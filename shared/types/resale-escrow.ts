/**
 * L9 devices and assets L4 (S24): item escrow in **test mode** for a second-hand item agreed in a resale conversation.
 *
 * - The buyer whose offer the seller accepted (the listing is `reserved`) may put that amount into the platform's escrow.
 *   It is a bookkeeping order of kind `item_purchase` (migration 2254, G line): always `test`, platform fee 0 (D3), no
 *   payment rail, refused while any real-money switch is on. Nothing is charged and nothing is paid out.
 * - The seller taps "handed over in person" (the order's `deliver`), the buyer taps "received" (`accept`, then the order
 *   settles); 48 hours after the handover the order accepts itself (D2). The buyer may say "there is a problem" within
 *   those 48 hours (the order's dispute). The seller can refund at any point while the money is held; it is also refunded
 *   when nothing was handed over 7 days after it went into escrow, or when the arrangement is gone.
 * - The escrow state is read from the order; `resale_escrow_links` (migration 2260) only remembers which conversation
 *   the order belongs to. Nothing here is added to the existing listing or conversation views.
 * - Switches: backend `RESALE_ESCROW_TEST_V1_ENABLED`, web `NEXT_PUBLIC_RESALE_ESCROW_TEST_ENABLED`; both exactly `'1'`,
 *   default off. Off: every route answers the 404 of a route that does not exist.
 */
import type { ResaleMoneySgdV1 } from './resale';

export const RESALE_ESCROW_TEST_FLAG_V1 = 'RESALE_ESCROW_TEST_V1_ENABLED';
export const RESALE_ESCROW_TEST_WEB_FLAG_V1 = 'NEXT_PUBLIC_RESALE_ESCROW_TEST_ENABLED';

/** Under `/api`. All need a person's own sign-in; the buyer's and the seller's routes are told apart by who calls. */
export const RESALE_ESCROW_ROUTES_V1 = {
  view: 'GET /resale/escrow/threads/:threadRef',
  hold: 'POST /resale/escrow/threads/:threadRef/hold',
  handedOver: 'POST /resale/escrow/threads/:threadRef/handed-over',
  received: 'POST /resale/escrow/threads/:threadRef/received',
  problem: 'POST /resale/escrow/threads/:threadRef/problem',
  refund: 'POST /resale/escrow/threads/:threadRef/refund',
} as const;

/** What the web shows. Read from the order (`resaleEscrowStateFromOrderV1`); `none` when there is no escrow yet. */
export const RESALE_ESCROW_STATES_V1 = ['none', 'held', 'handed_over', 'disputed', 'releasing', 'released', 'refunding', 'refunded', 'checking'] as const;
export type ResaleEscrowStateV1 = (typeof RESALE_ESCROW_STATES_V1)[number];

/** The coarse state kept on `resale_escrow_links` (the CHECK of migration 2260). */
export const RESALE_ESCROW_LINK_STATES_V1 = ['held', 'handed_over', 'disputed', 'released', 'refunded'] as const;
export type ResaleEscrowLinkStateV1 = (typeof RESALE_ESCROW_LINK_STATES_V1)[number];
/** Link states whose money is still in escrow (the partial unique index of migration 2260). */
export const RESALE_ESCROW_LIVE_LINK_STATES_V1 = ['held', 'handed_over', 'disputed'] as const;

export const RESALE_ESCROW_ACTIONS_V1 = ['hold', 'handed_over', 'received', 'problem', 'refund'] as const;
export type ResaleEscrowActionV1 = (typeof RESALE_ESCROW_ACTIONS_V1)[number];

/** The reasons a buyer can give for "there is a problem" (a subset of the order's dispute reasons). */
export const RESALE_ESCROW_PROBLEM_REASONS_V1 = ['not_as_described', 'other'] as const;
export type ResaleEscrowProblemReasonV1 = (typeof RESALE_ESCROW_PROBLEM_REASONS_V1)[number];

/** What the seller "delivers" by tapping "handed over in person": one fixed line, no attachment. */
export const RESALE_ESCROW_HANDOVER_TEXT_V1 = '当面交收完成 / Handed over in person';

export const RESALE_ESCROW_AMOUNT_LIMITS_V1 = { min: 100, max: 1_000_000 } as const;

