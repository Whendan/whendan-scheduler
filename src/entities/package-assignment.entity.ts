import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('package_assignment')
export class PackageAssignment {
    @PrimaryColumn({ name: 'package_id', type: 'uuid' })
    packageId: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @Column({ name: 'driver_id', type: 'uuid' })
    driverId: string;

    @Column({ name: 'vehicle_id', type: 'uuid' })
    vehicleId: string;
}
