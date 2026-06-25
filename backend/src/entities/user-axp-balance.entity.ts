import {
  Entity,
  PrimaryColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Running AXP balance snapshot — one row per user.
 *
 * Read this for displaying a user's balance; `UserAxpLedger` is the
 * write-once audit trail. The service layer updates both atomically in
 * a transaction. Denormalisation avoids aggregating the full ledger on
 * every read (ledger could grow to millions of rows).
 */
@Entity({ name: 'user_axp_balances' })
export class UserAxpBalance {
  @PrimaryColumn('uuid')
  userId!: string;

  /** Current available balance (bigint string because amounts can exceed JS safe int). */
  @Column({ type: 'bigint', default: 0 })
  balance!: string;

  /** Total earned lifetime (for stats/tier calculation). */
  @Column({ type: 'bigint', default: 0 })
  lifetimeEarned!: string;

  /** Total spent lifetime. */
  @Column({ type: 'bigint', default: 0 })
  lifetimeSpent!: string;

  /** Total expired lifetime (for monitoring FIFO expiry health). */
  @Column({ type: 'bigint', default: 0 })
  lifetimeExpired!: string;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
