import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AirdropAssistService } from './airdrop-assist.service';
import { READ_ONLY_FETCHER, ReadOnlyFetcher } from './data-source-plugin.types';
import { PolicyEvaluatorService } from '../agent/policy-evaluator.service';
import { MonitorService } from './monitor.service';

/**
 * AirdropAssistService 单测 — 空投发现与合法协助领取(crypto-native-agent-ops 任务 22,需求 11)。
 *
 * 覆盖:
 *   1. 资格发现(需求 11.1):只读取数 → 候选 + 窗口提醒;无源/失败/非法钱包 → 显式降级(Property 7/8)。
 *   2. 领取窗口提醒(需求 11.1):复用 MonitorService 创建 airdrop_window 订阅。
 *   3. 协助领取(需求 11.2 / 11.3 / Property 4):产出未签名计划,恒人确认 + autoExecuted=false。
 *   4. 排除 sybil(需求 11.4 / 6.2 / Property 3):多钱包 / sybil 意图 → 红线拒绝,不可绕过。
 *
 * 约定:ReadOnlyFetcher / MonitorService 用 mock;PolicyEvaluatorService 用真实实例的
 * 纯函数 classifyActionRisk(不触库),复用 Task 9 风险分级。
 */
describe('AirdropAssistService — 空投发现与合法协助领取 (需求 11 / Property 3 & 4)', () => {
  let service: AirdropAssistService;

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

  const mockMonitorService = {
    createMonitor: jest.fn(),
  };

  const WALLET = '0x' + '1'.repeat(40);

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AirdropAssistService,
        { provide: READ_ONLY_FETCHER, useValue: mockFetcher },
        { provide: PolicyEvaluatorService, useValue: mockPolicyEvaluator },
        { provide: MonitorService, useValue: mockMonitorService },
      ],
    }).compile();

    service = module.get<AirdropAssistService>(AirdropAssistService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─────────────── 4. 排除 sybil(需求 11.4 / Property 3) ───────────────

  describe('checkSybilGuard — 排除多钱包/sybil(需求 11.4,不可绕过)', () => {
    it('单一真实身份钱包 + 无 sybil 意图 → 通过', () => {
      const res = service.checkSybilGuard({ wallet: WALLET });
      expect(res.ok).toBe(true);
    });

    it('≥2 个不同钱包(批量薅空投)→ 红线拒绝', () => {
      const res = service.checkSybilGuard({
        wallet: WALLET,
        wallets: [WALLET, '0x' + '2'.repeat(40)],
      });
      expect(res.ok).toBe(false);
      expect(res.rule).toBe('abuse:sybil');
    });

    it('同一钱包重复(去重后唯一)→ 不算多钱包,通过', () => {
      const res = service.checkSybilGuard({
        wallet: WALLET,
        wallets: [WALLET, WALLET.toUpperCase()],
      });
      expect(res.ok).toBe(true);
    });

    it('意图含 sybil/女巫薅空投关键词 → 红线拒绝', () => {
      const res = service.checkSybilGuard({
        wallet: WALLET,
        intent: '用多钱包女巫薅这个空投',
      });
      expect(res.ok).toBe(false);
      expect(res.rule).toContain('abuse');
    });
  });

  // ─────────────── 1. 资格发现(需求 11.1 / Property 7/8) ───────────────

  describe('discoverAirdrops — 只读发现 + 窗口提醒 + 显式降级', () => {
    it('成功取数 → 解析候选 + 派生领取窗口提醒', async () => {
      const soon = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const far = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      mockFetcher.fetch.mockResolvedValue({
        success: true,
        data: [
          {
            projectName: 'AlphaDrop',
            tokenSymbol: 'ALPHA',
            eligible: true,
            requirements: ['hold_nft'],
            claimUrl: 'https://alpha.xyz/claim',
            claimWindowEnd: soon,
          },
          { projectName: 'BetaDrop', eligible: false, claimWindowEnd: far },
          { projectName: 'GammaDrop', claimWindowEnd: past },
        ],
      });

      const res = await service.discoverAirdrops({
        userId: 'u1',
        agentId: 'a1',
        wallet: WALLET,
        chain: 'ethereum',
        checkerUrl: 'https://checker.example/eligibility',
      });

      expect(res.fetched).toBe(true);
      expect(res.candidates).toHaveLength(3);
      expect(res.candidates[0].eligibility).toBe('eligible');
      expect(res.candidates[1].eligibility).toBe('not_eligible');
      expect(res.candidates[2].eligibility).toBe('unknown');

      const byName = Object.fromEntries(res.reminders.map((r) => [r.projectName, r]));
      expect(byName['AlphaDrop'].status).toBe('closing_soon');
      expect(byName['BetaDrop'].status).toBe('open');
      expect(byName['GammaDrop'].status).toBe('expired');
    });

    it('无资格来源(checkerUrl 缺省)→ 显式降级,不调用 fetcher,不编造资格', async () => {
      const res = await service.discoverAirdrops({
        userId: 'u1',
        agentId: 'a1',
        wallet: WALLET,
        chain: 'ethereum',
      });
      expect(res.fetched).toBe(false);
      expect(res.candidates).toEqual([]);
      expect(res.note).toBe('NO_ELIGIBILITY_SOURCE');
      expect(mockFetcher.fetch).not.toHaveBeenCalled();
    });

    it('非法钱包地址 → 显式降级,不调用 fetcher', async () => {
      const res = await service.discoverAirdrops({
        userId: 'u1',
        agentId: 'a1',
        wallet: 'not-an-address',
        chain: 'ethereum',
        checkerUrl: 'https://checker.example/eligibility',
      });
      expect(res.fetched).toBe(false);
      expect(res.note).toBe('INVALID_WALLET_ADDRESS');
      expect(mockFetcher.fetch).not.toHaveBeenCalled();
    });

    it('只读取数失败 → fetched=false,不编造候选(Property 7/8)', async () => {
      mockFetcher.fetch.mockResolvedValue({
        success: false,
        failureReason: 'timeout',
        error: 'TIMED_OUT',
      });
      const res = await service.discoverAirdrops({
        userId: 'u1',
        agentId: 'a1',
        wallet: WALLET,
        chain: 'ethereum',
        checkerUrl: 'https://checker.example/eligibility',
      });
      expect(res.fetched).toBe(false);
      expect(res.candidates).toEqual([]);
      expect(res.note).toBe('TIMED_OUT');
    });

    it('多钱包发现请求 → 红线拒绝(需求 11.4)', async () => {
      await expect(
        service.discoverAirdrops({
          userId: 'u1',
          agentId: 'a1',
          wallet: WALLET,
          wallets: [WALLET, '0x' + '2'.repeat(40)],
          chain: 'ethereum',
          checkerUrl: 'https://checker.example/eligibility',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockFetcher.fetch).not.toHaveBeenCalled();
    });
  });

  // ─────────────── 2. 领取窗口提醒(需求 11.1) ───────────────

  describe('scheduleClaimWindowReminder — 复用 MonitorService', () => {
    it('创建 airdrop_window 监控订阅(in_window 算子)', async () => {
      mockMonitorService.createMonitor.mockResolvedValue({ id: 'm1' });
      const end = new Date(Date.now() + 86400000).toISOString();
      const monitor = await service.scheduleClaimWindowReminder('u1', {
        agentId: 'a1',
        wallet: WALLET,
        projectName: 'AlphaDrop',
        claimUrl: 'https://alpha.xyz/claim',
        claimWindowEnd: end,
      });
      expect(monitor).toEqual({ id: 'm1' });
      expect(mockMonitorService.createMonitor).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({
          agentId: 'a1',
          monitorType: 'airdrop_window',
          condition: expect.objectContaining({
            operator: 'in_window',
            projectName: 'AlphaDrop',
            claimWindowEnd: end,
          }),
        }),
      );
    });

    it('多钱包提醒请求 → 红线拒绝,不创建订阅', async () => {
      await expect(
        service.scheduleClaimWindowReminder('u1', {
          agentId: 'a1',
          wallet: WALLET,
          wallets: [WALLET, '0x' + '3'.repeat(40)],
          projectName: 'AlphaDrop',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockMonitorService.createMonitor).not.toHaveBeenCalled();
    });
  });

  // ─────────────── 3. 协助领取(需求 11.2 / 11.3 / Property 4) ───────────────

  describe('assistClaim — 未签名领取计划,恒人确认 (Property 4)', () => {
    it('产出未签名领取计划 + 强制人确认 + 不自动执行(链上合约领取)', () => {
      const plan = service.assistClaim({
        userId: 'u1',
        agentId: 'a1',
        wallet: WALLET,
        projectName: 'AlphaDrop',
        chain: 'ethereum',
        contract: '0x' + 'c'.repeat(40),
        method: 'claim',
        args: { index: 1 },
      });

      expect(plan.wallet).toBe(WALLET);
      expect(plan.claimTransaction.to).toBe('0x' + 'c'.repeat(40));
      expect(plan.claimTransaction.method).toBe('claim');
      // Property 4:领取交易 → high → 人确认,系统不代执行。
      expect(plan.riskTier).toBe('high');
      expect(plan.requiresUserConfirmation).toBe(true);
      expect(plan.autoExecuted).toBe(false);
      expect(plan.decision).toBe('user_confirmation');
      expect(plan.preparationSteps.length).toBeGreaterThan(0);
    });

    it('页面领取(claimUrl)同样恒人确认 + 不自动执行', () => {
      const plan = service.assistClaim({
        userId: 'u1',
        agentId: 'a1',
        wallet: WALLET,
        projectName: 'BetaDrop',
        chain: 'base',
        claimUrl: 'https://beta.xyz/claim',
      });
      expect(plan.claimTransaction.claimUrl).toBe('https://beta.xyz/claim');
      expect(plan.riskTier).toBe('high');
      expect(plan.autoExecuted).toBe(false);
      expect(plan.requiresUserConfirmation).toBe(true);
    });

    it('多钱包领取请求 → 红线拒绝(需求 11.4 / Property 3)', () => {
      expect(() =>
        service.assistClaim({
          userId: 'u1',
          agentId: 'a1',
          wallet: WALLET,
          wallets: [WALLET, '0x' + '4'.repeat(40)],
          projectName: 'AlphaDrop',
          chain: 'ethereum',
        }),
      ).toThrow(ForbiddenException);
    });

    it('sybil 意图领取请求 → 红线拒绝', () => {
      expect(() =>
        service.assistClaim({
          userId: 'u1',
          agentId: 'a1',
          wallet: WALLET,
          projectName: 'AlphaDrop',
          chain: 'ethereum',
          intent: 'sybil farm this airdrop with many wallets',
        }),
      ).toThrow(ForbiddenException);
    });
  });

  // ─────────────── 不代执行资金 — 只读为主(需求 11.3 / Property 4) ───────────────

  describe('不代执行资金 — 只产出计划', () => {
    it('AirdropAssistService 不暴露任何签名/转账/执行方法', () => {
      const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(service));
      const forbidden = proto.filter((m) =>
        /(^|_)(sign|send|execute|transfer|submit|broadcast)/i.test(m),
      );
      expect(forbidden).toEqual([]);
    });
  });
});
