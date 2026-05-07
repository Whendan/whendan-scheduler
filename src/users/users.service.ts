import {
    BadRequestException,
    Inject,
    Injectable,
    InternalServerErrorException,
    Logger,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from 'src/supabase/supabase.provider';
import { DatabaseService } from 'src/database/database.service';
import { CreateUserDto } from './dto/create-user.dto';
import { DeactivateUsersDto } from './dto/deactivate-users.dto';
import { ReactivateUsersDto } from './dto/reactivate-users.dto';

// ~100 years — effectively permanent while preserving all associated data
const DEACTIVATION_BAN_DURATION = '876600h';

export interface DeactivateUsersResult {
    deactivated: string[];
    failed: Array<{ user_id: string; reason: string }>;
}

export interface ReactivateUsersResult {
    reactivated: string[];
    failed: Array<{ user_id: string; reason: string }>;
}

export interface CreateUserResult {
    user_id: string;
    user_email: string;
    user_display_name: string;
    user_phone_number: string;
    user_role: string;
    user_permission: string;
    invited_at: string | null;
    user_avatar_upload_url?: string;
}

@Injectable()
export class UsersService {
    private readonly logger = new Logger(UsersService.name);

    constructor(
        @Inject(SUPABASE_CLIENT)
        private readonly supabase: SupabaseClient,
        private readonly db: DatabaseService,
    ) { }

    async createUser(dto: CreateUserDto): Promise<CreateUserResult> {
        // Look up the role by name. Fail fast before touching auth so there is
        // nothing to clean up if the caller passes a bad role.
        const roleRows = await this.db.query<{ id: string; name: string }>(
            `SELECT id, name FROM app_roles WHERE name = $1 LIMIT 1`,
            [dto.user_role],
        );
        if (!roleRows.length) {
            throw new BadRequestException(
                `Role "${dto.user_role}" does not exist`,
            );
        }
        // TypeORM returns Postgres bigint columns as strings
        const roleId: string = roleRows[0].id;
        const isDriver = roleRows[0].name === 'Driver';

        // Deduplicate and validate permission strings.
        const uniquePermissions = [...new Set(dto.user_permission ?? [])];
        // TypeORM returns Postgres bigint columns as strings
        let permissionIds: string[] = [];
        if (uniquePermissions.length > 0) {
            const placeholders = uniquePermissions.map((_, i) => `$${i + 1}`).join(', ');
            const permRows = await this.db.query<{ id: string; permission: string }>(
                `SELECT id, permission FROM app_permission WHERE permission IN (${placeholders})`,
                uniquePermissions,
            );
            if (permRows.length !== uniquePermissions.length) {
                const found = new Set(permRows.map((r) => r.permission));
                const missing = uniquePermissions.filter((p) => !found.has(p));
                throw new BadRequestException(
                    `Unknown permission(s): ${missing.join(', ')}`,
                );
            }
            permissionIds = permRows.map((r) => r.id);
        }

        const { data: inviteData, error: inviteError } =
            await this.supabase.auth.admin.inviteUserByEmail(dto.user_email, {
                data: { display_name: dto.user_display_name },
            });

        if (inviteError) {
            if (inviteError.message.toLowerCase().includes('already registered')) {
                throw new BadRequestException(
                    `A user with email ${dto.user_email} already exists`,
                );
            }
            throw new InternalServerErrorException(
                `Failed to invite user: ${inviteError.message}`,
            );
        }

        const userId = inviteData.user.id;

        // Set phone number — inviteUserByEmail does not accept phone directly.
        const { error: updateError } =
            await this.supabase.auth.admin.updateUserById(userId, {
                phone: dto.user_phone_number,
            });

        if (updateError) {
            throw new InternalServerErrorException(
                `Failed to set phone number: ${updateError.message}`,
            );
        }

        const runner = await this.db.beginTransaction();
        try {
            await runner.query(
                `INSERT INTO team_members (id, role_id) VALUES ($1, $2)`,
                [userId, roleId],
            );

            if (isDriver) {
                const meta = dto.user_metadata ?? {};
                await runner.query(
                    `INSERT INTO drivers
                        (id, driver_license, license_expiry,
                         country_of_issue, driver_under_probation, license_type)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [
                        userId,
                        meta.driver_license ?? null,
                        meta.license_expiry ?? null,
                        meta.country_of_issue ?? null,
                        meta.driver_under_probation ?? null,
                        meta.license_type ?? null,
                    ],
                );
            }

            if (permissionIds.length > 0) {
                await runner.query(
                    `INSERT INTO user_permission (user_id, permission_id)
                     SELECT $1, unnest($2::bigint[])
                     ON CONFLICT DO NOTHING`,
                    [userId, permissionIds],
                );
            }

            await runner.commitTransaction();
        } catch (dbError) {
            await runner.rollbackTransaction();

            // Best-effort: delete the orphaned auth user
            const { error: deleteError } =
                await this.supabase.auth.admin.deleteUser(userId);
            if (deleteError) {
                this.logger.error(
                    `Auth user ${userId} could not be deleted after DB failure — manual cleanup required. DB error: ${(dbError as Error).message}. Delete error: ${deleteError.message}`,
                );
            }

            const msg = (dbError as Error).message ?? String(dbError);
            if (
                msg.includes('violates foreign key constraint') ||
                msg.includes('invalid input syntax for type uuid')
            ) {
                throw new BadRequestException(
                    `Invalid reference in request: ${msg}`,
                );
            }
            throw new InternalServerErrorException(
                `Failed to persist user data: ${msg}`,
            );
        } finally {
            await runner.release();
        }

        const result: CreateUserResult = {
            user_id: userId,
            user_email: inviteData.user.email ?? dto.user_email,
            user_display_name: dto.user_display_name,
            user_phone_number: dto.user_phone_number,
            user_role: dto.user_role,
            user_permission: JSON.stringify(uniquePermissions),
            invited_at: inviteData.user.invited_at ?? null,
        };

        // File bytes never pass through this server — the client uploads directly.
        if (dto.user_avatar) {
            const storagePath = `avatars/${userId}/avatar`;
            const { data: signedData, error: storageError } =
                await this.supabase.storage
                    .from('avatars')
                    .createSignedUploadUrl(storagePath, { upsert: true });

            if (storageError) {
                throw new InternalServerErrorException(
                    `Failed to generate avatar upload URL: ${storageError.message}`,
                );
            }

            result.user_avatar_upload_url = signedData.signedUrl;
        }

        return result;
    }

    async deactivateUsers(
        dto: DeactivateUsersDto,
        callerUserId: string,
    ): Promise<DeactivateUsersResult> {
        const deactivated: string[] = [];
        const failed: DeactivateUsersResult['failed'] = [];

        const results = await Promise.allSettled(
            dto.user_ids.map(async (userId) => {
                if (userId === callerUserId) {
                    throw new BadRequestException('Cannot deactivate your own account');
                }

                const { error: banError } =
                    await this.supabase.auth.admin.updateUserById(userId, {
                        ban_duration: DEACTIVATION_BAN_DURATION,
                    });

                if (banError) {
                    throw new InternalServerErrorException(
                        `Failed to ban user: ${banError.message}`,
                    );
                }

                // Best-effort: revoke all refresh tokens. If this fails the user is
                // still banned from obtaining new access tokens via the ban above.
                await this.supabase.auth.admin.signOut(userId, 'global');

                return userId;
            }),
        );

        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            const userId = dto.user_ids[i];
            if (result.status === 'fulfilled') {
                deactivated.push(result.value);
            } else {
                const reason =
                    result.reason instanceof Error
                        ? result.reason.message
                        : String(result.reason);
                failed.push({ user_id: userId, reason });
            }
        }

        return { deactivated, failed };
    }

    async reactivateUsers(
        dto: ReactivateUsersDto,
    ): Promise<ReactivateUsersResult> {
        const reactivated: string[] = [];
        const failed: ReactivateUsersResult['failed'] = [];

        const results = await Promise.allSettled(
            dto.user_ids.map(async (userId) => {
                const { error: unbanError } =
                    await this.supabase.auth.admin.updateUserById(userId, {
                        ban_duration: 'none',
                    });

                if (unbanError) {
                    throw new InternalServerErrorException(
                        `Failed to reactivate user: ${unbanError.message}`,
                    );
                }

                return userId;
            }),
        );

        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            const userId = dto.user_ids[i];
            if (result.status === 'fulfilled') {
                reactivated.push(result.value);
            } else {
                const reason =
                    result.reason instanceof Error
                        ? result.reason.message
                        : String(result.reason);
                failed.push({ user_id: userId, reason });
            }
        }

        return { reactivated, failed };
    }
}
