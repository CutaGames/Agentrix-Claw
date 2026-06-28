/**
 * aggregatedMarket.api — 全网可接机会聚合检索 + 半自主代成交 client 单元测试
 * （Agent Protocol Stack 需求 10.1 / 10.2 / 10.3，task 21.1）。
 *
 * Mocks `apiFetch`，锁定：
 *  - `/ard/search` 请求形（query.text / filter / federation）与结果归一化
 *    （来源徽标、品类推导、能力位缺省、GMV 兜底）；
 *  - `/ard/participate` 的能力位前置拒绝、入参映射、backend_gap 降级（任务 22.1）；
 *  - `/ard/aggregated-settlements` 的 graceful fallback。
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const apiFetch = jest.fn() as jest.MockedFunction<
  (path: string, options?: RequestInit) => Promise<any>
>;

jest.mock('../api', () => ({
  apiFetch: (path: string, options?: RequestInit) => apiFetch(path, options),
}));

import {
  searchAggregatedOpportunities,
  participateInListing,
  fetchAggregatedSettlements,
  AggregatedListing,
} from '../aggregatedMarket.api';

const internalEntry = {
  identifier: 'urn:air:agentrix.io:task:design-bounty',
  displayName: 'Logo design bounty',
  type: 'application/ai-skill',
  score: 88,
  source: 'internal',
  data: { category: 'task', gmv: 100, currency: 'USDC' },
};

const externalEntry = {
  identifier: 'urn:air:agenton.io:task:ext-1',
  displayName: 'External outsourcing task',
  type: 'application/a2a-agent-card+json',
  score: 60,
  source: 'agenton',
  url: 'https://agenton.io/tasks/ext-1',
  data: { category: 'task', source: 'agenton', aggregated: true, externalId: 'ext-1', externalUrl: 'https://agenton.io/tasks/ext-1' },
};

describe('searchAggregatedOpportunities', () => {
  beforeEach(() => apiFetch.mockReset());

  it('posts to /ard/search with query.text and federation, filter when category given', async () => {
    apiFetch.mockResolvedValueOnce({ results: [] });
    await searchAggregatedOpportunities({ text: 'logo', category: 'task', lang: 'en' });
    const [path, opts] = apiFetch.mock.calls[0];
    expect(path).toBe('/ard/search');
    expect((opts as RequestInit).method).toBe('POST');
    const body = JSON.parse((opts as RequestInit).body as string);
    expect(body.query.text).toBe('logo');
    expect(body.query.filter).toEqual({ category: ['task'] });
    expect(body.federation).toBe('auto');
  });

  it('falls back to category default query when text omitted', async () => {
    apiFetch.mockResolvedValueOnce({ results: [] });
    await searchAggregatedOpportunities({ category: 'skill', lang: 'en' });
    const body = JSON.parse((apiFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(typeof body.query.text).toBe('string');
    expect(body.query.text.length).toBeGreaterThan(0);
  });

  it('normalizes internal entry: internal=true, category, canAccept defaults true, gmv', async () => {
    apiFetch.mockResolvedValueOnce({ results: [internalEntry] });
    const [l] = await searchAggregatedOpportunities({});
    expect(l.internal).toBe(true);
    expect(l.source).toBe('internal');
    expect(l.category).toBe('task');
    expect(l.canAccept).toBe(true); // 内部条目默认可代成交
    expect(l.aggregated).toBe(false);
    expect(l.gmv).toBe(100);
    expect(l.currency).toBe('USDC');
  });

  it('normalizes external aggregated entry: internal=false, canAccept defaults false (link-discovery)', async () => {
    apiFetch.mockResolvedValueOnce({ results: [externalEntry] });
    const [l] = await searchAggregatedOpportunities({});
    expect(l.internal).toBe(false);
    expect(l.source).toBe('agenton');
    expect(l.aggregated).toBe(true);
    expect(l.canAccept).toBe(false); // 聚合外部条目默认仅链接发现
    expect(l.externalUrl).toBe('https://agenton.io/tasks/ext-1');
    expect(l.externalId).toBe('ext-1');
  });

  it('returns [] on backend error (graceful fallback)', async () => {
    apiFetch.mockRejectedValueOnce(new Error('Request failed: 404'));
    const r = await searchAggregatedOpportunities({});
    expect(r).toEqual([]);
  });
});

const baseListing: AggregatedListing = {
  identifier: 'urn:air:agentrix.io:task:design-bounty',
  displayName: 'Logo design bounty',
  score: 88,
  source: 'internal',
  internal: true,
  category: 'task',
  canAccept: true,
  canDiscover: true,
  canPublish: false,
  aggregated: false,
  gmv: 100,
  currency: 'USDC',
  regulated: null,
  externalId: 'design-bounty',
  connectorSource: 'internal',
};

describe('participateInListing', () => {
  beforeEach(() => apiFetch.mockReset());

  it('rejects link-discovery-only listings without calling backend', async () => {
    const r = await participateInListing({ listing: { ...baseListing, canAccept: false }, action: 'accept' });
    expect(r.ok).toBe(false);
    expect(r.status).toBe('rejected');
    expect(r.reason).toBe('link-discovery-only');
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('posts to /ard/participate with mapped listing ref + idempotencyKey', async () => {
    apiFetch.mockResolvedValueOnce({ ok: true, status: 'settled', feeBreakdown: { baseRate: 0.05, platformFee: 5, sellerNet: 95 } });
    const r = await participateInListing({ listing: baseListing, action: 'accept' });
    expect(r.ok).toBe(true);
    expect(r.status).toBe('settled');
    expect(r.feeBreakdown?.baseRate).toBe(0.05);
    const [path, opts] = apiFetch.mock.calls[0];
    expect(path).toBe('/ard/participate');
    const body = JSON.parse((opts as RequestInit).body as string);
    expect(body.listing.source).toBe('internal');
    expect(body.listing.externalId).toBe('design-bounty');
    expect(body.listing.category).toBe('task');
    expect(body.action).toBe('accept');
    expect(typeof body.idempotencyKey).toBe('string');
    expect(body.idempotencyKey.length).toBeGreaterThan(0);
  });

  it('degrades to backend_gap when endpoint missing (404/501)', async () => {
    apiFetch.mockRejectedValueOnce(new Error('Cannot POST /ard/participate'));
    const r = await participateInListing({ listing: baseListing, action: 'accept' });
    expect(r.ok).toBe(false);
    expect(r.status).toBe('backend_gap');
  });

  it('maps other errors to rejected', async () => {
    apiFetch.mockRejectedValueOnce(new Error('fence rejected: amount exceeds singleTxLimit'));
    const r = await participateInListing({ listing: baseListing, action: 'accept' });
    expect(r.status).toBe('rejected');
    expect(r.reason).toContain('fence rejected');
  });
});

describe('fetchAggregatedSettlements', () => {
  beforeEach(() => apiFetch.mockReset());

  it('normalizes settlement rows', async () => {
    apiFetch.mockResolvedValueOnce({
      items: [{ id: 's1', source: 'agenton', category: 'task', gmv: 100, currency: 'USDC', platform_fee: 5, seller_net: 95, status: 'settled', asset_type: 'aggregated_web2' }],
    });
    const rows = await fetchAggregatedSettlements();
    expect(rows).toHaveLength(1);
    expect(rows[0].platformFee).toBe(5);
    expect(rows[0].sellerNet).toBe(95);
    expect(rows[0].assetType).toBe('aggregated_web2');
  });

  it('returns [] on error (graceful fallback)', async () => {
    apiFetch.mockRejectedValueOnce(new Error('Request failed: 404'));
    expect(await fetchAggregatedSettlements()).toEqual([]);
  });
});
