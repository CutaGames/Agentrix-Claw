/**
 * twinOrders — orders the twin took, on the phone (T7, order contract v0.7;
 * REQ-mobile-049, I-036).
 *
 * Read-only, plus one action: deliver the saved draft exactly as the owner read it.
 * - Lists and details come from the seller routes and are decoded by the shared
 *   `order-escrow-view.ts` (the same decoder as the Web). A view that does not
 *   decode is an error, never a partial order.
 * - `deliver` is sent only when `reviewableDeliveryDraft` gives a draft (the order
 *   is `paid` and the digest recomputed over the draft's own content equals the
 *   server's). The body carries only the digest, so the server delivers its stored
 *   draft; if the draft changed after the owner read it, the server says
 *   `delivery_digest_mismatch` and the phone re-reads.
 * - Every 409 (including `action_not_allowed_in_status`: delivered elsewhere, refunded)
 *   and a 404 mean "re-read". A retry reuses the same idempotency key.
 * - Writing the answer, refunds and disputes stay on the Web.
 *
 * `sellerAgentId` and `?agentId=` are the Agent's external id (`agentUniqueId`, `AGT-…`), not the
 * account UUID (order contract comments since v0.4, `8ebf2189`); the screen takes it from the owner's
 * passport projection (`agentRef`).
 *
 * Endpoints (under the API base, which already ends in `/api`):
 *   GET  /order-escrow/orders?as=seller&agentId=:agentRef   { items: OrderSellerViewV1[] }
 *   GET  /order-escrow/orders/:orderId?as=seller       OrderSellerViewV1
 *   POST /order-escrow/orders/:orderId/actions         { action: 'deliver', expectedVersion, idempotencyKey, reviewedDeliveryDigest }
 */
import { ORDER_ERROR_CODES, orderSellerProceedsV1, type OrderActionRequestV1 } from '../../shared/types/order-escrow';
import {
  decodeOrderItems,
  decodeOrderSellerView,
  reviewableDeliveryDraft,
  type OrderDeliveryDraft,
  type OrderSellerView,
} from '../../shared/types/order-escrow-view';
import type { Money } from '../../shared/types/trust-loop-primitives';
import { AGENT_ACCOUNT_ID_PATTERN_V1, AGENT_EXTERNAL_ID_PATTERN_V1 } from '../../shared/types/agent-public-entry';
import { resolveTwinTransport, twinAuthHeaders, type TwinStatusTransportInput } from './twinStatus';
import { isOrderRef } from './webHandoff';

export type TwinOrdersUnavailableReason = 'not_enabled' | 'not_found' | 'agent_ref_required' | 'authentication_required';

export type TwinOrdersRead =
  | { kind: 'ready'; orders: OrderSellerView[] }
  | { kind: 'unavailable'; reason: TwinOrdersUnavailableReason }
  | { kind: 'error'; reason: string; retryable: boolean };

export type TwinOrderRead =
  | { kind: 'ready'; order: OrderSellerView }
  | { kind: 'unavailable'; reason: TwinOrdersUnavailableReason }
  | { kind: 'error'; reason: string; retryable: boolean };

export type TwinOrderDeliverOutcome =
  /** Delivered; `order` is the server's view afterwards. */
  | { kind: 'delivered'; order: OrderSellerView }
  /** The order or its draft changed: re-read before anything else. */
  | { kind: 'changed'; reason: string }
  /** The server wants the Web (for example a fresh sign-in). */
  | { kind: 'needs_web'; reason: string }
  /** Refused on the phone; nothing was sent. */
  | { kind: 'blocked'; reason: 'no_reviewable_draft' | 'not_reviewed' | 'authentication_required' | 'order_ref_invalid' }
  | { kind: 'failed'; reason: string; retryable: boolean };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function dataOf(body: unknown): unknown {
  return isRecord(body) && 'data' in body ? body.data : body;
}

function codeOf(body: unknown): string {
  if (!isRecord(body)) return '';
  if (typeof body.code === 'string') return body.code;
  // Nest wraps `new XException({ code })` as the response body itself; some proxies nest it once more.
  return isRecord(body.message) && typeof body.message.code === 'string' ? body.message.code : '';
}

