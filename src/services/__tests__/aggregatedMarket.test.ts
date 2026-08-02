/**
 * aggregatedMarket.api — 全网可接机会聚合检索 + 半自主代成交 client 单元测试
 * （Agent Protocol Stack 需求 10.1 / 10.2 / 10.3，task 21.1）。
 *
 * Mocks `apiFetch`，锁定：
 *  - `/ard/search` 请求形（query.text / filter / federation）与结果归一化
 *    （来源徽标、品类推导、能力位缺省、GMV 兜底）；
 *  - `/aggregation/participate` 的能力位前置拒绝、入参映射、错误映射；
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
  extractX402PaymentOption,
  payWithUserWalletAndReplay,
  AggregatedListing,
  ParticipateResult,
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

  it('posts to /aggregation/participate with mapped listing ref + idempotencyKey', async () => {
    apiFetch.mockResolvedValueOnce({ ok: true, status: 'settled', feeBreakdown: { baseRate: 0.05, platformFee: 5, sellerNet: 95 } });
    const r = await participateInListing({ listing: baseListing, action: 'accept' });
    expect(r.ok).toBe(true);
    expect(r.status).toBe('settled');
    expect(r.feeBreakdown?.baseRate).toBe(0.05);
    const [path, opts] = apiFetch.mock.calls[0];
    expect(path).toBe('/aggregation/participate');
    const body = JSON.parse((opts as RequestInit).body as string);
    expect(body.listing.source).toBe('internal');
    expect(body.listing.externalId).toBe('design-bounty');
    expect(body.listing.category).toBe('task');
    expect(body.action).toBe('accept');
    expect(typeof body.idempotencyKey).toBe('string');
    expect(body.idempotencyKey.length).toBeGreaterThan(0);
  });

  it('maps endpoint/transport errors to rejected', async () => {
    apiFetch.mockRejectedValueOnce(new Error('Cannot POST /aggregation/participate'));
    const r = await participateInListing({ listing: baseListing, action: 'accept' });
    expect(r.ok).toBe(false);
    expect(r.status).toBe('rejected');
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

// ── R6：用户主权钱包 x402 proof 回填（需求 4.1 / 4.2 / 4.3）──────────────────

/** payment_required 的 x402 支付要求样例（Injective 测试网 USDC，gmv=100）。 */
const paymentRequirements = {
  x402Version: 1,
  accepts: [
    {
      scheme: 'exact',
      network: 'injective-testnet',
      maxAmountRequired: String(100 * 1e6), // 100 USDC @ 6 位精度
      resource: 'urn:air:agentrix.io:task:design-bounty',
      payTo: '0xCommissionContract',
      asset: 'USDC',
      maxTimeoutSeconds: 300,
    },
  ],
  error: null,
};

