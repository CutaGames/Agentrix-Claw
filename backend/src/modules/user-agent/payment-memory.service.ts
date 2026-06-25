import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment, PaymentMethod } from '../../entities/payment.entity';
import { User } from '../../entities/user.entity';

export interface PaymentMemory {
  userId: string;
  preferredPaymentMethod?: PaymentMethod;
  preferredCurrency?: string;
  savedPaymentMethods: Array<{
    type: string;
    methodId: string;
    lastUsed: Date;
    usageCount: number;
  }>;
  merchantPreferences: Record<string, {
    preferredMethod?: PaymentMethod;
    lastAmount?: number;
    lastUsed?: Date;
  }>;
}

@Injectable()
export class PaymentMemoryService {
  private readonly logger = new Logger(PaymentMemoryService.name);

  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  /**
   * 获取用户的支付记忆
   */
  async getPaymentMemory(userId: string): Promise<PaymentMemory> {
    // 查询用户最近的支付记录
    const recentPayments = await this.paymentRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 50,
    });

    // 分析最常用的支付方式
    const methodCounts = new Map<PaymentMethod, number>();
    const currencyCounts = new Map<string, number>();
    const merchantPreferences: Record<string, any> = {};

    recentPayments.forEach(payment => {
      // 统计支付方式
      if (payment.paymentMethod) {
        methodCounts.set(
          payment.paymentMethod,
          (methodCounts.get(payment.paymentMethod) || 0) + 1,
        );
      }

      // 统计货币
      if (payment.currency) {
        currencyCounts.set(
          payment.currency,
          (currencyCounts.get(payment.currency) || 0) + 1,
        );
      }

      // 记录商户偏好
      if (payment.merchantId) {
        if (!merchantPreferences[payment.merchantId]) {
          merchantPreferences[payment.merchantId] = {
            preferredMethod: payment.paymentMethod,
            lastAmount: Number(payment.amount),
            lastUsed: payment.createdAt,
          };
        } else {
          // 更新最近的偏好
          if (payment.createdAt > merchantPreferences[payment.merchantId].lastUsed) {
            merchantPreferences[payment.merchantId].preferredMethod = payment.paymentMethod;
            merchantPreferences[payment.merchantId].lastAmount = Number(payment.amount);
            merchantPreferences[payment.merchantId].lastUsed = payment.createdAt;
          }
        }
      }
    });

    // 找出最常用的支付方式
    let preferredPaymentMethod: PaymentMethod | undefined;
    let maxCount = 0;
    methodCounts.forEach((count, method) => {
      if (count > maxCount) {
        maxCount = count;
        preferredPaymentMethod = method;
      }
    });

    // 找出最常用的货币
    let preferredCurrency: string | undefined;
    maxCount = 0;
    currencyCounts.forEach((count, currency) => {
      if (count > maxCount) {
        maxCount = count;
        preferredCurrency = currency;
      }
    });

    return {
      userId,
      preferredPaymentMethod,
      preferredCurrency,
      savedPaymentMethods: [], // 需要从其他服务获取
      merchantPreferences,
    };
  }

  /**
   * 记录支付信息（用于记忆）
   */
  async recordPayment(
    userId: string,
    paymentMethod: PaymentMethod,
    amount: number,
    currency: string,
    merchantId?: string,
  ): Promise<void> {
    // 支付记录会自动保存到数据库
    // 这里可以添加额外的记忆逻辑，比如更新用户偏好
    this.logger.log(
      `记录支付记忆 - User: ${userId}, Method: ${paymentMethod}, Amount: ${amount}, Merchant: ${merchantId}`,
    );
  }

  /**
   * 获取商户的推荐支付方式
   */
  async getMerchantPreferredMethod(
    userId: string,
    merchantId: string,
  ): Promise<string | null> {
    const memory = await this.getPaymentMemory(userId);
    const method = memory.merchantPreferences[merchantId]?.preferredMethod;
    return method ? String(method) : null;
  }
}

