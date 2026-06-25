import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';

import { HireSettlementOrchestrator } from './hire-settlement-orchestrator.service';
import { SplitTreeGeneratorService } from '../commission/split-tree-generator.service';
import { AgentAccountService } from '../agent-account/agent-account.service';
import { AgentHireEscrowService } from '../multi-agent/agent-hire-escrow.service';
import {
  AgentAccount,
  AgentAccountStatus,
} from '../../entities/agent-account.entity';
import { AgentSpendingRecord } from '../../entities/agent-spending-record.entity';
import { Account } from '../../entities/account.entity';
import { EasService } from '../agent/eas.service';
import { MPCWalletService } from '../mpc-wallet/mpc-wallet.service';
import { PayMindRelayerService } from '../relayer/relayer.service';
import { AgentHireEscrow } from '../../entities/agent-hire-escrow.entity';
import { AgentTaskEntity } from '../../entities/agent-task.entity';
import { ConfigService } from '@nestjs/config';
import type { AgentServiceListing, HireRequest } from './hire-settlement.types';

/**
 * crypto-native-agent-ops 任务 14 — 被雇佣结算 + 多跳分佣闭环(集成测)。
 *
 * 全链路:x402 挂牌 → 服务端权威定价 → escrow/relayer USDC → split-tree-generator 多跳分佣
 * → Commission 合约一次提交 → recordSpending 入账。
 *
 * 验收映射:
 *   - 需求 5.1(服务端权威定价 + USDC 结算)/ 5.2(多跳分佣链上一次提交)/
 *     5.3(AXP/USDC 边界)/ 5.4(可审计)/ 12.1(被雇佣赚钱)/ 12.4(可审计)。
 *   - Correctness Property 6(分佣守恒):商户净额 + 各方分佣 + 平台/渠道费 = 成交总额。
 *
 * 仓库约定:无测试数据库,用多 agent 内存状态 + 幂等键集合模拟唯一约束去重;
 * 真实 SplitTreeGeneratorService / AgentAccountService / AgentHireEscrowService 经编排器联动。
 */
