import { Test, TestingModule } from '@nestjs/testing';

import { AgentAccountResetScheduler } from './agent-account-reset.scheduler';
import { AgentAccountService } from './agent-account.service';

/**
 * AgentAccountResetScheduler 单测(crypto-native-agent-ops 任务 3)。
 *
 * 覆盖:
 *  - 每日/每月 cron 委托到 resetLimitsByResetDate。
 *  - 失败被吞(只记日志,不抛出阻塞调度)。
 *  - DISABLED 开关短路。
 */
describe('AgentAccountResetScheduler', () => {
  let scheduler: AgentAccountResetScheduler;
  let resetSpy: jest.Mock;

  const ENV_KEY = 'AGENT_ACCOUNT_RESET_SCHEDULER_DISABLED';

  beforeEach(async () => {
    delete process.env[ENV_KEY];
    resetSpy = jest.fn(async () => ({ dailyReset: 2, monthlyReset: 1 }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentAccountResetScheduler,
        {
          provide: AgentAccountService,
          useValue: { resetLimitsByResetDate: resetSpy },
        },
      ],
    }).compile();

    scheduler = module.get(AgentAccountResetScheduler);
  });

  afterEach(() => {
    delete process.env[ENV_KEY];
  });

  it('daily cron delegates to resetLimitsByResetDate', async () => {
    await scheduler.handleDailyReset();
    expect(resetSpy).toHaveBeenCalledTimes(1);
  });

  it('monthly cron delegates to resetLimitsByResetDate', async () => {
    await scheduler.handleMonthlyReset();
    expect(resetSpy).toHaveBeenCalledTimes(1);
  });

  it('swallows service errors without throwing', async () => {
    resetSpy.mockRejectedValueOnce(new Error('db down'));
    await expect(scheduler.handleDailyReset()).resolves.toBeUndefined();
  });

  it('is a no-op when disabled via env flag', async () => {
    process.env[ENV_KEY] = '1';
    await scheduler.handleDailyReset();
    await scheduler.handleMonthlyReset();
    expect(resetSpy).not.toHaveBeenCalled();
  });
});
