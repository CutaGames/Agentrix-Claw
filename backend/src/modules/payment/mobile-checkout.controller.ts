/**
 * Mobile Checkout Controller — Sprint M-P0-5.
 *
 * Frontend (`src/services/stripeCheckout.service.ts`) calls these
 * endpoints. This controller wraps `StripeService` to give the mobile
 * client both Checkout-Session and PaymentIntent flows:
 *
 *   POST /api/v1/checkout/session                      → web-style hosted checkout URL
 *   POST /api/v1/checkout/payment-intent               → native payment sheet
 *   GET  /api/v1/checkout/session/:id/verify           → poll completion state
 *
 * Important: store policy.
 *   On iOS / Android, virtual goods (subscriptions / AXP top-ups)
 *   MUST go through Apple IAP / Google Play Billing — not Stripe.
 *   For physical goods or web-redirect flows (where the user
 *   bounces to a Stripe Checkout page in a browser), this is fine.
 *   The mobile client should still use the IAP service for in-app
 *   subscription / AXP purchases; this endpoint is the web fallback.
 */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StripeService } from './stripe.service';
import Stripe from 'stripe';

interface SessionRequestBody {
  mode: 'subscription' | 'payment';
  tier?: string;
  billing_cycle?: 'monthly' | 'yearly';
  line_items?: Array<{
    type: 'skin' | 'axp_topup' | 'skill' | 'task_bounty';
    resource_id: string;
    quantity?: number;
  }>;
  axp_discount_amount?: number;
  success_url?: string;
  cancel_url?: string;
}

// USD price table — same source-of-truth used by SubscribePlanScreen.
const TIER_PRICE_CENTS_MONTHLY: Record<string, number> = {
  free: 0,
  lite: 990, // $9.90
  plus: 1990,
  pro: 4990,
  elite: 9990,
};
const TIER_PRICE_CENTS_YEARLY: Record<string, number> = {
  free: 0,
  lite: 9900,
  plus: 19900,
  pro: 49900,
  elite: 99900,
};

const SKIN_DEFAULT_CENTS = 199; // $1.99 fallback when DB lookup is wired later
const AXP_TOPUP_PER_PACK_CENTS = 99; // 100 AXP for $0.99
const TASK_BOUNTY_DEFAULT_CENTS = 500;
const SKILL_DEFAULT_CENTS = 299;

@UseGuards(JwtAuthGuard)
@Controller('v1/checkout')
export class MobileCheckoutController {
  constructor(private readonly stripe: StripeService) {}

  /**
   * Create a Stripe-hosted Checkout Session that the mobile client
   * opens in `expo-web-browser`. Stripe redirects back to
   * `agentrix://checkout/success?session_id=cs_…` on completion.
   */
  @Post('session')
  @HttpCode(HttpStatus.OK)
  async createSession(@Req() req: any, @Body() body: SessionRequestBody) {
    if (!this.stripe.isStripeConfigured()) {
      throw new BadRequestException('Stripe is not configured on this server');
    }
    if (!body.success_url || !body.cancel_url) {
      throw new BadRequestException('success_url and cancel_url are required');
    }

    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const stripeApi = this.stripe.getStripeInstance();
    if (!stripeApi) {
      throw new BadRequestException('Stripe runtime unavailable');
    }

    const params: Stripe.Checkout.SessionCreateParams = {
      mode: body.mode === 'subscription' ? 'subscription' : 'payment',
      success_url: body.success_url,
      cancel_url: body.cancel_url,
      client_reference_id: userId ?? undefined,
      metadata: {
        userId: userId ?? '',
        axpDiscount: String(body.axp_discount_amount ?? 0),
        source: 'mobile_app',
      },
      line_items: this.buildLineItems(body),
    };

    if (body.mode === 'subscription') {
      params.subscription_data = {
        metadata: {
          tier: body.tier ?? '',
          billing_cycle: body.billing_cycle ?? 'monthly',
          userId: userId ?? '',
        },
      };
    }

    const session = await stripeApi.checkout.sessions.create(params);

    return {
      session_id: session.id,
      url: session.url,
      expires_at: session.expires_at,
      amount_total_cents: session.amount_total ?? 0,
      currency: session.currency ?? 'usd',
      axp_discount_applied: body.axp_discount_amount ?? 0,
    };
  }

