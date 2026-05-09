import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('app_roles')
export class AppRole {
    @PrimaryGeneratedColumn({ type: 'bigint' })
    id: number;

    @Column({ unique: true })
    name: string;
}
