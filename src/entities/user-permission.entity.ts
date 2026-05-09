import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('user_permission')
export class UserPermission {
    @PrimaryColumn({ name: 'user_id', type: 'uuid' })
    userId: string;

    @PrimaryColumn({ name: 'permission_id', type: 'bigint' })
    permissionId: number;
}
