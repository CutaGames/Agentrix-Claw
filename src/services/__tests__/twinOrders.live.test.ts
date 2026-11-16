/**
 * L9.2 batch 10 (S10; I-036) — the income figure on the phone for an order on the payment rail.
 *
 * The seller view of such an order carries `amounts.processingFee` and `amounts.sellerNet` (the card processing fee is
 * already taken off). The phone shows the server's net and never subtracts on its own: "total − platform fee" says 9.50
 * for a 10.00 order whose seller receives 8.66. While the card fee is not locked (`null`) there is no figure at all.
 * A bookkeeping order carries neither field and keeps the figure it had.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import type { HttpRequestV1, HttpResponseV1, HttpTransportV1 } from '../../../shared/client/transport';
import { ORDER_ESCROW_SCHEMA_VERSION, orderSellerNetForViewV1, orderSellerNetProceedsV1 } from '../../../shared/types/order-escrow';
import { decodeOrderSellerView, type OrderSellerView } from '../../../shared/types/order-escrow-view';
import { readTwinOrder, readTwinOrders, summarizeTwinOrder, twinOrderPath, twinOrdersListPath } from '../twinOrders';

/** The seller routes use the Agent's external id. */
const AGENT = 'AGT-7F3A91C2';
const BASE = 'https://api.example.test/api';
const NOW = Date.parse('2026-09-29T08:00:00.000Z');
const ORDER_ID = 'ord_0123456789abcdef0123456789abcdef';
const base = { baseUrl: BASE, token: 'tok' };
const usd = (amountMinor: string) => ({ amountMinor, currency: 'USD', decimals: 2 });
const LIST = `GET ${twinOrdersListPath(AGENT)}`;
const ONE = `GET ${twinOrderPath(ORDER_ID)}`;

function transport(routes: Record<string, { status: number; body: unknown }>): HttpTransportV1 & { calls: HttpRequestV1[] } {
  const calls: HttpRequestV1[] = [];
  return {
    calls,
    async request(request: HttpRequestV1): Promise<HttpResponseV1> {
      calls.push(request);
      const route = routes[`${request.method} ${request.path.replace(BASE, '')}`];
      if (!route) return { status: 599, headers: {}, body: undefined };
      return { status: route.status, headers: {}, body: route.body };
    },
  };
}

/**
 * The seller view as the server sends it: a 10.00 order with a 0.50 platform fee. `rail` is what the payment rail lays over
 * `amounts` (`processingFee`, `sellerNet`, or other numbers); `undefined` is a bookkeeping order, which has none of it.
 */
function sellerJson(rail: Record<string, unknown> | undefined, overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: ORDER_ESCROW_SCHEMA_VERSION,
    orderId: ORDER_ID,
    kind: 'consultation_deposit',
    offerRef: 'offer-d',
    status: 'paid',
    escrow: { state: 'held', heldAt: '2026-09-29T07:00:00.000Z' },
    acceptanceWindowSeconds: 72 * 3600,
    environment: rail ? 'live' : 'test',
    createdAt: '2026-09-29T06:59:00.000Z',
    updatedAt: '2026-09-29T07:00:00.000Z',
    version: 3,
    amounts: { total: usd('1000'), platformFee: usd('50'), processingFeeBearer: rail ? 'seller' : 'undecided', ...(rail ?? {}) },
    mandateRef: { grantRef: 'grant-1', grantVersion: 1 },
    buyer: { displayName: null, kind: 'visitor' },
    sellerAgentId: AGENT,
    buyerNote: '想约一次咨询。',
    delivery: null,
    deliveryDraft: null,
    ...(rail ? { paymentDispute: 'none' } : {}),
    ...overrides,
  };
}
const view = (rail: Record<string, unknown> | undefined, overrides: Record<string, unknown> = {}): OrderSellerView => decodeOrderSellerView(sellerJson(rail, overrides))!;
const ok = (data: unknown) => ({ status: 200, body: { success: true, data } });

