import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('packages')
export class Package {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'optimisation_id', type: 'uuid', nullable: true })
    optimisationId: string | null;
}
