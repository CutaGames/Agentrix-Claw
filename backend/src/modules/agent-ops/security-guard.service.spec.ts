import { Test, TestingModule } from '@nestjs/testing';

import { SecurityGuard } from './security-guard.service';
import { READ_ONLY_FETCHER, ReadOnlyFetcher } from './data-source-plugin.types';
import {
  SCAM_INTEL_PROVIDER,
  TRANSACTION_SIMULATOR,
  TokenApproval,
  TransactionSimulator,
  ScamIntelProvider,
} from './security-guard.types';
import { PlaceholderTransactionSimulator } from './placeholder-transaction-simulator';
import { PlaceholderScamIntelProvider } from './placeholder-scam-intel-provider';
import { PolicyEvaluatorService } from '../agent/policy-evaluator.service';

/**
 * SecurityGuard 单测 — 散户安全防护(crypto-native-agent-ops 任务 17,需求 10)。
 *
 * 覆盖任务要求的三条单测:
 *   1. 高风险授权标注(需求 10.1):无限授权 / spender 被标记 → riskTier='high'。
 *   2. 撤销走人确认(需求 10.1 / Property 4):buildRevokeGuidance 恒 user_confirmation + autoExecuted=false。
 *   3. 不代执行资金(需求 10.4 / Property 4):服务无任何签名/转账能力;只读模拟/检查不上链。
 * 另覆盖:交易模拟占位 explicit degraded(Property 8)、骗局检查明确提示(需求 10.3 / Property 8)。
 *
 * 约定:ReadOnlyFetcher / 模拟器 / 情报源用 mock;PolicyEvaluatorService 用真实实例的
 * 纯函数 classifyActionRisk(不触库),复用 Task 9 的风险分级。
 */
