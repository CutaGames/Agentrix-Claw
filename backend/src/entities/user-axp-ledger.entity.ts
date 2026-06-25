import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

/**
 * AXP Ledger — Agentrix Point (soft currency, off-chain) per
 * docs/MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05.zh-CN.md §4.
 *
 * Every earn / spend / expire event appends one row. Running balance is
 * computed by `UserAxpBalance` (separate row-per-user snapshot), not by
 * aggregating the ledger on every read.
 *
 * `kind` taxonomy follows §4.2 (earn) and §4.3 (spend). Freeform strings
 * keep the ledger forward-compatible; a Zod validator in the service
 * layer gates what callers can insert.
 */
@Entity({ name: 'user_axp_ledger' })
@Index(['userId', 'createdAt'])
@Index(['userId', 'source'])
@Index(['expiresAt'])
// Exactly-once idempotency for `aeon_reality_reward` grants: at most one row
// per (user_id, source, ref_id) when ref_id is set. Scoped to this source so
// other earn sources that legitimately reuse a refId (coraising_*, aeon_wage,
// photo-mimic game_participate, …) are unaffected. Mirrored by migration
// `uq_user_axp_ledger_reality_reward_idem` (synchronize is off in prod;
// migration is authoritative — see soul-companion-onboarding Property 8).
@Index('uq_user_axp_ledger_reality_reward_idem', ['userId', 'source', 'refId'], {
  unique: true,
  where: `"ref_id" IS NOT NULL AND "source" = 'aeon_reality_reward'`,
})
// Pet Earning Flywheel · 拉新双边奖励/GMV 返佣 earn 精确一次（需求 4）。
// 镜像迁移 uq_user_axp_ledger_referral_idem。
@Index('uq_user_axp_ledger_referral_idem', ['userId', 'source', 'refId'], {
  unique: true,
  where: `"ref_id" IS NOT NULL AND "source" IN ('referral_signup', 'referral_gmv_pct')`,
})
// Pet Earning Flywheel · 收益兑付 spend 精确一次（需求 5）。
// 镜像迁移 uq_user_axp_ledger_spend_idem。
@Index('uq_user_axp_ledger_spend_idem', ['userId', 'source', 'refId'], {
  unique: true,
  where: `"direction" = 'spend' AND "ref_id" IS NOT NULL AND "source" IN ('sub_discount', 'skill_discount', 'skin_discount', 'redeem_skin')`,
})
export class UserAxpLedger {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  userId!: string;

  /** `earn` (positive amount) or `spend` (negative amount stored as positive, direction = 'spend'). */
  @Column({ type: 'varchar', length: 16 })
  direction!: 'earn' | 'spend' | 'expire' | 'adjust';

  /** Positive integer AXP. 1 AXP = $0.001 (see §4.1). */
  @Column({ type: 'bigint' })
  amount!: string;

  /** Semantic key: 'daily_checkin' / 'chat_active' / 'pet_lvl_up' / 'coraising_feed' / 'referral_signup' / 'referral_gmv_pct' / 'feed_post_liked' / 'task_complete' / 'skin_sold' / 'greeting_sent' / 'greeting_received' / 'game_participate' / 'contest_win' / 'sub_cashback' / 'sub_discount' / 'skill_discount' / 'skin_discount' / 'create_pet_slot' / 'task_priority' / 'card_pin' / 'skin_preorder' / 'l3_cosign_fee_waiver' / 'lottery_pull' / 'redeem_skin' / 'expire_12mo' */
  @Column({ type: 'varchar', length: 48 })
  source!: string;

  /** Free-form reference id (order, post, pet, task, etc.) for auditability. */
  @Column({ type: 'varchar', length: 96, nullable: true })
  refId?: string | null;

  /** Human-readable note (shown in user's AXP history view). */
  @Column({ type: 'varchar', length: 200, nullable: true })
  note?: string | null;

  /**
   * For earn rows: when this AXP batch will expire (12 months default per §4.6).
   * For spend/expire rows: the earn row's expiresAt (for FIFO drain audit).
   */
  @Column({ type: 'timestamptz', nullable: true })
  expiresAt?: Date | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