describe('HireSettlementOrchestrator — 被雇佣结算 + 多跳分佣闭环 (task 14)', () => {
  let orchestrator: HireSettlementOrchestrator;
  let agentAccount: AgentAccountService;

  // 多 agent 内存状态(executing / referrer / author)。
  let agents: Record<string, AgentAccount>;
  let recordedKeys: Set<string>;

  const EXEC_AGENT = 'agent-exec';
  const REFERRER_AGENT = 'agent-ref';
  const AUTHOR_AGENT = 'agent-author';

  const MERCHANT_WALLET = '0x1111111111111111111111111111111111111111';
  const REFERRER_WALLET = '0x2222222222222222222222222222222222222222';
  const AUTHOR_WALLET = '0x3333333333333333333333333333333333333333';

  const makeAgent = (id: string): AgentAccount =>
    ({
      id,
      status: AgentAccountStatus.ACTIVE,
      usedTodayAmount: 0,
      usedMonthAmount: 0,
      totalTransactions: 0,
      totalTransactionAmount: 0,
      successfulTransactions: 0,
      failedTransactions: 0,
      spendingLimits: {
        singleTxLimit: 100000,
        dailyLimit: 1000000,
        monthlyLimit: 10000000,
        currency: 'USDC',
      },
    } as AgentAccount);

  const mockAgentRepo = {
    findOne: jest.fn(async ({ where }: any) => agents[where.id] ?? null),
    save: jest.fn(async (a: AgentAccount) => {
      agents[a.id] = a;
      return a;
    }),
    manager: {
      transaction: jest.fn(async (cb: (m: any) => Promise<void>) => {
        const manager = {
          getRepository: () => mockAgentRepo,
          insert: async (_entity: any, row: any) => {
            if (row.idempotencyKey && recordedKeys.has(row.idempotencyKey)) {
              const err: any = new Error('duplicate key');
              err.code = '23505';
              throw err;
            }
            if (row.idempotencyKey) recordedKeys.add(row.idempotencyKey);
            return { identifiers: [{ id: 'rec' }] };
          },
        };
        return cb(manager);
      }),
    },
  };

  const mockSpendingRecordRepo = {
    findOne: jest.fn(async ({ where }: any) =>
      where?.idempotencyKey && recordedKeys.has(where.idempotencyKey)
        ? { id: 'rec', idempotencyKey: where.idempotencyKey }
        : null,
    ),
  };

  // escrow 内存状态(一行 / taskId)。
  let escrowRows: Record<string, any>;
  const mockEscrowRepo = {
    findOne: jest.fn(async ({ where }: any) => {
      if (where.taskId) return escrowRows[where.taskId] ?? null;
      if (where.id) {
        return Object.values(escrowRows).find((e: any) => e.id === where.id) ?? null;
      }
      return null;
    }),
    create: jest.fn((row: any) => ({ id: `escrow-${row.taskId}`, ...row })),
    save: jest.fn(async (e: any) => {
      escrowRows[e.taskId] = e;
      return e;
    }),
  };

  // ConfigService:返回 undefined → split-tree-generator 用内置默认平台/渠道地址。
  const mockConfig = { get: jest.fn(() => undefined) } as unknown as ConfigService;

  beforeEach(async () => {
    jest.clearAllMocks();
    agents = {
      [EXEC_AGENT]: makeAgent(EXEC_AGENT),
      [REFERRER_AGENT]: makeAgent(REFERRER_AGENT),
      [AUTHOR_AGENT]: makeAgent(AUTHOR_AGENT),
    };
    recordedKeys = new Set<string>();
    escrowRows = {};

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AgentAccountService,
        { provide: getRepositoryToken(AgentAccount), useValue: mockAgentRepo },
        { provide: getRepositoryToken(Account), useValue: {} },
        { provide: getRepositoryToken(AgentSpendingRecord), useValue: mockSpendingRecordRepo },
        { provide: EasService, useValue: null },
        { provide: MPCWalletService, useValue: null },
        { provide: PayMindRelayerService, useValue: null },
      ],
    }).compile();

    agentAccount = moduleRef.get<AgentAccountService>(AgentAccountService);

    const splitTree = new SplitTreeGeneratorService(mockConfig);
    const escrow = new AgentHireEscrowService(
      mockEscrowRepo as any,
      {} as any, // taskRepo unused on the release path
      agentAccount,
    );
    orchestrator = new HireSettlementOrchestrator(splitTree, agentAccount, escrow);
  });

  const baseListing = (overrides: Partial<AgentServiceListing> = {}): AgentServiceListing => ({
    listingId: 'listing-1',
    executingAgentId: EXEC_AGENT,
    sellerUserId: 'seller-user',
    merchantWallet: MERCHANT_WALLET,
    unitPriceUsd: 100,
    productType: 'service',
    x402Enabled: true,
    parties: [
      { role: 'referrer', agentId: REFERRER_AGENT, wallet: REFERRER_WALLET, poolShare: 0.5 },
      { role: 'author', agentId: AUTHOR_AGENT, wallet: AUTHOR_WALLET, poolShare: 0.3 },
    ],
    ...overrides,
  });

  const baseReq = (overrides: Partial<HireRequest> = {}): HireRequest => ({
    listing: baseListing(),
    hirerUserId: 'hirer-user',
    quantity: 1,
    currency: 'USDC',
    rail: 'escrow',
    taskId: 'task-1',
    ...overrides,
  });

  // ───────────────────────── 全链路 ─────────────────────────

  it('escrow 轨道全链路:挂牌→权威定价→escrow→split-tree→commission→recordSpending', async () => {
    const result = await orchestrator.settleHire(baseReq());

    // 权威定价:total = 100 × 1。
    expect(result.breakdown.totalUsd).toBe(100);
    // Commission 合约一次提交凭据存在。
    expect(result.commission.splitHash).toMatch(/^split_/);
    expect(result.commission.submissionRef).toContain('commission-submit:listing-1');
    // 结算引用为 escrow。
    expect(result.settlementRef).toContain('escrow:');

    // 执行 agent 经 escrow release 入账(merchant 净额)。
    expect(agents[EXEC_AGENT].totalTransactions).toBe(1);
    expect(agents[EXEC_AGENT].successfulTransactions).toBe(1);
    expect(Number(agents[EXEC_AGENT].totalTransactionAmount)).toBeCloseTo(
      result.breakdown.merchantNetUsd,
      6,
    );

    // 各分佣方 agent 经 commission 幂等键入账。
    expect(agents[REFERRER_AGENT].totalTransactions).toBe(1);
    expect(agents[AUTHOR_AGENT].totalTransactions).toBe(1);

    // 审计:入账事件齐全(executing + 2 parties)。
    expect(result.spendingEvents).toHaveLength(3);
  });

  it('relayer 轨道:直接 USDC 结算并对执行 agent 记账', async () => {
    const result = await orchestrator.settleHire(baseReq({ rail: 'relayer', taskId: 'task-relayer' }));

    expect(result.settlementRef).toBe('relayer:task-relayer');
    expect(agents[EXEC_AGENT].totalTransactions).toBe(1);
    expect(Number(agents[EXEC_AGENT].totalTransactionAmount)).toBeCloseTo(
      result.breakdown.merchantNetUsd,
      6,
    );
  });

  // ───────────────────────── Property 6:分佣守恒 ─────────────────────────

  describe('Property 6 — 分佣守恒(商户净额 + 各方分佣 + 平台/渠道费 = 成交总额)', () => {
    const cases: Array<{ name: string; listing: Partial<AgentServiceListing> }> = [
      { name: 'service + x402 + 2 parties', listing: {} },
      { name: 'service 无 x402(无渠道费)', listing: { x402Enabled: false } },
      { name: '无分佣方(净额全归执行 agent)', listing: { parties: [] } },
      {
        name: '单一推荐方',
        listing: {
          parties: [{ role: 'referrer', agentId: REFERRER_AGENT, wallet: REFERRER_WALLET, poolShare: 1.0 }],
        },
      },
      { name: 'physical 产品档', listing: { productType: 'physical' } },
      { name: 'nft 产品档', listing: { productType: 'nft' } },
      { name: '非整额定价 $33.33', listing: { unitPriceUsd: 33.33 } },
    ];

    it.each(cases)('守恒成立:$name', async ({ listing }) => {
      const result = await orchestrator.settleHire(
        baseReq({ listing: baseListing(listing), taskId: `task-${Math.random()}` }),
      );

      const b = result.breakdown;
      const sum =
        b.merchantNetUsd +
        b.platformFeeUsd +
        b.channelFeeUsd +
        b.partyShares.reduce((s, p) => s + p.amountUsd, 0);

      // 守恒:浮点出口以 cent 容差断言。
      expect(Math.abs(sum - b.totalUsd)).toBeLessThanOrEqual(0.01);
      // 各分项非负。
      expect(b.merchantNetUsd).toBeGreaterThanOrEqual(0);
      expect(b.platformFeeUsd).toBeGreaterThanOrEqual(0);
      expect(b.channelFeeUsd).toBeGreaterThanOrEqual(0);
    });

    it('无 x402 时不计渠道费', async () => {
      const result = await orchestrator.settleHire(
        baseReq({ listing: baseListing({ x402Enabled: false }), taskId: 'task-noch' }),
      );
      expect(result.breakdown.channelFeeUsd).toBe(0);
    });

    it('分佣方 poolShare 之和 > 1 被拒', async () => {
      await expect(
        orchestrator.settleHire(
          baseReq({
            listing: baseListing({
              parties: [
                { role: 'referrer', wallet: REFERRER_WALLET, poolShare: 0.7 },
                { role: 'author', wallet: AUTHOR_WALLET, poolShare: 0.5 },
              ],
            }),
            taskId: 'task-overshare',
          }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ───────────────────────── 服务端权威定价(需求 5.1)─────────────────────────

  it('总额由服务端权威重算,忽略客户端建议金额', async () => {
    const result = await orchestrator.settleHire(
      baseReq({ quantity: 3, clientSuggestedUsd: 1, taskId: 'task-auth' }),
    );
    // 权威 = unitPrice(100) × quantity(3) = 300,不受 clientSuggestedUsd=1 影响。
    expect(result.breakdown.totalUsd).toBe(300);
  });

  it('非法定价(unitPriceUsd<=0)被拒', async () => {
    await expect(
      orchestrator.settleHire(baseReq({ listing: baseListing({ unitPriceUsd: 0 }) })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // ───────────────────────── AXP / USDC 边界(需求 5.3)─────────────────────────

  describe('AXP/USDC 边界 — 仅 USDC 进入结算,AXP 不混用', () => {
    it('currency=AXP 被拒(不进入结算/记账)', async () => {
      await expect(
        orchestrator.settleHire(baseReq({ currency: 'AXP' as any, taskId: 'task-axp' })),
      ).rejects.toBeInstanceOf(BadRequestException);
      // 任何 agent 都不应被记账。
      expect(agents[EXEC_AGENT].totalTransactions).toBe(0);
      expect(agents[REFERRER_AGENT].totalTransactions).toBe(0);
    });

    it('currency=CNY 等非 USDC 被拒', async () => {
      await expect(
        orchestrator.settleHire(baseReq({ currency: 'CNY' as any, taskId: 'task-cny' })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ───────────────────────── 幂等 / 账实一致(Property 1 复用)─────────────────────────

  it('重复结算同一 taskId 不重复记账(幂等)', async () => {
    await orchestrator.settleHire(baseReq({ rail: 'relayer', taskId: 'task-dup' }));
    await orchestrator.settleHire(baseReq({ rail: 'relayer', taskId: 'task-dup' }));

    // 执行 agent 仅记一次。
    expect(agents[EXEC_AGENT].totalTransactions).toBe(1);
    expect(agents[REFERRER_AGENT].totalTransactions).toBe(1);
    expect(agents[AUTHOR_AGENT].totalTransactions).toBe(1);
  });
});
