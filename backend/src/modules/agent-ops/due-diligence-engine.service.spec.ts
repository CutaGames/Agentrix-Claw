import * as fc from 'fast-check';

import {
  DueDiligenceEngine,
  DueDiligenceFact,
  FACT_FIELD_TO_PATH,
} from './due-diligence-engine.service';
import { DeliverableValidator, KEY_DATA_PATHS } from './deliverable-validator.service';
import { DataSourceFetchResult, DueDiligenceTarget } from './data-source-plugin.types';

/**
 * DueDiligenceEngine 单测(crypto-native-agent-ops 任务 13)。
 *
 * 覆盖 design §C4 / 需求 8.1 / 8.2 / 8.4 / 8.6 / Property 7:
 *   - 跨只读源采集 → 归一 → 结构化报告(含来源链接 + 采集时间);
 *   - 合格判定 + 交付物落库(归属 agent、qualified、来源链接、采集时间戳);
 *   - **不编造**:报告中每条非空关键数据都有可核来源(Property 7);
 *   - 报告自洽。
 */
describe('DueDiligenceEngine (任务 13 / 需求 8)', () => {
  const ADDR = '0x' + 'a'.repeat(40);
  const target: DueDiligenceTarget = {
    type: 'token',
    chain: 'ethereum',
    address: ADDR,
    name: 'Foo',
    project: 'foo.io',
  };

  const NOW = '2026-05-10T00:00:00.000Z';

  // 可核 mock 仓库:记录 save 入参。
  function makeRepo() {
    const saved: any[] = [];
    return {
      saved,
      create: jest.fn((e: any) => ({ id: 'deliv-1', ...e })),
      save: jest.fn(async (e: any) => {
        saved.push(e);
        return e;
      }),
    };
  }

  function makeEngine(
    fetchAll: jest.Mock,
    repo = makeRepo(),
  ): { engine: DueDiligenceEngine; repo: ReturnType<typeof makeRepo> } {
    const registry = { fetchAll } as any;
    const validator = new DeliverableValidator();
    const engine = new DueDiligenceEngine(registry, validator, repo as any);
    return { engine, repo };
  }

  const fetched = (
    source: string,
    sourceUrl: string,
    data: Record<string, any>,
  ): DataSourceFetchResult => ({
    source,
    sourceUrl,
    status: 'fetched',
    data,
    collectedAt: NOW,
  });

  const notFetched = (source: string, sourceUrl: string): DataSourceFetchResult => ({
    source,
    sourceUrl,
    status: 'not_fetched',
    data: null,
    collectedAt: NOW,
    failureReason: 'timeout',
    note: 'boom',
  });

  /** 足以让报告合格的额外事实(各带可核来源)。 */
  function qualifyingFacts(): DueDiligenceFact[] {
    const src = (url: string) => ({ source: 'coingecko', sourceUrl: url, collectedAt: NOW });
    return [
      { field: 'category', value: 'DeFi', ...src('https://coingecko.com/foo') },
      { field: 'marketCapUsd', value: 1_000_000, ...src('https://coingecko.com/foo') },
      { field: 'fdvUsd', value: 2_000_000, ...src('https://coingecko.com/foo') },
      { field: 'circulatingSupply', value: 500_000, ...src('https://coingecko.com/foo') },
      { field: 'totalSupply', value: 1_000_000, ...src('https://coingecko.com/foo') },
      { field: 'website', value: 'https://foo.io', ...src('https://foo.io') },
      {
        field: 'contractPermissions',
        value: { mintable: false, ownerPrivileged: false, pausable: false, upgradeableProxy: false },
        ...src('https://etherscan.io/foo'),
      },
      { field: 'honeypotRug', value: false, ...src('https://de.fi/scanner/foo') },
    ];
  }

  // ─────────────── 端到端:采集 → 报告 → 合格 → 落库 ───────────────

  describe('端到端编排 (需求 8.1/8.2/8.4/8.6)', () => {
    it('跨源采集 + 充足事实 → 合格报告并落库(归属 agent + qualified + 采集时间)', async () => {
      const fetchAll = jest.fn().mockResolvedValue([
        fetched('block_explorer', `https://etherscan.io/token/${ADDR}`, {
          contractVerified: true,
          holderCount: 12_345,
        }),
        fetched('dex', `https://dexscreener.com/ethereum/${ADDR}`, {
          liquidityUsd: 250_000,
          volume24hUsd: 750_000,
        }),
        fetched('audit_source', 'https://de.fi/scanner/contract/' + ADDR, {
          auditStatus: 'Audited (CertiK)',
        }),
      ]);
      const { engine, repo } = makeEngine(fetchAll);

      const { report, validation, deliverable } = await engine.run({
        taskId: 'task-1',
        agentId: 'agent-1',
        userId: 'user-1',
        target,
        extraFacts: qualifyingFacts(),
      });

      expect(validation.qualified).toBe(true);
      expect(report.conclusion.riskRating).not.toBeNull();
      expect(report.collectedAt).toBe(NOW);

      // 落库一次,字段正确。
      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(deliverable).not.toBeNull();
      expect(deliverable!.agentId).toBe('agent-1');
      expect(deliverable!.taskId).toBe('task-1');
      expect(deliverable!.type).toBe('due_diligence_report');
      expect(deliverable!.qualified).toBe(true);
      expect(deliverable!.collectedAt).toEqual(new Date(NOW));
      expect(deliverable!.sourceLinks.length).toBeGreaterThan(0);
    });

    it('数据不足 → 不合格,仍落库并标注缺项(qualified=false)', async () => {
      const fetchAll = jest.fn().mockResolvedValue([
        fetched('block_explorer', `https://etherscan.io/token/${ADDR}`, {
          contractVerified: true,
        }),
      ]);
      const { engine, repo } = makeEngine(fetchAll);

      const { validation, deliverable } = await engine.run({
        taskId: 'task-2',
        agentId: 'agent-1',
        userId: 'user-1',
        target,
      });

      expect(validation.qualified).toBe(false);
      expect(validation.missingItems.length).toBeGreaterThan(0);
      expect(deliverable!.qualified).toBe(false);
      expect(repo.save).toHaveBeenCalledTimes(1);
    });

    it('persist=false → 不落库', async () => {
      const fetchAll = jest.fn().mockResolvedValue([]);
      const { engine, repo } = makeEngine(fetchAll);
      const { deliverable } = await engine.run({
        taskId: 'task-3',
        agentId: 'agent-1',
        userId: 'user-1',
        target,
        persist: false,
      });
      expect(deliverable).toBeNull();
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  // ─────────────── 不编造数据 (Property 7) ───────────────

  describe('不编造数据 (Property 7 / 需求 8.5)', () => {
    it('未获取的源不贡献字段,且关键链接仍保留可核 URL', async () => {
      const fetchAll = jest.fn().mockResolvedValue([
        notFetched('block_explorer', `https://etherscan.io/token/${ADDR}`),
        fetched('dex', `https://dexscreener.com/ethereum/${ADDR}`, { liquidityUsd: 100 }),
      ]);
      const { engine } = makeEngine(fetchAll);
      const { report } = await engine.run({
        taskId: 't',
        agentId: 'a',
        userId: 'u',
        target,
      });

      // block_explorer 未获取 → 不写 holderCount/contractVerified。
      expect(report.onchainActivity.holderCount).toBeNull();
      expect(report.onchainActivity.contractVerified).toBeNull();
      // 但区块浏览器链接仍保留(可核)。
      expect(report.keyLinks.blockExplorer).toBe(`https://etherscan.io/token/${ADDR}`);
      // 取到的字段带 provenance。
      expect(report.provenance['onchainActivity.liquidityUsd']?.sourceUrl).toBe(
        `https://dexscreener.com/ethereum/${ADDR}`,
      );
      // 未取到字段标「未获取」。
      expect(report.notFetched).toContain('onchainActivity.holderCount');
    });

    it('拒绝无来源链接的事实(不并入,防编造)', async () => {
      const fetchAll = jest.fn().mockResolvedValue([]);
      const { engine } = makeEngine(fetchAll);
      const { report } = await engine.run({
        taskId: 't',
        agentId: 'a',
        userId: 'u',
        target,
        extraFacts: [
          { field: 'marketCapUsd', value: 9_999_999, source: 'rumor', sourceUrl: '', collectedAt: NOW },
        ],
      });
      // 无源事实被拒 → 字段仍为空,无 provenance。
      expect(report.basics.marketCapUsd).toBeNull();
      expect(report.provenance['basics.marketCapUsd']).toBeUndefined();
      expect(report.notFetched).toContain('basics.marketCapUsd');
    });

    it('丢弃无 sourceUrl 的 fetched 结果(绝不无源归因)', async () => {
      const fetchAll = jest.fn().mockResolvedValue([
        // 异常 fetched:有数据但无来源链接 → 不应被归因。
        { source: 'shady', sourceUrl: '', status: 'fetched', data: { holderCount: 5 }, collectedAt: NOW },
      ]);
      const { engine } = makeEngine(fetchAll);
      const { report } = await engine.run({ taskId: 't', agentId: 'a', userId: 'u', target });
      expect(report.onchainActivity.holderCount).toBeNull();
      expect(report.provenance['onchainActivity.holderCount']).toBeUndefined();
    });

    // Property 7 不变量:报告中每条非空关键数据都必有非空可核来源链接。
    it('属性:任意采集结果 + 事实组合下,每条非空关键数据都有可核来源 (fast-check)', () => {
      const fieldKeys = Object.keys(FACT_FIELD_TO_PATH);

      // 生成器:随机 fetched/not_fetched 结果(fetched ⟹ 非空 sourceUrl,符合插件契约)。
      const valueArb = fc.oneof(
        fc.double({ min: 0, max: 1e9, noNaN: true }),
        fc.boolean(),
        fc.string({ minLength: 1, maxLength: 12 }),
      );
      const dataArb = fc.dictionary(fc.constantFrom(...fieldKeys), valueArb, { maxKeys: 6 });
      const resultArb = fc.record({
        source: fc.constantFrom('block_explorer', 'dex', 'audit_source', 'other'),
        sourceUrl: fc.constant('https://src.example/x'),
        status: fc.constant('fetched' as const),
        data: dataArb,
        collectedAt: fc.constant(NOW),
      });
      const notFetchedArb = fc.record({
        source: fc.constantFrom('block_explorer', 'dex'),
        sourceUrl: fc.constant('https://src.example/y'),
        status: fc.constant('not_fetched' as const),
        data: fc.constant(null),
        collectedAt: fc.constant(NOW),
      });

      // 事实:sourceUrl 可能为空(应被拒,不得编造)。
      const factArb: fc.Arbitrary<DueDiligenceFact> = fc.record({
        field: fc.constantFrom(...fieldKeys),
        value: valueArb,
        source: fc.constant('extra'),
        sourceUrl: fc.oneof(fc.constant(''), fc.constant('https://fact.example/z')),
        collectedAt: fc.constant(NOW),
      });

      const fetchAll = jest.fn();
      const { engine } = makeEngine(fetchAll);

      fc.assert(
        fc.property(
          fc.array(fc.oneof(resultArb, notFetchedArb), { maxLength: 8 }),
          fc.array(factArb, { maxLength: 8 }),
          (results, facts) => {
            const report = engine.buildReport(
              target,
              results as DataSourceFetchResult[],
              facts,
              Date.now(),
            );

            // 不变量:每条非空关键数据字段都必有非空可核来源链接(无编造)。
            for (const path of KEY_DATA_PATHS) {
              const v = getByPath(report, path);
              if (isPresent(v)) {
                const prov = report.provenance[path];
                expect(prov).toBeDefined();
                expect(typeof prov.sourceUrl).toBe('string');
                expect(prov.sourceUrl.length).toBeGreaterThan(0);
              }
            }
          },
        ),
        { numRuns: 60 },
      );
    });
  });

  // ─────────────── 报告自洽 ───────────────

  describe('报告自洽', () => {
    it('引擎产出的合格报告通过校验器的自洽门槛(B8)', async () => {
      const fetchAll = jest.fn().mockResolvedValue([
        fetched('block_explorer', `https://etherscan.io/token/${ADDR}`, {
          contractVerified: true,
          holderCount: 1000,
        }),
        fetched('dex', `https://dexscreener.com/ethereum/${ADDR}`, { liquidityUsd: 50_000 }),
        fetched('audit_source', 'https://de.fi/x', { auditStatus: 'Audited' }),
      ]);
      const { engine } = makeEngine(fetchAll);
      const { report, validation } = await engine.run({
        taskId: 't',
        agentId: 'a',
        userId: 'u',
        target,
        extraFacts: qualifyingFacts(),
      });
      const b8 = validation.checks.find((c) => c.id === 'B8')!;
      expect(b8.passed).toBe(true);
      // 自洽:流通量 ≤ 总量,市值 ≤ FDV。
      expect(report.basics.circulatingSupply!).toBeLessThanOrEqual(report.basics.totalSupply!);
      expect(report.basics.marketCapUsd!).toBeLessThanOrEqual(report.basics.fdvUsd!);
    });

    it('结论评级由可核风险信号派生(蜜罐 → critical)', async () => {
      const fetchAll = jest.fn().mockResolvedValue([]);
      const { engine } = makeEngine(fetchAll);
      const { report } = await engine.run({
        taskId: 't',
        agentId: 'a',
        userId: 'u',
        target,
        extraFacts: [
          { field: 'honeypotRug', value: true, source: 'defi', sourceUrl: 'https://de.fi/x', collectedAt: NOW },
        ],
      });
      expect(report.conclusion.riskRating).toBe('critical');
      expect(report.conclusion.summary).toContain('蜜罐');
    });
  });
});

// 测试内联工具(与校验器同义,避免导出私有函数)。
function getByPath(obj: any, path: string): unknown {
  return path.split('.').reduce<any>((acc, key) => (acc == null ? acc : acc[key]), obj);
}
function isPresent(v: unknown): boolean {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'object') return Object.keys(v as object).length > 0;
  return true;
}
