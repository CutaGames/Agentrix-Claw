import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Multi-Agent v2.1 — per-user, per-period sub-task spend tracker.
 *
 * Two row kinds share this table:
 *   - **monthly**: `period_day = null`, one per (user, period_year_month)
 *   - **daily**:   `period_day = YYYY-MM-DD`, one per (user, day)
 *
 * The daily cron at 02:30 UTC+8 aggregates yesterday's `agent_cost_records`
 * rows whose `event_type='sub_task_complete'` per user → upserts BOTH the
 * day row and the month row.
 *
 * The WorkerLlmRouter / SpawnService read these rows at request time:
 *   - free tier: `period_day` row checked against 20 sub-tasks/day cap
 *   - pro tier: `period_year_month` row checked against 200 sub-tasks/month
 *     inclusion
 */
@Entity('user_subscription_usage')
@Index(['userId', 'periodYearMonth'])
export class UserSubscriptionUsage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  /** `YYYY-MM` period key shared by all rows in the same month. */
  @Column({ length: 7 })
  periodYearMonth: string;

  /**
   * `YYYY-MM-DD` for daily rows; NULL for the monthly aggregate row.
   * The migration installs partial unique indexes to keep both row kinds
   * consistent.
   */
  @Column({ type: 'date', nullable: true })
  periodDay: string | null;

  @Column({ type: 'int', default: 0 })
  subTasksCount: number;

  /** Sum of `estimatedCostUsd` from agent_cost_records for the period. */
  @Column({ type: 'decimal', precision: 18, scale: 6, default: 0 })
  totalCostUsd: number;

  /** Snapshot at the time of the most recent upsert. */
  @Column({ length: 16, default: 'free' })
  subscriptionTier: 'free' | 'pro' | 'business' | 'enterprise';

  @UpdateDateColumn({ type: 'timestamptz' })
  lastUpdatedAt: Date;
}
