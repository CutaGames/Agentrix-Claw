import { Injectable, Logger, Inject, forwardRef, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { PaymentService } from './payment.service';
import { Payment, PaymentStatus, PaymentMethod } from '../../entities/payment.entity';
import { StripeSettlement, StripeSettlementStatus } from '../../entities/stripe-settlement.entity';
import { CommissionService } from '../commission/commission.service';
import { AuditProofService } from '../commission/audit-proof.service';
import { PetOverageBillingService } from '../pet-gen-quota/pet-overage-billing.service';

/**
 * Stripe 支付分佣记录接口
 * 用于批量结算时使用
 */
export interface StripeCommissionRecord {
  paymentIntentId: string;
  paymentId: string;
  amount: number;
  currency: string;
  stripeFee: number;
  netAmount: number;
  merchantId?: string;
  agentId?: string;
  skillLayerType?: string;
  commissionRate?: number;
  platformCommission: number;
  merchantAmount: number;
  agentAmount: number;
  orderId?: string;
  settledAt?: Date;
  settlementStatus: 'pending' | 'processing' | 'settled' | 'failed';
}

@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);
  private stripe: Stripe | null = null;
  private webhookSecret: string;

  constructor(
    private configService: ConfigService,
    private paymentService: PaymentService,
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(StripeSettlement)
    private stripeSettlementRepository: Repository<StripeSettlement>,
    @Inject(forwardRef(() => CommissionService))
    private commissionService: CommissionService,
    @Inject(forwardRef(() => AuditProofService))
    private auditProofService: AuditProofService,
    @Optional() private petOverageBilling?: PetOverageBillingService,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      this.logger.warn('STRIPE_SECRET_KEY is not configured. Stripe webhook features will be disabled.');
      this.logger.warn('To enable Stripe webhooks, add STRIPE_SECRET_KEY to your .env file');
    } else {
      this.stripe = new Stripe(secretKey, {
        apiVersion: '2023-08-16',
      });
    }
    this.webhookSecret = this.configService.get<string>(
      'STRIPE_WEBHOOK_SECRET',
      '',
    );
  }

  async handleWebhook(rawBody: Buffer, signature: string) {
    if (!this.stripe) {
      throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY in your .env file');
    }

    let event: Stripe.Event;

    try {
      // 验证Webhook签名
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret,
      );
    } catch (err: any) {
      this.logger.error('Webhook签名验证失败:', err.message);
      throw new Error(`Webhook Error: ${err.message}`);
    }

    this.logger.log(`Received Stripe event: ${event.type}, event_id: ${event.id}`);

    // 幂等性检查：检查是否已处理过此事件
    const existingSettlement = await this.stripeSettlementRepository.findOne({
      where: { stripeEventId: event.id },
    });
    if (existingSettlement) {
      this.logger.log(`Event ${event.id} already processed, skipping (idempotent)`);
      return { received: true, idempotent: true };
    }

    // 处理不同类型的事件
    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent, event.id);
        break;
      case 'payment_intent.payment_failed':
        await this.handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
        break;
      case 'payment_intent.canceled':
        await this.handlePaymentIntentCanceled(event.data.object as Stripe.PaymentIntent);
        break;
      case 'charge.refunded':
        await this.handleChargeRefunded(event.data.object as Stripe.Charge);
        break;
      case 'charge.dispute.created':
        await this.handleDisputeCreated(event.data.object as Stripe.Dispute);
        break;
      default:
        this.logger.log(`未处理的事件类型: ${event.type}`);
    }

    return { received: true };
  }

  private async handlePaymentIntentSucceeded(
    paymentIntent: Stripe.PaymentIntent,
    eventId: string,
  ) {
    this.logger.log(`支付成功: ${paymentIntent.id}, amount: ${paymentIntent.amount}`);

    try {
      const metadata = paymentIntent.metadata;
      const paymentId = metadata?.paymentId;

      // 1. 幂等性检查：检查 Payment 是否已完成
      if (paymentId) {
        const existingPayment = await this.paymentRepository.findOne({
          where: { id: paymentId },
        });
        if (existingPayment?.status === PaymentStatus.COMPLETED) {
          this.logger.log(`Payment ${paymentId} already completed, skipping (idempotent)`);
          return;
        }

        // 2. 更新支付状态
        await this.paymentService.updatePaymentStatus(
          paymentId,
          PaymentStatus.COMPLETED,
          paymentIntent.id,
        );

        // 3. 更新 Payment 记录的 transactionHash
        await this.paymentRepository.update(paymentId, {
          transactionHash: paymentIntent.id,
          status: PaymentStatus.COMPLETED,
        });
      }

      // 4. 持久化结算记录到数据库（替代内存存储）
      const settlement = await this.recordCommissionForSettlement(paymentIntent, eventId);

      // 5. 创建审计存证
      await this.createAuditProof(paymentIntent, settlement);

      // 6. Phase 2 W3 BE-T2.5—如果是 pet_overage 购买，同步发起 quota.confirm
      if (this.petOverageBilling) {
        try {
          await this.petOverageBilling.handlePaymentIntentSucceeded({
            paymentIntentId: paymentIntent.id,
            amount: paymentIntent.amount / 100,
            metadata: paymentIntent.metadata as any,
          });
        } catch (overageErr: any) {
          this.logger.error(
            `pet_overage bridge failed paymentIntent=${paymentIntent.id}: ${overageErr?.message || overageErr}`,
          );
          // intentional: do not throw, otherwise Stripe will retry the entire webhook
        }
      }

      this.logger.log(`Payment ${paymentId} completed, settlement ${settlement.id} recorded with audit proof`);
    } catch (error) {
      this.logger.error('更新支付状态失败:', error);
      throw error; // 抛出错误以便 Stripe 重试
    }
  }

  /**
   * V5.0 分账费率配置
   */
  private readonly V5_FEE_CONFIGS: Record<string, {
    baseFeeRate: number;
    poolRate: number;
  }> = {
    'PHYSICAL': { baseFeeRate: 0.005, poolRate: 0.025 },
    'DIGITAL': { baseFeeRate: 0.01, poolRate: 0.04 },
    'SERVICE': { baseFeeRate: 0.015, poolRate: 0.065 },
    'INFRA': { baseFeeRate: 0.005, poolRate: 0.02 },
    'RESOURCE': { baseFeeRate: 0.005, poolRate: 0.025 },
    'LOGIC': { baseFeeRate: 0.01, poolRate: 0.04 },
    'COMPOSITE': { baseFeeRate: 0.02, poolRate: 0.08 },
  };

  private readonly V5_SPLIT_RATIOS = {
    executionAgentRatio: 0.70,
    recommendationAgentRatio: 0.30,
    referralAgentRatio: 0.20,
  };

  /**
   * 记录分佣信息到数据库（V5.0 持久化）
   */
  private async recordCommissionForSettlement(
    paymentIntent: Stripe.PaymentIntent,
    eventId: string,
  ): Promise<StripeSettlement> {
    const metadata = paymentIntent.metadata;
    const amount = paymentIntent.amount / 100;
    const currency = paymentIntent.currency.toUpperCase();

    // 检查是否已存在
    const existing = await this.stripeSettlementRepository.findOne({
      where: { paymentIntentId: paymentIntent.id },
    });
    if (existing) {
      this.logger.log(`Settlement for ${paymentIntent.id} already exists`);
      return existing;
    }

    // 获取商品类型（默认 PHYSICAL）
    const productType = metadata?.productType || metadata?.skillLayerType || 'PHYSICAL';
    const config = this.V5_FEE_CONFIGS[productType] || this.V5_FEE_CONFIGS['PHYSICAL'];

    // 1. Stripe 通道费
    const stripeFee = amount * 0.029 + 0.30;
    const netAmount = amount - stripeFee;

    // 2. 平台管理费 + 激励池（基于总金额）
    const baseFee = amount * config.baseFeeRate;
    const poolFee = amount * config.poolRate;
    const platformCommission = baseFee + poolFee;

    // 3. 商户最终所得
    const merchantAmount = netAmount - platformCommission;

    // 4. V5.0 激励池分配
    const hasExecutionAgent = !!metadata?.executionAgentId;
    const hasRecommendationAgent = !!metadata?.recommendationAgentId;
    const hasReferralAgent = !!metadata?.referralAgentId;

    const executionAgentAmount = hasExecutionAgent 
      ? poolFee * this.V5_SPLIT_RATIOS.executionAgentRatio 
      : 0;
    const recommendationAgentAmount = hasRecommendationAgent 
      ? poolFee * this.V5_SPLIT_RATIOS.recommendationAgentRatio 
      : 0;
    const referralAgentAmount = hasReferralAgent 
      ? baseFee * this.V5_SPLIT_RATIOS.referralAgentRatio 
      : 0;

    // 未分配的归平台
    const unallocatedPool = poolFee - executionAgentAmount - recommendationAgentAmount;
    const platformNetAmount = (baseFee - referralAgentAmount) + unallocatedPool;

    // 旧版兼容：agentAmount = executionAgentAmount
    const agentAmount = executionAgentAmount;

    // 创建结算记录
    const settlement = this.stripeSettlementRepository.create({
      paymentIntentId: paymentIntent.id,
      paymentId: metadata?.paymentId || null,
      orderId: metadata?.orderId || null,
      amount,
      currency,
      stripeFee: Math.round(stripeFee * 100) / 100,
      netAmount: Math.round(netAmount * 100) / 100,
      
      // 商户信息
      merchantId: metadata?.merchantId || null,
      stripeConnectAccountId: metadata?.stripeConnectAccountId || null,
      
      // V5.0 Agent 信息
      agentId: metadata?.agentId || metadata?.executionAgentId || null,
      executionAgentId: metadata?.executionAgentId || null,
      executionAgentConnectId: metadata?.executionAgentConnectId || null,
      recommendationAgentId: metadata?.recommendationAgentId || null,
      recommendationAgentConnectId: metadata?.recommendationAgentConnectId || null,
      referralAgentId: metadata?.referralAgentId || null,
      referralAgentConnectId: metadata?.referralAgentConnectId || null,
      
      // 分账配置
      productType,
      skillLayerType: metadata?.skillLayerType || 'LOGIC',
      commissionRate: config.baseFeeRate + config.poolRate,
      
      // V5.0 费用明细
      baseFee: Math.round(baseFee * 100) / 100,
      poolFee: Math.round(poolFee * 100) / 100,
      platformCommission: Math.round(platformCommission * 100) / 100,
      platformNetAmount: Math.round(platformNetAmount * 100) / 100,
      
      // 各方金额
      merchantAmount: Math.round(merchantAmount * 100) / 100,
      agentAmount: Math.round(agentAmount * 100) / 100,
      executionAgentAmount: Math.round(executionAgentAmount * 100) / 100,
      recommendationAgentAmount: Math.round(recommendationAgentAmount * 100) / 100,
      referralAgentAmount: Math.round(referralAgentAmount * 100) / 100,
      
      status: StripeSettlementStatus.PENDING,
      stripeEventId: eventId,
      metadata: {
        stripeChargeId: paymentIntent.latest_charge,
        paymentMethodType: paymentIntent.payment_method_types?.[0],
        description: metadata?.description,
        v5Split: {
          baseFeeRate: `${config.baseFeeRate * 100}%`,
          poolRate: `${config.poolRate * 100}%`,
          totalRate: `${(config.baseFeeRate + config.poolRate) * 100}%`,
        },
      },
    });

    const saved = await this.stripeSettlementRepository.save(settlement);
    
    this.logger.log(`V5.0 Settlement ${saved.id} recorded:`);
    this.logger.log(`  商户: $${saved.merchantAmount}`);
    this.logger.log(`  执行Agent: $${saved.executionAgentAmount}`);
    this.logger.log(`  推荐Agent: $${saved.recommendationAgentAmount}`);
    this.logger.log(`  推广Agent: $${saved.referralAgentAmount}`);
    this.logger.log(`  平台净收益: $${saved.platformNetAmount}`);

    return saved;
  }

  /**
   * 创建审计存证
   * 解决 P1 审计存证问题
   */
  private async createAuditProof(
    paymentIntent: Stripe.PaymentIntent,
    settlement: StripeSettlement,
  ): Promise<void> {
    try {
      const metadata = paymentIntent.metadata;
      
      // 构建审计数据
      const auditData = {
        type: 'stripe_payment_succeeded',
        paymentIntentId: paymentIntent.id,
        settlementId: settlement.id,
        amount: settlement.amount,
        currency: settlement.currency,
        stripeFee: settlement.stripeFee,
        netAmount: settlement.netAmount,
        platformCommission: settlement.platformCommission,
        merchantAmount: settlement.merchantAmount,
        agentAmount: settlement.agentAmount,
        skillLayerType: settlement.skillLayerType,
        commissionRate: settlement.commissionRate,
        merchantId: settlement.merchantId,
        agentId: settlement.agentId,
        timestamp: new Date().toISOString(),
      };

      // 调用 AuditProofService 创建存证
      const proof = await this.auditProofService.createProof({
        orderId: metadata?.orderId || settlement.paymentIntentId,
        taskId: `stripe_settlement_${settlement.id}`,
        taskDescription: `Stripe payment settlement for ${paymentIntent.id}`,
        expectedResultHash: this.hashData(auditData),
        creator: metadata?.merchantId || 'platform',
        executor: 'stripe_webhook_service',
        amount: settlement.amount,
        currency: settlement.currency,
        metadata: auditData,
      });

      // 更新结算记录的审计哈希
      settlement.auditProofHash = proof.id;
      await this.stripeSettlementRepository.save(settlement);

      this.logger.log(`Audit proof ${proof.id} created for settlement ${settlement.id}`);
    } catch (error) {
      // 审计存证失败不应阻止支付处理，只记录警告
      this.logger.warn(`Failed to create audit proof for settlement ${settlement.id}:`, error);
    }
  }

  /**
   * 计算数据哈希
   */
  private hashData(data: any): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  }

  /**
   * 根据技能层类型获取分佣率（V5 分佣机制）
   */
  private getCommissionRateBySkillLayer(skillLayerType: string): number {
    const rates: Record<string, number> = {
      'INFRA': 0.025,      // 2.5% - 基础设施层
      'RESOURCE': 0.03,    // 3% - 资源层
      'LOGIC': 0.05,       // 5% - 逻辑层
      'COMPOSITE': 0.10,   // 10% - 复合层
    };
    return rates[skillLayerType] || rates['LOGIC'];
  }

  /**
   * 获取待结算记录（从数据库）
   */
  async getPendingSettlements(): Promise<StripeSettlement[]> {
    return await this.stripeSettlementRepository.find({
      where: { status: StripeSettlementStatus.PENDING },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * 获取指定状态的结算记录
   */
  async getSettlementsByStatus(status: StripeSettlementStatus): Promise<StripeSettlement[]> {
    return await this.stripeSettlementRepository.find({
      where: { status },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * 更新结算状态
   */
  async updateSettlementStatus(
    settlementId: string,
    status: StripeSettlementStatus,
    additionalData?: Partial<StripeSettlement>,
  ): Promise<StripeSettlement> {
    const settlement = await this.stripeSettlementRepository.findOne({
      where: { id: settlementId },
    });
    if (!settlement) {
      throw new Error(`Settlement ${settlementId} not found`);
    }

    settlement.status = status;
    if (additionalData) {
      Object.assign(settlement, additionalData);
    }
    if (status === StripeSettlementStatus.SETTLED) {
      settlement.settledAt = new Date();
    }

    return await this.stripeSettlementRepository.save(settlement);
  }

  /**
   * 执行批量结算（从数据库读取）
   */
  async executeBatchSettlement(): Promise<{
    processed: number;
    totalMerchantAmount: number;
    totalAgentAmount: number;
    totalPlatformAmount: number;
  }> {
    const pendingRecords = await this.getPendingSettlements();
    const now = new Date();
    
    let processed = 0;
    let totalMerchantAmount = 0;
    let totalAgentAmount = 0;
    let totalPlatformAmount = 0;

    for (const record of pendingRecords) {
      try {
        // 标记为处理中
        record.status = StripeSettlementStatus.PROCESSING;
        await this.stripeSettlementRepository.save(record);

        // TODO: 实际的结算逻辑
        // 1. 调用 Stripe Connect 转账给商户（如果使用 Connect）
        // 2. 或者记录到平台结算表，等待手动/定时打款

        // 累计金额
        totalMerchantAmount += Number(record.merchantAmount);
        totalAgentAmount += Number(record.agentAmount);
        totalPlatformAmount += Number(record.platformCommission);

        // 标记为已结算
        record.status = StripeSettlementStatus.SETTLED;
        record.settledAt = now;
        await this.stripeSettlementRepository.save(record);
        processed++;

        this.logger.log(`Settlement completed for ${record.paymentIntentId}`);
      } catch (error) {
        record.status = StripeSettlementStatus.FAILED;
        record.failureReason = error instanceof Error ? error.message : String(error);
        await this.stripeSettlementRepository.save(record);
        this.logger.error(`Settlement failed for ${record.paymentIntentId}:`, error);
      }
    }

    return {
      processed,
      totalMerchantAmount: Math.round(totalMerchantAmount * 100) / 100,
      totalAgentAmount: Math.round(totalAgentAmount * 100) / 100,
      totalPlatformAmount: Math.round(totalPlatformAmount * 100) / 100,
    };
  }

  private async handlePaymentIntentFailed(
    paymentIntent: Stripe.PaymentIntent,
  ) {
    this.logger.log(`支付失败: ${paymentIntent.id}`);

    try {
      const paymentId = paymentIntent.metadata?.paymentId;
      if (paymentId) {
        await this.paymentService.updatePaymentStatus(
          paymentId,
          PaymentStatus.FAILED,
        );
      }
    } catch (error) {
      this.logger.error('更新支付状态失败:', error);
    }
  }

  private async handlePaymentIntentCanceled(
    paymentIntent: Stripe.PaymentIntent,
  ) {
    this.logger.log(`支付取消: ${paymentIntent.id}`);

    try {
      const paymentId = paymentIntent.metadata?.paymentId;
      if (paymentId) {
        await this.paymentService.updatePaymentStatus(
          paymentId,
          PaymentStatus.CANCELLED,
        );
      }
    } catch (error) {
      this.logger.error('更新支付状态失败:', error);
    }
  }

  /**
   * 处理退款事件
   */
  private async handleChargeRefunded(charge: Stripe.Charge) {
    this.logger.log(`退款事件: ${charge.id}, amount_refunded: ${charge.amount_refunded}`);

    try {
      const paymentIntentId = typeof charge.payment_intent === 'string' 
        ? charge.payment_intent 
        : charge.payment_intent?.id;

      if (paymentIntentId) {
        // 查找对应的支付记录
        const payment = await this.paymentRepository.findOne({
          where: { transactionHash: paymentIntentId },
        });

        if (payment) {
          // 如果全额退款
          if (charge.amount_refunded >= charge.amount) {
            payment.status = PaymentStatus.REFUNDED;
          }
          payment.metadata = {
            ...payment.metadata,
            refundedAmount: charge.amount_refunded / 100,
            refundedAt: new Date().toISOString(),
          };
          await this.paymentRepository.save(payment);

          // 更新数据库中的结算记录状态
          const settlement = await this.stripeSettlementRepository.findOne({
            where: { paymentIntentId },
          });
          if (settlement) {
            settlement.status = StripeSettlementStatus.REFUNDED;
            settlement.metadata = {
              ...settlement.metadata,
              refundedAmount: charge.amount_refunded / 100,
              refundedAt: new Date().toISOString(),
            };
            await this.stripeSettlementRepository.save(settlement);
          }
        }
      }
    } catch (error) {
      this.logger.error('处理退款事件失败:', error);
    }
  }

  /**
   * 处理争议事件
   */
  private async handleDisputeCreated(dispute: Stripe.Dispute) {
    this.logger.log(`争议创建: ${dispute.id}, reason: ${dispute.reason}`);

    try {
      const paymentIntentId = typeof dispute.payment_intent === 'string'
        ? dispute.payment_intent
        : dispute.payment_intent?.id;

      if (paymentIntentId) {
        // 更新数据库中的结算记录状态
        const settlement = await this.stripeSettlementRepository.findOne({
          where: { paymentIntentId },
        });
        if (settlement) {
          settlement.status = StripeSettlementStatus.DISPUTED;
          settlement.metadata = {
            ...settlement.metadata,
            disputeId: dispute.id,
            disputeReason: dispute.reason,
            disputeCreatedAt: new Date().toISOString(),
          };
          await this.stripeSettlementRepository.save(settlement);
          this.logger.warn(`Settlement ${settlement.id} marked as disputed due to dispute ${dispute.id}`);
        }

        // 查找并更新支付记录
        const payment = await this.paymentRepository.findOne({
          where: { transactionHash: paymentIntentId },
        });

        if (payment) {
          payment.metadata = {
            ...payment.metadata,
            disputeId: dispute.id,
            disputeReason: dispute.reason,
            disputeCreatedAt: new Date().toISOString(),
          };
          await this.paymentRepository.save(payment);
        }
      }
    } catch (error) {
      this.logger.error('处理争议事件失败:', error);
    }
  }
}

