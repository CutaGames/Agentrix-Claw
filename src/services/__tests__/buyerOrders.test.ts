/**
 * M1 "订单只读" — the orders the owner placed, on the phone (buyerOrders.ts, BuyerOrdersScreen). Read only:
 * the service only ever GETs the buyer routes, the screen writes nothing and links every action to the Web
 * order page; M0 builds route the order notice and 收入与回执's "maybe yours" here instead of the web.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import type { HttpRequestV1, HttpResponseV1, HttpTransportV1 } from '../../../shared/client/transport';
import { ORDER_ESCROW_SCHEMA_VERSION } from '../../../shared/types/order-escrow';
import { decodeOrderBuyerView, type OrderBuyerView } from '../../../shared/types/order-escrow-view';
import { BUYER_ORDERS_LIST_PATH, buyerOrderNextOnWeb, buyerOrderPath, readBuyerOrder, readBuyerOrders } from '../buyerOrders';
import { orderEscrowTimeline } from '../twinOrderTimeline';

const BASE = 'https://api.example.test/api';
const NOW = Date.parse('2026-10-07T10:00:00.000Z');
const ORDER_ID = 'ord_0123456789abcdef0123456789abcdef';
const OTHER_ID = 'ord_fedcba9876543210fedcba9876543210';
const base = { baseUrl: BASE, token: 'tok' };

type Route = { status: number; body: unknown } | 'throw';
function transport(routes: Record<string, Route>): HttpTransportV1 & { calls: HttpRequestV1[] } {
  const calls: HttpRequestV1[] = [];
  return {
    calls,
    async request(request: HttpRequestV1): Promise<HttpResponseV1> {
      calls.push(request);
      const route = routes[`${request.method} ${request.path.replace(BASE, '')}`];
      if (!route) return { status: 599, headers: {}, body: undefined };
      if (route === 'throw') throw new Error('offline');
      return { status: route.status, headers: {}, body: route.body };
    },
  };
}

function buyerJson(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: ORDER_ESCROW_SCHEMA_VERSION,
    orderId: ORDER_ID,
    kind: 'paid_question',
    offerRef: 'offer-q',
    status: 'paid',
    escrow: { state: 'held', heldAt: '2026-10-07T09:00:00.000Z' },
    acceptanceWindowSeconds: 72 * 3600,
    environment: 'test',
    createdAt: '2026-10-07T08:59:00.000Z',
    updatedAt: '2026-10-07T09:00:00.000Z',
    version: 3,
    seller: { agentId: 'AGT-7F3A91C2', displayName: 'Lin Tan' },
    total: { amountMinor: '1990', currency: 'USD', decimals: 2 },
    buyerNote: '孩子上小学前要准备多少钱？',
    delivery: null,
    ...overrides,
  };
}
const view = (overrides: Record<string, unknown> = {}): OrderBuyerView => decodeOrderBuyerView(buyerJson(overrides))!;
const ok = (data: unknown) => ({ status: 200, body: { success: true, data } });
const LIST = `GET ${BUYER_ORDERS_LIST_PATH}`;
const ONE = `GET ${buyerOrderPath(ORDER_ID)}`;

describe('reading the orders I placed', () => {
  it('reads the buyer list with my token, decodes it with the shared decoder, newest first', async () => {
    const older = buyerJson({ orderId: OTHER_ID, updatedAt: '2026-10-06T09:00:00.000Z', status: 'settled' });
    const http = transport({ [LIST]: ok({ items: [older, buyerJson()] }) });
    const read = await readBuyerOrders({ ...base, transport: http });
    expect(read.kind === 'ready' && read.orders.map((order) => order.orderId)).toEqual([ORDER_ID, OTHER_ID]);
    expect(http.calls).toHaveLength(1);
    expect(http.calls[0]).toMatchObject({ method: 'GET', path: `${BASE}/order-escrow/orders?as=buyer` });
    expect(http.calls[0].headers).toMatchObject({ Authorization: 'Bearer tok', 'X-Agentrix-Surface': 'mobile' });
  });

  it('switch off, signed out, offline, or one bad item: never a partial list', async () => {
    const run = (route: Route, input: Record<string, unknown> = base) => readBuyerOrders({ ...input, transport: transport({ [LIST]: route }) });
    expect(await run({ status: 503, body: { code: 'orders_unavailable' } })).toEqual({ kind: 'unavailable', reason: 'not_enabled' });
    expect(await run({ status: 401, body: {} })).toEqual({ kind: 'unavailable', reason: 'authentication_required' });
    expect(await run(ok({ items: [] }), { baseUrl: BASE, token: '' })).toEqual({ kind: 'unavailable', reason: 'authentication_required' });
    expect(await run('throw')).toEqual({ kind: 'error', reason: 'network', retryable: true });
    expect(await run({ status: 500, body: {} })).toEqual({ kind: 'error', reason: 'http_500', retryable: true });
    expect(await run(ok({ items: [buyerJson(), buyerJson({ status: 'shipped' })] }))).toEqual({ kind: 'error', reason: 'response_malformed', retryable: false });
    // A buyer view that carries the seller's split or draft is a contract error (the buyer never sees them).
    expect(await run(ok({ items: [buyerJson({ deliveryDraft: null })] }))).toMatchObject({ kind: 'error', reason: 'response_malformed' });
    expect(await run(ok({ items: [buyerJson({ amounts: {} })] }))).toMatchObject({ kind: 'error', reason: 'response_malformed' });
  });

  it('one order by its ord_ ref; not mine is not found; anything else is not even requested', async () => {
    const http = transport({ [ONE]: ok(buyerJson({ status: 'delivered', deliveredAt: '2026-10-07T09:30:00.000Z', delivery: { answerText: '先把教育金和日常开销分开算。', deliveryRefs: [] } })) });
    const read = await readBuyerOrder(ORDER_ID, { ...base, transport: http });
    expect(read.kind === 'ready' && read.order.delivery?.answerText).toBe('先把教育金和日常开销分开算。');
    expect(http.calls[0].path).toBe(`${BASE}/order-escrow/orders/${ORDER_ID}?as=buyer`);
    expect(await readBuyerOrder(ORDER_ID, { ...base, transport: transport({ [ONE]: { status: 404, body: { code: 'order_not_found' } } }) })).toEqual({ kind: 'unavailable', reason: 'not_found' });
    expect(await readBuyerOrder(ORDER_ID, { ...base, transport: transport({ [ONE]: ok(buyerJson({ orderId: OTHER_ID })) }) })).toMatchObject({ kind: 'error', reason: 'response_malformed' });
    const none = transport({});
    for (const bad of ['../orders?as=seller', '', 'order_1', `${ORDER_ID}/actions`]) {
      expect(await readBuyerOrder(bad, { ...base, transport: none })).toEqual({ kind: 'unavailable', reason: 'not_found' });
    }
    expect(none.calls).toHaveLength(0);
  });
});

describe('what is open on the web, in the buyer’s words', () => {
  it('follows the shared buyer actions: pay, accept or dispute, refund after the delivery deadline, nothing for unknown', () => {
    expect(buyerOrderNextOnWeb(view({ status: 'awaiting_payment', escrow: { state: 'not_funded' }, paymentDeadline: '2026-10-07T12:00:00.000Z' }), NOW)).toBe('pay');
    // The payment window passed: no pay; cancelling may still be open.
    expect(buyerOrderNextOnWeb(view({ status: 'awaiting_payment', escrow: { state: 'not_funded' }, paymentDeadline: '2026-10-07T09:00:00.000Z' }), NOW)).not.toBe('pay');
    expect(buyerOrderNextOnWeb(view({ status: 'delivered', deliveredAt: '2026-10-07T09:30:00.000Z', delivery: { answerText: 'x', deliveryRefs: [] } }), NOW)).toBe('accept_or_dispute');
    // The acceptance window closed: accepting is still open, a dispute is not.
    expect(buyerOrderNextOnWeb(view({ status: 'delivered', deliveredAt: '2026-10-01T09:30:00.000Z', delivery: { answerText: 'x', deliveryRefs: [] } }), NOW)).toBe('accept');
    expect(buyerOrderNextOnWeb(view({ status: 'paid', deliveryDeadline: '2026-10-07T09:30:00.000Z' }), NOW)).toBe('refund');
    expect(buyerOrderNextOnWeb(view({ status: 'unknown' }), NOW)).toBe('view');
    expect(buyerOrderNextOnWeb(view({ status: 'settled' }), NOW)).toBe('view');
  });

  it('the timeline speaks to the buyer: waiting for them to deliver, for me to accept, money back to me', () => {
    const notes = (overrides: Record<string, unknown>) => orderEscrowTimeline(view(overrides), 'buyer').map((step) => step.note?.zh ?? null).filter(Boolean);
    expect(notes({ status: 'awaiting_payment', escrow: { state: 'not_funded' } })).toEqual(['等你付款']);
    expect(notes({ status: 'paid' })).toEqual(['等对方交付']);
    expect(notes({ status: 'delivered', deliveredAt: '2026-10-07T09:30:00.000Z' })).toEqual(['等你验收（验收期满自动验收）']);
    expect(notes({ status: 'refunded', escrow: { state: 'refunded', heldAt: '2026-10-07T09:00:00.000Z', refundedAt: '2026-10-07T09:40:00.000Z' } })).toEqual(['钱已退回给你']);
    // The seller side keeps its own words.
    expect(orderEscrowTimeline(view({ status: 'paid' })).map((step) => step.note?.zh ?? null).filter(Boolean)).toEqual(['等你交付']);
  });
});

describe('source guards', () => {
  const read = (...parts: string[]) => fs.readFileSync(path.resolve(__dirname, '..', '..', ...parts), 'utf8');
  const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const service = withoutComments(read('services', 'buyerOrders.ts'));
  const screen = withoutComments(read('screens', 'four-zone', 'BuyerOrdersScreen.tsx'));
  const nav = read('navigation', 'four-zone', 'FourZoneTabNavigator.tsx');
  const matters = read('screens', 'four-zone', 'MattersHomeScreen.tsx');
  const income = read('screens', 'four-zone', 'TwinIncomeScreen.tsx');

  it('the service only reads the buyer routes', () => {
    expect(service.match(/method: '([A-Z]+)'/g)).toEqual(["method: 'GET'"]);
    expect(service).not.toMatch(/\/actions|'POST'|'PUT'|'DELETE'|idempotencyKey|as=seller/);
  });

  it('the screen writes nothing: every action is a link to the web order page', () => {
    expect(screen).not.toMatch(/apiFetch|[^A-Za-z.]fetch\(|transport\.request|useMutation|Alert\.alert/);
    expect(screen).toMatch(/open\(getBuyerOrderWebUrl\(order\.orderId\)\)/);
    expect(screen).toMatch(/orderEscrowTimeline\(order, 'buyer'\)/);
  });

  it('M0 builds register it and route the order notice and 收入与回执 there; other builds keep the web link', () => {
    expect(nav).toMatch(/\{MOBILE_M0_ENABLED \? <TwinStack\.Screen name="BuyerOrders" component=\{BuyerOrdersScreen\}/);
    expect(matters).toMatch(/buyerOrderUrl && MOBILE_M0_ENABLED \? \([\s\S]*?screen: 'BuyerOrders', params: \{ ref: orderRef \}/);
    expect(matters).toMatch(/Linking\.openURL\(buyerOrderUrl\)/);
    expect(income).toMatch(/MOBILE_M0_ENABLED \? \(\s*<TouchableOpacity onPress=\{\(\) => navigation\.navigate\('BuyerOrders', \{ ref: linkedRef \}\)\}/);
    expect(income).toMatch(/open\(getBuyerOrderWebUrl\(linkedRef as string\)\)/);
  });
});
