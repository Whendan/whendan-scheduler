import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('vrp_solution')
export class VrpSolution {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'optimization_id', type: 'uuid' })
    optimizationId: string;

    @Column({ type: 'int', nullable: true })
    cost: number | null;

    @Column({ name: 'routes_count', type: 'int', nullable: true })
    routesCount: number | null;

    @Column({ name: 'unassigned_count', type: 'int', nullable: true })
    unassignedCount: number | null;

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

    @Column({ name: 'loading_time', type: 'int', nullable: true })
    loadingTime: number | null;

    @Column({ name: 'solving_time', type: 'int', nullable: true })
    solvingTime: number | null;

    @Column({ name: 'routing_time', type: 'int', nullable: true })
    routingTime: number | null;
}
