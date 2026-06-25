import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';

/**
 * Multi-Agent v1 W5 — daily rolling pet productivity snapshot.
 *
 * One row per (livingPetId, snapshotDate). Written daily by the
 * `multi-agent-summary` cron at 02:00 UTC+8.
 *
 * v1 writes only — v2 W8 (Pet Arena) reads to seed initial ELO.
 * Spec: design.md §2.2 新增 7; tasks.md W5.5
 */
@Entity('pet_productivity_snapshot')
@Index(['userId', 'snapshotDate'])
@Index(['livingPetId', 'snapshotDate'])
@Unique('uniq_pps_pet_date', ['livingPetId', 'snapshotDate'])
export class PetProductivitySnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', length: 64 })
  userId: string;

  @Column({ name: 'living_pet_id', type: 'uuid' })
  livingPetId: string;

  @Column({ name: 'agent_account_id', length: 64, nullable: true })
  agentAccountId: string | null;

  /** ISO date (YYYY-MM-DD); rolling 7-day sums end on this date. */
  @Column({ name: 'snapshot_date', type: 'date' })
  snapshotDate: string;

  @Column({ name: 'sub_task_count', type: 'integer', default: 0 })
  subTaskCount: number;

  @Column({ name: 'succeeded_count', type: 'integer', default: 0 })
  succeededCount: number;

  @Column({ name: 'failed_count', type: 'integer', default: 0 })
  failedCount: number;

  @Column({ name: 'total_cost_usd', type: 'double precision', default: 0 })
  totalCostUsd: number;

  @Column({ name: 'avg_duration_ms', type: 'bigint', default: 0 })
  avgDurationMs: number;

  @Column({ name: 'xp_earned', type: 'integer', default: 0 })
  xpEarned: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
