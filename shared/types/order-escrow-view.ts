/**
 * Order views on the client side (T7, order contract `shared/types/order-escrow.ts` v0.7).
 *
 * Moved from the Web's `frontend/lib/orders/model.ts` (@ 208c48ed) so Web and the phone decode
 * and display orders the same way (REQ-mobile-049, backend answer 4: a separate file, so display
 * logic can change without a contract version). Everything that was there is unchanged; v0.7 adds
 * `deliveryDraft` to the seller view (below). Pure functions only: no transport, no React.
 *
 * Nothing here decides a price or a rule on its own:
 * - amounts are whatever the server wrote into the offer or order;
 * - which buttons show comes from `ORDER_TRANSITIONS` (via
 *   `availableOrderActionsV1`), narrowed only by facts the view carries
 *   (a payment deadline that has passed, an acceptance window that closed,
 *   an `unknown` result);
 * - a view that does not decode is a contract error, never a partial order.
 *
 * Contract v0.4 (`040a7755`, REQ-web-016) defines the offer (`OrderOfferV1`),
 * `buyerNote` and `delivery` in both views, and every route.
 */
import {
  ESCROW_STATES,
  ORDER_ESCROW_SCHEMA_VERSION,
  ORDER_KINDS,
  ORDER_STATUSES,
  availableOrderActionsV1,
  isAllowedPaymentRedirectV1,
  orderDeliveryDigestV1,
  type EscrowStateV1,
  type OrderActionRequestV1,
  type OrderActionV1,
  type OrderBuyerViewV1,
  type OrderDeliveryDraftV1,
  type OrderDeliveryV1,
  type OrderKindV1,
  type OrderOfferV1,
  type OrderSellerViewV1,
  type OrderStatusV1,
  type PayOrderResponseV1,
} from './order-escrow';
import { MINOR_AMOUNT_PATTERN, type Money } from './trust-loop-primitives';

export type OrderRole = 'buyer' | 'seller_owner';
/** The actions a person can send from a page (system and platform actions never are). */
export type ClientOrderAction = OrderActionRequestV1['action'];

export type OrderOffer = OrderOfferV1;
export type OrderDelivery = OrderDeliveryV1;
export type OrderDeliveryDraft = OrderDeliveryDraftV1;
export type OrderBuyerView = OrderBuyerViewV1;
/** Decoded seller view: `deliveryDraft` is always present (`null` when there is none, or from a pre-v0.7 server). */
export type OrderSellerView = OrderSellerViewV1 & { deliveryDraft: OrderDeliveryDraftV1 | null };
export type OrderView = OrderBuyerView | OrderSellerView;

// ---------------------------------------------------------------------------
// Decoders

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isIso(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function optionalIso(value: unknown): string | undefined | null {
  if (value === undefined || value === null) return undefined;
  return isIso(value) ? value : null;
}

/** A non-negative amount: the Web never shows or sends a negative price. */
export function decodeMoney(value: unknown): Money | null {
  if (!isRecord(value)) return null;
  const { amountMinor, currency, decimals } = value;
  if (typeof amountMinor !== 'string' || !MINOR_AMOUNT_PATTERN.test(amountMinor) || amountMinor.startsWith('-')) return null;
  if (typeof currency !== 'string' || !/^[A-Z]{3,5}$/.test(currency)) return null;
  if (typeof decimals !== 'number' || !Number.isInteger(decimals) || decimals < 0 || decimals > 18) return null;
  return { amountMinor, currency, decimals };
}

function isKind(value: unknown): value is OrderKindV1 {
  return (ORDER_KINDS as readonly unknown[]).includes(value);
}

function isEnvironment(value: unknown): value is 'test' | 'live' {
  return value === 'test' || value === 'live';
}

function nonEmpty(value: unknown, max = 400): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

export function decodeOrderOffer(value: unknown): OrderOffer | null {
  if (!isRecord(value)) return null;
  const price = decodeMoney(value.price);
  if (
    !nonEmpty(value.offerRef, 200)
    || !isKind(value.kind)
    || !nonEmpty(value.sellerAgentId, 200)
    || !nonEmpty(value.sellerDisplayName, 120)
    || !nonEmpty(value.title, 200)
    || !price
    || typeof value.acceptanceWindowSeconds !== 'number'
    || !Number.isInteger(value.acceptanceWindowSeconds)
    || value.acceptanceWindowSeconds <= 0
    || !isEnvironment(value.environment)
  ) {
    return null;
  }
  return {
    offerRef: value.offerRef,
    kind: value.kind,
    sellerAgentId: value.sellerAgentId,
    sellerDisplayName: value.sellerDisplayName,
    title: value.title,
    description: typeof value.description === 'string' && value.description.trim() ? value.description : null,
    price,
    acceptanceWindowSeconds: value.acceptanceWindowSeconds,
    environment: value.environment,
  };
}

/** `null` before delivery; `undefined` when malformed (or missing: the field is required since v0.4). */
function decodeDelivery(value: unknown): OrderDelivery | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const answerText = value.answerText === null ? null : typeof value.answerText === 'string' ? value.answerText : undefined;
  if (answerText === undefined) return undefined;
  const refs = value.deliveryRefs;
  if (!Array.isArray(refs) || !refs.every((ref) => typeof ref === 'string')) return undefined;
  return { answerText, deliveryRefs: [...refs] };
}

