import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment, PaymentStatus } from '../../entities/payment.entity';
import { Order, OrderStatus } from '../../entities/order.entity';

export interface MerchantTrustScore {
  merchantId: string;
  trustScore: number; // 0-100
  trustLevel: 'low' | 'medium' | 'high' | 'excellent';
  totalTransactions: number;
  totalAmount: number;
  successRate: number; // 0-1
  averageRating?: number;
  lastTransactionAt?: Date;
  statistics: {
    completed: number;
    failed: number;
    refunded: number;
    disputed: number;
  };
}

@Injectable()
export class MerchantTrustService {
  private readonly logger = new Logger(MerchantTrustService.name);

  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
  ) {}

  /**
   * 获取商家可信度评分
   */
  async getMerchantTrustScore(merchantId: string): Promise<MerchantTrustScore> {
    // 查询该商户的所有交易
    const payments = await this.paymentRepository.find({
      where: { merchantId },
    });

    const orders = await this.orderRepository.find({
      where: { merchantId },
    });

    // 统计交易数据
    const statistics = {
      completed: payments.filter(p => p.status === PaymentStatus.COMPLETED).length,
      failed: payments.filter(p => p.status === PaymentStatus.FAILED).length,
      refunded: payments.filter(p => p.status === PaymentStatus.REFUNDED).length,
      disputed: orders.filter(
        (o) => o.status === OrderStatus.FROZEN || o.status === OrderStatus.DISPUTED,
      ).length,
    };

    const totalTransactions = payments.length;
    const successRate = totalTransactions > 0 
      ? statistics.completed / totalTransactions 
      : 0;

    const totalAmount = payments
      .filter(p => p.status === PaymentStatus.COMPLETED)
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const lastTransaction = payments.length > 0
      ? payments.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
      : null;

    // 计算可信度评分（0-100）
    // 基础分：成功率 * 60 + 交易量分 * 20 + 时间分 * 20
    let trustScore = successRate * 60;

    // 交易量分（有交易记录加分）
    if (totalTransactions > 0) {
      trustScore += Math.min(20, totalTransactions / 10);
    }

    // 时间分（最近有交易加分）
    if (lastTransaction) {
      const daysSinceLastTransaction = 
        (Date.now() - lastTransaction.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceLastTransaction < 30) {
        trustScore += 20;
      } else if (daysSinceLastTransaction < 90) {
        trustScore += 10;
      }
    }

    // 退款和争议扣分
    trustScore -= (statistics.refunded / totalTransactions) * 10;
    trustScore -= (statistics.disputed / totalTransactions) * 20;

    trustScore = Math.max(0, Math.min(100, trustScore));

    // 确定可信度等级
    let trustLevel: 'low' | 'medium' | 'high' | 'excellent';
    if (trustScore >= 80) {
      trustLevel = 'excellent';
    } else if (trustScore >= 60) {
      trustLevel = 'high';
    } else if (trustScore >= 40) {
      trustLevel = 'medium';
    } else {
      trustLevel = 'low';
    }

    return {
      merchantId,
      trustScore: Math.round(trustScore * 100) / 100,
      trustLevel,
      totalTransactions,
      totalAmount,
      successRate: Math.round(successRate * 100) / 100,
      lastTransactionAt: lastTransaction?.createdAt,
      statistics,
    };
  }

  /**
   * 获取商家交易统计
   */
  async getMerchantStatistics(merchantId: string) {
    const payments = await this.paymentRepository.find({
      where: { merchantId },
    });

    return {
      totalTransactions: payments.length,
      totalAmount: payments
        .filter(p => p.status === PaymentStatus.COMPLETED)
        .reduce((sum, p) => sum + Number(p.amount), 0),
      averageAmount: payments.length > 0
        ? payments.reduce((sum, p) => sum + Number(p.amount), 0) / payments.length
        : 0,
      byStatus: {
        completed: payments.filter(p => p.status === PaymentStatus.COMPLETED).length,
        failed: payments.filter(p => p.status === PaymentStatus.FAILED).length,
        refunded: payments.filter(p => p.status === PaymentStatus.REFUNDED).length,
        processing: payments.filter(p => p.status === PaymentStatus.PROCESSING).length,
      },
    };
  }
}

