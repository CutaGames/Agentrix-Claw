import {
  Entity,
  PrimaryColumn,
  Column,
  UpdateDateColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * User subscription tier snapshot — per docs §3.
 *
 * Single row per user. Mirrors active Stripe subscription (or free). When
 * a Stripe webhook fires (invoice.paid / subscription.updated) we upsert
 * this row; clients read from here to decide quota/permissions.
 *
 * Tier taxonomy: 'free' | 'lite' | 'plus' | 'pro' | 'elite' | 'enterprise'.
 */
@Entity({ name: 'user_subscriptions' })
@Index(['tier'])
@Index(['stripeSubscriptionId'])
export class UserSubscription {
  @PrimaryColumn('uuid')
  userId!: string;

  @Column({ type: 'varchar', length: 16, default: 'free' })
  tier!: 'free' | 'lite' | 'plus' | 'pro' | 'elite' | 'enterprise';

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: 'active' | 'past_due' | 'cancelled' | 'trialing' | 'incomplete';

  @Column({ type: 'varchar', length: 8, default: 'USD' })
  currency!: string;

  @Column({ type: 'int', default: 0 })
  priceCents!: number;

  @Column({ type: 'varchar', length: 16, default: 'monthly' })
  billingCycle!: 'monthly' | 'yearly';

  @Column({ type: 'varchar', length: 128, nullable: true })
  stripeCustomerId?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  stripeSubscriptionId?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  stripePriceId?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  currentPeriodStart?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  currentPeriodEnd?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt?: Date | null;

  @Column({ type: 'boolean', default: false })
  cancelAtPeriodEnd!: boolean;

  /** AXP applied to current period (for split-pay display). */
  @Column({ type: 'int', default: 0 })
  axpAppliedCurrent!: number;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
