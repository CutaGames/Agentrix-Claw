import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { AutoPayGrant } from '../../entities/auto-pay-grant.entity';
import { Payment, PaymentStatus } from '../../entities/payment.entity';

export interface AutoPaymentRequest {
  grantId: string;
  agentId: string;
  userId: string;
  amount: number;
  recipient: string;
  description?: string;
}

@Injectable()
export class AutoPayExecutorService {
  private readonly logger = new Logger(AutoPayExecutorService.name);

  constructor(
    @InjectRepository(AutoPayGrant)
    private grantRepository: Repository<AutoPayGrant>,
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
  ) {}

  /**
   * 执行自动支付
   */
  async executeAutoPayment(request: AutoPaymentRequest): Promise<Payment> {
    const { grantId, agentId, userId, amount, recipient, description } = request;

    // 1. 验证授权
    const grant = await this.validateGrant(grantId, userId, agentId, amount);

    // 2. 创建支付记录
    const payment = this.paymentRepository.create({
      userId,
      amount,
      currency: 'CNY',
      paymentMethod: 'wallet' as any,
      description: description || `自动支付 - Agent: ${agentId}`,
      agentId,
      metadata: {
        autoPay: true,
        grantId,
        recipient,
      },
      status: PaymentStatus.PROCESSING,
    });

    const savedPayment = await this.paymentRepository.save(payment);

    try {
      // 3. 执行支付（这里应该调用合约或支付服务）
      // TODO: 实际调用智能合约执行支付
      await this.executePaymentOnChain(savedPayment.id, recipient, amount);

      // 4. 更新授权使用量
      await this.updateGrantUsage(grant, amount);

      // 5. 更新支付状态
      savedPayment.status = PaymentStatus.COMPLETED;
      savedPayment.transactionHash = `0x${Date.now().toString(16)}`;

      return this.paymentRepository.save(savedPayment);
    } catch (error) {
      this.logger.error('自动支付执行失败:', error);
      savedPayment.status = PaymentStatus.FAILED;
      await this.paymentRepository.save(savedPayment);
      throw error;
    }
  }

  /**
   * 验证授权
   */
  private async validateGrant(
    grantId: string,
    userId: string,
    agentId: string,
    amount: number,
  ): Promise<AutoPayGrant> {
    const grant = await this.grantRepository.findOne({
      where: { id: grantId, userId, agentId },
    });

    if (!grant) {
      throw new Error('授权不存在');
    }

    if (!grant.isActive) {
      throw new Error('授权已失效');
    }

    if (new Date() > grant.expiresAt) {
      grant.isActive = false;
      await this.grantRepository.save(grant);
      throw new Error('授权已过期');
    }

    // 检查单次限额
    if (amount > grant.singleLimit) {
      throw new Error(`支付金额超过单次限额 ${grant.singleLimit}`);
    }

    // 检查每日限额（需要重置每日使用量）
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const grantDate = new Date(grant.updatedAt);
    grantDate.setHours(0, 0, 0, 0);

    if (grantDate.getTime() < today.getTime()) {
      // 新的一天，重置使用量
      grant.usedToday = 0;
    }

    if (grant.usedToday + amount > grant.dailyLimit) {
      throw new Error(
        `支付金额超过每日限额 ${grant.dailyLimit}，今日已用 ${grant.usedToday}`,
      );
    }

    return grant;
  }

  /**
   * 更新授权使用量
   */
  private async updateGrantUsage(
    grant: AutoPayGrant,
    amount: number,
  ): Promise<void> {
    grant.usedToday += amount;
    grant.totalUsed += amount;
    await this.grantRepository.save(grant);
  }

  /**
   * 在链上执行支付（调用智能合约）
   */
  private async executePaymentOnChain(
    paymentId: string,
    recipient: string,
    amount: number,
  ): Promise<void> {
    // TODO: 实际调用智能合约
    // 1. 连接合约
    // 2. 调用 executeAutoPayment 方法
    // 3. 等待交易确认
    this.logger.log(
      `执行链上支付: paymentId=${paymentId}, recipient=${recipient}, amount=${amount}`,
    );
  }

  /**
   * 清理过期授权
   */
  async cleanupExpiredGrants(): Promise<number> {
    const expiredGrants = await this.grantRepository.find({
      where: {
        expiresAt: LessThan(new Date()),
        isActive: true,
      },
    });

    for (const grant of expiredGrants) {
      grant.isActive = false;
      await this.grantRepository.save(grant);
    }

    return expiredGrants.length;
  }
}