const DELIVERY_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

/**
 * v0.7 seller-only draft. Missing or `null` → `null` (a pre-v0.7 server never sends it);
 * `undefined` when malformed. The digest is only checked for shape here; whether it matches
 * the content is {@link reviewableDeliveryDraft}'s question.
 */
function decodeDeliveryDraft(value: unknown): OrderDeliveryDraft | null | undefined {
  if (value === undefined || value === null) return null;
  if (!isRecord(value) || typeof value.digest !== 'string' || !DELIVERY_DIGEST_PATTERN.test(value.digest)) return undefined;
  const content = decodeDelivery({ answerText: value.answerText, deliveryRefs: value.deliveryRefs });
  if (!content) return undefined;
  return { ...content, digest: value.digest };
}

/** Fields both views share; `null` when any required one is missing or out of the contract's range. */
function decodeCommon(value: Record<string, unknown>) {
  const escrow = value.escrow;
  if (
    value.schemaVersion !== ORDER_ESCROW_SCHEMA_VERSION
    || !nonEmpty(value.orderId, 200)
    || !isKind(value.kind)
    || !nonEmpty(value.offerRef, 200)
    || !(ORDER_STATUSES as readonly unknown[]).includes(value.status)
    || !isRecord(escrow)
    || !(ESCROW_STATES as readonly unknown[]).includes(escrow.state)
    || typeof value.acceptanceWindowSeconds !== 'number'
    || !Number.isInteger(value.acceptanceWindowSeconds)
    || value.acceptanceWindowSeconds < 0
    || !isEnvironment(value.environment)
    || !isIso(value.createdAt)
    || !isIso(value.updatedAt)
    || typeof value.version !== 'number'
    || !Number.isInteger(value.version)
    || value.version < 0
  ) {
    return null;
  }
  const paymentDeadline = optionalIso(value.paymentDeadline);
  // v0.13: absent from older servers, null while the deadline switch is off.
  const deliveryDeadline = optionalIso(value.deliveryDeadline);
  const deliveredAt = optionalIso(value.deliveredAt);
  const acceptedAt = optionalIso(value.acceptedAt);
  const delivery = decodeDelivery(value.delivery);
  if (paymentDeadline === null || deliveryDeadline === null || deliveredAt === null || acceptedAt === null || delivery === undefined) return null;
  if (typeof value.buyerNote !== 'string') return null;
  const escrowDates: { heldAt?: string; releasedAt?: string; refundedAt?: string } = {};
  for (const key of ['heldAt', 'releasedAt', 'refundedAt'] as const) {
    const at = optionalIso(escrow[key]);
    if (at === null) return null;
    if (at) escrowDates[key] = at;
  }
  return {
    schemaVersion: ORDER_ESCROW_SCHEMA_VERSION,
    orderId: value.orderId,
    kind: value.kind,
    offerRef: value.offerRef,
    status: value.status as OrderStatusV1,
    escrow: { state: escrow.state as EscrowStateV1, ...escrowDates },
    ...(paymentDeadline ? { paymentDeadline } : {}),
    ...(deliveryDeadline ? { deliveryDeadline } : {}),
    acceptanceWindowSeconds: value.acceptanceWindowSeconds,
    ...(deliveredAt ? { deliveredAt } : {}),
    ...(acceptedAt ? { acceptedAt } : {}),
    environment: value.environment,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    version: value.version,
    buyerNote: value.buyerNote,
    delivery,
  };
}

