import { IsString, IsUUID } from 'class-validator';

export class UpdateUserRoleDto {
    @IsUUID('4')
    user_id: string;

    @IsString()
    role_name: string;
}
