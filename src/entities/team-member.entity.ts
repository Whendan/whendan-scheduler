import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('team_members')
export class TeamMember {
    @PrimaryColumn({ type: 'uuid' })
    id: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @Column({ name: 'role_id', type: 'bigint' })
    roleId: number;
}