describe('SecurityGuard — 安全防护 (需求 10 / Property 4 & 8)', () => {
  let guard: SecurityGuard;

  const mockFetcher: jest.Mocked<ReadOnlyFetcher> = {
    fetch: jest.fn(),
  };

  // classifyActionRisk 是纯函数(只调 checkRedline,不访问仓库),用真实实例即可。
  const realEvaluator = new PolicyEvaluatorService(
    undefined as any,
    undefined as any,
    undefined as any,
    undefined as any,
  );
  const mockPolicyEvaluator = {
    classifyActionRisk: (action: any) => realEvaluator.classifyActionRisk(action),
  };

  let simulator: TransactionSimulator;
  let scamIntel: ScamIntelProvider;

  beforeEach(async () => {
    jest.clearAllMocks();
    simulator = new PlaceholderTransactionSimulator();
    scamIntel = new PlaceholderScamIntelProvider();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SecurityGuard,
        { provide: READ_ONLY_FETCHER, useValue: mockFetcher },
        { provide: PolicyEvaluatorService, useValue: mockPolicyEvaluator },
        { provide: TRANSACTION_SIMULATOR, useValue: simulator },
        { provide: SCAM_INTEL_PROVIDER, useValue: scamIntel },
      ],
    }).compile();

    guard = module.get<SecurityGuard>(SecurityGuard);
  });

  const baseApproval = (over: Partial<TokenApproval> = {}): TokenApproval => ({
    chain: 'ethereum',
    token: '0x' + 'a'.repeat(40),
    tokenSymbol: 'USDC',
    spender: '0x' + 'b'.repeat(40),
    spenderLabel: 'SomeDApp',
    allowance: '1000000',
    spenderVerified: true,
    ...over,
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  // ─────────────── 1. 高风险授权标注(需求 10.1) ───────────────

  describe('annotateApproval — 高风险标注', () => {
    it('无限授权(isUnlimited)→ riskTier=high + 信号', () => {
      const out = guard.annotateApproval(baseApproval({ isUnlimited: true }));
      expect(out.riskTier).toBe('high');
      expect(out.riskSignals.join(' ')).toContain('无限授权');
      expect(out.recommendation).toContain('建议立即撤销');
    });

    it("额度逼近 uint256 上限(allowance=max)→ 视为无限 → high", () => {
      const maxUint = (2n ** 256n - 1n).toString();
      const out = guard.annotateApproval(baseApproval({ allowance: maxUint }));
      expect(out.riskTier).toBe('high');
    });

    it("allowance='unlimited' 文本 → high", () => {
      const out = guard.annotateApproval(baseApproval({ allowance: 'unlimited' }));
      expect(out.riskTier).toBe('high');
    });

    it('spender 被骗局名单标记 → high', () => {
      const out = guard.annotateApproval(
        baseApproval({ spenderFlagged: true, allowance: '100' }),
      );
      expect(out.riskTier).toBe('high');
      expect(out.riskSignals.join(' ')).toContain('标记为高危');
    });

    it('spender 合约未验证 + 有限额度 → medium', () => {
      const out = guard.annotateApproval(
        baseApproval({ spenderVerified: false, allowance: '100' }),
      );
      expect(out.riskTier).toBe('medium');
    });

    it('有限额度 + 已验证 + 未标记 → low', () => {
      const out = guard.annotateApproval(baseApproval({ allowance: '100' }));
      expect(out.riskTier).toBe('low');
    });
  });

  describe('scanApprovals — 只读扫描 + 排序 + 显式降级', () => {
    it('成功取数 → 标注并按高风险在前排序,highRiskCount 正确', async () => {
      mockFetcher.fetch.mockResolvedValue({
        success: true,
        data: [
          // 低风险
          {
            token: '0x' + 'a'.repeat(40),
            spender: '0x' + 'b'.repeat(40),
            allowance: '100',
            spenderVerified: true,
          },
          // 高风险(无限)
          {
            token: '0x' + 'c'.repeat(40),
            spender: '0x' + 'd'.repeat(40),
            isUnlimited: true,
          },
        ],
      });

      const res = await guard.scanApprovals({
        userId: 'u1',
        agentId: 'a1',
        wallet: '0x' + '1'.repeat(40),
        chain: 'ethereum',
      });

      expect(res.fetched).toBe(true);
      expect(res.approvals).toHaveLength(2);
      expect(res.approvals[0].riskTier).toBe('high'); // 高风险排最前
      expect(res.highRiskCount).toBe(1);
      expect(res.sourceUrl).toContain('etherscan.io');
    });

    it('只读取数失败 → fetched=false,不编造授权(Property 7/8)', async () => {
      mockFetcher.fetch.mockResolvedValue({
        success: false,
        failureReason: 'timeout',
        error: 'TIMED_OUT',
      });

      const res = await guard.scanApprovals({
        userId: 'u1',
        agentId: 'a1',
        wallet: '0x' + '1'.repeat(40),
        chain: 'ethereum',
      });

      expect(res.fetched).toBe(false);
      expect(res.approvals).toEqual([]);
      expect(res.note).toBe('TIMED_OUT');
    });

    it('非法钱包地址 → 显式未取数,不调用 fetcher', async () => {
      const res = await guard.scanApprovals({
        userId: 'u1',
        agentId: 'a1',
        wallet: 'not-an-address',
        chain: 'ethereum',
      });
      expect(res.fetched).toBe(false);
      expect(res.note).toBe('INVALID_WALLET_ADDRESS');
      expect(mockFetcher.fetch).not.toHaveBeenCalled();
    });
  });

  // ─────────────── 2. 撤销走人确认(需求 10.1 / Property 4) ───────────────

  describe('buildRevokeGuidance — 撤销走人确认,不代执行 (Property 4)', () => {
    it('产出未签名 approve(spender,0) 计划 + 强制人确认 + 不自动执行', () => {
      const approval = baseApproval({ isUnlimited: true });
      const guidance = guard.buildRevokeGuidance(approval);

      // 计划为撤销(额度置 0),目标为代币合约。
      expect(guidance.plan.method).toBe('approve');
      expect(guidance.plan.args).toEqual({
        spender: approval.spender,
        amount: '0',
      });
      expect(guidance.plan.to).toBe(approval.token);

      // Property 4:交易签名 → high → 人确认,系统不代执行。
      expect(guidance.riskTier).toBe('high');
      expect(guidance.requiresUserConfirmation).toBe(true);
      expect(guidance.autoExecuted).toBe(false);
      expect(guidance.decision).toBe('user_confirmation');
    });

    it('撤销动作恒为 high(transaction_sign)无论授权风险档', () => {
      const lowApproval = baseApproval({ allowance: '1' });
      const guidance = guard.buildRevokeGuidance(lowApproval);
      expect(guidance.riskTier).toBe('high');
      expect(guidance.autoExecuted).toBe(false);
    });
  });

  // ─────────────── 3. 不代执行资金(需求 10.4 / Property 4) ───────────────

  describe('不代执行资金 — 只读为主', () => {
    it('SecurityGuard 不暴露任何签名/转账/执行方法', () => {
      const proto = Object.getOwnPropertyNames(
        Object.getPrototypeOf(guard),
      );
      const forbidden = proto.filter((m) =>
        /(^|_)(sign|send|execute|transfer|submit|broadcast)/i.test(m),
      );
      expect(forbidden).toEqual([]);
    });

    it('撤销引导从不调用浏览器执行器(只产出计划)', () => {
      guard.buildRevokeGuidance(baseApproval({ isUnlimited: true }));
      expect(mockFetcher.fetch).not.toHaveBeenCalled();
    });
  });

  // ─────────────── 交易模拟(需求 10.2 / Property 8) ───────────────

  describe('simulateTransaction — 占位适配器显式降级 (Property 8)', () => {
    it('占位实现 available=false,不伪造资产变动', async () => {
      const res = await guard.simulateTransaction({
        chain: 'ethereum',
        from: '0x' + '1'.repeat(40),
        to: '0x' + '2'.repeat(40),
      });
      expect(res.available).toBe(false);
      expect(res.provider).toBe('placeholder');
      expect(res.assetChanges).toBeUndefined();
      expect(res.note).toContain('SIMULATION_ADAPTER_NOT_CONFIGURED');
    });

    it('模拟器抛错 → 显式降级,不伪造', async () => {
      jest
        .spyOn(simulator, 'simulate')
        .mockRejectedValueOnce(new Error('boom'));
      const res = await guard.simulateTransaction({
        chain: 'ethereum',
        from: '0x' + '1'.repeat(40),
        to: '0x' + '2'.repeat(40),
      });
      expect(res.available).toBe(false);
      expect(res.note).toContain('SIMULATION_ERROR');
    });
  });

  // ─────────────── 骗局检查(需求 10.3 / Property 8) ───────────────

  describe('checkScam — 地址/合约/域名骗局检查,明确提示', () => {
    it('品牌仿冒域名 → danger + 明确提示', async () => {
      const res = await guard.checkScam({
        kind: 'domain',
        value: 'metamask-wallet.com',
      });
      expect(res.risk).toBe('danger');
      expect(res.signals.join(' ')).toContain('仿冒品牌');
      expect(res.advice).toContain('高危');
    });

    it('punycode 域名 → danger', async () => {
      const res = await guard.checkScam({
        kind: 'domain',
        value: 'xn--metamask-abc.com',
      });
      expect(res.risk).toBe('danger');
    });

    it('情报源未知 + 本地无信号 → unknown(不谎报 safe,Property 8)', async () => {
      const res = await guard.checkScam({
        kind: 'address',
        value: '0x' + 'a'.repeat(40),
      });
      expect(res.risk).toBe('unknown');
      expect(res.advice).toContain('未知');
    });

    it('情报源明确标记 → danger', async () => {
      jest.spyOn(scamIntel, 'lookup').mockResolvedValueOnce({
        flagged: true,
        signals: ['Chainabuse 报告:drainer'],
        sources: ['chainabuse'],
      });
      const res = await guard.checkScam({
        kind: 'contract',
        value: '0x' + 'a'.repeat(40),
        chain: 'ethereum',
      });
      expect(res.risk).toBe('danger');
      expect(res.sources).toContain('chainabuse');
    });

    it('零地址 → caution + 提示', async () => {
      const res = await guard.checkScam({
        kind: 'address',
        value: '0x' + '0'.repeat(40),
      });
      expect(res.risk).toBe('caution');
      expect(res.signals.join(' ')).toContain('零地址');
    });
  });
});
