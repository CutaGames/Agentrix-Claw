import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PayIntentService } from './pay-intent.service';

@Injectable()
export class PayIntentSchedulerService {
  private readonly logger = new Logger(PayIntentSchedulerService.name);

  constructor(private readonly payIntentService: PayIntentService) {}

  /**
   * 每小时清理过期的PayIntent
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredPayIntents() {
    this.logger.log('开始清理过期的PayIntent...');
    try {
      const count = await this.payIntentService.cleanupExpiredPayIntents();
      this.logger.log(`清理完成，共清理 ${count} 个过期的PayIntent`);
    } catch (error) {
      this.logger.error('清理过期PayIntent失败:', error);
    }
  }
}

