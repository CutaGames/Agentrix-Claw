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

import { AgentHireEscrowService } from '../multi-agent/agent-hire-escrow.service';
import { CommissionService } from '../commission/commission.service';
import { PayeeType } from '../../entities/commission.entity';
import { Payment, PaymentStatus, PaymentMethod } from '../../entities/payment.entity';

/**
 * crypto-native-agent-ops 任务 2.2 — 结算出口自动记账(集成测)。
 *
 * 目标:一笔真实结算流经各出口(relayer / escrow release / commission settled)时,
 * 统一调用 AgentAccountService.recordSpending,使 usedTodayAmount / 交易统计正确增长,
 * 且以结算事件 id 为幂等键保持账实一致(同一事件不重复计数 · Property 1)。
 *
 * 验收映射:需求 7.1(自动记账,不依赖手动端点)/ 7.2(同步累计统计)/
 *           7.4 & Correctness Property 1(账实一致 · 幂等)。
 *
 * 仓库约定:无测试数据库,用内存 agent 状态 + 幂等键集合模拟唯一约束去重,
 * 真实 AgentAccountService 经各结算服务的注入点被调用(验证「挂钩」真实生效)。
 */
describe('Settlement exits auto-call recordSpending (task 2.2)', () => {
  let agentAccount: AgentAccountService;

  let agent: AgentAccount;
  let recordedKeys: Set<string>;

  const AGENT_ID = 'agent-1';

  const makeAgent = (): AgentAccount =>
    ({
      id: AGENT_ID,
      status: AgentAccountStatus.ACTIVE,
      usedTodayAmount: 0,
      usedMonthAmount: 0,
      totalTransactions: 0,
      totalTransactionAmount: 0,
      successfulTransactions: 0,
      failedTransactions: 0,
      spendingLimits: {
        singleTxLimit: 1000,
        dailyLimit: 5000,
        monthlyLimit: 50000,
        currency: 'USDC',
      },
    } as AgentAccount);

  const mockAgentRepo = {
    findOne: jest.fn(async () => agent),
    save: jest.fn(async (a: AgentAccount) => {
      agent = a;
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

  beforeEach(async () => {
    jest.clearAllMocks();
    agent = makeAgent();
    recordedKeys = new Set<string>();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AgentAccountService,
        { provide: getRepositoryToken(AgentAccount), useValue: mockAgentRepo },
        { provide: getRepositoryToken(Account), useValue: {} },
        {
          provide: getRepositoryToken(AgentSpendingRecord),
          useValue: mockSpendingRecordRepo,
        },
        { provide: EasService, useValue: null },
        { provide: MPCWalletService, useValue: null },
        { provide: PayMindRelayerService, useValue: null },
      ],
    }).compile();

    agentAccount = moduleRef.get<AgentAccountService>(AgentAccountService);
  });

  describe('agent_hire_escrow release', () => {
    it('records spending on a real release and accumulates stats (7.1/7.2)', async () => {
      const escrowRow: any = {
        id: 'escrow-1',
        taskId: 'task-1',
        hirerUserId: 'hirer',
        sellerUserId: 'seller',
        agentId: AGENT_ID,
        agreedUsd: 100,
        status: 'reserved',
      };
      const escrowRepo = {
        findOne: jest.fn(async () => escrowRow),
        save: jest.fn(async (e: any) => e),
      };
      const escrow = new AgentHireEscrowService(
        escrowRepo as any,
        {} as any,
        agentAccount,
      );

      await escrow.releaseOnSuccess('task-1', 80);

      expect(agent.usedTodayAmount).toBe(80);
      expect(agent.usedMonthAmount).toBe(80);
      expect(agent.totalTransactions).toBe(1);
      expect(agent.successfulTransactions).toBe(1);
      expect(Number(agent.totalTransactionAmount)).toBe(80);
    });

    it('does not double-count when release accounting runs twice (Property 1)', async () => {
      const escrowRow: any = {
        id: 'escrow-dup',
        agentId: AGENT_ID,
        agreedUsd: 100,
        status: 'reserved',
      };
      const escrowRepo = {
        findOne: jest.fn(async () => escrowRow),
        save: jest.fn(async (e: any) => e),
      };
      const escrow: any = new AgentHireEscrowService(
        escrowRepo as any,
        {} as any,
        agentAccount,
      );

      // 直接驱动记账钩子两次(模拟重试/重复事件),应只记一次。
      await escrow.recordAgentSpending(escrowRow, 80);
      await escrow.recordAgentSpending(escrowRow, 80);

      expect(agent.totalTransactions).toBe(1);
      expect(Number(agent.totalTransactionAmount)).toBe(80);
      expect(agent.usedTodayAmount).toBe(80);
    });

    it('does not record on refund (被拒/未成交不记账)', async () => {
      const escrowRow: any = {
        id: 'escrow-ref',
        agentId: AGENT_ID,
        agreedUsd: 100,
        status: 'reserved',
      };
      const escrowRepo = {
        findOne: jest.fn(async () => escrowRow),
        save: jest.fn(async (e: any) => e),
      };
      const escrow = new AgentHireEscrowService(
        escrowRepo as any,
        {} as any,
        agentAccount,
      );

      await escrow.refundOnFailure('task-x', 'seller failed to deliver');

      expect(agent.totalTransactions).toBe(0);
      expect(agent.usedTodayAmount).toBe(0);
    });
  });

  describe('relayer QuickPay settlement', () => {
    const makeRelayer = () =>
      new PayMindRelayerService(
        { findOne: jest.fn(), save: jest.fn() } as any,
        { get: jest.fn(() => undefined) } as any,
        agentAccount,
      );

    it('records spending for a completed payment tied to an agent', async () => {
      const relayer: any = makeRelayer();
      const payment: Payment = {
        id: 'pay-1',
        amount: 42,
        currency: 'USDC',
        agentId: AGENT_ID,
        status: PaymentStatus.COMPLETED,
        paymentMethod: PaymentMethod.X402,
      } as Payment;

      await relayer.recordAgentSpending(payment);

      expect(agent.totalTransactions).toBe(1);
      expect(agent.successfulTransactions).toBe(1);
      expect(Number(agent.totalTransactionAmount)).toBe(42);
      expect(agent.usedTodayAmount).toBe(42);
    });

    it('skips payments without an agentId or not completed', async () => {
      const relayer: any = makeRelayer();
      await relayer.recordAgentSpending({
        id: 'pay-2',
        amount: 10,
        status: PaymentStatus.COMPLETED,
      } as Payment);
      await relayer.recordAgentSpending({
        id: 'pay-3',
        amount: 10,
        agentId: AGENT_ID,
        status: PaymentStatus.FAILED,
      } as Payment);

      expect(agent.totalTransactions).toBe(0);
    });

    it('is idempotent on the same paymentId (Property 1)', async () => {
      const relayer: any = makeRelayer();
      const payment = {
        id: 'pay-dup',
        amount: 25,
        agentId: AGENT_ID,
        status: PaymentStatus.COMPLETED,
      } as Payment;

      await relayer.recordAgentSpending(payment);
      await relayer.recordAgentSpending(payment);

      expect(agent.totalTransactions).toBe(1);
      expect(Number(agent.totalTransactionAmount)).toBe(25);
    });
  });

  describe('commission split completion', () => {
    const buildCommissionService = (rows: any[]) => {
      const commissionRepo = {
        find: jest.fn(async () => rows),
        update: jest.fn(async () => ({ affected: rows.length })),
      };
      return new CommissionService(
        commissionRepo as any,
        {} as any,
        {} as any,
        {} as any,
        agentAccount,
      );
    };

    it('records spending for AGENT-payee commissions on settle (7.1/7.2)', async () => {
      const svc = buildCommissionService([
        { id: 'com-1', payeeId: AGENT_ID, payeeType: PayeeType.AGENT, amount: 12, status: 'ready' },
        { id: 'com-2', payeeId: AGENT_ID, payeeType: PayeeType.AGENT, amount: 8, status: 'ready' },
      ]);

      await svc.markCommissionsAsSettled(AGENT_ID, PayeeType.AGENT);

      expect(agent.totalTransactions).toBe(2);
      expect(Number(agent.totalTransactionAmount)).toBe(20);
      expect(agent.usedTodayAmount).toBe(20);
    });

    it('does not record for non-AGENT payees', async () => {
      const svc = buildCommissionService([
        { id: 'com-3', payeeId: 'merchant-1', payeeType: PayeeType.MERCHANT, amount: 30, status: 'ready' },
      ]);

      await svc.markCommissionsAsSettled('merchant-1', PayeeType.MERCHANT);

      expect(agent.totalTransactions).toBe(0);
    });

    it('is idempotent across repeated settlement of the same commission id (Property 1)', async () => {
      const rows = [
        { id: 'com-dup', payeeId: AGENT_ID, payeeType: PayeeType.AGENT, amount: 15, status: 'ready' },
      ];
      const svc = buildCommissionService(rows);

      await svc.markCommissionsAsSettled(AGENT_ID, PayeeType.AGENT);
      await svc.markCommissionsAsSettled(AGENT_ID, PayeeType.AGENT);

      expect(agent.totalTransactions).toBe(1);
      expect(Number(agent.totalTransactionAmount)).toBe(15);
    });
  });
});
