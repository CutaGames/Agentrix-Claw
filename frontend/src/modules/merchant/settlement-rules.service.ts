import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment, PaymentStatus } from '../../entities/payment.entity';

export interface SettlementRule {
  merchantId: string;
  cycle: 'daily' | 'weekly' | 'monthly';
  currency: string;
  autoConvert: boolean;
  targetCurrency?: string;
  minAmount?: number;
  enabled: boolean;
}

export interface SettlementRecord {
  id: string;
  merchantId: string;
  period: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  settledAt?: Date;
  transactionHash?: string;
}

@Injectable()
export class SettlementRulesService {
  private readonly logger = new Logger(SettlementRulesService.name);

  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
  ) {}

  /**
   * 创建结算规则
   */
  async createSettlementRule(rule: SettlementRule): Promise<SettlementRule> {
    // 实际应该保存到数据库
    this.logger.log(`创建结算规则: merchantId=${rule.merchantId}, cycle=${rule.cycle}`);
    return rule;
  }

  /**
   * 获取结算规则
   */
  async getSettlementRule(merchantId: string): Promise<SettlementRule | null> {
    // 实际应该从数据库查询
    // 默认规则
    return {
      merchantId,
      cycle: 'daily',
      currency: 'USDC',
      autoConvert: false,
      enabled: true,
    };
  }

  /**
   * 执行结算
   */
  async performSettlement(merchantId: string, period: string): Promise<SettlementRecord> {
    const rule = await this.getSettlementRule(merchantId);
    if (!rule || !rule.enabled) {
      throw new Error('结算规则未配置或已禁用');
    }

    // 查询待结算的支付
    const payments = await this.paymentRepository.find({
      where: {
        merchantId,
        status: PaymentStatus.COMPLETED,
        // 实际应该根据周期筛选
      },
    });

    const amount = payments.reduce((sum, p) => {
      if (p.currency === rule.currency) {
        return sum + Number(p.amount);
      }
      return sum;
    }, 0);

    // 检查最小金额
    if (rule.minAmount && amount < rule.minAmount) {
      throw new Error(`结算金额 ${amount} 低于最小金额 ${rule.minAmount}`);
    }

    const record: SettlementRecord = {
      id: `settle_${merchantId}_${period}`,
      merchantId,
      period,
      amount,
      currency: rule.currency,
      status: 'pending',
    };

    this.logger.log(`结算记录创建: merchantId=${merchantId}, amount=${amount}, currency=${rule.currency}`);
    return record;
  }
}

