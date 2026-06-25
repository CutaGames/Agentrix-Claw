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
 * AgentAccountService.resetLimitsByResetDate 单测(crypto-native-agent-ops 任务 3)。
 *
 * 覆盖:
 *  - 需求 7.5:按日/按月重置 usedTodayAmount / usedMonthAmount。
 *  - 需求 7.6:依据 limitResetDate + UTC,而非全表无差别即时归零;同日幂等不二次归零。
 *  - 需求 7.7 / Property 2:漏跑补偿(基于 limitResetDate 比较,与 cron 是否准点无关)。
 *  - 时区边界:日/月边界以 UTC 零点为准。
 *
 * 仓库测试约定:无测试数据库,用 getRepositoryToken 注入 mock Repository;
 * find 返回预置候选,save 写回内存,断言每个 agent 的重置决策。
 */
describe('AgentAccountService.resetLimitsByResetDate', () => {
  let service: AgentAccountService;
  let candidates: AgentAccount[];
  let saved: AgentAccount[];

  const makeAgent = (overrides: Partial<AgentAccount>): AgentAccount =>
    ({
      id: 'agent-x',
      status: AgentAccountStatus.ACTIVE,
      usedTodayAmount: 0,
      usedMonthAmount: 0,
      limitResetDate: undefined,
      ...overrides,
    } as AgentAccount);

  const mockAgentRepo = {
    find: jest.fn(async () => candidates),
    save: jest.fn(async (a: AgentAccount) => {
      saved.push(a);
      return a;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    candidates = [];
    saved = [];

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

    service = module.get<AgentAccountService>(AgentAccountService);
  });

  it('cross-day: resets usedTodayAmount only when same month (7.5/7.6)', async () => {
    const agent = makeAgent({
      usedTodayAmount: 50,
      usedMonthAmount: 120,
      limitResetDate: new Date('2026-02-10'),
    });
    candidates = [agent];

    const result = await service.resetLimitsByResetDate(
      new Date('2026-02-11T00:00:30Z'),
    );

    expect(result).toEqual({ dailyReset: 1, monthlyReset: 0 });
    expect(agent.usedTodayAmount).toBe(0);
    expect(agent.usedMonthAmount).toBe(120); // 同月,月额度不动
    expect(
      AgentAccountResetDateString(agent.limitResetDate),
    ).toBe('2026-02-11');
  });

  it('cross-month: resets both daily and monthly on a new month (7.5)', async () => {
    const agent = makeAgent({
      usedTodayAmount: 80,
      usedMonthAmount: 900,
      limitResetDate: new Date('2026-02-28'),
    });
    candidates = [agent];

    const result = await service.resetLimitsByResetDate(
      new Date('2026-03-01T00:01:00Z'),
    );

    expect(result).toEqual({ dailyReset: 1, monthlyReset: 1 });
    expect(agent.usedTodayAmount).toBe(0);
    expect(agent.usedMonthAmount).toBe(0);
    expect(
      AgentAccountResetDateString(agent.limitResetDate),
    ).toBe('2026-03-01');
  });

  it('missed-run compensation: resets after multiple skipped days (7.7)', async () => {
    // limitResetDate 停留在 5 天前(cron 漏跑),下次运行应一次性补偿。
    const agent = makeAgent({
      usedTodayAmount: 33,
      usedMonthAmount: 200,
      limitResetDate: new Date('2026-02-10'),
    });
    candidates = [agent];

    const result = await service.resetLimitsByResetDate(
      new Date('2026-02-15T06:00:00Z'),
    );

    expect(result.dailyReset).toBe(1);
    expect(agent.usedTodayAmount).toBe(0);
    expect(
      AgentAccountResetDateString(agent.limitResetDate),
    ).toBe('2026-02-15');
  });

  it('missed-run compensation across month boundary resets both (7.7)', async () => {
    // 漏跑跨月:上次 1 月底,下次运行已是 2 月中。
    const agent = makeAgent({
      usedTodayAmount: 10,
      usedMonthAmount: 500,
      limitResetDate: new Date('2026-01-30'),
    });
    candidates = [agent];

    const result = await service.resetLimitsByResetDate(
      new Date('2026-02-14T12:00:00Z'),
    );

    expect(result).toEqual({ dailyReset: 1, monthlyReset: 1 });
    expect(agent.usedTodayAmount).toBe(0);
    expect(agent.usedMonthAmount).toBe(0);
  });

  it('first run with null limitResetDate resets both and sets the date', async () => {
    const agent = makeAgent({
      usedTodayAmount: 5,
      usedMonthAmount: 5,
      limitResetDate: undefined,
    });
    candidates = [agent];

    const result = await service.resetLimitsByResetDate(
      new Date('2026-02-11T00:00:00Z'),
    );

    expect(result).toEqual({ dailyReset: 1, monthlyReset: 1 });
    expect(agent.usedTodayAmount).toBe(0);
    expect(agent.usedMonthAmount).toBe(0);
    expect(
      AgentAccountResetDateString(agent.limitResetDate),
    ).toBe('2026-02-11');
  });

  it('idempotent within the same UTC day: no second zeroing (7.6)', async () => {
    // limitResetDate == 今日(UTC) → 不应重置,即使候选里被返回。
    const agent = makeAgent({
      usedTodayAmount: 40,
      usedMonthAmount: 40,
      limitResetDate: new Date('2026-02-11'),
    });
    candidates = [agent];

    const result = await service.resetLimitsByResetDate(
      new Date('2026-02-11T23:59:59Z'),
    );

    expect(result).toEqual({ dailyReset: 0, monthlyReset: 0 });
    expect(agent.usedTodayAmount).toBe(40); // 未被归零
    expect(agent.usedMonthAmount).toBe(40);
    expect(mockAgentRepo.save).not.toHaveBeenCalled();
  });

  it('UTC boundary: just before UTC midnight = same day (no reset)', async () => {
    const agent = makeAgent({
      usedTodayAmount: 70,
      limitResetDate: new Date('2026-02-11'),
    });
    candidates = [agent];

    // 2026-02-11T23:59:59Z 仍属 02-11(UTC)→ 不重置。
    const result = await service.resetLimitsByResetDate(
      new Date('2026-02-11T23:59:59Z'),
    );

    expect(result.dailyReset).toBe(0);
    expect(agent.usedTodayAmount).toBe(70);
  });

  it('UTC boundary: just after UTC midnight = next day (reset)', async () => {
    const agent = makeAgent({
      usedTodayAmount: 70,
      limitResetDate: new Date('2026-02-11'),
    });
    candidates = [agent];

    // 2026-02-12T00:00:01Z 已跨入 02-12(UTC)→ 重置。
    const result = await service.resetLimitsByResetDate(
      new Date('2026-02-12T00:00:01Z'),
    );

    expect(result.dailyReset).toBe(1);
    expect(agent.usedTodayAmount).toBe(0);
  });

  it('processes only candidates needing reset (not blanket table zeroing) (7.6)', async () => {
    const stale = makeAgent({
      id: 'stale',
      usedTodayAmount: 10,
      limitResetDate: new Date('2026-02-09'),
    });
    candidates = [stale];

    await service.resetLimitsByResetDate(new Date('2026-02-11T00:00:00Z'));

    // find 用 limitResetDate IS NULL / < today 过滤,仅候选被处理
    expect(mockAgentRepo.find).toHaveBeenCalledTimes(1);
    expect(mockAgentRepo.save).toHaveBeenCalledTimes(1);
  });
});

/** 把存储的 limitResetDate(Date)归一为 'YYYY-MM-DD'(UTC)便于断言。 */
function AgentAccountResetDateString(d?: Date): string {
  return new Date(d as Date).toISOString().slice(0, 10);
}
