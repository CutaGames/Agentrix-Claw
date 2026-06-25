import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { AgentAccountService } from './agent-account.service';
import {
  AgentAccount,
  AgentAccountStatus,
} from '../../entities/agent-account.entity';
import { AgentSpendingRecord } from '../../entities/agent-spending-record.entity';
import { Account } from '../../entities/account.entity';
import { EasService } from '../agent/eas.service';
import { MPCWalletService } from '../mpc-wallet/mpc-wallet.service';
import { PayMindRelayerService } from '../relayer/relayer.service';

/**
 * AgentAccountService.recordSpending 单测(crypto-native-agent-ops 任务 2.1)。
 *
 * 覆盖:
 *  - 需求 7.1/7.2:真实成交记账并同步累计统计(total/successful/failed/totalAmount)。
 *  - 需求 7.4 / Property 1(账实一致):重复 idempotencyKey 只记一次。
 *  - 需求 7.3:被拒动作(status/限额拒绝)不记账 —— 调用方据 checkSpendingLimit 跳过。
 *
 * 仓库测试约定:无测试数据库,用 getRepositoryToken 注入 mock Repository。
 * 事务以 manager.transaction(cb) 直接执行回调模拟(单连接内顺序写)。
 */
describe('AgentAccountService.recordSpending', () => {
  let service: AgentAccountService;

  /** 内存中的 agent 状态,供累计断言。 */
  let agent: AgentAccount;
  /** 已落库的幂等键集合,模拟唯一约束去重。 */
  let recordedKeys: Set<string>;

  const makeAgent = (): AgentAccount =>
    ({
      id: 'agent-1',
      status: AgentAccountStatus.ACTIVE,
      usedTodayAmount: 0,
      usedMonthAmount: 0,
      totalTransactions: 0,
      totalTransactionAmount: 0,
      successfulTransactions: 0,
      failedTransactions: 0,
      spendingLimits: {
        singleTxLimit: 100,
        dailyLimit: 200,
        monthlyLimit: 1000,
        currency: 'USDC',
      },
    } as AgentAccount);

  const mockAgentRepo = {
    findOne: jest.fn(async () => agent),
    save: jest.fn(async (a: AgentAccount) => {
      agent = a;
      return a;
    }),
    // manager exposes transaction + getRepository + insert for recordSpending
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

  const mockAccountRepo = {};

  beforeEach(async () => {
    jest.clearAllMocks();
    agent = makeAgent();
    recordedKeys = new Set<string>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentAccountService,
        { provide: getRepositoryToken(AgentAccount), useValue: mockAgentRepo },
        { provide: getRepositoryToken(Account), useValue: mockAccountRepo },
        {
          provide: getRepositoryToken(AgentSpendingRecord),
          useValue: mockSpendingRecordRepo,
        },
        { provide: EasService, useValue: null },
        { provide: MPCWalletService, useValue: null },
        { provide: PayMindRelayerService, useValue: null },
      ],
    }).compile();

    service = module.get<AgentAccountService>(AgentAccountService);
  });

  it('records a real successful settlement and accumulates stats (7.1/7.2)', async () => {
    await service.recordSpending('agent-1', 50, true, 'evt-1');

    expect(agent.usedTodayAmount).toBe(50);
    expect(agent.usedMonthAmount).toBe(50);
    expect(agent.totalTransactions).toBe(1);
    expect(Number(agent.totalTransactionAmount)).toBe(50);
    expect(agent.successfulTransactions).toBe(1);
    expect(agent.failedTransactions).toBe(0);
  });

  it('accumulates a failed settlement into failedTransactions (7.2)', async () => {
    await service.recordSpending('agent-1', 30, false, 'evt-2');

    expect(agent.totalTransactions).toBe(1);
    expect(agent.successfulTransactions).toBe(0);
    expect(agent.failedTransactions).toBe(1);
    expect(Number(agent.totalTransactionAmount)).toBe(30);
  });

  it('counts a duplicate idempotencyKey only once (7.4 / Property 1)', async () => {
    await service.recordSpending('agent-1', 50, true, 'evt-dup');
    await service.recordSpending('agent-1', 50, true, 'evt-dup');
    await service.recordSpending('agent-1', 50, true, 'evt-dup');

    expect(agent.totalTransactions).toBe(1);
    expect(Number(agent.totalTransactionAmount)).toBe(50);
    expect(agent.usedTodayAmount).toBe(50);
    expect(agent.successfulTransactions).toBe(1);
    // 第二、三次命中幂等短路,不再进入事务保存
    expect(mockAgentRepo.save).toHaveBeenCalledTimes(1);
  });

  it('counts distinct idempotencyKeys independently', async () => {
    await service.recordSpending('agent-1', 20, true, 'evt-a');
    await service.recordSpending('agent-1', 25, true, 'evt-b');

    expect(agent.totalTransactions).toBe(2);
    expect(Number(agent.totalTransactionAmount)).toBe(45);
    expect(agent.usedTodayAmount).toBe(45);
  });

  it('treats a concurrent-race duplicate (unique violation) as idempotent skip', async () => {
    // 模拟竞态:findOne 未命中(未落库),但 insert 命中唯一约束 23505
    recordedKeys.add('evt-race'); // 预置:insert 将抛 23505
    mockSpendingRecordRepo.findOne.mockResolvedValueOnce(null);

    await service.recordSpending('agent-1', 99, true, 'evt-race');

    // 23505 被吞为幂等跳过,统计不变
    expect(agent.totalTransactions).toBe(0);
    expect(Number(agent.totalTransactionAmount)).toBe(0);
    expect(mockAgentRepo.save).not.toHaveBeenCalled();
  });

  it('still records when no idempotencyKey is provided (backward compatible)', async () => {
    await service.recordSpending('agent-1', 10, true);
    await service.recordSpending('agent-1', 10, true);

    // 无幂等键 → 不去重,两次都记
    expect(agent.totalTransactions).toBe(2);
    expect(Number(agent.totalTransactionAmount)).toBe(20);
  });

  describe('rejected actions are not recorded (7.3)', () => {
    it('checkSpendingLimit rejects a suspended agent → caller must skip recordSpending', async () => {
      agent.status = AgentAccountStatus.SUSPENDED;

      const result = await service.checkSpendingLimit('agent-1', 10);

      expect(result.allowed).toBe(false);
      // 模拟调用方契约:被拒则不记账
      if (result.allowed) {
        await service.recordSpending('agent-1', 10, true, 'evt-rej-1');
      }
      expect(agent.totalTransactions).toBe(0);
      expect(mockAgentRepo.save).not.toHaveBeenCalled();
    });

    it('checkSpendingLimit rejects over daily limit → caller must skip recordSpending', async () => {
      agent.usedTodayAmount = 190; // dailyLimit=200

      const result = await service.checkSpendingLimit('agent-1', 50);

      expect(result.allowed).toBe(false);
      if (result.allowed) {
        await service.recordSpending('agent-1', 50, true, 'evt-rej-2');
      }
      expect(agent.totalTransactions).toBe(0);
      expect(Number(agent.totalTransactionAmount)).toBe(0);
    });

    it('checkSpendingLimit rejects over single-tx limit → caller must skip recordSpending', async () => {
      const result = await service.checkSpendingLimit('agent-1', 150); // singleTxLimit=100

      expect(result.allowed).toBe(false);
      if (result.allowed) {
        await service.recordSpending('agent-1', 150, true, 'evt-rej-3');
      }
      expect(agent.totalTransactions).toBe(0);
    });
  });
});

