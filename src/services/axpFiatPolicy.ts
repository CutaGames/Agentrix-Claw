/**
 * axpFiatPolicy — AXP is never sold for money on mobile.
 *
 * Policy (2026-09-27, Stripe product-fit review): AXP can only be earned and
 * redeemed for in-app benefits. It cannot be bought, withdrawn, or shown with
 * a fixed dollar value. This module is the client-side guard for the two
 * purchase rails the app has:
 *   - Stripe checkout (`stripeCheckout.service.ts`): no `axp_topup` line items.
 *   - Store IAP via RevenueCat (`iap.service.ts`): no `axp_pack_*` products.
 *
 * The backend must refuse these too; this guard makes sure the phone never
 * even starts such a purchase.
 */

export const AXP_FIAT_PURCHASE_BLOCKED = 'AXP_FIAT_PURCHASE_BLOCKED' as const;

export class AxpFiatPurchaseBlockedError extends Error {
  readonly code = AXP_FIAT_PURCHASE_BLOCKED;
  readonly productRef: string;

  constructor(productRef: string) {
    super(`${AXP_FIAT_PURCHASE_BLOCKED}: AXP cannot be bought (${productRef})`);
    this.name = 'AxpFiatPurchaseBlockedError';
    this.productRef = productRef;
  }
}

/**
 * True when a checkout line-item type or store product id refers to AXP.
 * Matches on whole segments so `axp_pack_1000`, `axp_topup`,
 * `com.agentrix.axp.pack1000` and `AXP-Topup` are caught, while unrelated
 * ids that merely contain the letters (e.g. `maxpower`) are not.
 */
export function isAxpFiatProduct(ref: unknown): boolean {
  if (typeof ref !== 'string') return false;
  const segments = ref.trim().toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return segments.some((segment) => segment === 'axp' || /^axp(pack|topup|coins?|credits?)\d*$/.test(segment));
}

export function assertNoAxpFiatPurchase(refs: readonly unknown[]): void {
  for (const ref of refs) {
    if (isAxpFiatProduct(ref)) {
      throw new AxpFiatPurchaseBlockedError(String(ref));
    }
  }
}

/** Identifiers a RevenueCat package can carry (package, store product, offering). */
export function iapPackageRefs(pkg: unknown): string[] {
  if (!pkg || typeof pkg !== 'object') return [];
  const record = pkg as Record<string, any>;
  const refs = [
    record.identifier,
    record.product?.identifier,
    record.storeProduct?.identifier,
    record.offeringIdentifier,
    record.presentedOfferingContext?.offeringIdentifier,
  ];
  return refs.filter((ref): ref is string => typeof ref === 'string' && ref.length > 0);
}

export function isAxpIapPackage(pkg: unknown): boolean {
  return iapPackageRefs(pkg).some(isAxpFiatProduct);
}

export function isAxpFiatPurchaseBlockedError(error: unknown): error is AxpFiatPurchaseBlockedError {
  return !!error && typeof error === 'object' && (error as { code?: unknown }).code === AXP_FIAT_PURCHASE_BLOCKED;
}
