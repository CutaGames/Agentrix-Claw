/**
 * T7 (I-036, REQ-mobile-049) — orders the twin took, on the phone: read-only, plus delivering
 * the saved draft with only its digest. Money negatives run every time: nothing but `deliver`
 * is ever sent; `deliver` never carries content; it is not sent without a reviewable draft or
 * with a digest that is not the one over the text on screen.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import type { HttpRequestV1, HttpResponseV1, HttpTransportV1 } from '../../../shared/client/transport';
import { ORDER_ESCROW_SCHEMA_VERSION, ORDER_IDEMPOTENCY_KEY_PATTERN, orderDeliveryDigestV1 } from '../../../shared/types/order-escrow';
import { decodeOrderSellerView, type OrderSellerView } from '../../../shared/types/order-escrow-view';
import {
  deliverTwinOrderDraft,
  readTwinOrder,
  readTwinOrders,
  summarizeTwinOrder,
  twinOrderActionPath,
  twinOrderDeliverIdempotencyKey,
  twinOrderPath,
  twinOrdersListPath,
} from '../twinOrders';

const AGENT_UUID = '75e5c531-4c1e-4d6a-9b0a-3f2e1d0c9b8a';
/** The seller routes use the Agent's external id (order contract, 8ebf2189). */
const AGENT = 'AGT-7F3A91C2';
const BASE = 'https://api.example.test/api';
const NOW = Date.parse('2026-09-29T08:00:00.000Z');
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

const draftOf = (orderId: string, answerText: string) => ({
  answerText,
  deliveryRefs: [] as string[],
  digest: orderDeliveryDigestV1({ orderId, deliveryRefs: [], answerText }),
});

function sellerJson(overrides: Record<string, unknown> = {}) {
  const orderId = (overrides.orderId as string) ?? ORDER_ID;
  return {
    schemaVersion: ORDER_ESCROW_SCHEMA_VERSION,
    orderId,
    kind: 'paid_question',
    offerRef: 'offer-q',
    status: 'paid',
    escrow: { state: 'held', heldAt: '2026-09-29T07:00:00.000Z' },
    acceptanceWindowSeconds: 72 * 3600,
    environment: 'test',
    createdAt: '2026-09-29T06:59:00.000Z',
    updatedAt: '2026-09-29T07:00:00.000Z',
    version: 3,
    amounts: { total: { amountMinor: '1990', currency: 'USD', decimals: 2 }, platformFee: { amountMinor: '19', currency: 'USD', decimals: 2 }, processingFeeBearer: 'undecided' },
    mandateRef: { grantRef: 'grant-1', grantVersion: 1 },
    buyer: { displayName: null, kind: 'visitor' },
    sellerAgentId: AGENT,
    buyerNote: '孩子上小学前要准备多少钱？',
    delivery: null,
    deliveryDraft: draftOf(orderId, '先把教育金和日常开销分开算。'),
    ...overrides,
  };
}
const view = (overrides: Record<string, unknown> = {}): OrderSellerView => decodeOrderSellerView(sellerJson(overrides))!;
const ok = (data: unknown) => ({ status: 200, body: { success: true, data } });
const LIST = `GET ${twinOrdersListPath(AGENT)}`;
const ONE = `GET ${twinOrderPath(ORDER_ID)}`;
const ACT = `POST ${twinOrderActionPath(ORDER_ID)}`;

