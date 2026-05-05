import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('household_agents')
@Index(['familyId', 'active'])
export class HouseholdAgentEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'varchar', length: 64 })
  familyId: string;

  @Column({ type: 'varchar', length: 24 })
  role: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'jsonb' })
  visibleToRoles: string[];

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'bigint' })
  createdAtMs: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