export function decodeOrderBuyerView(value: unknown): OrderBuyerView | null {
  if (!isRecord(value)) return null;
  const common = decodeCommon(value);
  const total = decodeMoney(value.total);
  const seller = value.seller;
  if (!common || !total || !isRecord(seller) || !nonEmpty(seller.agentId, 200) || !nonEmpty(seller.displayName, 120)) return null;
  // The buyer view never carries the owner's account, the grant, the fee split, or the seller's draft (v0.7).
  if ('parties' in value || 'mandateRef' in value || 'amounts' in value || 'deliveryDraft' in value) return null;
  return { ...common, seller: { agentId: seller.agentId, displayName: seller.displayName }, total };
}

export function decodeOrderSellerView(value: unknown): OrderSellerView | null {
  if (!isRecord(value)) return null;
  const common = decodeCommon(value);
  const amounts = value.amounts;
  const buyer = value.buyer;
  const mandate = value.mandateRef;
  if (!common || !isRecord(amounts) || !isRecord(buyer) || !isRecord(mandate) || !nonEmpty(value.sellerAgentId, 200)) return null;
  // The seller view never carries the buyer's account id.
  if ('parties' in value || 'userId' in buyer || 'visitorRef' in buyer) return null;
  const total = decodeMoney(amounts.total);
  const platformFee = decodeMoney(amounts.platformFee);
  const bearer = amounts.processingFeeBearer;
  if (!total || !platformFee || (bearer !== 'seller' && bearer !== 'platform' && bearer !== 'undecided')) return null;
  if (buyer.kind !== 'user' && buyer.kind !== 'visitor') return null;
  if (buyer.displayName !== null && typeof buyer.displayName !== 'string') return null;
  if (!nonEmpty(mandate.grantRef, 200) || typeof mandate.grantVersion !== 'number') return null;
  const deliveryDraft = decodeDeliveryDraft(value.deliveryDraft);
  if (deliveryDraft === undefined) return null;
  return {
    ...common,
    amounts: { total, platformFee, processingFeeBearer: bearer },
    buyer: { displayName: typeof buyer.displayName === 'string' && buyer.displayName.trim() ? buyer.displayName : null, kind: buyer.kind },
    mandateRef: { grantRef: mandate.grantRef, grantVersion: mandate.grantVersion },
    sellerAgentId: value.sellerAgentId,
    deliveryDraft,
  };
}

/**
 * A list response: `{ items: [...] }` (or a bare array). `null` when it is not a list or any
 * item fails to decode: one bad order is a contract error for the whole list, never a gap.
 */
export function decodeOrderItems<T>(value: unknown, decode: (item: unknown) => T | null): T[] | null {
  const items = isRecord(value) && Array.isArray(value.items) ? value.items : Array.isArray(value) ? value : null;
  if (!items) return null;
  const decoded: T[] = [];
  for (const item of items) {
    const one = decode(item);
    if (one === null) return null;
    decoded.push(one);
  }
  return decoded;
}

/**
 * Web only follows a Stripe hosted page (v0 always answers the Web with one).
 * A client secret needs Stripe's own script, which the Web does not load (no
 * new dependency); it fails closed.
 */
export type PayStartV0 =
  | { kind: 'redirect'; url: string }
  | { kind: 'unsupported'; reason: 'client_secret' };

export function decodePayResponse(value: unknown): PayStartV0 | null {
  if (!isRecord(value)) return null;
  const response = value as Partial<PayOrderResponseV1> & Record<string, unknown>;
  if (response.kind === 'redirect') {
    return typeof response.url === 'string' && isAllowedPaymentRedirectV1(response.url) ? { kind: 'redirect', url: response.url } : null;
  }
  if (response.kind === 'client_secret' && typeof response.clientSecret === 'string') return { kind: 'unsupported', reason: 'client_secret' };
  return null;
}

