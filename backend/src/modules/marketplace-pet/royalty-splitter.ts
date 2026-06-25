/**
 * Royalty splitter — Phase 3 W1 BE-T3.4 / BE-T3.5.
 *
 * Computes how a sale price is divided across:
 *   1. The original creator chain (up to 3 ancestors deep)
 *   2. The current seller (residual)
 *   3. The platform commission
 *
 * Pure function — no DB / no DI. Service layer assembles the chain and calls this.
 *
 * Rules (v1):
 *  - Platform takes `platformBps` first off the gross.
 *  - Then for each ancestor in the chain (oldest first), apply that link's
 *    `royaltyRateBps` to the ORIGINAL gross (not residual). This matches
 *    industry convention (e.g. EIP-2981 royalties are flat on price).
 *  - Stop at 3 ancestors. Anything beyond is collapsed into the seller.
 *  - If royalty + platform exceeds gross, scale royalties down proportionally
 *    so seller never goes negative; emit a warning flag.
 *  - All math in cents (integer) to avoid float drift.
 */

export interface RoyaltyChainLink {
  /** Creator user id at this layer of the lineage. */
  creatorUserId: string;
  /** Royalty rate in basis points (0..10000) declared at this skin's mint. */
  royaltyRateBps: number;
}

export interface RoyaltySplitInput {
  /** Sale gross price in USD cents. */
  grossPriceCents: number;
  /** Platform take in basis points (e.g. 500 = 5%). */
  platformBps: number;
  /** Seller user id (current owner who is selling). */
  sellerUserId: string;
  /**
   * Lineage from oldest to newest. The original creator is at index 0, the
   * direct parent at the end. Pass the seller's own skin's chain INCLUDING
   * itself; the splitter ignores the trailing entry if its `creatorUserId`
   * equals `sellerUserId` (no self-royalty).
   */
  ancestorChain: RoyaltyChainLink[];
  /** Maximum number of ancestor links honoured (default 3). */
  maxAncestors?: number;
}

export interface RoyaltyPayout {
  recipientUserId: string;
  /** Amount in USD cents. */
  amountCents: number;
  /** Description of what this payout is for. */
  reason: 'platform' | 'royalty' | 'seller';
  /** Layer index for royalty payouts (0 = original creator). */
  ancestorLayer?: number;
}

export interface RoyaltySplitResult {
  payouts: RoyaltyPayout[];
  totalRoyaltyCents: number;
  platformCents: number;
  sellerCents: number;
  /** True when royalties had to be scaled down because they would have made seller negative. */
  scaledDown: boolean;
}

const DEFAULT_MAX_ANCESTORS = 3;

export function splitRoyalty(input: RoyaltySplitInput): RoyaltySplitResult {
  const gross = Math.max(0, Math.floor(input.grossPriceCents));
  const platformBps = clampBps(input.platformBps);
  const maxAncestors = input.maxAncestors ?? DEFAULT_MAX_ANCESTORS;

  const platformCents = Math.floor((gross * platformBps) / 10000);

  // Filter chain: drop self-royalty + cap at maxAncestors (oldest first).
  const honouredChain: Array<{ link: RoyaltyChainLink; layer: number }> = [];
  for (let i = 0; i < input.ancestorChain.length && honouredChain.length < maxAncestors; i++) {
    const link = input.ancestorChain[i];
    if (!link || link.creatorUserId === input.sellerUserId) continue;
    if (clampBps(link.royaltyRateBps) === 0) continue;
    honouredChain.push({ link, layer: i });
  }

  const rawRoyalties = honouredChain.map(({ link, layer }) => ({
    recipientUserId: link.creatorUserId,
    amountCents: Math.floor((gross * clampBps(link.royaltyRateBps)) / 10000),
    layer,
  }));

  let totalRoyalty = rawRoyalties.reduce((s, r) => s + r.amountCents, 0);
  let scaledDown = false;
  let scale = 1;

  // If platform + royalty > gross, scale royalties down proportionally.
  if (platformCents + totalRoyalty > gross) {
    const room = Math.max(0, gross - platformCents);
    scale = totalRoyalty > 0 ? room / totalRoyalty : 0;
    scaledDown = true;
    for (const r of rawRoyalties) {
      r.amountCents = Math.floor(r.amountCents * scale);
    }
    totalRoyalty = rawRoyalties.reduce((s, r) => s + r.amountCents, 0);
  }

  const sellerCents = Math.max(0, gross - platformCents - totalRoyalty);

  const payouts: RoyaltyPayout[] = [];
  if (platformCents > 0) {
    payouts.push({
      recipientUserId: '__platform__',
      amountCents: platformCents,
      reason: 'platform',
    });
  }
  for (const r of rawRoyalties) {
    if (r.amountCents > 0) {
      payouts.push({
        recipientUserId: r.recipientUserId,
        amountCents: r.amountCents,
        reason: 'royalty',
        ancestorLayer: r.layer,
      });
    }
  }
  payouts.push({
    recipientUserId: input.sellerUserId,
    amountCents: sellerCents,
    reason: 'seller',
  });

  return {
    payouts,
    totalRoyaltyCents: totalRoyalty,
    platformCents,
    sellerCents,
    scaledDown,
  };
}

function clampBps(v: number): number {
  if (!Number.isFinite(v) || v < 0) return 0;
  if (v > 10000) return 10000;
  return Math.floor(v);
}
