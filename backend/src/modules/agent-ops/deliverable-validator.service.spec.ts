import { DeliverableValidator } from './deliverable-validator.service';
import {
  DueDiligenceReport,
  FieldProvenance,
  MAX_DUE_DILIGENCE_LATENCY_MS,
} from './due-diligence.types';

/**
 * DeliverableValidator 单测(crypto-native-agent-ops 任务 13)。
 *
 * 覆盖 design §C4「合格校验器」/ 需求 8 验收清单 / 需求 8.6 / Property 7:
 *   - 逐项检查 A 必备 6 项 + B 真实性门槛 3 项;
 *   - 任一必备项缺失 或 违反任一真实性门槛(尤其编造数据)→ 不合格;
 *   - 报告自洽(数字不矛盾)。
 */
describe('DeliverableValidator (任务 13 / 需求 8.6 / Property 7)', () => {
  let validator: DeliverableValidator;

  beforeEach(() => {
    validator = new DeliverableValidator();
  });

  const prov = (url: string): FieldProvenance => ({
    source: 'test_source',
    sourceUrl: url,
    collectedAt: '2026-05-10T00:00:00.000Z',
  });

  /** 构造一份「全部合格」的基准报告(可在各用例中精确破坏单点)。 */
  function qualifiedReport(): DueDiligenceReport {
    return {
      target: { type: 'token', chain: 'ethereum', address: '0x' + 'a'.repeat(40), name: 'Foo' },
      identity: {
        name: 'Foo',
        address: '0x' + 'a'.repeat(40),
        chain: 'ethereum',
        project: 'foo.io',
      },
      basics: {
        category: 'DeFi',
        launchTime: '2024-01-01',
        marketCapUsd: 1_000_000,
        fdvUsd: 2_000_000,
        circulatingSupply: 500_000,
        totalSupply: 1_000_000,
        priceUsd: 2,
        links: { website: 'https://foo.io', social: ['https://x.com/foo'], docs: 'https://docs.foo.io' },
      },
      onchainActivity: {
        holderCount: 12_345,
        topHolderConcentration: 35,
        liquidityUsd: 250_000,
        volume24hUsd: 750_000,
        contractVerified: true,
      },
      riskSignals: {
        contractPermissions: {
          mintable: false,
          ownerPrivileged: false,
          pausable: false,
          upgradeableProxy: false,
        },
        honeypotRug: false,
        largeUnlock: false,
        suspiciousApprovals: false,
        auditStatus: 'Audited (CertiK)',
      },
      keyLinks: {
        blockExplorer: 'https://etherscan.io/token/0x' + 'a'.repeat(40),
        dexOrCex: 'https://dexscreener.com/ethereum/0x' + 'a'.repeat(40),
        official: 'https://foo.io',
        auditReport: 'https://certik.com/foo',
      },
      conclusion: { riskRating: 'low', summary: 'Foo 风险评级:低。依据:已通过审计、合约已验证。' },
      provenance: {
        'basics.category': prov('https://foo.io/about'),
        'basics.launchTime': prov('https://foo.io/about'),
        'basics.marketCapUsd': prov('https://coingecko.com/foo'),
        'basics.fdvUsd': prov('https://coingecko.com/foo'),
        'basics.circulatingSupply': prov('https://coingecko.com/foo'),
        'basics.totalSupply': prov('https://coingecko.com/foo'),
        'basics.priceUsd': prov('https://dexscreener.com/ethereum/foo'),
        'basics.links.website': prov('https://foo.io'),
        'basics.links.social': prov('https://foo.io'),
        'basics.links.docs': prov('https://foo.io'),
        'onchainActivity.holderCount': prov('https://etherscan.io/token/foo'),
        'onchainActivity.topHolderConcentration': prov('https://etherscan.io/token/foo'),
        'onchainActivity.liquidityUsd': prov('https://dexscreener.com/ethereum/foo'),
        'onchainActivity.volume24hUsd': prov('https://dexscreener.com/ethereum/foo'),
        'onchainActivity.contractVerified': prov('https://etherscan.io/token/foo'),
        'riskSignals.contractPermissions': prov('https://etherscan.io/token/foo'),
        'riskSignals.honeypotRug': prov('https://de.fi/scanner/foo'),
        'riskSignals.largeUnlock': prov('https://de.fi/scanner/foo'),
        'riskSignals.suspiciousApprovals': prov('https://de.fi/scanner/foo'),
        'riskSignals.auditStatus': prov('https://certik.com/foo'),
      },
      notFetched: [],
      sourceLinks: [],
      collectedAt: '2026-05-10T00:00:00.000Z',
      latencyMs: 1500,
      generatedAt: '2026-05-10T00:00:30.000Z',
    };
  }

  it('基准报告通过全部 9 项 → 合格', () => {
    const result = validator.validate(qualifiedReport());
    expect(result.qualified).toBe(true);
    expect(result.checks).toHaveLength(9);
    expect(result.missingItems).toEqual([]);
    expect(result.violations).toEqual([]);
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  // ───────────── A 必备 6 项:逐项缺失即不合格 ─────────────

  describe('A 必备内容:逐项缺失 → 不合格', () => {
    it('A1 缺少链 → 不合格', () => {
      const r = qualifiedReport();
      r.identity.chain = null;
      const res = validator.validate(r);
      expect(res.qualified).toBe(false);
      expect(res.missingItems).toContain('A1');
    });

    it('A1 缺少名称与地址 → 不合格', () => {
      const r = qualifiedReport();
      r.identity.name = null;
      r.identity.address = null;
      const res = validator.validate(r);
      expect(res.missingItems).toContain('A1');
    });

    it('A2 缺少市值与 FDV → 不合格', () => {
      const r = qualifiedReport();
      r.basics.marketCapUsd = null;
      r.basics.fdvUsd = null;
      delete r.provenance['basics.marketCapUsd'];
      delete r.provenance['basics.fdvUsd'];
      const res = validator.validate(r);
      expect(res.qualified).toBe(false);
      expect(res.missingItems).toContain('A2');
    });

    it('A2 缺少官网链接 → 不合格', () => {
      const r = qualifiedReport();
      r.basics.links.website = null;
      delete r.provenance['basics.links.website'];
      const res = validator.validate(r);
      expect(res.missingItems).toContain('A2');
    });

    it('A3 缺少合约验证状态 → 不合格', () => {
      const r = qualifiedReport();
      r.onchainActivity.contractVerified = null;
      delete r.provenance['onchainActivity.contractVerified'];
      const res = validator.validate(r);
      expect(res.missingItems).toContain('A3');
    });

    it('A3 缺少持币地址数 → 不合格', () => {
      const r = qualifiedReport();
      r.onchainActivity.holderCount = null;
      delete r.provenance['onchainActivity.holderCount'];
      const res = validator.validate(r);
      expect(res.missingItems).toContain('A3');
    });

    it('A4 缺少审计状态 → 不合格', () => {
      const r = qualifiedReport();
      r.riskSignals.auditStatus = null;
      delete r.provenance['riskSignals.auditStatus'];
      const res = validator.validate(r);
      expect(res.missingItems).toContain('A4');
    });

    it('A4 缺少合约权限 → 不合格', () => {
      const r = qualifiedReport();
      r.riskSignals.contractPermissions = null;
      delete r.provenance['riskSignals.contractPermissions'];
      const res = validator.validate(r);
      expect(res.missingItems).toContain('A4');
    });

    it('A5 缺少区块浏览器链接 → 不合格', () => {
      const r = qualifiedReport();
      r.keyLinks.blockExplorer = null;
      const res = validator.validate(r);
      expect(res.missingItems).toContain('A5');
    });

    it('A6 缺少结论摘要 → 不合格', () => {
      const r = qualifiedReport();
      r.conclusion.summary = null;
      const res = validator.validate(r);
      expect(res.missingItems).toContain('A6');
    });

    it('A6 缺少风险评级 → 不合格', () => {
      const r = qualifiedReport();
      r.conclusion.riskRating = null;
      const res = validator.validate(r);
      expect(res.missingItems).toContain('A6');
    });
  });

  // ───────────── B 真实性门槛:违反即不合格 ─────────────

  describe('B 真实性与质量门槛:违反 → 不合格', () => {
    it('B7 关键数据有值但无可核来源(编造)→ 不合格', () => {
      const r = qualifiedReport();
      // holderCount 仍有值,但移除其来源 → 视为编造。
      delete r.provenance['onchainActivity.holderCount'];
      const res = validator.validate(r);
      expect(res.qualified).toBe(false);
      expect(res.violations).toContain('B7');
    });

    it('B7 来源链接为空串(无效来源)→ 不合格', () => {
      const r = qualifiedReport();
      r.provenance['basics.marketCapUsd'] = prov('');
      const res = validator.validate(r);
      expect(res.violations).toContain('B7');
    });

    it('B7 同一字段既有值又被标「未获取」(自相矛盾)→ 不合格', () => {
      const r = qualifiedReport();
      r.notFetched = ['onchainActivity.liquidityUsd'];
      const res = validator.validate(r);
      expect(res.violations).toContain('B7');
    });

    it('B8 缺少采集时间 → 不合格', () => {
      const r = qualifiedReport();
      r.collectedAt = null;
      const res = validator.validate(r);
      expect(res.violations).toContain('B8');
    });

    it('B8 流通量 > 总量(数字矛盾)→ 不合格', () => {
      const r = qualifiedReport();
      r.basics.circulatingSupply = 2_000_000;
      r.basics.totalSupply = 1_000_000;
      const res = validator.validate(r);
      expect(res.qualified).toBe(false);
      expect(res.violations).toContain('B8');
    });

    it('B8 市值 > FDV(数字矛盾)→ 不合格', () => {
      const r = qualifiedReport();
      r.basics.marketCapUsd = 5_000_000;
      r.basics.fdvUsd = 2_000_000;
      const res = validator.validate(r);
      expect(res.violations).toContain('B8');
    });

    it('B8 负数 → 不合格', () => {
      const r = qualifiedReport();
      r.onchainActivity.liquidityUsd = -1;
      const res = validator.validate(r);
      expect(res.violations).toContain('B8');
    });

    it('B8 Top holders 集中度超出 [0,100] → 不合格', () => {
      const r = qualifiedReport();
      r.onchainActivity.topHolderConcentration = 150;
      const res = validator.validate(r);
      expect(res.violations).toContain('B8');
    });

    it('B8 风险信号检出但无具体链上证据 → 不合格', () => {
      const r = qualifiedReport();
      r.riskSignals.honeypotRug = true;
      delete r.provenance['riskSignals.honeypotRug'];
      const res = validator.validate(r);
      expect(res.violations).toContain('B8');
    });

    it('B8 风险信号检出且有链上证据 → 通过', () => {
      const r = qualifiedReport();
      r.riskSignals.honeypotRug = true;
      r.provenance['riskSignals.honeypotRug'] = prov('https://de.fi/scanner/foo');
      // 结论仍需自洽(评级已是 low,但本用例只验证 B8)。
      const res = validator.validate(r);
      const b8 = res.checks.find((c) => c.id === 'B8')!;
      expect(b8.passed).toBe(true);
    });

    it('B9 超出可接受时延 → 不合格', () => {
      const r = qualifiedReport();
      r.latencyMs = MAX_DUE_DILIGENCE_LATENCY_MS + 1;
      const res = validator.validate(r);
      expect(res.qualified).toBe(false);
      expect(res.violations).toContain('B9');
    });

    it('B9 缺少时延度量 → 不合格', () => {
      const r = qualifiedReport();
      r.latencyMs = null;
      const res = validator.validate(r);
      expect(res.violations).toContain('B9');
    });
  });

  // ───────────── 报告自洽边界(等号通过) ─────────────

  describe('报告自洽边界', () => {
    it('流通量 == 总量 → 通过(允许等号)', () => {
      const r = qualifiedReport();
      r.basics.circulatingSupply = 1_000_000;
      r.basics.totalSupply = 1_000_000;
      const res = validator.validate(r);
      expect(res.checks.find((c) => c.id === 'B8')!.passed).toBe(true);
    });

    it('集中度 0 与 100 边界 → 通过', () => {
      for (const c of [0, 100]) {
        const r = qualifiedReport();
        r.onchainActivity.topHolderConcentration = c;
        expect(validator.validate(r).checks.find((x) => x.id === 'B8')!.passed).toBe(true);
      }
    });
  });

  it('多项缺失同时报告(missingItems + violations 聚合)', () => {
    const r = qualifiedReport();
    r.identity.chain = null; // A1
    r.conclusion.summary = null; // A6
    r.collectedAt = null; // B8
    const res = validator.validate(r);
    expect(res.qualified).toBe(false);
    expect(res.missingItems).toEqual(expect.arrayContaining(['A1', 'A6']));
    expect(res.violations).toContain('B8');
  });
});
