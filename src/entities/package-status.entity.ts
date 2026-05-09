import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('package_status')
export class PackageStatus {
    @PrimaryGeneratedColumn({ type: 'bigint' })
    id: number;

    @Column({ unique: true })
    status: string;

    @Column({ unique: true })
    enums: string;
}