describe('reading the orders the twin took', () => {
  it('reads the seller list with the owner token, decodes it with the shared decoder, newest first', async () => {
    const older = sellerJson({ orderId: OTHER_ID, updatedAt: '2026-09-28T07:00:00.000Z', status: 'settled', deliveryDraft: null });
    const http = transport({ [LIST]: ok({ items: [older, sellerJson()] }) });
    const read = await readTwinOrders(AGENT, { ...base, transport: http });
    expect(read.kind).toBe('ready');
    expect(read.kind === 'ready' && read.orders.map((order) => order.orderId)).toEqual([ORDER_ID, OTHER_ID]);
    expect(http.calls[0]).toMatchObject({ method: 'GET', path: `${BASE}/order-escrow/orders?as=seller&agentId=${AGENT}` });
    expect(http.calls[0].headers).toMatchObject({ Authorization: 'Bearer tok', 'X-Agentrix-Surface': 'mobile' });
  });

  it('switch off, not found, signed out, offline, a bad item or another seller: never a partial list', async () => {
    const run = (route: Route, input: Record<string, unknown> = base) => readTwinOrders(AGENT, { ...input, transport: transport({ [LIST]: route }) });
    expect(await run({ status: 503, body: { code: 'orders_unavailable' } })).toEqual({ kind: 'unavailable', reason: 'not_enabled' });
    expect(await run({ status: 404, body: { code: 'order_not_found' } })).toEqual({ kind: 'unavailable', reason: 'not_found' });
    expect(await run(ok({ items: [] }), { baseUrl: BASE, token: '' })).toEqual({ kind: 'unavailable', reason: 'authentication_required' });
    expect(await run('throw')).toEqual({ kind: 'error', reason: 'network', retryable: true });
    expect(await run(ok({ items: [sellerJson(), sellerJson({ status: 'shipped' })] }))).toEqual({ kind: 'error', reason: 'response_malformed', retryable: false });
    expect(await run(ok({ items: [sellerJson({ sellerAgentId: 'someone-else' })] }))).toEqual({ kind: 'error', reason: 'response_malformed', retryable: false });
    // A seller view that carries the buyer's account is a contract error.
    expect(await run(ok({ items: [sellerJson({ buyer: { displayName: null, kind: 'user', userId: 'u-1' } })] }))).toMatchObject({ kind: 'error' });
    // Not an external id: nothing is requested. The account UUID is the old, wrong key.
    const none = transport({});
    for (const bad of ['../x', AGENT_UUID, '', 'AGT 1']) {
      expect(await readTwinOrders(bad, { ...base, transport: none })).toEqual({ kind: 'unavailable', reason: 'agent_ref_required' });
    }
    expect(none.calls).toHaveLength(0);
  });

  it('one order by its ord_ ref; anything else is not even requested', async () => {
    const http = transport({ [ONE]: ok(sellerJson()) });
    const read = await readTwinOrder(ORDER_ID, { ...base, transport: http });
    expect(read.kind === 'ready' && read.order.deliveryDraft?.answerText).toBe('先把教育金和日常开销分开算。');
    expect(http.calls[0].path).toBe(`${BASE}/order-escrow/orders/${ORDER_ID}?as=seller`);
    const none = transport({});
    expect(await readTwinOrder('../orders?as=buyer', { ...base, transport: none })).toEqual({ kind: 'unavailable', reason: 'not_found' });
    expect(none.calls).toHaveLength(0);
    expect(await readTwinOrder(ORDER_ID, { ...base, transport: transport({ [ONE]: ok(sellerJson({ orderId: OTHER_ID })) }) })).toMatchObject({ kind: 'error', reason: 'response_malformed' });
  });
});

