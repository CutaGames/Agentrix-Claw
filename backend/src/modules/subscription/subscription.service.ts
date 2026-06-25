import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSubscription } from '../../entities/user-subscription.entity';
import {
  SubscriptionTier,
  TIER_QUOTAS,
  TIER_PRICING,
  TierQuota,
} from './subscription.constants';

export interface SubscriptionView {
  tier: SubscriptionTier;
  status: string;
  currency: string;
  price_cents: number;
  billing_cycle: 'monthly' | 'yearly';
  current_period_start: number | null;
  current_period_end: number | null;
  cancel_at_period_end: boolean;
  axp_applied_current: number;
}

/**
 * Subscription state + quota lookups.
 *
 * Stripe webhooks (handled separately) call `upsertFromStripe` to keep
 * `user_subscriptions` in sync. Everything else reads `getBalance` /
 * `getQuota` via this service.
 */
@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    @InjectRepository(UserSubscription)
    private readonly repo: Repository<UserSubscription>,
  ) {}

  async getSubscription(userId: string): Promise<SubscriptionView> {
    const row = await this.repo.findOne({ where: { userId } });
    if (!row) {
      // Default to free — do not create a DB row until user actually
      // pays or takes another paid action. Saves space.
      return {
        tier: 'free',
        status: 'active',
        currency: 'USD',
        price_cents: 0,
        billing_cycle: 'monthly',
        current_period_start: null,
        current_period_end: null,
        cancel_at_period_end: false,
        axp_applied_current: 0,
      };
    }
    return {
      tier: row.tier,
      status: row.status,
      currency: row.currency,
      price_cents: row.priceCents,
      billing_cycle: row.billingCycle,
      current_period_start: row.currentPeriodStart?.getTime() ?? null,
      current_period_end: row.currentPeriodEnd?.getTime() ?? null,
      cancel_at_period_end: row.cancelAtPeriodEnd,
      axp_applied_current: row.axpAppliedCurrent,
    };
  }

  async getQuota(userId: string): Promise<TierQuota & { effective_tier: SubscriptionTier }> {
    const sub = await this.getSubscription(userId);
    const tier = (sub.status === 'past_due' ? 'free' : sub.tier) as SubscriptionTier;
    return { ...TIER_QUOTAS[tier], effective_tier: tier };
  }

  /** Static catalog for the subscribe-plan screen. Client-friendly shape. */
  getCatalog() {
    const tiers: SubscriptionTier[] = ['free', 'lite', 'plus', 'pro', 'elite', 'enterprise'];
    return tiers.map((t) => ({
      tier: t,
      pricing: TIER_PRICING[t],
      quota: TIER_QUOTAS[t],
    }));
  }

  /**
   * Upsert from a Stripe webhook event. Idempotent. `tier` is derived
   * from price_id lookup in the caller; we just persist fields.
   */
  async upsertFromStripe(
    userId: string,
    payload: {
      tier: SubscriptionTier;
      status: string;
      currency?: string;
      priceCents?: number;
      billingCycle?: 'monthly' | 'yearly';
      stripeCustomerId?: string;
      stripeSubscriptionId?: string;
      stripePriceId?: string;
      currentPeriodStart?: Date;
      currentPeriodEnd?: Date;
      cancelAtPeriodEnd?: boolean;
      cancelledAt?: Date;
    },
  ): Promise<void> {
    const existing = await this.repo.findOne({ where: { userId } });
    if (existing) {
      await this.repo.update({ userId }, {
        tier: payload.tier,
        status: payload.status as any,
        currency: payload.currency ?? existing.currency,
        priceCents: payload.priceCents ?? existing.priceCents,
        billingCycle: payload.billingCycle ?? existing.billingCycle,
        stripeCustomerId: payload.stripeCustomerId ?? existing.stripeCustomerId,
        stripeSubscriptionId: payload.stripeSubscriptionId ?? existing.stripeSubscriptionId,
        stripePriceId: payload.stripePriceId ?? existing.stripePriceId,
        currentPeriodStart: payload.currentPeriodStart ?? existing.currentPeriodStart,
        currentPeriodEnd: payload.currentPeriodEnd ?? existing.currentPeriodEnd,
        cancelAtPeriodEnd:
          payload.cancelAtPeriodEnd ?? existing.cancelAtPeriodEnd,
        cancelledAt: payload.cancelledAt ?? existing.cancelledAt,
      });
      return;
    }
    await this.repo.save(
      this.repo.create({
        userId,
        tier: payload.tier,
        status: payload.status as any,
        currency: payload.currency ?? 'USD',
        priceCents: payload.priceCents ?? 0,
        billingCycle: payload.billingCycle ?? 'monthly',
        stripeCustomerId: payload.stripeCustomerId,
        stripeSubscriptionId: payload.stripeSubscriptionId,
        stripePriceId: payload.stripePriceId,
        currentPeriodStart: payload.currentPeriodStart,
        currentPeriodEnd: payload.currentPeriodEnd,
        cancelAtPeriodEnd: payload.cancelAtPeriodEnd ?? false,
        cancelledAt: payload.cancelledAt,
      }),
    );
  }

  /** Admin: set tier directly (invitation perks, customer-support actions). */
  async setTier(
    userId: string,
    tier: SubscriptionTier,
    note?: string,
  ): Promise<SubscriptionView> {
    await this.upsertFromStripe(userId, {
      tier,
      status: 'active',
    });
    this.logger.log(`admin set tier userId=${userId} tier=${tier} note=${note ?? ''}`);
    return this.getSubscription(userId);
  }
}
