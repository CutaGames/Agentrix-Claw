/**
 * Agent Account Reset Scheduler
 *
 * spec: crypto-native-agent-ops 任务 3 · 需求 7.5/7.6/7.7 · design §C1 B 组。
 *
 * 按 `limitResetDate` + 统一时区(UTC)定时重置 AgentAccount 的额度:
 * - 每日 00:00 UTC:跨日重置 `usedTodayAmount`(并顺带补偿跨月)。
 * - 每月 1 日 00:05 UTC:作为「跨月重置」的安全网(与每日任务幂等)。
 *
 * 实际重置逻辑在 `AgentAccountService.resetLimitsByResetDate()`:基于
 * `limitResetDate` 与当前 UTC 日期比较,漏跑可在下次运行时一次性补偿,
 * 而非全表无差别即时归零。参照 `developer-account-scheduler` 模式。
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AgentAccountService } from './agent-account.service';

@Injectable()
export class AgentAccountResetScheduler {
  private readonly logger = new Logger(AgentAccountResetScheduler.name);

  constructor(private readonly agentAccountService: AgentAccountService) {}

  /** 是否禁用调度(测试/灰度用)。 */
  private get disabled(): boolean {
    return process.env.AGENT_ACCOUNT_RESET_SCHEDULER_DISABLED === '1';
  }

  /**
   * 每日 00:00 UTC 重置 `usedTodayAmount`(并补偿跨月 `usedMonthAmount`)。
   * 使用 UTC 时间确保日/月边界口径全球一致(需求 7.6)。
   */
  @Cron('0 0 * * *', {
    name: 'agent-account-daily-limit-reset',
    timeZone: 'UTC',
  })
  async handleDailyReset(): Promise<void> {
    if (this.disabled) return;

    const startTime = Date.now();
    this.logger.log('开始 Agent 额度日重置(按 limitResetDate + UTC)...');

    try {
      const { dailyReset, monthlyReset } =
        await this.agentAccountService.resetLimitsByResetDate();
      const duration = Date.now() - startTime;
      this.logger.log(
        `Agent 额度日重置完成 daily=${dailyReset} monthly=${monthlyReset}（${duration}ms）`,
      );
    } catch (error) {
      this.logger.error(
        `Agent 额度日重置失败: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * 每月 1 日 00:05 UTC 月度重置安全网。
   * 延迟 5 分钟,避免与每日任务并发;逻辑幂等(同日重复运行不二次归零)。
   */
  @Cron('5 0 1 * *', {
    name: 'agent-account-monthly-limit-reset',
    timeZone: 'UTC',
  })
  async handleMonthlyReset(): Promise<void> {
    if (this.disabled) return;

    const startTime = Date.now();
    this.logger.log('开始 Agent 额度月重置安全网(按 limitResetDate + UTC)...');

    try {
      const { dailyReset, monthlyReset } =
        await this.agentAccountService.resetLimitsByResetDate();
      const duration = Date.now() - startTime;
      this.logger.log(
        `Agent 额度月重置安全网完成 daily=${dailyReset} monthly=${monthlyReset}（${duration}ms）`,
      );
    } catch (error) {
      this.logger.error(
        `Agent 额度月重置失败: ${error.message}`,
        error.stack,
      );
    }
  }
}
