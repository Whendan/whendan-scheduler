import {
    BadRequestException,
    Inject,
    Injectable,
    InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from 'src/supabase/supabase.provider';
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
    email: string;
    display_name: string;
    phone_number: string;
    invited_at: string | null;
    avatar_upload_url?: string;
}

@Injectable()
export class UsersService {
    constructor(
        @Inject(SUPABASE_CLIENT)
        private readonly supabase: SupabaseClient,
    ) { }

    async createUser(dto: CreateUserDto): Promise<CreateUserResult> {
        // Invite the user — creates an unverified account and sends an invite email
        const { data: inviteData, error: inviteError } =
            await this.supabase.auth.admin.inviteUserByEmail(dto.user_email, {
                data: { display_name: dto.display_name },
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

        // Set phone number — inviteUserByEmail does not accept phone directly
        const { error: updateError } =
            await this.supabase.auth.admin.updateUserById(userId, {
                phone: dto.phone_number,
            });

        if (updateError) {
            throw new InternalServerErrorException(
                `Failed to set phone number: ${updateError.message}`,
            );
        }

        const result: CreateUserResult = {
            user_id: userId,
            email: inviteData.user.email ?? dto.user_email,
            display_name: dto.display_name,
            phone_number: dto.phone_number,
            invited_at: inviteData.user.invited_at ?? null,
        };

        // Generate a presigned upload URL when the caller intends to upload an avatar.
        // File bytes never pass through this server — the client uploads directly to storage.
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

            result.avatar_upload_url = signedData.signedUrl;
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
