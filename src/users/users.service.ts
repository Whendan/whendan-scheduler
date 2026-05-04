import {
    BadRequestException,
    Inject,
    Injectable,
    InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from 'src/supabase/supabase.provider';
import { CreateUserDto } from './dto/create-user.dto';

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
}
