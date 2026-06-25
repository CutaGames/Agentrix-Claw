import { Injectable, Logger } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CommissionService } from './commission.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';
import { PayeeType } from '../../entities/commission.entity';

@Injectable()
export class CommissionSchedulerService {
  private readonly logger = new Logger(CommissionSchedulerService.name);

  constructor(
    private commissionService: CommissionService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private schedulerRegistry: SchedulerRegistry,
  ) {}

  /**
   * 每小时检查一次，解锁已到期的佣金
   */
  @Cron(CronExpression.EVERY_HOUR)
  async unlockDueCommissions() {
    try {
      const unlocked = await this.commissionService.releaseDueCommissions();
      const settled = await this.commissionService.finalizeOrdersDue();
      if (unlocked > 0) {
        this.logger.log(`解锁 ${unlocked} 笔佣金，进入结算池`);
      }
      if (settled > 0) {
        this.logger.log(`自动结算 ${settled} 笔订单，状态更新为 SETTLED`);
      }
    } catch (error) {
      this.logger.error('解锁佣金失败', error);
    }
  }

  /**
   * T+1自动结算任务
   * 每天凌晨2点执行，结算前一天的交易
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async executeDailySettlement() {
    this.logger.log('开始执行T+1自动结算任务...');

    try {
      // 获取所有Agent和Merchant用户
      const agents = await this.userRepository.find({
        where: { roles: { $contains: ['agent'] } as any },
      });
      const merchants = await this.userRepository.find({
        where: { roles: { $contains: ['merchant'] } as any },
      });

      let successCount = 0;
      let failCount = 0;

      // 结算Agent分润
      for (const agent of agents) {
        try {
          await this.commissionService.executeSettlement(
            agent.id,
            PayeeType.AGENT,
            'CNY',
          );
          successCount++;
          this.logger.log(`Agent ${agent.id} 结算成功`);
        } catch (error) {
          failCount++;
          this.logger.error(`Agent ${agent.id} 结算失败:`, error);
        }
      }

      // 结算Merchant分润（如果有）
      for (const merchant of merchants) {
        try {
          await this.commissionService.executeSettlement(
            merchant.id,
            PayeeType.MERCHANT,
            'CNY',
          );
          successCount++;
          this.logger.log(`Merchant ${merchant.id} 结算成功`);
        } catch (error) {
          failCount++;
          this.logger.error(`Merchant ${merchant.id} 结算失败:`, error);
        }
      }

      this.logger.log(
        `T+1自动结算完成: 成功 ${successCount} 个，失败 ${failCount} 个`,
      );
    } catch (error) {
      this.logger.error('自动结算任务执行失败:', error);
    }
  }

  /**
   * 手动触发结算（用于测试）
   */
  async triggerSettlement(payeeId: string, payeeType: PayeeType) {
    return this.commissionService.executeSettlement(payeeId, payeeType, 'CNY');
  }
}

