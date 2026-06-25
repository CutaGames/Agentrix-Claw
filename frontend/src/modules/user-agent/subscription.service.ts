import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Payment, PaymentStatus } from '../../entities/payment.entity';

export interface Subscription {
  id: string;
  userId: string;
  merchantId: string;
  amount: number;
  currency: string;
  interval: 'daily' | 'weekly' | 'monthly' | 'yearly';
  nextBillingDate: Date;
  status: 'active' | 'paused' | 'cancelled';
  metadata?: any;
}

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
  ) {}

  /**
   * 识别定期交易（订阅）
   */
  async identifySubscriptions(userId: string): Promise<Subscription[]> {
    // 查询用户的所有成功支付
    const payments = await this.paymentRepository.find({
      where: {
        userId,
        status: PaymentStatus.COMPLETED,
      },
      order: { createdAt: 'DESC' },
    });

    // 按商户和金额分组
    const paymentGroups = new Map<string, Payment[]>();
    payments.forEach(payment => {
      if (payment.merchantId) {
        const key = `${payment.merchantId}_${payment.amount}_${payment.currency}`;
        if (!paymentGroups.has(key)) {
          paymentGroups.set(key, []);
        }
        paymentGroups.get(key)!.push(payment);
      }
    });

    const subscriptions: Subscription[] = [];

    // 分析每个分组，找出定期交易
    paymentGroups.forEach((groupPayments, key) => {
      if (groupPayments.length < 2) return; // 至少需要2次交易

      // 按时间排序
      groupPayments.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      // 计算时间间隔
      const intervals: number[] = [];
      for (let i = 1; i < groupPayments.length; i++) {
        const diff = groupPayments[i].createdAt.getTime() - groupPayments[i - 1].createdAt.getTime();
        intervals.push(diff);
      }

      // 计算平均间隔
      const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
      const days = avgInterval / (1000 * 60 * 60 * 24);

      // 判断订阅类型
      let interval: 'daily' | 'weekly' | 'monthly' | 'yearly';
      if (days <= 1.5) {
        interval = 'daily';
      } else if (days <= 7.5) {
        interval = 'weekly';
      } else if (days <= 35) {
        interval = 'monthly';
      } else {
        interval = 'yearly';
      }

      // 计算下次账单日期
      const lastPayment = groupPayments[groupPayments.length - 1];
      const nextBillingDate = new Date(lastPayment.createdAt);
      if (interval === 'daily') {
        nextBillingDate.setDate(nextBillingDate.getDate() + 1);
      } else if (interval === 'weekly') {
        nextBillingDate.setDate(nextBillingDate.getDate() + 7);
      } else if (interval === 'monthly') {
        nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
      } else {
        nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
      }

      subscriptions.push({
        id: `sub_${key}`,
        userId,
        merchantId: lastPayment.merchantId!,
        amount: Number(lastPayment.amount),
        currency: lastPayment.currency,
        interval,
        nextBillingDate,
        status: 'active',
        metadata: {
          paymentCount: groupPayments.length,
          firstPayment: groupPayments[0].createdAt,
          lastPayment: lastPayment.createdAt,
        },
      });
    });

    return subscriptions;
  }

  /**
   * 获取用户的订阅列表
   */
  async getUserSubscriptions(userId: string): Promise<Subscription[]> {
    return this.identifySubscriptions(userId);
  }
}

