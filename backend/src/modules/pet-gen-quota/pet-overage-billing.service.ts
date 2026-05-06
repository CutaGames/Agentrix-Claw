import { Injectable, Logger } from '@nestjs/common';
import { PetGenQuotaService } from './pet-gen-quota.service';

/**
 * PetOverageBillingService — Phase 2 W3 BE-T2.5
 *
 * Bridges Stripe webhook → PetGenQuotaService.confirm() for overage charges.
 * The Stripe webhook handler calls `handlePaymentIntentSucceeded()` with a
 * subset of the PaymentIntent metadata. We act ONLY when
 * `metadata.purpose === 'pet_overage'`, otherwise it is a no-op.
 *
 * Expected metadata keys (set by PetCreator during Stripe checkout creation):
 *  - purpose         = 'pet_overage'
 *  - quotaId         (uuid)
 *  - petGenTaskId    (optional, for cross-ref)
 *
 * The bridge is idempotent: if `confirm` errors because the quota row was
 * already confirmed (no reserved capacity), we swallow it and log; the upstream
 * caller (stripe-webhook) is also wrapped in idempotency at the event_id level.
 */
@Injectable()
export class PetOverageBillingService {
  private readonly logger = new Logger(PetOverageBillingService.name);

  constructor(private readonly quotaService: PetGenQuotaService) {}

  /** Called from StripeWebhookService.handlePaymentIntentSucceeded (best-effort). */
  async handlePaymentIntentSucceeded(input: {
    paymentIntentId: string;
    amount: number; // USD cents → caller passes already divided
    metadata: Record<string, string | undefined> | null | undefined;
  }): Promise<{ handled: boolean; reason?: string }> {
    const md = input.metadata ?? {};
    if (md.purpose !== 'pet_overage') {
      return { handled: false, reason: 'not_pet_overage' };
    }
    const quotaId = md.quotaId;
    if (!quotaId) {
      this.logger.warn(
        `[BE-T2.5] pet_overage webhook missing quotaId paymentIntent=${input.paymentIntentId}`,
      );
      return { handled: false, reason: 'missing_quota_id' };
    }
    try {
      const updated = await this.quotaService.confirm(quotaId, 'overage');
      this.logger.log(
        `[BE-T2.5] pet_overage confirmed quotaId=${quotaId} period=${updated.period} overageUsed=${updated.overageUsed}`,
      );
      return { handled: true };
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (/no reserved capacity/i.test(msg)) {
        this.logger.warn(`[BE-T2.5] pet_overage idempotent skip quotaId=${quotaId}`);
        return { handled: false, reason: 'already_confirmed' };
      }
      this.logger.error(`[BE-T2.5] pet_overage confirm failed quotaId=${quotaId}: ${msg}`);
      throw err;
    }
  }
}