describe('delivering the saved draft', () => {
  it('sends only the digest of the draft on screen — no content, no other action', async () => {
    const order = view();
    const digest = order.deliveryDraft!.digest;
    const http = transport({ [ACT]: ok(sellerJson({ status: 'delivered', deliveredAt: '2026-09-29T08:00:00.000Z', delivery: { answerText: '先把教育金和日常开销分开算。', deliveryRefs: [] }, deliveryDraft: null, version: 4 })) });
    const outcome = await deliverTwinOrderDraft(order, digest, 'order:mobile:deliver:k1', { ...base, transport: http, nowMs: NOW });
    expect(outcome.kind).toBe('delivered');
    expect(http.calls).toHaveLength(1);
    expect(http.calls[0]).toMatchObject({ method: 'POST', path: `${BASE}/order-escrow/orders/${ORDER_ID}/actions` });
    expect(http.calls[0].body).toEqual({ action: 'deliver', expectedVersion: 3, idempotencyKey: 'order:mobile:deliver:k1', reviewedDeliveryDigest: digest });
    expect(http.calls[0].body).not.toHaveProperty('answerText');
    expect(http.calls[0].body).not.toHaveProperty('deliveryRefs');
  });

  it('nothing is sent without a reviewable draft or with a digest that is not the one on screen', async () => {
    const cases: Array<[string, OrderSellerView, string, string]> = [
      ['no draft', view({ deliveryDraft: null }), 'sha256:' + '0'.repeat(64), 'no_reviewable_draft'],
      ['already delivered', view({ status: 'delivered', deliveredAt: '2026-09-29T07:30:00.000Z', delivery: { answerText: 'x', deliveryRefs: [] } }), 'x', 'no_reviewable_draft'],
      ['outcome unknown', view({ status: 'unknown' }), 'x', 'no_reviewable_draft'],
      ['server digest not over this content', view({ deliveryDraft: { ...draftOf(ORDER_ID, '原文'), answerText: '改过的原文' } }), draftOf(ORDER_ID, '原文').digest, 'no_reviewable_draft'],
      ['another order’s digest', view({ deliveryDraft: draftOf(OTHER_ID, '原文') }), draftOf(OTHER_ID, '原文').digest, 'no_reviewable_draft'],
      ['digest the owner did not see', view(), draftOf(ORDER_ID, '别的回答').digest, 'not_reviewed'],
      ['empty digest', view(), '', 'not_reviewed'],
    ];
    for (const [label, order, digest, reason] of cases) {
      const http = transport({ [ACT]: ok(sellerJson({ status: 'delivered' })) });
      const outcome = await deliverTwinOrderDraft(order, digest, 'k', { ...base, transport: http, nowMs: NOW });
      expect([label, outcome]).toEqual([label, { kind: 'blocked', reason }]);
      expect([label, http.calls.length]).toEqual([label, 0]);
    }
    const signedOut = transport({});
    expect(await deliverTwinOrderDraft(view(), view().deliveryDraft!.digest, 'k', { baseUrl: BASE, token: '', transport: signedOut, nowMs: NOW })).toEqual({ kind: 'blocked', reason: 'authentication_required' });
    expect(signedOut.calls).toHaveLength(0);
  });

  it('what the server says decides: 409 re-read, 403 web, 503 off, 5xx retry; "delivered" only when it says delivered', async () => {
    const order = view();
    const digest = order.deliveryDraft!.digest;
    const run = (route: Route) => deliverTwinOrderDraft(order, digest, 'k', { ...base, transport: transport({ [ACT]: route }), nowMs: NOW });
    expect(await run({ status: 409, body: { code: 'delivery_digest_mismatch' } })).toEqual({ kind: 'changed', reason: 'delivery_digest_mismatch' });
    expect(await run({ status: 409, body: { code: 'order_version_conflict' } })).toEqual({ kind: 'changed', reason: 'order_version_conflict' });
    expect(await run({ status: 409, body: { code: 'order_delivery_draft_missing' } })).toEqual({ kind: 'changed', reason: 'order_delivery_draft_missing' });
    // Delivered elsewhere, or refunded meanwhile.
    expect(await run({ status: 409, body: { code: 'action_not_allowed_in_status' } })).toEqual({ kind: 'changed', reason: 'action_not_allowed_in_status' });
    expect(await run({ status: 400, body: { code: 'order_invalid' } })).toEqual({ kind: 'failed', reason: 'order_invalid', retryable: false });
    expect(await run({ status: 403, body: { code: 'sign_in_required' } })).toEqual({ kind: 'needs_web', reason: 'sign_in_required' });
    expect(await run({ status: 404, body: { code: 'order_not_found' } })).toEqual({ kind: 'changed', reason: 'order_not_found' });
    expect(await run({ status: 503, body: { code: 'orders_unavailable' } })).toEqual({ kind: 'failed', reason: 'orders_unavailable', retryable: false });
    expect(await run({ status: 502, body: {} })).toEqual({ kind: 'failed', reason: 'http_502', retryable: true });
    expect(await run('throw')).toEqual({ kind: 'failed', reason: 'network', retryable: true });
    expect(await run(ok(sellerJson()))).toEqual({ kind: 'changed', reason: 'status_paid' });
    expect(await run(ok({ nope: true }))).toEqual({ kind: 'changed', reason: 'response_malformed' });
  });

  it('a retry of the same draft reuses the key (a replay, never a second delivery); a new draft or version gets a new one', async () => {
    const order = view();
    const digest = order.deliveryDraft!.digest;
    const key = twinOrderDeliverIdempotencyKey(order, digest);
    expect(key).toMatch(ORDER_IDEMPOTENCY_KEY_PATTERN);
    expect(twinOrderDeliverIdempotencyKey(view(), digest)).toBe(key);
    expect(twinOrderDeliverIdempotencyKey(view({ version: 4 }), digest)).not.toBe(key);
    const other = draftOf(ORDER_ID, '另一版回答');
    expect(twinOrderDeliverIdempotencyKey(view({ deliveryDraft: other }), other.digest)).not.toBe(key);
    expect(twinOrderDeliverIdempotencyKey(view({ orderId: OTHER_ID, deliveryDraft: draftOf(OTHER_ID, '先把教育金和日常开销分开算。') }), digest)).not.toBe(key);
    // A 502, then the same tap again: both requests carry the same key.
    let calls = 0;
    const flaky: HttpTransportV1 & { calls: HttpRequestV1[] } = {
      calls: [],
      async request(request: HttpRequestV1): Promise<HttpResponseV1> {
        flaky.calls.push(request);
        calls += 1;
        return calls === 1
          ? { status: 502, headers: {}, body: {} }
          : { status: 200, headers: {}, body: { success: true, data: sellerJson({ status: 'delivered', deliveredAt: '2026-09-29T08:00:00.000Z', delivery: { answerText: '先把教育金和日常开销分开算。', deliveryRefs: [] }, deliveryDraft: null, version: 4 }) } };
      },
    };
    expect((await deliverTwinOrderDraft(order, digest, twinOrderDeliverIdempotencyKey(order, digest), { ...base, transport: flaky, nowMs: NOW })).kind).toBe('failed');
    expect((await deliverTwinOrderDraft(order, digest, twinOrderDeliverIdempotencyKey(order, digest), { ...base, transport: flaky, nowMs: NOW })).kind).toBe('delivered');
    expect(flaky.calls.map((call) => (call.body as { idempotencyKey: string }).idempotencyKey)).toEqual([key, key]);
  });
});