describe('participateInListing — idempotencyKey + proof（R6）', () => {
  beforeEach(() => apiFetch.mockReset());

  it('returns the generated idempotencyKey and echoes payment_required', async () => {
    apiFetch.mockResolvedValueOnce({ ok: false, status: 'payment_required', paymentRequirements });
    const r = await participateInListing({ listing: baseListing, action: 'accept' });
    expect(r.status).toBe('payment_required');
    expect(typeof r.idempotencyKey).toBe('string');
    expect(r.idempotencyKey!.length).toBeGreaterThan(0);
    expect(r.paymentRequirements).toBeTruthy();
  });

  it('reuses a caller-provided idempotencyKey and sends proof in the body', async () => {
    apiFetch.mockResolvedValueOnce({ ok: true, status: 'settled' });
    const r = await participateInListing({
      listing: baseListing,
      action: 'accept',
      idempotencyKey: 'idem-fixed-1',
      proof: { txHash: '0xabc', network: 'injective-testnet', asset: 'USDC' },
    });
    expect(r.status).toBe('settled');
    expect(r.idempotencyKey).toBe('idem-fixed-1');
    const body = JSON.parse((apiFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.idempotencyKey).toBe('idem-fixed-1');
    expect(body.proof).toEqual({ txHash: '0xabc', network: 'injective-testnet', asset: 'USDC' });
  });

  it('omits proof from the body when not provided (autopay path unaffected)', async () => {
    apiFetch.mockResolvedValueOnce({ ok: true, status: 'settled' });
    await participateInListing({ listing: baseListing, action: 'accept' });
    const body = JSON.parse((apiFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.proof).toBeUndefined();
  });
});

describe('extractX402PaymentOption', () => {
  it('maps a supported network to chainId + USDC token + human amount', () => {
    const opt = extractX402PaymentOption(paymentRequirements, {
      amountMinor: '100000000',
      currency: 'USDC',
      decimals: 6,
    });
    expect(opt).not.toBeNull();
    expect(opt!.network).toBe('injective-testnet');
    expect(opt!.chainId).toBe(1439);
    expect(opt!.payTo).toBe('0xCommissionContract');
    expect(opt!.asset).toBe('USDC');
    expect(opt!.amountHuman).toBe('100');
    expect(opt!.usdcToken).toMatch(/^0x/);
  });

  it('fails closed for an unsupported network', () => {
    const opt = extractX402PaymentOption({
      accepts: [{ network: 'solana-mainnet', payTo: '0xabc', maxAmountRequired: '1000000' }],
    });
    expect(opt).toBeNull();
  });

  it('fails closed when payTo is missing', () => {
    const opt = extractX402PaymentOption({
      x402Version: 1,
      accepts: [{ scheme: 'exact', network: 'injective-testnet', asset: 'USDC', maxAmountRequired: '1000000' }],
      error: null,
    });
    expect(opt).toBeNull();
  });

  it('keeps large atomic amounts exact without Number conversion', () => {
    const large = '900719925474099312345678';
    const opt = extractX402PaymentOption({
      x402Version: 1,
      accepts: [{
        scheme: 'exact',
        network: 'bsc-testnet',
        payTo: '0xabc',
        asset: 'USDC',
        maxAmountRequired: large,
      }],
      error: null,
    });
    expect(opt?.amountHuman).toBe('900719925474099312.345678');
  });

  it('fails closed for unsupported assets, ambiguous networks and quote mismatches', () => {
    const requirement = {
      x402Version: 1,
      accepts: [{
        scheme: 'exact',
        network: 'bsc-testnet',
        payTo: '0xabc',
        asset: 'USDC',
        maxAmountRequired: '1000000',
      }],
      error: null,
    };
    expect(extractX402PaymentOption({
      ...requirement,
      accepts: [{ ...requirement.accepts[0], asset: 'USDT' }],
    })).toBeNull();
    expect(extractX402PaymentOption({
      ...requirement,
      accepts: [{ ...requirement.accepts[0], network: 'bsc' }],
    })).toBeNull();
    expect(extractX402PaymentOption(requirement, {
      amountMinor: '2000000',
      currency: 'USDC',
      decimals: 6,
    })).toBeNull();
  });
});

describe('payWithUserWalletAndReplay — user sovereign wallet proof backfill（R6）', () => {
  beforeEach(() => apiFetch.mockReset());

  const pending: ParticipateResult = {
    ok: false,
    status: 'payment_required',
    paymentRequirements,
    idempotencyKey: 'idem-pay-first-1',
  };

  it('pays via user wallet then replays with the SAME idempotencyKey + proof (exactly-once)', async () => {
    // 重放后端结算成功（settled）。
    apiFetch.mockResolvedValueOnce({ ok: true, status: 'settled', feeBreakdown: { baseRate: 0.05 } });
    const pay = jest.fn(async () => ({ txHash: '0xdeadbeef', status: 'submitted' as const }));

    const r = await payWithUserWalletAndReplay(
      { listing: baseListing, action: 'accept' },
      pending,
      pay,
    );

    // 用户钱包只被调用一次，参数来自 x402 支付要求解析。
    expect(pay).toHaveBeenCalledTimes(1);
    expect(pay).toHaveBeenCalledWith({
      chainId: 1439,
      token: expect.stringMatching(/^0x/),
      to: '0xCommissionContract',
      amountHuman: '100',
    });

    // 重放只向后端发一次请求（精确一次），且复用同一 idempotencyKey + 携 proof。
    expect(apiFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse((apiFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.idempotencyKey).toBe('idem-pay-first-1');
    expect(body.proof.txHash).toBe('0xdeadbeef');
    expect(body.proof.network).toBe('injective-testnet');

    expect(r.ok).toBe(true);
    expect(r.status).toBe('settled');
    expect(r.idempotencyKey).toBe('idem-pay-first-1');
  });

  it('does not replay when the wallet payment fails (fail-closed)', async () => {
    const pay = jest.fn(async () => ({ txHash: '', status: 'failed' as const, reason: 'FEATURE_DISABLED' }));
    const r = await payWithUserWalletAndReplay(
      { listing: baseListing, action: 'accept' },
      pending,
      pay,
    );
    expect(pay).toHaveBeenCalledTimes(1);
    expect(apiFetch).not.toHaveBeenCalled(); // 未付款成功 → 不重放，不重复扣款
    expect(r.ok).toBe(false);
    expect(r.status).toBe('rejected');
    expect(r.reason).toContain('FEATURE_DISABLED');
    expect(r.idempotencyKey).toBe('idem-pay-first-1');
  });

  it('rejects without paying when idempotencyKey is missing (avoid double-charge)', async () => {
    const pay = jest.fn();
    const r = await payWithUserWalletAndReplay(
      { listing: baseListing, action: 'accept' },
      { ...pending, idempotencyKey: undefined },
      pay as any,
    );
    expect(pay).not.toHaveBeenCalled();
    expect(apiFetch).not.toHaveBeenCalled();
    expect(r.reason).toBe('missing-idempotency-key');
  });

  it('rejects without paying for a non payment_required result', async () => {
    const pay = jest.fn();
    const r = await payWithUserWalletAndReplay(
      { listing: baseListing, action: 'accept' },
      { ok: true, status: 'settled', idempotencyKey: 'k' },
      pay as any,
    );
    expect(pay).not.toHaveBeenCalled();
    expect(r.reason).toBe('not-payment-required');
  });

  it('fails closed for an unsupported payment network (no wallet call, no replay)', async () => {
    const pay = jest.fn();
    const r = await payWithUserWalletAndReplay(
      { listing: baseListing, action: 'accept' },
      {
        ok: false,
        status: 'payment_required',
        idempotencyKey: 'k',
        paymentRequirements: { accepts: [{ network: 'solana-mainnet', payTo: '0xabc', maxAmountRequired: '1' }] },
      },
      pay as any,
    );
    expect(pay).not.toHaveBeenCalled();
    expect(apiFetch).not.toHaveBeenCalled();
    expect(r.reason).toBe('unsupported-payment-network');
  });
});
