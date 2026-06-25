/**
 * Task Commission Service
 * 
 * Handles platform commission calculation and settlement for task marketplace.
 * Default rate: 5% (500 basis points)
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MerchantTask } from '../../entities/merchant-task.entity';

/** Commission rate constants */
export const TASK_COMMISSION = {
  /** Default platform commission: 5% = 500 bps */
  DEFAULT_RATE_BPS: 500,
  /** Minimum commission amount (in base currency unit, e.g. 1 USD) */
  MIN_AMOUNT: 1.0,
  /** Maximum commission rate: 10% = 1000 bps */
  MAX_RATE_BPS: 1000,
  /** Basis points divisor */
  BPS_DIVISOR: 10000,
};

export interface CommissionBreakdown {
  grossAmount: number;
  commissionRate: string;
  commissionBps: number;
  commissionAmount: number;
  netPayoutAmount: number;
  currency: string;
}

@Injectable()
export class TaskCommissionService {
  private readonly logger = new Logger(TaskCommissionService.name);

  constructor(
    @InjectRepository(MerchantTask)
    private taskRepository: Repository<MerchantTask>,
  ) {}

  /**
   * Calculate commission breakdown for a given amount
   */
  calculateCommission(
    grossAmount: number,
    currency: string,
    commissionBps: number = TASK_COMMISSION.DEFAULT_RATE_BPS,
  ): CommissionBreakdown {
    const commissionAmount = Math.max(
      Number((grossAmount * commissionBps / TASK_COMMISSION.BPS_DIVISOR).toFixed(2)),
      TASK_COMMISSION.MIN_AMOUNT,
    );
    const netPayoutAmount = Number((grossAmount - commissionAmount).toFixed(2));

    return {
      grossAmount,
      commissionRate: `${(commissionBps / 100).toFixed(1)}%`,
      commissionBps,
      commissionAmount,
      netPayoutAmount,
      currency,
    };
  }

  /**
   * Apply commission to a task when it completes.
   * Called during task completion flow.
   */
  async applyCommission(taskId: string): Promise<CommissionBreakdown> {
    const task = await this.taskRepository.findOne({ where: { id: taskId } });
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const breakdown = this.calculateCommission(
      task.budget,
      task.currency,
      task.commissionBps || TASK_COMMISSION.DEFAULT_RATE_BPS,
    );

    // Update task with commission data
    task.commissionAmount = breakdown.commissionAmount;
    task.netPayoutAmount = breakdown.netPayoutAmount;
    task.commissionStatus = 'calculated';
    await this.taskRepository.save(task);

    this.logger.log(
      `Commission applied to task ${taskId}: ` +
      `${breakdown.commissionRate} of ${breakdown.grossAmount} ${breakdown.currency} = ` +
      `${breakdown.commissionAmount} commission, ${breakdown.netPayoutAmount} net payout`,
    );

    return breakdown;
  }

  /**
   * Mark commission as settled (after on-chain settlement)
   */
  async settleCommission(taskId: string, txHash?: string): Promise<void> {
    await this.taskRepository.update(taskId, {
      commissionStatus: 'settled',
      commissionTxHash: txHash || null,
    });
    this.logger.log(`Commission settled for task ${taskId}, tx: ${txHash || 'off-chain'}`);
  }

  /**
   * Waive commission for a task (admin action)
   */
  async waiveCommission(taskId: string): Promise<void> {
    const task = await this.taskRepository.findOne({ where: { id: taskId } });
    if (!task) throw new Error(`Task not found: ${taskId}`);

    task.commissionAmount = 0;
    task.netPayoutAmount = task.budget;
    task.commissionStatus = 'waived';
    await this.taskRepository.save(task);

    this.logger.log(`Commission waived for task ${taskId}`);
  }

  /**
   * Get commission summary for a user's tasks
   */
  async getUserCommissionSummary(userId: string): Promise<{
    totalTasks: number;
    totalGross: number;
    totalCommission: number;
    totalNetPayout: number;
    currency: string;
  }> {
    const result = await this.taskRepository
      .createQueryBuilder('task')
      .select('COUNT(task.id)', 'totalTasks')
      .addSelect('COALESCE(SUM(task.budget), 0)', 'totalGross')
      .addSelect('COALESCE(SUM(task.commissionAmount), 0)', 'totalCommission')
      .addSelect('COALESCE(SUM(task.netPayoutAmount), 0)', 'totalNetPayout')
      .where('task.merchantId = :userId', { userId })
      .andWhere('task.commissionStatus IN (:...statuses)', { statuses: ['calculated', 'settled'] })
      .getRawOne();

    return {
      totalTasks: parseInt(result.totalTasks) || 0,
      totalGross: parseFloat(result.totalGross) || 0,
      totalCommission: parseFloat(result.totalCommission) || 0,
      totalNetPayout: parseFloat(result.totalNetPayout) || 0,
      currency: 'USD',
    };
  }
}
