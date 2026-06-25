import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum TokenPlanType {
  FREE_TRIAL = 'free_trial',
  STARTER    = 'starter',
  PRO        = 'pro',
  UNLIMITED  = 'unlimited',
}

/**
 * Tracks a user's LLM token quota for the current billing period.
 * One row per user per billing period.
 */
@Entity('user_token_quotas')
@Index(['userId', 'periodStart'])
export class UserTokenQuota {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  @Index()
  userId: string;

  /** Billing period start (inclusive, UTC midnight) */
  @Column({ name: 'period_start', type: 'date' })
  periodStart: Date;

  /** Billing period end (exclusive) */
  @Column({ name: 'period_end', type: 'date' })
  periodEnd: Date;

  /** Plan type for display purposes */
  @Column({ name: 'plan_type', type: 'enum', enum: TokenPlanType, default: TokenPlanType.FREE_TRIAL })
  planType: TokenPlanType;

  /** Total allocated tokens for this period (default: 1_000_000 free trial) */
  @Column({ name: 'total_quota', type: 'bigint', default: 1_000_000 })
  totalQuota: number;

  /** Tokens consumed: input + output combined */
  @Column({ name: 'used_tokens', type: 'bigint', default: 0 })
  usedTokens: number;

  /** Input (prompt) tokens consumed */
  @Column({ name: 'input_tokens', type: 'bigint', default: 0 })
  inputTokens: number;

  /** Output (completion) tokens consumed */
  @Column({ name: 'output_tokens', type: 'bigint', default: 0 })
  outputTokens: number;

  /** Number of LLM calls made this period */
  @Column({ name: 'call_count', type: 'int', default: 0 })
  callCount: number;

  /** Alert thresholds sent (to avoid repeated notifications) */
  @Column({ name: 'alert_sent_50', default: false })
  alertSent50: boolean;

  @Column({ name: 'alert_sent_80', default: false })
  alertSent80: boolean;

  @Column({ name: 'alert_sent_95', default: false })
  alertSent95: boolean;

  /** Set when quota is exhausted and further calls should be blocked */
  @Column({ name: 'quota_exhausted', default: false })
  quotaExhausted: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