/** The order statuses as `shared/types/order-escrow.ts` names them (kept as strings so this file stays standalone). */
export function resaleEscrowStateFromOrderV1(orderStatus: string | null | undefined): ResaleEscrowStateV1 {
  switch (orderStatus) {
    case 'paid':
      return 'held';
    case 'delivered':
      return 'handed_over';
    case 'disputed':
      return 'disputed';
    case 'accepted':
      return 'releasing';
    case 'settled':
      return 'released';
    case 'refund_pending':
      return 'refunding';
    case 'refunded':
      return 'refunded';
    case 'unknown':
      return 'checking';
    default:
      return 'none';
  }
}

/** The link state an order status moves the link to; `null` keeps the link where it is (accepted, refunding, unknown). */
export function resaleEscrowLinkStateFromOrderV1(orderStatus: string | null | undefined): ResaleEscrowLinkStateV1 | null {
  switch (orderStatus) {
    case 'paid':
      return 'held';
    case 'delivered':
      return 'handed_over';
    case 'disputed':
      return 'disputed';
    case 'settled':
      return 'released';
    case 'refunded':
    case 'cancelled':
      return 'refunded';
    default:
      return null;
  }
}

/**
 * The buttons of one side in one state. The buyer may put money into escrow only while the conversation can pay
 * (`holdable`: their offer was accepted and the listing is reserved), also again after a refund.
 */
export function resaleEscrowActionsV1(role: 'buyer' | 'seller', state: ResaleEscrowStateV1, holdable = false): ResaleEscrowActionV1[] {
  if (role === 'buyer') {
    if ((state === 'none' || state === 'refunded') && holdable) return ['hold'];
    if (state === 'handed_over') return ['received', 'problem'];
    return [];
  }
  if (state === 'held') return ['handed_over', 'refund'];
  if (state === 'handed_over' || state === 'disputed') return ['refund'];
  return [];
}

export interface ResaleEscrowViewV1 {
  schemaVersion: 1;
  threadRef: string;
  role: 'buyer' | 'seller';
  state: ResaleEscrowStateV1;
  /** The escrowed amount, or (before there is one) the accepted offer the buyer would put in; `null` when neither. */
  amount: ResaleMoneySgdV1 | null;
  orderId: string | null;
  heldAt: string | null;
  handedOverAt: string | null;
  /** Handover time + the order's acceptance window (48 hours by default): after it the order accepts itself. */
  acceptBy: string | null;
  closedAt: string | null;
  actions: ResaleEscrowActionV1[];
  environment: 'test';
  platformFeeMinor: 0;
}

const VIEW_KEYS = ['schemaVersion', 'threadRef', 'role', 'state', 'amount', 'orderId', 'heldAt', 'handedOverAt', 'acceptBy', 'closedAt', 'actions', 'environment', 'platformFeeMinor'];
const THREAD_REF = /^rst_[0-9a-f]{32}$/;
const ORDER_ID = /^ord_[0-9a-f]{32}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function sameKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}
function isTime(value: unknown): boolean {
  return value === null || (typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value)));
}
function isAmountMinor(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= RESALE_ESCROW_AMOUNT_LIMITS_V1.min && value <= RESALE_ESCROW_AMOUNT_LIMITS_V1.max;
}

/** Key by key: one key more or less, a live environment or any platform fee makes the whole view unreadable (`null`). */
export function decodeResaleEscrowViewV1(value: unknown): ResaleEscrowViewV1 | null {
  if (!isRecord(value) || !sameKeys(value, VIEW_KEYS)) return null;
  if (value.schemaVersion !== 1 || typeof value.threadRef !== 'string' || !THREAD_REF.test(value.threadRef)) return null;
  if (value.role !== 'buyer' && value.role !== 'seller') return null;
  if (typeof value.state !== 'string' || !(RESALE_ESCROW_STATES_V1 as readonly string[]).includes(value.state)) return null;
  if (value.amount !== null) {
    if (!isRecord(value.amount) || !sameKeys(value.amount, ['amountMinor', 'currency']) || !isAmountMinor(value.amount.amountMinor) || value.amount.currency !== 'SGD') return null;
  }
  if (value.orderId !== null && (typeof value.orderId !== 'string' || !ORDER_ID.test(value.orderId))) return null;
  if (!isTime(value.heldAt) || !isTime(value.handedOverAt) || !isTime(value.acceptBy) || !isTime(value.closedAt)) return null;
  if (!Array.isArray(value.actions) || value.actions.length > RESALE_ESCROW_ACTIONS_V1.length) return null;
  if (!value.actions.every((action) => typeof action === 'string' && (RESALE_ESCROW_ACTIONS_V1 as readonly string[]).includes(action))) return null;
  if (new Set(value.actions).size !== value.actions.length) return null;
  if (value.environment !== 'test' || value.platformFeeMinor !== 0) return null;
  return {
    schemaVersion: 1,
    threadRef: value.threadRef as string,
    role: value.role as 'buyer' | 'seller',
    state: value.state as ResaleEscrowStateV1,
    amount: value.amount === null ? null : { amountMinor: (value.amount as { amountMinor: number }).amountMinor, currency: 'SGD' },
    orderId: value.orderId as string | null,
    heldAt: value.heldAt as string | null,
    handedOverAt: value.handedOverAt as string | null,
    acceptBy: value.acceptBy as string | null,
    closedAt: value.closedAt as string | null,
    actions: [...(value.actions as ResaleEscrowActionV1[])],
    environment: 'test',
    platformFeeMinor: 0,
  };
}