  /**
   * Create a PaymentIntent for native Apple Pay / Google Pay sheet.
   * Returns the client secret + ephemeral key that
   * `@stripe/stripe-react-native` (or RevenueCat) consumes.
   */
  @Post('payment-intent')
  @HttpCode(HttpStatus.OK)
  async createPaymentIntent(
    @Req() req: any,
    @Body()
    body: {
      type: 'skin' | 'axp_topup' | 'skill';
      resource_id: string;
      axp_discount_amount?: number;
    },
  ) {
    if (!this.stripe.isStripeConfigured()) {
      throw new BadRequestException('Stripe is not configured on this server');
    }
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const stripeApi = this.stripe.getStripeInstance();
    if (!stripeApi) {
      throw new BadRequestException('Stripe runtime unavailable');
    }

    const baseCents = this.priceCentsForLineItem(body.type, body.resource_id);
    const discountCents = Math.min(baseCents, Math.floor((body.axp_discount_amount ?? 0) * 0.1));
    const finalCents = Math.max(50, baseCents - discountCents); // Stripe min charge

    // Get-or-create Stripe customer for the user (idempotent on email).
    const userEmail = req.user?.email;
    let customer = null;
    if (userEmail) {
      try {
        customer = await this.stripe.getOrCreateCustomer({
          userId: userId ?? 'anonymous',
          email: userEmail,
        });
      } catch {
        // fall through; PaymentIntent still works without customer
      }
    }

    const ephemeralKey = customer
      ? await stripeApi.ephemeralKeys.create(
          { customer: customer.id },
          { apiVersion: '2023-08-16' },
        )
      : null;

    const intent = await this.stripe.createPaymentIntent({
      amount: finalCents,
      currency: 'usd',
      paymentMethod: 'stripe' as any,
      userId: userId ?? 'anonymous',
      paymentId: undefined,
      description: `${body.type} ${body.resource_id}`,
      orderId: body.resource_id,
      customerId: customer?.id,
    });

    return {
      client_secret: intent.clientSecret,
      payment_intent_id: intent.paymentIntentId,
      amount_cents: finalCents,
      currency: 'usd',
      ephemeral_key: ephemeralKey?.secret ?? '',
      customer_id: customer?.id ?? '',
    };
  }

  /**
   * Verify a Checkout Session completed. Mobile polls this after
   * deep-link return to confirm subscription state before showing
   * the success toast.
   */
  @Get('session/:id/verify')
  async verifySession(@Param('id') id: string) {
    if (!this.stripe.isStripeConfigured()) {
      throw new BadRequestException('Stripe is not configured on this server');
    }
    const stripeApi = this.stripe.getStripeInstance();
    if (!stripeApi) {
      throw new BadRequestException('Stripe runtime unavailable');
    }
    const session = await stripeApi.checkout.sessions.retrieve(id);
    if (!session) throw new NotFoundException('Checkout session not found');

    const status =
      session.status === 'complete'
        ? 'complete'
        : session.status === 'expired'
        ? 'expired'
        : 'open';

    return {
      status,
      tier: (session.metadata?.tier as string | undefined) || undefined,
      amount_total_cents: session.amount_total ?? 0,
      currency: session.currency ?? 'usd',
    };
  }

  // ── Helpers ──────────────────────────────────────────────────

  private buildLineItems(body: SessionRequestBody): Stripe.Checkout.SessionCreateParams.LineItem[] {
    if (body.mode === 'subscription') {
      const tier = (body.tier ?? 'lite').toLowerCase();
      const cycle = body.billing_cycle ?? 'monthly';
      const cents =
        cycle === 'yearly'
          ? TIER_PRICE_CENTS_YEARLY[tier] ?? 9900
          : TIER_PRICE_CENTS_MONTHLY[tier] ?? 990;
      return [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: cents,
            recurring: { interval: cycle === 'yearly' ? 'year' : 'month' },
            product_data: {
              name: `Agentrix ${tier.toUpperCase()} (${cycle})`,
              metadata: { tier, billing_cycle: cycle },
            },
          },
        },
      ];
    }

    if (!body.line_items || body.line_items.length === 0) {
      throw new BadRequestException('line_items is required for payment mode');
    }
    return body.line_items.map((li) => ({
      quantity: li.quantity ?? 1,
      price_data: {
        currency: 'usd',
        unit_amount: this.priceCentsForLineItem(li.type, li.resource_id),
        product_data: {
          name: `${li.type} ${li.resource_id}`,
          metadata: { type: li.type, resource_id: li.resource_id },
        },
      },
    }));
  }

  private priceCentsForLineItem(type: string, _resourceId: string): number {
    // Future: look up the actual price by resource_id from Marketplace /
    // PetSkin / Task tables. For M-P0-5 we use bucketed defaults and a
    // metadata pointer so the mobile UI can show the right total.
    switch (type) {
      case 'skin':
        return SKIN_DEFAULT_CENTS;
      case 'axp_topup':
        return AXP_TOPUP_PER_PACK_CENTS;
      case 'task_bounty':
        return TASK_BOUNTY_DEFAULT_CENTS;
      case 'skill':
        return SKILL_DEFAULT_CENTS;
      default:
        return 100;
    }
  }
}
