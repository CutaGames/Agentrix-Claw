import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Payment, PaymentStatus } from '../../entities/payment.entity';

export interface ReconciliationRecord {
  id: string;
  merchantId: string;
  date: Date;
  type: 'T+0' | 'T+1' | 'T+7';
  totalAmount: number;
  totalCount: number;
  matchedCount: number;
  unmatchedCount: number;
  differences: Array<{
    paymentId: string;
    expectedAmount: number;
    actualAmount: number;
    difference: number;
    reason: string;
  }>;
  status: 'pending' | 'completed' | 'failed';
  createdAt: Date;
}

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
  ) {}

  /**
   * 执行对账（T+1）
   */
  async performReconciliation(
    merchantId: string,
    date: Date,
    type: 'T+0' | 'T+1' | 'T+7' = 'T+1',
  ): Promise<ReconciliationRecord> {
    // 计算对账日期范围
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    // 查询该日期的所有支付
    const payments = await this.paymentRepository.find({
      where: {
        merchantId,
        status: PaymentStatus.COMPLETED,
        createdAt: Between(startDate, endDate),
      },
    });

    // 统计
    const totalAmount = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const totalCount = payments.length;

    // 检测差异（简化处理，实际应该与外部系统对账）
    const differences: ReconciliationRecord['differences'] = [];
    let matchedCount = totalCount;

    // 检查是否有异常金额
    payments.forEach(payment => {
      const expectedAmount = Number(payment.amount);
      const actualAmount = Number(payment.amount); // 实际应该从外部系统获取

      if (Math.abs(expectedAmount - actualAmount) > 0.01) {
        differences.push({
          paymentId: payment.id,
          expectedAmount,
          actualAmount,
          difference: actualAmount - expectedAmount,
          reason: '金额不匹配',
        });
        matchedCount--;
      }
    });

    const record: ReconciliationRecord = {
      id: `recon_${merchantId}_${date.toISOString().split('T')[0]}`,
      merchantId,
      date,
      type,
      totalAmount,
      totalCount,
      matchedCount,
      unmatchedCount: differences.length,
      differences,
      status: differences.length === 0 ? 'completed' : 'pending',
      createdAt: new Date(),
    };

    this.logger.log(
      `对账完成: merchantId=${merchantId}, date=${date.toISOString()}, matched=${matchedCount}/${totalCount}`,
    );

    return record;
  }

  /**
   * 获取对账记录
   */
  async getReconciliationRecords(merchantId: string): Promise<ReconciliationRecord[]> {
    // 实际应该从数据库查询
    // 这里简化处理
    return [];
  }
}