// ---------------------------------------------------------------------------
// What a person can do now

const CLIENT_ACTIONS: ReadonlySet<OrderActionV1> = new Set<OrderActionV1>(['pay', 'cancel', 'deliver', 'accept', 'refund', 'open_dispute', 'request_refund']);

function passed(iso: string | undefined, nowMs: number): boolean {
  if (!iso) return false;
  const at = Date.parse(iso);
  return Number.isFinite(at) && at <= nowMs;
}

/**
 * Buttons for this person on this order, from `ORDER_TRANSITIONS`. Narrowed by:
 * `unknown` → none (do not pay twice); a payment deadline that passed → no pay;
 * an acceptance window that closed → no dispute; a refund request only after the delivery deadline (v0.13).
 */
export function orderActionsFor(
  view: Pick<OrderView, 'status' | 'paymentDeadline' | 'deliveredAt' | 'acceptanceWindowSeconds'> & { deliveryDeadline?: string | null },
  role: OrderRole,
  nowMs = Date.now(),
): ClientOrderAction[] {
  if (view.status === 'unknown') return [];
  return availableOrderActionsV1(view.status, role)
    .filter((action): action is ClientOrderAction => CLIENT_ACTIONS.has(action))
    .filter((action) => {
      if (action === 'pay') return !passed(view.paymentDeadline, nowMs);
      // v0.13: only once the delivery deadline passed with nothing delivered.
      if (action === 'request_refund') return !view.deliveredAt && passed(view.deliveryDeadline ?? undefined, nowMs);
      if (action === 'open_dispute') {
        if (!view.deliveredAt) return false;
        const closes = Date.parse(view.deliveredAt) + view.acceptanceWindowSeconds * 1000;
        return Number.isFinite(closes) && nowMs < closes;
      }
      return true;
    });
}

/** The digest the owner confirms for exactly the delivery on screen. */
export function reviewedDeliveryDigest(orderId: string, delivery: OrderDelivery): string {
  return orderDeliveryDigestV1({ orderId, deliveryRefs: delivery.deliveryRefs, answerText: delivery.answerText });
}

/**
 * v0.7: the saved draft the owner can deliver as it stands (`deliver` with only
 * `reviewedDeliveryDigest`). `null` unless the order can be delivered now, a draft exists,
 * and the digest recomputed over the draft's own content equals the server's: the digest
 * that goes out is always the one for the content on screen. If the draft changes after
 * the owner read it, the server answers `delivery_digest_mismatch`.
 */
export function reviewableDeliveryDraft(view: OrderSellerView, nowMs = Date.now()): { draft: OrderDeliveryDraft; digest: string } | null {
  const draft = view.deliveryDraft;
  if (!draft || !orderActionsFor(view, 'seller_owner', nowMs).includes('deliver')) return null;
  const digest = reviewedDeliveryDigest(view.orderId, draft);
  return digest === draft.digest ? { draft, digest } : null;
}

// ---------------------------------------------------------------------------
// Money

/** Exact decimal from the minor-unit string (no floating point): `12.50 USD`. */
export function formatMoney(money: Money): string {
  const digits = money.amountMinor.replace(/^-/, '');
  const padded = digits.padStart(money.decimals + 1, '0');
  const whole = money.decimals > 0 ? padded.slice(0, padded.length - money.decimals) : padded;
  const fraction = money.decimals > 0 ? padded.slice(padded.length - money.decimals) : '';
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${grouped}${fraction ? `.${fraction}` : ''} ${money.currency}`;
}

export function formatDuration(seconds: number, zh: boolean): string {
  const hours = Math.round(seconds / 3600);
  if (hours >= 48 && hours % 24 === 0) return zh ? `${hours / 24} 天` : `${hours / 24} days`;
  if (hours >= 1) return zh ? `${hours} 小时` : `${hours} hours`;
  const minutes = Math.max(1, Math.round(seconds / 60));
  return zh ? `${minutes} 分钟` : `${minutes} min`;
}
