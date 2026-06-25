import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { AgentHireEscrowService } from './agent-hire-escrow.service';
import { AgentHireEscrow } from '../../entities/agent-hire-escrow.entity';
import { AgentTaskEntity } from '../../entities/agent-task.entity';
import { AgentAccountService } from '../agent-account/agent-account.service';

/**
 * AgentHireEscrowService 信用评分自动更新单测(crypto-native-agent-ops 任务 4)。
 *
 * 覆盖:
 *  - 需求 7.8:escrow release 成功 → 自动加分(+score)。
 *  - 需求 7.9:refundOnFailure(任务失败)/ dispute 退款 → 自动减分(-score)。
 *  - 钩子失败不中断结算/退款主流程(吞错告警)。
 *  - 状态机幂等:非 reserved/disputed 状态不触发评分变更。
 */
describe('AgentHireEscrowService — credit score auto-update (task 4)', () => {
  let service: AgentHireEscrowService;
  let escrow: AgentHireEscrow;

  const updateCreditScore = jest.fn(async () => undefined);
  const recordSpending = jest.fn(async () => undefined);

  const mockEscrowRepo = {
    findOne: jest.fn(async () => escrow),
    save: jest.fn(async (e: AgentHireEscrow) => {
      escrow = e;
      return e;
    }),
    create: jest.fn((row: Partial<AgentHireEscrow>) => row as AgentHireEscrow),
    find: jest.fn(async () => []),
  };

  const mockTaskRepo = { find: jest.fn(async () => []) };

  const mockAgentAccount = {
    updateCreditScore,
    recordSpending,
  } as unknown as AgentAccountService;

  const makeEscrow = (overrides: Partial<AgentHireEscrow> = {}): AgentHireEscrow =>
    ({
      id: 'esc-1',
      taskId: 'task-1',
      hirerUserId: 'hirer-1',
      sellerUserId: 'seller-1',
      agentId: 'agent-1',
      agreedUsd: 100,
      status: 'reserved',
      ...overrides,
    } as AgentHireEscrow);

  beforeEach(async () => {
    jest.clearAllMocks();
    escrow = makeEscrow();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentHireEscrowService,
        { provide: getRepositoryToken(AgentHireEscrow), useValue: mockEscrowRepo },
        { provide: getRepositoryToken(AgentTaskEntity), useValue: mockTaskRepo },
        { provide: AgentAccountService, useValue: mockAgentAccount },
      ],
    }).compile();

    service = module.get<AgentHireEscrowService>(AgentHireEscrowService);
  });

  it('adds credit on releaseOnSuccess (7.8)', async () => {
    await service.releaseOnSuccess('task-1', 80);

    expect(updateCreditScore).toHaveBeenCalledTimes(1);
    const [agentId, delta, reason] = updateCreditScore.mock.calls[0];
    expect(agentId).toBe('agent-1');
    expect(delta).toBeGreaterThan(0);
    expect(reason).toContain('escrow-release-success');
  });

  it('subtracts credit on refundOnFailure / task failure (7.9)', async () => {
    await service.refundOnFailure('task-1', 'task failed with error xyz');

    expect(updateCreditScore).toHaveBeenCalledTimes(1);
    const [agentId, delta, reason] = updateCreditScore.mock.calls[0];
    expect(agentId).toBe('agent-1');
    expect(delta).toBeLessThan(0);
    expect(reason).toContain('escrow-task-failure');
  });

  it('subtracts credit on dispute refund (adminUpholdDispute) (7.9)', async () => {
    escrow = makeEscrow({ status: 'disputed' });
    await service.adminUpholdDispute('esc-1');

    expect(updateCreditScore).toHaveBeenCalledTimes(1);
    const [agentId, delta, reason] = updateCreditScore.mock.calls[0];
    expect(agentId).toBe('agent-1');
    expect(delta).toBeLessThan(0);
    expect(reason).toContain('escrow-dispute-refund');
  });

  it('does not adjust credit when release is a no-op (already released)', async () => {
    escrow = makeEscrow({ status: 'released' });
    await service.releaseOnSuccess('task-1', 80);
    expect(updateCreditScore).not.toHaveBeenCalled();
  });

  it('does not adjust credit when there is no agentId', async () => {
    escrow = makeEscrow({ agentId: null });
    await service.releaseOnSuccess('task-1', 80);
    expect(updateCreditScore).not.toHaveBeenCalled();
  });

  it('does not break the release flow if credit update throws', async () => {
    updateCreditScore.mockRejectedValueOnce(new Error('boom'));
    const result = await service.releaseOnSuccess('task-1', 80);
    expect(result?.status).toBe('released');
  });
});