/**
 * AgentAccountService.updateCreditScore 单测(crypto-native-agent-ops 任务 4)。
 *
 * 覆盖:
 *  - 需求 7.8/7.9:加分 / 减分。
 *  - 需求 7.10:creditScore 钳制在 0–1000;creditScoreUpdatedAt 同步更新。
 *  - 需求 7.11:creditScore → riskLevel 映射(design §C1 C 组阈值
 *    low ≥700 / medium 500–699 / high 300–499 / critical <300)。
 */
describe('AgentAccountService.updateCreditScore', () => {
  let service: AgentAccountService;
  let agent: AgentAccount;

  const makeAgent = (creditScore: number): AgentAccount =>
    ({
      id: 'agent-credit',
      status: AgentAccountStatus.ACTIVE,
      creditScore,
      riskLevel: undefined as any,
      creditScoreUpdatedAt: undefined,
      metadata: undefined,
    } as AgentAccount);

  const mockAgentRepo = {
    findOne: jest.fn(async () => agent),
    save: jest.fn(async (a: AgentAccount) => {
      agent = a;
      return a;
    }),
  };

  const build = async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentAccountService,
        { provide: getRepositoryToken(AgentAccount), useValue: mockAgentRepo },
        { provide: getRepositoryToken(Account), useValue: {} },
        { provide: getRepositoryToken(AgentSpendingRecord), useValue: {} },
        { provide: EasService, useValue: null },
        { provide: MPCWalletService, useValue: null },
        { provide: PayMindRelayerService, useValue: null },
      ],
    }).compile();
    return module.get<AgentAccountService>(AgentAccountService);
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    service = await build();
  });

  it('adds a positive delta and stamps creditScoreUpdatedAt (7.8/7.10)', async () => {
    agent = makeAgent(500);
    const before = Date.now();
    const updated = await service.updateCreditScore('agent-credit', 50, 'release-success');

    expect(Number(updated.creditScore)).toBe(550);
    expect(updated.creditScoreUpdatedAt).toBeInstanceOf(Date);
    expect(updated.creditScoreUpdatedAt!.getTime()).toBeGreaterThanOrEqual(before);
    expect(updated.metadata?.creditHistory?.[0]).toMatchObject({
      delta: 50,
      newScore: 550,
      reason: 'release-success',
    });
  });

  it('subtracts a negative delta (7.9)', async () => {
    agent = makeAgent(500);
    const updated = await service.updateCreditScore('agent-credit', -120, 'task-failed');
    expect(Number(updated.creditScore)).toBe(380);
  });

  it('clamps at upper bound 1000 (7.10)', async () => {
    agent = makeAgent(990);
    const updated = await service.updateCreditScore('agent-credit', 50);
    expect(Number(updated.creditScore)).toBe(1000);
  });

  it('clamps at lower bound 0 (7.10)', async () => {
    agent = makeAgent(20);
    const updated = await service.updateCreditScore('agent-credit', -100);
    expect(Number(updated.creditScore)).toBe(0);
  });

  it('maps creditScore → riskLevel per C组 thresholds (7.11)', () => {
    // 边界值逐档验证:low ≥700 / medium 500–699 / high 300–499 / critical <300
    expect(AgentAccountService.mapCreditScoreToRiskLevel(1000)).toBe('low');
    expect(AgentAccountService.mapCreditScoreToRiskLevel(700)).toBe('low');
    expect(AgentAccountService.mapCreditScoreToRiskLevel(699)).toBe('medium');
    expect(AgentAccountService.mapCreditScoreToRiskLevel(500)).toBe('medium');
    expect(AgentAccountService.mapCreditScoreToRiskLevel(499)).toBe('high');
    expect(AgentAccountService.mapCreditScoreToRiskLevel(300)).toBe('high');
    expect(AgentAccountService.mapCreditScoreToRiskLevel(299)).toBe('critical');
    expect(AgentAccountService.mapCreditScoreToRiskLevel(0)).toBe('critical');
  });

  it('updateCreditScore writes the mapped riskLevel onto the agent (7.11)', async () => {
    agent = makeAgent(680);
    // 680 + 30 = 710 → low
    let updated = await service.updateCreditScore('agent-credit', 30);
    expect(updated.riskLevel).toBe('low');

    agent = makeAgent(680);
    // 680 - 200 = 480 → high
    updated = await service.updateCreditScore('agent-credit', -200);
    expect(updated.riskLevel).toBe('high');

    agent = makeAgent(310);
    // 310 - 50 = 260 → critical
    updated = await service.updateCreditScore('agent-credit', -50);
    expect(updated.riskLevel).toBe('critical');
  });
});
