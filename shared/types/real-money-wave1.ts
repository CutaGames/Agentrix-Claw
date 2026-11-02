/**
 * Real money, first wave, v0 contract only (L6-8): paid consultations and deposits for the twin, charged in SGD through
 * Stripe, with a take rate; sellers go through Stripe Connect KYC.
 *
 * E95: live charging, live Stripe keys and turning this on need the owner's approval each time (and the lawyer, the
 * collecting entity and OA-67 first). Nothing reads this file in v0 and no key or live switch is defined here.
 */

/** Future server switch; nothing reads it in v0. Turning it on needs the owner's per-instance approval (E95). */
export const REAL_MONEY_WAVE1_FLAG = 'REAL_MONEY_WAVE1_ENABLED';

export const REAL_MONEY_CURRENCY_V0 = 'SGD' as const;
export const REAL_MONEY_ORDER_KINDS_V0 = ['paid_consultation', 'deposit'] as const;
export type RealMoneyOrderKindV0 = (typeof REAL_MONEY_ORDER_KINDS_V0)[number];

export const SELLER_KYC_STATES_V0 = ['not_started', 'pending', 'verified', 'rejected'] as const;
export type SellerKycStateV0 = (typeof SELLER_KYC_STATES_V0)[number];

/** Order v0.13 refund rules this wave may use. */
export const REAL_MONEY_REFUND_RULES_V0 = ['full_before_24h', 'half_before_2h', 'none_after_start'] as const;
export type RealMoneyRefundRuleV0 = (typeof REAL_MONEY_REFUND_RULES_V0)[number];

export const REAL_MONEY_LIMITS_V0 = { minMinor: 100, maxMinor: 500_000, maxTakeRateBps: 3000 } as const;

export interface RealMoneyOrderDraftV0 {
  kind: RealMoneyOrderKindV0;
  amountMinor: number;
  currency: typeof REAL_MONEY_CURRENCY_V0;
  takeRateBps: number;
  refundRule: RealMoneyRefundRuleV0;
}

/** Platform take in minor units, rounded half up; never more than the amount. */
export function realMoneyTakeMinorV0(amountMinor: number, takeRateBps: number): number {
  return Math.min(amountMinor, Math.floor((amountMinor * takeRateBps + 5000) / 10000));
}

/** Only a verified seller can be paid out. */
export function sellerCanReceiveV0(state: SellerKycStateV0): boolean {
  return state === 'verified';
}

export function decodeRealMoneyOrderDraftV0(value: unknown): RealMoneyOrderDraftV0 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const kind = raw.kind;
  const amount = raw.amountMinor;
  const bps = raw.takeRateBps;
  const rule = raw.refundRule;
  const L = REAL_MONEY_LIMITS_V0;
  if (typeof kind !== 'string' || !(REAL_MONEY_ORDER_KINDS_V0 as readonly string[]).includes(kind)) return null;
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < L.minMinor || amount > L.maxMinor) return null;
  if (raw.currency !== REAL_MONEY_CURRENCY_V0) return null;
  if (typeof bps !== 'number' || !Number.isInteger(bps) || bps < 0 || bps > L.maxTakeRateBps) return null;
  if (typeof rule !== 'string' || !(REAL_MONEY_REFUND_RULES_V0 as readonly string[]).includes(rule)) return null;
  return { kind: kind as RealMoneyOrderKindV0, amountMinor: amount, currency: REAL_MONEY_CURRENCY_V0, takeRateBps: bps, refundRule: rule as RealMoneyRefundRuleV0 };
}
