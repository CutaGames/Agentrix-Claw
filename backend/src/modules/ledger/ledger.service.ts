import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Payment } from '../../entities/payment.entity';
import { Commission } from '../../entities/commission.entity';
import { CommissionSettlement } from '../../entities/commission-settlement.entity';

export interface RevenueShare {
  merchantId: string;
  totalRevenue: number;
  platformCommission: number;
  merchantShare: number;
  currency: string;
  period: { start: Date; end: Date };
}

export interface SplitPayment {
  paymentId: string;
  recipients: Array<{
    recipientId: string;
    amount: number;
    percentage?: number;
  }>;
  totalAmount: number;
  currency: string;
}

export interface Reconciliation {
  id: string;
  date: Date;
  totalTransactions: number;
  totalAmount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed';
  discrepancies?: Array<{
    type: string;
    description: string;
    amount: number;
  }>;
}

@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(Commission)
    private commissionRepository: Repository<Commission>,
    @InjectRepository(CommissionSettlement)
    private settlementRepository: Repository<CommissionSettlement>,
  ) {}

  /**
   * 获取商户分润
   */
  async getRevenueShare(
    merchantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<RevenueShare> {
    const payments = await this.paymentRepository.find({
      where: {
        merchantId,
        status: 'completed' as any,
        createdAt: Between(startDate, endDate),
      },
    });

    const totalRevenue = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const platformCommissionRate = 0.05; // 5%平台佣金
    const platformCommission = totalRevenue * platformCommissionRate;
    const merchantShare = totalRevenue - platformCommission;

    return {
      merchantId,
      totalRevenue,
      platformCommission,
      merchantShare,
      currency: payments[0]?.currency || 'CNY',
      period: { start: startDate, end: endDate },
    };
  }

  /**
   * 获取平台佣金
   */
  async getPlatformCommission(
    startDate: Date,
    endDate: Date,
  ): Promise<{
    totalCommission: number;
    currency: string;
    period: { start: Date; end: Date };
  }> {
    const payments = await this.paymentRepository.find({
      where: {
        status: 'completed' as any,
        createdAt: Between(startDate, endDate),
      },
    });

    const totalRevenue = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const commissionRate = 0.05; // 5%平台佣金
    const totalCommission = totalRevenue * commissionRate;

    return {
      totalCommission,
      currency: payments[0]?.currency || 'CNY',
      period: { start: startDate, end: endDate },
    };
  }

  /**
   * 创建分账支付
   */
  async createSplitPayment(request: SplitPayment): Promise<SplitPayment> {
    // 验证总金额
    const calculatedTotal = request.recipients.reduce(
      (sum, r) => sum + r.amount,
      0,
    );

    if (Math.abs(calculatedTotal - request.totalAmount) > 0.01) {
      throw new Error('分账金额总和与总金额不匹配');
    }

    // 这里应该调用智能合约或支付服务执行分账
    // 暂时返回请求对象
    this.logger.log(`创建分账支付: ${request.paymentId}`);

    return request;
  }

  /**
   * 创建日终对账
   */
  async createReconciliation(date: Date): Promise<Reconciliation> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const payments = await this.paymentRepository.find({
      where: {
        createdAt: Between(startOfDay, endOfDay),
      },
    });

    const totalTransactions = payments.length;
    const totalAmount = payments.reduce((sum, p) => sum + Number(p.amount), 0);

    // 检查差异（简化实现）
    const discrepancies: Array<{
      type: string;
      description: string;
      amount: number;
    }> = [];

    // 检查失败的交易
    const failedPayments = payments.filter(p => p.status === 'failed' as any);
    if (failedPayments.length > 0) {
      discrepancies.push({
        type: 'failed_payments',
        description: `有 ${failedPayments.length} 笔失败交易`,
        amount: failedPayments.reduce((sum, p) => sum + Number(p.amount), 0),
      });
    }

    return {
      id: `reconciliation_${date.toISOString().split('T')[0]}`,
      date,
      totalTransactions,
      totalAmount,
      currency: payments[0]?.currency || 'CNY',
      status: discrepancies.length > 0 ? 'pending' : 'completed',
      discrepancies,
    };
  }

  /**
   * 导出支付流水
   */
  async exportLedger(params: {
    userId?: string;
    merchantId?: string;
    startDate: Date;
    endDate: Date;
    format: 'csv' | 'json' | 'xlsx';
  }): Promise<{
    data: any[];
    format: string;
    filename: string;
  }> {
    const where: any = {
      createdAt: Between(params.startDate, params.endDate),
    };

    if (params.userId) {
      where.userId = params.userId;
    }
    if (params.merchantId) {
      where.merchantId = params.merchantId;
    }

    const payments = await this.paymentRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });

    // 格式化数据
    const data = payments.map(p => ({
      id: p.id,
      userId: p.userId,
      merchantId: p.merchantId,
      amount: p.amount,
      currency: p.currency,
      paymentMethod: p.paymentMethod,
      status: p.status,
      transactionHash: p.transactionHash,
      createdAt: p.createdAt,
    }));

    const filename = `ledger_${params.startDate.toISOString().split('T')[0]}_${params.endDate.toISOString().split('T')[0]}.${params.format}`;

    return {
      data,
      format: params.format,
      filename,
    };
  }
}