export type ResaleEscrowInputCheckV1<T> = { ok: true; value: T } | { ok: false; field: string };

/** `POST …/hold`: only `expectedOfferMinor`, the accepted offer the buyer saw (a stale page pays nothing). */
export function validateResaleEscrowHoldInputV1(value: unknown): ResaleEscrowInputCheckV1<{ expectedOfferMinor: number }> {
  if (!isRecord(value)) return { ok: false, field: 'body' };
  for (const key of Object.keys(value)) if (key !== 'expectedOfferMinor') return { ok: false, field: key };
  if (!isAmountMinor(value.expectedOfferMinor)) return { ok: false, field: 'expectedOfferMinor' };
  return { ok: true, value: { expectedOfferMinor: value.expectedOfferMinor } };
}

/** `POST …/problem`: only `reasonCode`, `not_as_described` or `other`. */
export function validateResaleEscrowProblemInputV1(value: unknown): ResaleEscrowInputCheckV1<{ reasonCode: ResaleEscrowProblemReasonV1 }> {
  if (!isRecord(value)) return { ok: false, field: 'body' };
  for (const key of Object.keys(value)) if (key !== 'reasonCode') return { ok: false, field: key };
  if (typeof value.reasonCode !== 'string' || !(RESALE_ESCROW_PROBLEM_REASONS_V1 as readonly string[]).includes(value.reasonCode)) return { ok: false, field: 'reasonCode' };
  return { ok: true, value: { reasonCode: value.reasonCode as ResaleEscrowProblemReasonV1 } };
}

/** `POST …/handed-over`, `…/received`, `…/refund`: no body, or `{}`. */
export function validateResaleEscrowEmptyInputV1(value: unknown): ResaleEscrowInputCheckV1<Record<string, never>> {
  if (value === undefined || value === null) return { ok: true, value: {} };
  if (!isRecord(value)) return { ok: false, field: 'body' };
  const extra = Object.keys(value)[0];
  return extra === undefined ? { ok: true, value: {} } : { ok: false, field: extra };
}

export const RESALE_ESCROW_ERROR_CODES_V1 = [
  'escrow_not_ready',
  'escrow_exists',
  'escrow_amount_changed',
  'escrow_state_changed',
  'escrow_no_seller_agent',
  'escrow_unavailable',
] as const;
export type ResaleEscrowErrorCodeV1 = (typeof RESALE_ESCROW_ERROR_CODES_V1)[number];

/** Error bodies carry `code` and this one line in both languages. */
export const RESALE_ESCROW_ERROR_MESSAGES_V1: Record<ResaleEscrowErrorCodeV1, string> = {
  escrow_not_ready: '这段对话现在不能放进托管：要等卖家接受你的出价。 This conversation cannot use escrow yet: the seller has to accept your offer first.',
  escrow_exists: '这件东西已经有一笔托管了。 There is already an escrow on this item.',
  escrow_amount_changed: '成交价变了，刷新页面再看。 The agreed price changed; reload the page.',
  escrow_state_changed: '托管的状态刚刚变了，刷新页面再看。 The escrow just changed; reload the page.',
  escrow_no_seller_agent: '卖家现在没有可以收款的 Agent，托管用不了。 The seller has no Agent that can take this escrow right now.',
  escrow_unavailable: '托管暂时用不了。 Escrow is not available right now.',
};

/** Shown on every escrow box. */
export const RESALE_ESCROW_TEST_MODE_NOTE_V1 = {
  zh: '测试模式：不会真的扣款，也不会真的打款，平台不收费用。',
  en: 'Test mode: nothing is charged or paid out, and there is no platform fee.',
} as const;
