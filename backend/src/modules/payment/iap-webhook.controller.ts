/**
 * IAP webhook controller — Sprint M-P0-3 (Android-first).
 *
 *   POST /api/v1/payment/iap-webhook
 *
 * Receives RevenueCat events for in-app purchases. RevenueCat is the
 * single source of truth for both Apple App Store / Google Play, so
 * we don't need to implement the App Store Server / Play Developer
 * server APIs ourselves.
 *
 * Event types we care about:
 *   - INITIAL_PURCHASE / NON_RENEWING_PURCHASE → mark user subscription
 *     active, credit AXP top-up, etc.
 *   - RENEWAL → extend subscription period.
 *   - CANCELLATION / EXPIRATION → mark subscription inactive.
 *
 * Auth: RevenueCat sends an `Authorization: Bearer <shared_secret>`
 * header. We verify against `REVENUECAT_WEBHOOK_SECRET` env. If unset
 * we accept all in dev / reject all in prod (fail-closed).
 *
 * For now this controller is a stub that logs + acks — once the
 * real fulfillment logic (subscription extension, AXP crediting) is
 * wired we replace the inner switch.
 */
import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators/public.decorator';
import { AxpService } from '../axp/axp.service';

interface RevenueCatEvent {
  event: {
    type: string;
    app_user_id?: string;
    aliases?: string[];
    product_id?: string;
    period_type?: string;
    purchased_at_ms?: number;
    expiration_at_ms?: number | null;
    store?: string;
    transaction_id?: string;
    is_trial_conversion?: boolean;
    metadata?: Record<string, unknown>;
  };
}

@Public()
@Controller('v1/payment')
export class IapWebhookController {
  private readonly logger = new Logger(IapWebhookController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly axp: AxpService,
  ) {}

  @Post('iap-webhook')
  @HttpCode(HttpStatus.OK)
  async receive(
    @Headers('authorization') auth: string | undefined,
    @Body() body: RevenueCatEvent,
  ) {
    const secret = this.config.get<string>('REVENUECAT_WEBHOOK_SECRET');
    if (secret) {
      const expected = `Bearer ${secret}`;
      if (auth !== expected) {
        throw new UnauthorizedException('Invalid webhook signature');
      }
    } else if (process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException('REVENUECAT_WEBHOOK_SECRET not configured');
    }

    if (!body?.event?.type) {
      throw new BadRequestException('Missing event type');
    }
    const evt = body.event;
    const userId = evt.app_user_id || (evt.aliases && evt.aliases[0]);

    this.logger.log(
      `[iap] event=${evt.type} product=${evt.product_id} user=${userId} txn=${evt.transaction_id}`,
    );

    // Dispatcher — keep light for now; full fulfillment in
    // a follow-up sprint when the Play Console product IDs are finalized.
    switch (evt.type) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'NON_RENEWING_PURCHASE':
        await this.handlePurchase(userId, evt);
        break;
      case 'CANCELLATION':
      case 'EXPIRATION':
      case 'BILLING_ISSUE':
        await this.handleLapse(userId, evt);
        break;
      case 'PRODUCT_CHANGE':
      case 'TEMPORARY_ENTITLEMENT_GRANT':
      case 'UNCANCELLATION':
      case 'TRANSFER':
      case 'TEST':
        // No-op for now; logging above is enough.
        break;
      default:
        this.logger.warn(`[iap] unhandled event type: ${evt.type}`);
    }

    return { ok: true };
  }

  // ── Handlers ──────────────────────────────────────────────────

  private async handlePurchase(userId: string | undefined, evt: RevenueCatEvent['event']) {
    if (!userId) {
      this.logger.warn('[iap] purchase event without app_user_id; skipping fulfillment');
      return;
    }
    const productId = evt.product_id || '';

    // Map AXP top-up products by product_id pattern. Conventions:
    //   axp_pack_100  -> +100 AXP
    //   axp_pack_500  -> +500 AXP (10% bonus)
    //   axp_pack_1200 -> +1200 AXP (20% bonus, $9.99)
    if (productId.startsWith('axp_pack_')) {
      const amount = Number(productId.replace('axp_pack_', '')) || 0;
      if (amount > 0) {
        try {
          await this.axp.earn({
            userId,
            source: 'admin_grant',
            amount,
            refId: evt.transaction_id ?? null,
            note: `IAP top-up via ${evt.store ?? 'store'}`,
            metadata: {
              iap_product: productId,
              transaction_id: evt.transaction_id,
              store: evt.store,
            },
          });
          this.logger.log(`[iap] credited ${amount} AXP to ${userId} from ${productId}`);
        } catch (e) {
          this.logger.error(
            `[iap] AXP credit failed for ${userId}: ${(e as Error).message}`,
          );
        }
      }
      return;
    }

    // Subscription products (sub_lite_monthly, sub_pro_yearly, ...) —
    // fulfillment handled by SubscriptionService when wired. For now we
    // just record the receipt; the upstream `/v1/subscription` endpoints
    // will pick this up via lookup.
    this.logger.log(`[iap] subscription receipt recorded: ${productId} for ${userId}`);
  }

  private async handleLapse(userId: string | undefined, evt: RevenueCatEvent['event']) {
    if (!userId) return;
    this.logger.log(
      `[iap] lapse: user=${userId} product=${evt.product_id} type=${evt.type}`,
    );
    // Subscription expiry handling: mark the user's subscription
    // as `inactive` in DB. Implementation deferred until the dedicated
    // SubscriptionService is part of this codebase.
  }
}