describe('summary', () => {
  it('proceeds are total minus the platform fee; a paid order without a reviewable draft is answered on the web', () => {
    expect(summarizeTwinOrder(view(), NOW)).toMatchObject({ proceeds: { amountMinor: '1971', currency: 'USD', decimals: 2 }, answerOnWeb: false, test: true });
    expect(summarizeTwinOrder(view({ deliveryDraft: null }), NOW)).toMatchObject({ reviewable: null, answerOnWeb: true });
    expect(summarizeTwinOrder(view({ status: 'settled', deliveryDraft: null, environment: 'live' }), NOW)).toMatchObject({ answerOnWeb: false, test: false });
    const mismatched = view({ amounts: { total: { amountMinor: '100', currency: 'USD', decimals: 2 }, platformFee: { amountMinor: '1', currency: 'SGD', decimals: 2 }, processingFeeBearer: 'undecided' } });
    expect(summarizeTwinOrder(mismatched, NOW).proceeds).toBeNull();
  });
});

describe('source guards', () => {
  const read = (...parts: string[]) => fs.readFileSync(path.resolve(__dirname, '..', ...parts), 'utf8');
  const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const service = withoutComments(read('twinOrders.ts'));
  const screen = read('..', 'screens', 'four-zone', 'TwinIncomeScreen.tsx');

  it('the only write is deliver, and it carries no content', () => {
    expect(service.match(/action: '([a-z_]+)'/g)).toEqual(["action: 'deliver'"]);
    expect(service).not.toMatch(/answerText:|deliveryRefs:|delivery-draft|refund|open_dispute|cancel|'PUT'/);
  });

  it('the screen writes only through deliverTwinOrderDraft, after a confirmation, and reads back', () => {
    expect(screen).not.toMatch(/apiFetch|[^A-Za-z.]fetch\(|transport\.request/);
    expect(screen).toMatch(/deliverTwinOrderDraft\(order, digest, twinOrderDeliverIdempotencyKey\(order, digest\)\)/);
    expect(screen).toMatch(/Alert\.alert\(/);
    expect(screen).toMatch(/onSettled: \(\) => void queryClient\.invalidateQueries\(\{ queryKey: ordersKey \}\)/);
    // The button only exists for a reviewable draft; its digest is that draft's.
    expect(screen).toMatch(/summary\.reviewable \? \(/);
    expect(screen).toMatch(/confirmDeliver\(order, summary\.reviewable!\.digest\)/);
  });
});
