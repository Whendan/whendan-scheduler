import {
    IsBoolean,
    IsEmail,
    IsNotEmpty,
    IsOptional,
    IsString,
} from 'class-validator';

export class CreateUserDto {
    @IsEmail()
    @IsNotEmpty()
    user_email: string;

    @IsString()
    @IsNotEmpty()
    display_name: string;

    @IsString()
    @IsNotEmpty()
    phone_number: string;

    // Accepted but intentionally unused
    @IsOptional()
    user_metadata?: unknown;

    @IsBoolean()
    @IsOptional()
    user_avatar?: boolean;
}
