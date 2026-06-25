/**
 * Developer Account Scheduler Service
 * 
 * 定时任务服务，用于处理开发者账户的定期维护任务：
 * - 每日重置 API 调用计数
 * - 每月重置月度调用计数
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DeveloperAccountService } from './developer-account.service';

@Injectable()
export class DeveloperAccountSchedulerService {
  private readonly logger = new Logger(DeveloperAccountSchedulerService.name);

  constructor(
    private readonly developerAccountService: DeveloperAccountService,
  ) {}

  /**
   * 每日凌晨 0:00 UTC 重置每日 API 调用计数
   * 使用 UTC 时间确保全球开发者体验一致
   */
  @Cron('0 0 * * *', {
    name: 'resetDailyApiCounts',
    timeZone: 'UTC',
  })
  async handleDailyReset(): Promise<void> {
    this.logger.log('Starting daily API call count reset...');
    const startTime = Date.now();

    try {
      await this.developerAccountService.resetDailyCounts();
      const duration = Date.now() - startTime;
      this.logger.log(`Daily API call count reset completed in ${duration}ms`);
    } catch (error) {
      this.logger.error(`Failed to reset daily API counts: ${error.message}`, error.stack);
    }
  }

  /**
   * 每月 1 日凌晨 0:05 UTC 重置月度 API 调用计数
   * 延迟 5 分钟执行，避免与每日重置任务冲突
   */
  @Cron('5 0 1 * *', {
    name: 'resetMonthlyApiCounts',
    timeZone: 'UTC',
  })
  async handleMonthlyReset(): Promise<void> {
    this.logger.log('Starting monthly API call count reset...');
    const startTime = Date.now();

    try {
      await this.developerAccountService.resetMonthlyCounts();
      const duration = Date.now() - startTime;
      this.logger.log(`Monthly API call count reset completed in ${duration}ms`);
    } catch (error) {
      this.logger.error(`Failed to reset monthly API counts: ${error.message}`, error.stack);
    }
  }

  /**
   * 每小时检查并处理过期的待审核账户
   * 超过 30 天未通过审核的账户将被标记为已撤销
   */
  @Cron(CronExpression.EVERY_HOUR, {
    name: 'handleExpiredPendingAccounts',
  })
  async handleExpiredPendingAccounts(): Promise<void> {
    this.logger.debug('Checking for expired pending developer accounts...');
    
    try {
      // 此功能待实现：标记超期未审核的账户
      // await this.developerAccountService.markExpiredPendingAccounts();
    } catch (error) {
      this.logger.error(`Failed to handle expired pending accounts: ${error.message}`, error.stack);
    }
  }

  /**
   * 每天凌晨 2:00 UTC 生成开发者账户统计快照
   * 用于历史数据分析和趋势追踪
   */
  @Cron('0 2 * * *', {
    name: 'generateDailySnapshots',
    timeZone: 'UTC',
  })
  async handleDailySnapshots(): Promise<void> {
    this.logger.debug('Generating daily developer account snapshots...');
    
    try {
      // 此功能待实现：生成每日统计快照
      // await this.developerAccountService.generateDailySnapshots();
    } catch (error) {
      this.logger.error(`Failed to generate daily snapshots: ${error.message}`, error.stack);
    }
  }
}
