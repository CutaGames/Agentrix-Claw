import { Test, TestingModule } from '@nestjs/testing';

import { DataSourceRegistry } from './data-source-registry.service';
import { BlockExplorerPlugin } from './plugins/block-explorer.plugin';
import { DexPlugin } from './plugins/dex.plugin';
import { AuditSourcePlugin } from './plugins/audit-source.plugin';
import {
  DATA_SOURCE_PLUGINS,
  DueDiligenceTarget,
  READ_ONLY_FETCHER,
  ReadOnlyFetchResponse,
} from './data-source-plugin.types';

/**
 * 数据源插件框架单测(crypto-native-agent-ops 任务 12)。
 *
 * 覆盖 design §C4 / 需求 8.1 / 8.3 / 8.5 / Property 7:
 *   - `DataSourcePlugin` 接口(name / fetch(target) / sourceUrl);均只读。
 *   - 首批插件:区块浏览器 + DEX + 1 官方/审计源。
 *   - **失败跳过标「未获取」(not_fetched);严禁编造数据**。
 *
 * 网络/浏览器调用置于可注入的 ReadOnlyFetcher 边界后,测试注入 mock 模拟成败路径,
 * 无需真实网络。
 */
describe('DataSource 插件框架 (任务 12 / 需求 8.1/8.3/8.5)', () => {
  // 0x + 40 hex 的合法 EVM 地址。
  const ADDR = '0x' + 'a'.repeat(40);
  const CTX = { userId: 'u1', agentId: 'a1' };

  const tokenTarget: DueDiligenceTarget = {
    type: 'token',
    chain: 'ethereum',
    address: ADDR,
    name: 'ExampleToken',
    project: 'example.io',
  };

  // 可编程 mock 采集器:按需返回成功/失败。
  const mockFetcher = { fetch: jest.fn() };

  const ok = (data: any): ReadOnlyFetchResponse => ({ success: true, data });
  const fail = (
    failureReason: ReadOnlyFetchResponse['failureReason'],
    error = 'err',
  ): ReadOnlyFetchResponse => ({ success: false, failureReason, error });

  let registry: DataSourceRegistry;
  let explorer: BlockExplorerPlugin;
  let dex: DexPlugin;
  let audit: AuditSourcePlugin;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: READ_ONLY_FETCHER, useValue: mockFetcher },
        BlockExplorerPlugin,
        DexPlugin,
        AuditSourcePlugin,
        {
          provide: DATA_SOURCE_PLUGINS,
          useFactory: (e, d, a) => [e, d, a],
          inject: [BlockExplorerPlugin, DexPlugin, AuditSourcePlugin],
        },
        DataSourceRegistry,
      ],
    }).compile();

    registry = module.get(DataSourceRegistry);
    explorer = module.get(BlockExplorerPlugin);
    dex = module.get(DexPlugin);
    audit = module.get(AuditSourcePlugin);
  });

  // ─────────────── 接口契约 / 来源链接 ───────────────

  describe('接口契约:name / sourceUrl / supports', () => {
    it('首批三个插件具备稳定 name', () => {
      expect(registry.listSources()).toEqual(['block_explorer', 'dex', 'audit_source']);
    });

    it('区块浏览器 sourceUrl 按链映射(ethereum→etherscan,token→token 路径)', () => {
      expect(explorer.sourceUrl(tokenTarget)).toBe(`https://etherscan.io/token/${ADDR}`);
      expect(explorer.sourceUrl({ ...tokenTarget, chain: 'bsc', type: 'contract' })).toBe(
        `https://bscscan.com/address/${ADDR}`,
      );
    });

    it('DEX sourceUrl 指向 dexscreener 对应链', () => {
      expect(dex.sourceUrl(tokenTarget)).toBe(`https://dexscreener.com/ethereum/${ADDR}`);
    });

    it('审计源 sourceUrl:有地址走合约扫描器,否则走项目 slug', () => {
      expect(audit.sourceUrl(tokenTarget)).toBe(`https://de.fi/scanner/contract/${ADDR}`);
      expect(audit.sourceUrl({ type: 'project', project: 'https://Example.IO/' })).toBe(
        'https://de.fi/project/example.io',
      );
    });

    it('未知链 / 非法地址 → 区块浏览器与 DEX 不支持(supports=false)', () => {
      expect(explorer.supports({ type: 'token', chain: 'solana', address: ADDR })).toBe(false);
      expect(dex.supports({ type: 'token', chain: 'ethereum', address: '0xbad' })).toBe(false);
    });
  });

  // ─────────────── 成功路径(只搬运,不编造) ───────────────

  describe('成功采集:只搬运可核字段', () => {
    it('区块浏览器:解析验证状态与持币数', async () => {
      mockFetcher.fetch.mockResolvedValue(
        ok({ contractVerified: true, holdersText: '12,345 addresses' }),
      );
      const r = await explorer.fetch(tokenTarget, CTX);
      expect(r.status).toBe('fetched');
      expect(r.source).toBe('block_explorer');
      expect(r.sourceUrl).toBe(`https://etherscan.io/token/${ADDR}`);
      expect(r.data).toEqual({ contractVerified: true, holderCount: 12345 });
      expect(typeof r.collectedAt).toBe('string');
      expect(new Date(r.collectedAt).toString()).not.toBe('Invalid Date');
    });

    it('DEX:解析价格/流动性/24h 量(含 K/M 后缀)', async () => {
      mockFetcher.fetch.mockResolvedValue(
        ok({ priceUsdText: '$1.23', liquidityUsdText: '$2.5M', volume24hText: '750K' }),
      );
      const r = await dex.fetch(tokenTarget, CTX);
      expect(r.status).toBe('fetched');
      expect(r.data).toEqual({ priceUsd: 1.23, liquidityUsd: 2_500_000, volume24hUsd: 750_000 });
    });
  });

  // ─────────────── 不编造:无法解析的字段不写入 ───────────────

  describe('不编造数据 (Property 7)', () => {
    it('源返回无法解析的文本 → 该字段不写入(绝不杜撰)', async () => {
      mockFetcher.fetch.mockResolvedValue(
        ok({ contractVerified: 'maybe', holdersText: 'N/A' }),
      );
      const r = await explorer.fetch(tokenTarget, CTX);
      // contractVerified 非布尔不搬运;holders 无法解析不搬运 → 全无可用字段 → 未获取。
      expect(r.status).toBe('not_fetched');
      expect(r.data).toBeNull();
    });

    it('源返回空对象 → 标未获取,data 为 null', async () => {
      mockFetcher.fetch.mockResolvedValue(ok({}));
      const r = await dex.fetch(tokenTarget, CTX);
      expect(r.status).toBe('not_fetched');
      expect(r.data).toBeNull();
      // 来源链接仍保留以供核查。
      expect(r.sourceUrl).toBe(`https://dexscreener.com/ethereum/${ADDR}`);
    });

    it('部分字段可解析 → 只搬运可解析项,缺失项不补(留缺而非编造)', async () => {
      mockFetcher.fetch.mockResolvedValue(
        ok({ priceUsdText: '$0.50', liquidityUsdText: 'unknown', volume24hText: '' }),
      );
      const r = await dex.fetch(tokenTarget, CTX);
      expect(r.status).toBe('fetched');
      expect(r.data).toEqual({ priceUsd: 0.5 });
    });
  });

  // ─────────────── 失败跳过标「未获取」 ───────────────

  describe('失败跳过标未获取 (需求 8.5)', () => {
    it.each([
      ['timeout' as const],
      ['blocked' as const],
      ['dom_changed' as const],
      ['selector_miss' as const],
    ])('采集失败(%s)→ not_fetched,data=null,保留 sourceUrl 与失败原因', async (reason) => {
      mockFetcher.fetch.mockResolvedValue(fail(reason, 'boom'));
      const r = await explorer.fetch(tokenTarget, CTX);
      expect(r.status).toBe('not_fetched');
      expect(r.data).toBeNull();
      expect(r.failureReason).toBe(reason);
      expect(r.sourceUrl).toBe(`https://etherscan.io/token/${ADDR}`);
      expect(r.note).toContain('boom');
    });

    it('采集器抛错 → fetch 不抛出,归一为 not_fetched', async () => {
      mockFetcher.fetch.mockRejectedValue(new Error('network down'));
      const r = await dex.fetch(tokenTarget, CTX);
      expect(r.status).toBe('not_fetched');
      expect(r.data).toBeNull();
      expect(r.note).toContain('network down');
    });

    it('标的信息不足以构造来源链接 → not_fetched,且不调用采集器', async () => {
      const r = await audit.fetch({ type: 'project' }, CTX);
      expect(r.status).toBe('not_fetched');
      expect(r.data).toBeNull();
      expect(mockFetcher.fetch).not.toHaveBeenCalled();
    });
  });

  // ─────────────── 聚合:部分失败不影响其它源 ───────────────

  describe('注册表聚合:部分源失败被跳过且标未获取', () => {
    it('一个源成功 + 一个源失败 + 一个源空 → 各产一条结果,失败项 not_fetched', async () => {
      // 调用顺序与 supportedSources 顺序一致:explorer → dex → audit。
      mockFetcher.fetch
        .mockResolvedValueOnce(ok({ contractVerified: true })) // explorer 成功
        .mockResolvedValueOnce(fail('timeout')) // dex 失败
        .mockResolvedValueOnce(ok({})); // audit 空数据

      const results = await registry.fetchAll(tokenTarget, CTX);
      expect(results).toHaveLength(3);

      const byName = Object.fromEntries(results.map((r) => [r.source, r]));
      expect(byName['block_explorer'].status).toBe('fetched');
      expect(byName['block_explorer'].data).toEqual({ contractVerified: true });
      expect(byName['dex'].status).toBe('not_fetched');
      expect(byName['dex'].data).toBeNull();
      expect(byName['audit_source'].status).toBe('not_fetched');
      expect(byName['audit_source'].data).toBeNull();

      // 每条都带可核来源链接(即便未获取)。
      for (const r of results) {
        expect(typeof r.sourceUrl).toBe('string');
        expect(r.sourceUrl.length).toBeGreaterThan(0);
      }
    });

    it('无任何源支持该标的 → 返回空数组(不编造结果)', async () => {
      const results = await registry.fetchAll({ type: 'wallet', chain: 'solana' }, CTX);
      expect(results).toEqual([]);
      expect(mockFetcher.fetch).not.toHaveBeenCalled();
    });

    it('插件违约抛错 → 注册表兜底为 not_fetched(不中断其它源)', async () => {
      jest.spyOn(explorer, 'fetch').mockRejectedValueOnce(new Error('plugin bug'));
      mockFetcher.fetch
        .mockResolvedValueOnce(ok({ priceUsdText: '$1' })) // dex 成功
        .mockResolvedValueOnce(ok({ auditStatusText: 'Audited' })); // audit 成功

      const results = await registry.fetchAll(tokenTarget, CTX);
      const byName = Object.fromEntries(results.map((r) => [r.source, r]));
      expect(byName['block_explorer'].status).toBe('not_fetched');
      expect(byName['block_explorer'].data).toBeNull();
      expect(byName['block_explorer'].note).toContain('plugin bug');
      expect(byName['dex'].status).toBe('fetched');
      expect(byName['audit_source'].status).toBe('fetched');
    });
  });

  // ─────────────── 只读保证 ───────────────

  describe('只读保证 (需求 8.3)', () => {
    it('采集仅经 ReadOnlyFetcher(只读 navigate+eval),无写动作入参', async () => {
      mockFetcher.fetch.mockResolvedValue(ok({ contractVerified: false }));
      await explorer.fetch(tokenTarget, CTX);
      expect(mockFetcher.fetch).toHaveBeenCalledTimes(1);
      const req = mockFetcher.fetch.mock.calls[0][0];
      // 请求只含 url + 只读提取表达式,不含任何点击/输入/提交语义。
      expect(req).toMatchObject({ url: `https://etherscan.io/token/${ADDR}`, userId: 'u1', agentId: 'a1' });
      expect(typeof req.extract).toBe('string');
    });
  });
});
