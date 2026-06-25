import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Payment, PaymentStatus } from '../../entities/payment.entity';

export type PlanTier = 'free' | 'pro' | 'pro_plus' | 'enterprise';

/**
 * Phase 2 W3 — User plan-tier resolver.
 *
 * Until SubscriptionService migrates to a row-based subscription table, plan
 * tier is derived from recent successful payments to platform plan SKUs.
 * Heuristic (matches docs/PRD_PET_PHASED_DEV_PLAN §6 Pricing):
 *   - Any "pro_plus_monthly"/"pro_plus_yearly" merchant within 32 days  → 'pro_plus'
 *   - Any "pro_monthly"/"pro_yearly" merchant within 32 days            → 'pro'
 *   - Any "enterprise_*" merchant ever                                  → 'enterprise'
 *   - Otherwise                                                          → 'free'
 *
 * Plan SKU IDs are matched on `payment.metadata.planSku` first, then on
 * `payment.merchantId === 'agentrix-platform'` + `metadata.skuId`. Falls back
 * to `'free'` for any error to avoid blocking quota lookup.
 */
@Injectable()
export class UserPlanResolverService {
  private readonly logger = new Logger(UserPlanResolverService.name);
  // 32-day rolling window — a pro user paying monthly should not flicker to
  // free between billing cycles.
  private static readonly WINDOW_MS = 32 * 24 * 60 * 60 * 1000;

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
  ) {}

  async getPlan(userId: string): Promise<PlanTier> {
    if (!userId) return 'free';
    try {
      // Enterprise — any successful enterprise payment ever
      const enterprise = await this.paymentRepo.findOne({
        where: {
          userId,
          status: PaymentStatus.COMPLETED,
        },
        order: { createdAt: 'DESC' },
      });
      if (enterprise && this.matchPlanSku(enterprise, /^enterprise/)) {
        return 'enterprise';
      }
      // Recent payments
      const cutoff = new Date(Date.now() - UserPlanResolverService.WINDOW_MS);
      const recent = await this.paymentRepo.find({
        where: {
          userId,
          status: PaymentStatus.COMPLETED,
          createdAt: MoreThan(cutoff),
        },
        order: { createdAt: 'DESC' },
        take: 20,
      });
      if (recent.some((p) => this.matchPlanSku(p, /^pro_plus/))) return 'pro_plus';
      if (recent.some((p) => this.matchPlanSku(p, /^pro(?!_plus)/))) return 'pro';
      return 'free';
    } catch (err: any) {
      this.logger.warn(`getPlan(${userId}) failed → defaulting to free: ${err?.message || err}`);
      return 'free';
    }
  }

  private matchPlanSku(payment: Payment, pattern: RegExp): boolean {
    const md = (payment as any).metadata as Record<string, unknown> | undefined;
    const sku = (md?.planSku || md?.skuId || '') as string;
    if (sku && pattern.test(sku.toLowerCase())) return true;
    return false;
  }
}
