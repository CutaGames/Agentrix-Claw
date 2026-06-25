import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReferralCommission, CommissionStatus } from '../../entities/referral-commission.entity';
import { Cron, CronExpression } from '@nestjs/schedule';

/**
 * 推广分成结算服务
 * 每周自动结算一次推广分成
 */
@Injectable()
export class ReferralCommissionService {
  private readonly logger = new Logger(ReferralCommissionService.name);

  constructor(
    @InjectRepository(ReferralCommission)
    private commissionRepository: Repository<ReferralCommission>,
  ) {}

  /**
   * 结算指定周期的推广分成
   * @param period 结算周期，格式：YYYY-WW（如 "2025-W01"）
   */
  async settleCommissions(period?: string): Promise<{
    settledCount: number;
    totalAmount: number;
  }> {
    const targetPeriod = period || this.getCurrentPeriod();

    this.logger.log(`开始结算推广分成，周期: ${targetPeriod}`);

    // 查找待结算的分成记录
    const pendingCommissions = await this.commissionRepository.find({
      where: {
        status: CommissionStatus.PENDING,
      },
    });

    if (pendingCommissions.length === 0) {
      this.logger.log('没有待结算的分成记录');
      return { settledCount: 0, totalAmount: 0 };
    }

    let settledCount = 0;
    let totalAmount = 0;

    // 批量结算
    for (const commission of pendingCommissions) {
      // 标记为已结算
      commission.status = CommissionStatus.SETTLED;
      commission.settledAt = new Date();
      commission.settlementPeriod = targetPeriod;

      await this.commissionRepository.save(commission);

      settledCount++;
      totalAmount += Number(commission.commissionAmount);

      this.logger.log(
        `结算分成: Agent ${commission.agentId}, 金额 ${commission.commissionAmount} ${commission.currency}`,
      );
    }

    this.logger.log(
      `结算完成: 共结算 ${settledCount} 笔，总金额 ${totalAmount}`,
    );

    // TODO: 实际支付到Agent钱包或账户
    // 这里应该调用支付服务，将分成金额支付给Agent

    return { settledCount, totalAmount };
  }

  /**
   * 每周自动结算（每周一凌晨2点执行）
   */
  @Cron('0 2 * * 1') // 每周一凌晨2点
  async weeklySettlement() {
    this.logger.log('开始执行每周推广分成自动结算');
    await this.settleCommissions();
  }

  /**
   * 获取当前结算周期
   */
  private getCurrentPeriod(): string {
    const now = new Date();
    const year = now.getFullYear();
    const week = this.getWeekNumber(now);
    return `${year}-W${week.toString().padStart(2, '0')}`;
  }

  /**
   * 获取周数
   */
  private getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }

  /**
   * 获取Agent的待结算分成
   */
  async getPendingCommissions(agentId: string): Promise<ReferralCommission[]> {
    return this.commissionRepository.find({
      where: {
        agentId,
        status: CommissionStatus.PENDING,
      },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 获取Agent的已结算分成
   */
  async getSettledCommissions(
    agentId: string,
    period?: string,
  ): Promise<ReferralCommission[]> {
    const query = this.commissionRepository
      .createQueryBuilder('commission')
      .where('commission.agentId = :agentId', { agentId })
      .andWhere('commission.status = :status', { status: CommissionStatus.SETTLED })
      .orderBy('commission.settledAt', 'DESC');

    if (period) {
      query.andWhere('commission.settlementPeriod = :period', { period });
    }

    return query.getMany();
  }
}