describe('the income figure of an order on the payment rail', () => {
  // The same numbers as `frontend/__tests__/orders/live-order-pages.test.tsx`: the phone and the web say the same amount.
  it('a 10.00 order whose seller receives 8.66: the phone says 8.66, not the 9.50 of "total − platform fee"', () => {
    const order = view({ processingFee: usd('84'), sellerNet: usd('866') });
    expect(order.amounts.processingFee).toEqual(usd('84'));
    expect(summarizeTwinOrder(order, NOW)).toMatchObject({ proceeds: usd('866'), test: false });
    // The same order without the rail's fields is a bookkeeping order and keeps the old figure.
    expect(summarizeTwinOrder(view(undefined), NOW)).toMatchObject({ proceeds: usd('950'), test: true });
    // 8.66 is the one formula of the whole system: total − platform fee − card fee.
    expect(orderSellerNetProceedsV1(usd('1000'), usd('50'), usd('84'))).toEqual(usd('866'));
  });

  it.each([
    ['5000', '250', '84', '4666'],
    ['1990', '19', '88', '1883'],
    ['100', '0', '53', '47'],
    ['100', '5', '95', '0'],
  ])('total %s, platform fee %s, card fee %s: the seller receives %s', (total, fee, card, net) => {
    const order = view({ total: usd(total), platformFee: usd(fee), processingFee: usd(card), sellerNet: usd(net) });
    expect(summarizeTwinOrder(order, NOW).proceeds).toEqual(usd(net));
    expect(orderSellerNetProceedsV1(usd(total), usd(fee), usd(card))).toEqual(usd(net));
  });

  it('the figure is the one in the view, never a subtraction on the phone', () => {
    const order = view({ processingFee: usd('84'), sellerNet: usd('800') });
    expect(summarizeTwinOrder(order, NOW).proceeds).toEqual(usd('800'));
    expect(orderSellerNetForViewV1(order.amounts)).toEqual(usd('800'));
  });

  it('the card fee not locked yet (null): no figure at all, not the old one', () => {
    const order = view({ processingFee: null, sellerNet: null });
    expect(order.amounts.sellerNet).toBeNull();
    expect(summarizeTwinOrder(order, NOW).proceeds).toBeNull();
    // A fee is named but the server gave no net: still no figure.
    expect(summarizeTwinOrder(view({ processingFee: usd('84'), sellerNet: null }), NOW).proceeds).toBeNull();
  });

  it('read through the routes, the list and the single order carry the figure to the summary unchanged, and nothing but two GETs is sent', async () => {
    const json = sellerJson({ processingFee: usd('84'), sellerNet: usd('866') });
    const http = transport({ [LIST]: ok({ items: [json] }), [ONE]: ok(json) });
    const list = await readTwinOrders(AGENT, { ...base, transport: http });
    const one = await readTwinOrder(ORDER_ID, { ...base, transport: http });
    expect(list.kind === 'ready' && summarizeTwinOrder(list.orders[0], NOW).proceeds).toEqual(usd('866'));
    expect(one.kind === 'ready' && summarizeTwinOrder(one.order, NOW).proceeds).toEqual(usd('866'));
    expect(http.calls.map((call) => call.method)).toEqual(['GET', 'GET']);
    expect(http.calls.every((call) => call.body === undefined)).toBe(true);
  });

  it('a net or a card fee that is not money makes the whole view unreadable: an error, never a partial order', async () => {
    const bad: Array<Record<string, unknown>> = [
      { processingFee: usd('84'), sellerNet: '866' },
      { processingFee: usd('84'), sellerNet: 866 },
      { processingFee: usd('84'), sellerNet: { amountMinor: '866' } },
      { processingFee: usd('84'), sellerNet: [] },
      { processingFee: '84', sellerNet: usd('866') },
      { processingFee: 84, sellerNet: usd('866') },
    ];
    for (const rail of bad) {
      const json = sellerJson(rail);
      expect(decodeOrderSellerView(json)).toBeNull();
      expect(await readTwinOrder(ORDER_ID, { ...base, transport: transport({ [ONE]: ok(json) }) })).toEqual({ kind: 'error', reason: 'response_malformed', retryable: false });
      expect(await readTwinOrders(AGENT, { ...base, transport: transport({ [LIST]: ok({ items: [json] }) }) })).toEqual({ kind: 'error', reason: 'response_malformed', retryable: false });
    }
  });
});

describe('source guards', () => {
  const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const service = withoutComments(fs.readFileSync(path.resolve(__dirname, '..', 'twinOrders.ts'), 'utf8'));

  it('the service takes the figure from the shared view formula and does no arithmetic of its own', () => {
    expect(service).toMatch(/proceeds = orderSellerNetForViewV1\(order\.amounts\)/);
    expect(service).not.toMatch(/orderSellerProceedsV1|orderSellerNetProceedsV1|BigInt|amountMinor|platformFee|processingFee/);
  });
});
