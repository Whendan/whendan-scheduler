import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('vrp_route')
export class VrpRoute {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'solution_id', type: 'uuid' })
    solutionId: string;

    @Column({ type: 'int', nullable: true })
    cost: number | null;

    @Column({ type: 'int', array: true, nullable: true })
    delivery: number[] | null;

    @Column({ type: 'int', array: true, nullable: true })
    amount: number[] | null;

    @Column({ type: 'int', array: true, nullable: true })
    pickup: number[] | null;

    @Column({ type: 'int', nullable: true })
    setup: number | null;

    @Column({ type: 'int', nullable: true })
    service: number | null;

    @Column({ type: 'int', nullable: true })
    duration: number | null;

    @Column({ name: 'waiting_time', type: 'int', nullable: true })
    waitingTime: number | null;

    @Column({ type: 'int', nullable: true })
    priority: number | null;
}