/** An external id the seller routes accept; an account UUID is not one (it also matches the loose pattern). */
export function isTwinSellerAgentRef(value: unknown): value is string {
  return typeof value === 'string' && AGENT_EXTERNAL_ID_PATTERN_V1.test(value) && !AGENT_ACCOUNT_ID_PATTERN_V1.test(value);
}

export function twinOrdersListPath(sellerAgentRef: string): string {
  return `/order-escrow/orders?as=seller&agentId=${encodeURIComponent(sellerAgentRef)}`;
}

export function twinOrderPath(orderId: string): string {
  return `/order-escrow/orders/${encodeURIComponent(orderId)}?as=seller`;
}

export function twinOrderActionPath(orderId: string): string {
  return `/order-escrow/orders/${encodeURIComponent(orderId)}/actions`;
}

async function send(
  method: 'GET' | 'POST',
  path: string,
  body: unknown,
  input: TwinStatusTransportInput,
): Promise<{ status: number; body: unknown } | { blocked: 'authentication_required' } | null> {
  const { baseUrl, token, transport } = resolveTwinTransport(input);
  if (!token) return { blocked: 'authentication_required' };
  try {
    const response = await transport.request({
      method,
      path: `${baseUrl}${path}`,
      headers: { ...twinAuthHeaders(token), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(body !== undefined ? { body } : {}),
    });
    return { status: response.status, body: response.body };
  } catch {
    return null;
  }
}

/** Shared failure mapping for the two reads; `null` means "2xx, decode it". */
function readFailure(response: Awaited<ReturnType<typeof send>>): Exclude<TwinOrdersRead, { kind: 'ready' }> | null {
  if (!response) return { kind: 'error', reason: 'network', retryable: true };
  if ('blocked' in response) return { kind: 'unavailable', reason: 'authentication_required' };
  const code = codeOf(response.body);
  // The orders switch is off (or this action's backend is not live yet).
  if (response.status === 503 || code === ORDER_ERROR_CODES.unavailable) return { kind: 'unavailable', reason: 'not_enabled' };
  if (response.status === 404) return { kind: 'unavailable', reason: 'not_found' };
  if (response.status === 401) return { kind: 'unavailable', reason: 'authentication_required' };
  if (response.status < 200 || response.status >= 300) {
    return { kind: 'error', reason: code || `http_${response.status}`, retryable: response.status >= 500 || response.status === 429 };
  }
  return null;
}

/** Newest activity first; the server's order is kept for equal times. */
function byUpdatedDesc(a: OrderSellerView, b: OrderSellerView): number {
  return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
}

/** Every order this twin took (seller view). `sellerAgentRef` is the Agent's external id. */
export async function readTwinOrders(sellerAgentRef: string, input: TwinStatusTransportInput = {}): Promise<TwinOrdersRead> {
  if (!isTwinSellerAgentRef(sellerAgentRef)) return { kind: 'unavailable', reason: 'agent_ref_required' };
  const response = await send('GET', twinOrdersListPath(sellerAgentRef), undefined, input);
  const failure = readFailure(response);
  if (failure) return failure;
  const orders = decodeOrderItems(dataOf((response as { body: unknown }).body), decodeOrderSellerView);
  if (!orders) return { kind: 'error', reason: 'response_malformed', retryable: false };
  // Only this twin's orders: a list that names another seller is not trusted.
  if (orders.some((order) => order.sellerAgentId !== sellerAgentRef)) return { kind: 'error', reason: 'response_malformed', retryable: false };
  return { kind: 'ready', orders: [...orders].sort(byUpdatedDesc) };
}

/** One order (seller view). Not this owner's order → `not_found`, like the server. */
export async function readTwinOrder(orderId: string, input: TwinStatusTransportInput = {}): Promise<TwinOrderRead> {
  if (!isOrderRef(orderId)) return { kind: 'unavailable', reason: 'not_found' };
  const response = await send('GET', twinOrderPath(orderId), undefined, input);
  const failure = readFailure(response);
  if (failure) return failure;
  const order = decodeOrderSellerView(dataOf((response as { body: unknown }).body));
  if (!order || order.orderId !== orderId) return { kind: 'error', reason: 'response_malformed', retryable: false };
  return { kind: 'ready', order };
}

export interface TwinOrderSummary {
  /** What the owner gets once the money is released (total − platform fee); `null` if it cannot be computed. */
  proceeds: Money | null;
  /** The saved draft the owner can deliver from the phone, with its digest. */
  reviewable: { draft: OrderDeliveryDraft; digest: string } | null;
  /** Paid, but nothing the phone can deliver: the answer is written on the Web. */
  answerOnWeb: boolean;
  /** A test-mode order never moves real money. */
  test: boolean;
}

export function summarizeTwinOrder(order: OrderSellerView, nowMs: number = Date.now()): TwinOrderSummary {
  let proceeds: Money | null = null;
  try {
    proceeds = orderSellerProceedsV1(order.amounts.total, order.amounts.platformFee);
  } catch {
    proceeds = null;
  }
  const reviewable = reviewableDeliveryDraft(order, nowMs);
  return {
    proceeds,
    reviewable,
    answerOnWeb: order.status === 'paid' && !reviewable,
    test: order.environment === 'test',
  };
}

/**
 * One key per (order, version, draft digest): the same request always carries the same key.
 * A retry after a 5xx or a lost response is then a replay the server answers with the current
 * view (`delivered`), not a second delivery or a misleading 409 (backend, REQ-mobile-057).
 * A changed draft or order has a new digest or version, and so a new key.
 */
export function twinOrderDeliverIdempotencyKey(order: Pick<OrderSellerView, 'orderId' | 'version'>, digest: string): string {
  const hex = /^sha256:([0-9a-f]{64})$/.exec(digest)?.[1] ?? '';
  return `order:mobile:deliver:${order.orderId}:v${order.version}:${hex.slice(0, 32)}`;
}

/**
 * Deliver the saved draft the owner just read. `reviewedDigest` is the digest the
 * screen showed with the draft; it must still be the reviewable draft's digest.
 */
export async function deliverTwinOrderDraft(
  order: OrderSellerView,
  reviewedDigest: string,
  idempotencyKey: string,
  input: TwinStatusTransportInput & { nowMs?: number } = {},
): Promise<TwinOrderDeliverOutcome> {
  if (!isOrderRef(order.orderId)) return { kind: 'blocked', reason: 'order_ref_invalid' };
  const reviewable = reviewableDeliveryDraft(order, input.nowMs ?? Date.now());
  if (!reviewable) return { kind: 'blocked', reason: 'no_reviewable_draft' };
  if (!reviewedDigest || reviewedDigest !== reviewable.digest) return { kind: 'blocked', reason: 'not_reviewed' };
  // Only the digest: no content, so the server delivers exactly its stored draft.
  const body: OrderActionRequestV1 = {
    action: 'deliver',
    expectedVersion: order.version,
    idempotencyKey,
    reviewedDeliveryDigest: reviewable.digest,
  };
  const response = await send('POST', twinOrderActionPath(order.orderId), body, input);
  if (!response) return { kind: 'failed', reason: 'network', retryable: true };
  if ('blocked' in response) return { kind: 'blocked', reason: 'authentication_required' };
  const code = codeOf(response.body);
  if (response.status === 409) return { kind: 'changed', reason: code || 'conflict' };
  if (response.status === 403 || response.status === 401) return { kind: 'needs_web', reason: code || `http_${response.status}` };
  if (response.status === 404) return { kind: 'changed', reason: 'order_not_found' };
  if (response.status === 503) return { kind: 'failed', reason: code || 'not_enabled', retryable: false };
  if (response.status < 200 || response.status >= 300) {
    return { kind: 'failed', reason: code || `http_${response.status}`, retryable: response.status >= 500 || response.status === 429 };
  }
  const next = decodeOrderSellerView(dataOf(response.body));
  // Delivered means the server says so; anything else is re-read, not assumed.
  if (!next || next.orderId !== order.orderId) return { kind: 'changed', reason: 'response_malformed' };
  return next.status === 'delivered' ? { kind: 'delivered', order: next } : { kind: 'changed', reason: `status_${next.status}` };
}
