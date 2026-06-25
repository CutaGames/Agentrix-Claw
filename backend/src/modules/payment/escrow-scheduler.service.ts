import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EscrowService } from './escrow.service';
import { EscrowStatus } from '../../entities/escrow.entity';

@Injectable()
export class EscrowSchedulerService {
  private readonly logger = new Logger(EscrowSchedulerService.name);

  constructor(private readonly escrowService: EscrowService) {}

  /**
   * 自动确认收货任务
   * 每小时执行一次，检查7天前已发货的订单，自动确认收货
   */
  @Cron(CronExpression.EVERY_HOUR)
  async autoConfirmDelivery() {
    this.logger.log('开始执行自动确认收货任务...');
    try {
      const result = await this.escrowService.autoConfirmDeliveryAfterDays(7);
      this.logger.log(
        `自动确认收货完成: 成功 ${result.successCount} 个，失败 ${result.failCount} 个`,
      );
    } catch (error) {
      this.logger.error('自动确认收货任务执行失败:', error);
    }
  }
}

