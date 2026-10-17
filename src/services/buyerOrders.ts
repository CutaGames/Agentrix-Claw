/**
 * buyerOrders — the orders the owner placed, read on the phone (M1 "订单只读", briefs/mobile-redesign-v1.md
 * section 6: "原生只读详情；退款等操作仍走网页"; order contract v0.7).
 *
 * Read only. Paying, accepting, disputing, cancelling and asking for a refund stay on the Web order page
 * (`/orders/:orderId`); the phone says which of them is open there and links to it.
 * - The list and one order come from the buyer routes and are decoded by the shared `order-escrow-view.ts`
 *   (the same decoder as the Web). A view that does not decode is an error, never a partial order.
 * - An order that is not this account's is 404 on the server, the same as one that does not exist.
 *
 * Endpoints (under the API base, which already ends in `/api`):
 *   GET /order-escrow/orders?as=buyer            { items: OrderBuyerViewV1[] }
 *   GET /order-escrow/orders/:orderId?as=buyer   OrderBuyerViewV1
 */
import { ORDER_ERROR_CODES } from '../../shared/types/order-escrow';
import { decodeOrderBuyerView, decodeOrderItems, orderActionsFor, type OrderBuyerView } from '../../shared/types/order-escrow-view';
import { resolveTwinTransport, twinAuthHeaders, type TwinStatusTransportInput } from './twinStatus';
import { isOrderRef } from './webHandoff';

export type BuyerOrdersUnavailableReason = 'not_enabled' | 'not_found' | 'authentication_required';

export type BuyerOrdersRead =
  | { kind: 'ready'; orders: OrderBuyerView[] }
  | { kind: 'unavailable'; reason: BuyerOrdersUnavailableReason }
  | { kind: 'error'; reason: string; retryable: boolean };

export type BuyerOrderRead =
  | { kind: 'ready'; order: OrderBuyerView }
  | { kind: 'unavailable'; reason: BuyerOrdersUnavailableReason }
  | { kind: 'error'; reason: string; retryable: boolean };

export const BUYER_ORDERS_LIST_PATH = '/order-escrow/orders?as=buyer';

export function buyerOrderPath(orderId: string): string {
  return `/order-escrow/orders/${encodeURIComponent(orderId)}?as=buyer`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function dataOf(body: unknown): unknown {
  return isRecord(body) && 'data' in body ? body.data : body;
}

function codeOf(body: unknown): string {
  if (!isRecord(body)) return '';
  if (typeof body.code === 'string') return body.code;
  return isRecord(body.message) && typeof body.message.code === 'string' ? body.message.code : '';
}

async function get(path: string, input: TwinStatusTransportInput): Promise<{ status: number; body: unknown } | 'signed_out' | null> {
  const { baseUrl, token, transport } = resolveTwinTransport(input);
  if (!token) return 'signed_out';
  try {
    const response = await transport.request({ method: 'GET', path: `${baseUrl}${path}`, headers: twinAuthHeaders(token) });
    return { status: response.status, body: response.body };
  } catch {
    return null;
  }
}

/** `null` means "2xx, decode it". */
function readFailure(response: Awaited<ReturnType<typeof get>>): Exclude<BuyerOrdersRead, { kind: 'ready' }> | null {
  if (!response) return { kind: 'error', reason: 'network', retryable: true };
  if (response === 'signed_out') return { kind: 'unavailable', reason: 'authentication_required' };
  const code = codeOf(response.body);
  if (response.status === 503 || code === ORDER_ERROR_CODES.unavailable) return { kind: 'unavailable', reason: 'not_enabled' };
  if (response.status === 404) return { kind: 'unavailable', reason: 'not_found' };
  if (response.status === 401) return { kind: 'unavailable', reason: 'authentication_required' };
  if (response.status < 200 || response.status >= 300) {
    return { kind: 'error', reason: code || `http_${response.status}`, retryable: response.status >= 500 || response.status === 429 };
  }
  return null;
}

function byUpdatedDesc(a: OrderBuyerView, b: OrderBuyerView): number {
  return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
}

/** Every order this account placed (buyer view), newest activity first. */
export async function readBuyerOrders(input: TwinStatusTransportInput = {}): Promise<BuyerOrdersRead> {
  const response = await get(BUYER_ORDERS_LIST_PATH, input);
  const failure = readFailure(response);
  if (failure) return failure;
  const orders = decodeOrderItems(dataOf((response as { body: unknown }).body), decodeOrderBuyerView);
  if (!orders) return { kind: 'error', reason: 'response_malformed', retryable: false };
  return { kind: 'ready', orders: [...orders].sort(byUpdatedDesc) };
}

/** One order by its `ord_` ref (buyer view). Not this account's order → `not_found`, like the server. */
export async function readBuyerOrder(orderId: string, input: TwinStatusTransportInput = {}): Promise<BuyerOrderRead> {
  if (!isOrderRef(orderId)) return { kind: 'unavailable', reason: 'not_found' };
  const response = await get(buyerOrderPath(orderId), input);
  const failure = readFailure(response);
  if (failure) return failure;
  const order = decodeOrderBuyerView(dataOf((response as { body: unknown }).body));
  if (!order || order.orderId !== orderId) return { kind: 'error', reason: 'response_malformed', retryable: false };
  return { kind: 'ready', order };
}

/** What is open for the buyer on the Web order page (the shared `orderActionsFor`), for the link's words. */
export type BuyerOrderNextOnWeb = 'pay' | 'accept_or_dispute' | 'accept' | 'refund' | 'cancel' | 'view';

export function buyerOrderNextOnWeb(order: OrderBuyerView, nowMs: number = Date.now()): BuyerOrderNextOnWeb {
  const actions = orderActionsFor(order, 'buyer', nowMs);
  if (actions.includes('pay')) return 'pay';
  if (actions.includes('accept') && actions.includes('open_dispute')) return 'accept_or_dispute';
  if (actions.includes('accept')) return 'accept';
  if (actions.includes('request_refund')) return 'refund';
  if (actions.includes('cancel')) return 'cancel';
  return 'view';
}
