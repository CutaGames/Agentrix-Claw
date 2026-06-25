import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MarketplacePetListing } from '../../entities/marketplace-pet-listing.entity';
import { AncestorChainService } from './ancestor-chain.service';
import { splitRoyalty, RoyaltySplitResult } from './royalty-splitter';
import { StripeConnectService } from '../payment/stripe-connect.service';

/**
 * MarketplaceSettlementBridge — Phase 3 W3 BE-T3.8.
 *
 * Triggered by the controller (or downstream Stripe webhook) once a listing
 * transitions to `sold`. Resolves the royalty split and dispatches Stripe
 * Connect transfers. Behaviour:
 *
 *  - StripeConnectService missing OR resolveAccountId returns null
 *      → record `manualPayoutPending: true`, no transfer attempted.
 *  - Each payout (royalty + seller) becomes one Connect transfer with idempotency
 *    key `mp_settle:<listingId>:<recipientId>:<reason>`.
 *  - Platform cut stays on the platform account (no transfer).
 *  - Idempotent: re-running on the same listing skips already-settled payouts
 *    (relies on Stripe-side idempotency keys).
 *
 * Account resolution: caller supplies `resolveStripeAccount(userId)` strategy.
 * In production this would be `userRepo.findOne(...).stripeConnectAccountId`.
 */

const PLATFORM_BPS_DEFAULT = 500; // 5%

export interface SettlementResult {
  listingId: string;
  split: RoyaltySplitResult;
  transfers: Array<{
    recipientUserId: string;
    amountCents: number;
    reason: 'royalty' | 'seller';
    transferId?: string;
    manualPayoutPending?: boolean;
    error?: string;
  }>;
}

export type StripeAccountResolver = (userId: string) => Promise<string | null>;

@Injectable()
export class MarketplaceSettlementBridge {
  private readonly logger = new Logger(MarketplaceSettlementBridge.name);

  constructor(
    @InjectRepository(MarketplacePetListing)
    private readonly listingRepo: Repository<MarketplacePetListing>,
    private readonly ancestorChain: AncestorChainService,
    @Optional() private readonly stripeConnect?: StripeConnectService,
  ) {}

  /**
   * Settle a sold listing. Caller passes the account resolver (we don't own
   * the user→stripe mapping in this module).
   */
  async settleSoldListing(
    listingId: string,
    resolveStripeAccount: StripeAccountResolver,
    opts: { platformBps?: number } = {},
  ): Promise<SettlementResult> {
    const listing = await this.listingRepo.findOne({ where: { id: listingId } });
    if (!listing) throw new Error(`listing ${listingId} not found`);
    if (listing.status !== 'sold' || !listing.finalPriceUsd) {
      throw new Error(`listing ${listingId} not sold yet (status=${listing.status})`);
    }

    const grossCents = Math.round(Number(listing.finalPriceUsd) * 100);
    if (!Number.isFinite(grossCents) || grossCents <= 0) {
      throw new Error(`listing ${listingId} invalid finalPriceUsd=${listing.finalPriceUsd}`);
    }

    const chain = await this.ancestorChain.resolveChain(listing.petSkinId);
    const split = splitRoyalty({
      grossPriceCents: grossCents,
      platformBps: opts.platformBps ?? PLATFORM_BPS_DEFAULT,
      sellerUserId: listing.sellerUserId,
      ancestorChain: chain,
    });

    const transfers: SettlementResult['transfers'] = [];
    for (const payout of split.payouts) {
      if (payout.reason === 'platform') continue; // stays on platform account
      if (payout.amountCents <= 0) continue;

      const accountId = await resolveStripeAccount(payout.recipientUserId);
      if (!accountId || !this.stripeConnect) {
        transfers.push({
          recipientUserId: payout.recipientUserId,
          amountCents: payout.amountCents,
          reason: payout.reason,
          manualPayoutPending: true,
        });
        this.logger.warn(
          `Manual payout pending listing=${listingId} user=${payout.recipientUserId} amount=${payout.amountCents}c reason=${payout.reason} (no Stripe Connect account)`,
        );
        continue;
      }

      try {
        const transfer = await this.stripeConnect.createTransfer({
          amount: payout.amountCents / 100,
          destinationAccountId: accountId,
          description: `Marketplace ${payout.reason} for listing ${listingId}`,
          metadata: {
            listingId,
            recipientUserId: payout.recipientUserId,
            reason: payout.reason,
            ancestorLayer: String(payout.ancestorLayer ?? ''),
            idempotencyKey: `mp_settle:${listingId}:${payout.recipientUserId}:${payout.reason}`,
          },
        });
        transfers.push({
          recipientUserId: payout.recipientUserId,
          amountCents: payout.amountCents,
          reason: payout.reason,
          transferId: transfer.id,
        });
      } catch (err: any) {
        this.logger.error(
          `Stripe transfer failed listing=${listingId} user=${payout.recipientUserId}: ${err?.message || err}`,
        );
        transfers.push({
          recipientUserId: payout.recipientUserId,
          amountCents: payout.amountCents,
          reason: payout.reason,
          error: err?.message || String(err),
        });
      }
    }

    return { listingId, split, transfers };
  }
}
