import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('app_permission')
export class AppPermission {
    @PrimaryGeneratedColumn({ type: 'bigint' })
    id: number;

    @Column({ unique: true })
    permission: string;
}
