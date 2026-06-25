import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { UserPlanResolverService, PlanTier } from '../pet-gen-quota/user-plan-resolver.service';
import { StripeService } from '../payment/stripe.service';

/**
 * Phase 6 / V4 §5.2 — BillingPlanService
 *
 * 暴露 Pro / Pro+ 订阅 SKU 目录 + 当前 plan 解析 + Stripe Checkout Session
 * 创建。Plan tier 由 [user-plan-resolver.service.ts] 通过最近 32 天的成功 payment
 * 推导（`metadata.planSku` 匹配 `^pro` / `^pro_plus`）。
 *
 * Stripe Price ID 通过环境变量注入，方便不同环境绑定不同产品：
 *   STRIPE_PRICE_PRO_MONTHLY        = price_xxx
 *   STRIPE_PRICE_PRO_YEARLY         = price_xxx
 *   STRIPE_PRICE_PRO_PLUS_MONTHLY   = price_xxx
 *   STRIPE_PRICE_PRO_PLUS_YEARLY    = price_xxx
 *   STRIPE_BILLING_SUCCESS_URL      = https://agentrix.top/billing/success?session={CHECKOUT_SESSION_ID}
 *   STRIPE_BILLING_CANCEL_URL       = https://agentrix.top/billing/cancel
 */

export type PlanSku =
  | 'pro_monthly'
  | 'pro_yearly'
  | 'pro_plus_monthly'
  | 'pro_plus_yearly';

export interface PlanSkuDescriptor {
  sku: PlanSku;
  tier: 'pro' | 'pro_plus';
  interval: 'month' | 'year';
  display_name: string;
  price_cents: number;
  currency: 'usd';
  features: string[];
  stripe_price_id: string | null;
}

const SKU_CATALOG: Omit<PlanSkuDescriptor, 'stripe_price_id'>[] = [
  {
    sku: 'pro_monthly',
    tier: 'pro',
    interval: 'month',
    display_name: 'Agentrix Pro · 月付',
    price_cents: 1900,
    currency: 'usd',
    features: [
      '无限 LLM 调用（标准模型）',
      '5 GB 萌宠生成配额 / 月',
      '解锁 6 族群灵魂模板',
      '日报 / 周报推送',
    ],
  },
  {
    sku: 'pro_yearly',
    tier: 'pro',
    interval: 'year',
    display_name: 'Agentrix Pro · 年付（省 2 个月）',
    price_cents: 19000,
    currency: 'usd',
    features: [
      '所有 Pro 月付权益',
      '相比月付节省 ~17%',
      '优先客服',
    ],
  },
  {
    sku: 'pro_plus_monthly',
    tier: 'pro_plus',
    interval: 'month',
    display_name: 'Agentrix Pro+ · 月付',
    price_cents: 4900,
    currency: 'usd',
    features: [
      'Pro 全部权益',
      '解锁 Premium 模型（Opus / GPT-4o）',
      '20 GB 萌宠生成 / 月',
      '萌宠团队 Lv.5+ 多宠协作',
      'Marketplace 创作者收益分成 +5%',
    ],
  },
  {
    sku: 'pro_plus_yearly',
    tier: 'pro_plus',
    interval: 'year',
    display_name: 'Agentrix Pro+ · 年付（省 2 个月）',
    price_cents: 49000,
    currency: 'usd',
    features: [
      '所有 Pro+ 月付权益',
      '相比月付节省 ~17%',
      '专属客服 + 早期 beta',
    ],
  },
];

@Injectable()
export class BillingPlanService {
  private readonly logger = new Logger(BillingPlanService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly planResolver: UserPlanResolverService,
    private readonly stripeService: StripeService,
  ) {}

  /** Resolve the user's effective tier based on recent payments. */
  async getCurrentPlan(userId: string): Promise<PlanTier> {
    return this.planResolver.getPlan(userId);
  }

  /** Returns the catalog with Stripe price IDs (or null if env not set). */
  listSkus(): PlanSkuDescriptor[] {
    return SKU_CATALOG.map((s) => ({
      ...s,
      stripe_price_id: this.priceIdFor(s.sku),
    }));
  }

  findSku(sku: string): Omit<PlanSkuDescriptor, 'stripe_price_id'> | null {
    return SKU_CATALOG.find((s) => s.sku === sku) ?? null;
  }

  priceIdFor(sku: PlanSku): string | null {
    const map: Record<PlanSku, string> = {
      pro_monthly: 'STRIPE_PRICE_PRO_MONTHLY',
      pro_yearly: 'STRIPE_PRICE_PRO_YEARLY',
      pro_plus_monthly: 'STRIPE_PRICE_PRO_PLUS_MONTHLY',
      pro_plus_yearly: 'STRIPE_PRICE_PRO_PLUS_YEARLY',
    };
    return this.config.get<string>(map[sku]) ?? null;
  }

  /**
   * Creates a Stripe Checkout Session in subscription mode for the given plan SKU.
   * Returns { url, sessionId }. Throws BadRequestException if Stripe / price id not configured.
   */
  async createCheckoutSession(input: {
    userId: string;
    sku: PlanSku;
    customerEmail?: string;
  }): Promise<{ url: string; session_id: string }> {
    const desc = this.findSku(input.sku);
    if (!desc) throw new BadRequestException(`unknown plan sku: ${input.sku}`);
    if (!this.stripeService.isStripeConfigured()) {
      throw new BadRequestException('Stripe is not configured on this server');
    }
    const priceId = this.priceIdFor(input.sku);
    if (!priceId) {
      throw new BadRequestException(
        `Stripe price id not configured for sku=${input.sku}. Set env STRIPE_PRICE_${input.sku.toUpperCase()} to enable checkout.`,
      );
    }
    const stripe = (this.stripeService as any).stripe as Stripe | null;
    if (!stripe) {
      throw new BadRequestException('Stripe SDK is not initialised');
    }
    const successUrl =
      this.config.get<string>('STRIPE_BILLING_SUCCESS_URL') ||
      'https://agentrix.top/billing/success?session={CHECKOUT_SESSION_ID}';
    const cancelUrl =
      this.config.get<string>('STRIPE_BILLING_CANCEL_URL') ||
      'https://agentrix.top/billing/cancel';

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: input.userId,
        customer_email: input.customerEmail,
        metadata: {
          userId: input.userId,
          planSku: input.sku,
          planTier: desc.tier,
          source: 'agentrix-platform',
        },
        subscription_data: {
          metadata: {
            userId: input.userId,
            planSku: input.sku,
            planTier: desc.tier,
          },
        },
      });
      this.logger.log(
        `🧾 created checkout session ${session.id} user=${input.userId} sku=${input.sku}`,
      );
      if (!session.url) {
        throw new BadRequestException('Stripe did not return a checkout URL');
      }
      return { url: session.url, session_id: session.id };
    } catch (err: any) {
      this.logger.error(
        `checkout session creation failed: ${err?.message || err}`,
      );
      throw new BadRequestException(
        err?.message || 'Stripe checkout session creation failed',
      );
    }
  }
}
