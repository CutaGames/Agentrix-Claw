import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { StripeSettlement, StripeSettlementStatus } from '../../entities/stripe-settlement.entity';

/**
 * Stripe Connect 账户类型
 */
export enum StripeConnectAccountType {
  STANDARD = 'standard',   // 标准账户：商户管理自己的 Stripe 设置
  EXPRESS = 'express',     // Express 账户：简化的入驻流程，部分功能由平台控制
  CUSTOM = 'custom',       // 自定义账户：完全由平台控制
}

/**
 * Connect 账户创建参数
 */
export interface CreateConnectAccountParams {
  email: string;
  merchantId: string;
  merchantName?: string;
  country?: string;
  accountType?: StripeConnectAccountType;
  businessType?: 'individual' | 'company';
  metadata?: Record<string, string>;
}

/**
 * Transfer 参数
 */
export interface CreateTransferParams {
  amount: number;          // 金额（美元）
  currency?: string;
  destinationAccountId: string;  // 目标 Connect 账户 ID
  sourceTransaction?: string;    // 关联的 charge ID
  description?: string;
  metadata?: Record<string, string>;
}

/**
 * Stripe Connect 服务
 * 
 * 实现原生分账功能，解决：
 * 1. 平台资金归集问题：资金直接进入平台账户
 * 2. 商户分账：通过 Transfer API 自动分账给商户
 * 3. 分佣自动化：在支付成功后自动执行分账
 * 
 * 支持两种分账模式：
 * - Destination Charges：支付时直接指定目标账户（推荐）
 * - Separate Charges and Transfers：先收款后转账
 */
@Injectable()
export class StripeConnectService {
  private readonly logger = new Logger(StripeConnectService.name);
  private stripe: Stripe | null = null;
  private readonly isConfigured: boolean = false;
  private readonly platformAccountId: string;

  constructor(
    private configService: ConfigService,
    @InjectRepository(StripeSettlement)
    private stripeSettlementRepository: Repository<StripeSettlement>,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      this.logger.warn('STRIPE_SECRET_KEY is not configured. Stripe Connect will be disabled.');
    } else {
      this.stripe = new Stripe(secretKey, {
        apiVersion: '2023-08-16',
      });
      this.isConfigured = true;
      this.logger.log('✅ Stripe Connect service initialized');
    }
    this.platformAccountId = this.configService.get<string>('STRIPE_PLATFORM_ACCOUNT_ID', '');
  }

  /**
   * 检查 Stripe Connect 是否已配置
   */
  isConnectConfigured(): boolean {
    return this.isConfigured;
  }

  // ==================== 账户管理 ====================

  /**
   * 创建 Connect 账户（商户入驻）
   * 
   * 推荐使用 Express 账户类型，简化入驻流程
   */
  async createConnectAccount(params: CreateConnectAccountParams): Promise<Stripe.Account> {
    if (!this.stripe) {
      throw new Error('Stripe is not configured');
    }

    const accountType = params.accountType || StripeConnectAccountType.EXPRESS;

    const accountParams: Stripe.AccountCreateParams = {
      type: accountType,
      email: params.email,
      country: params.country || 'US',
      business_type: params.businessType || 'individual',
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: {
        agentrixMerchantId: params.merchantId,
        merchantName: params.merchantName || '',
        platform: 'agentrix',
        ...params.metadata,
      },
    };

    // Express 账户需要额外的 business_profile
    if (accountType === StripeConnectAccountType.EXPRESS) {
      accountParams.business_profile = {
        name: params.merchantName,
        product_description: 'Agentrix merchant services',
      };
    }

    const account = await this.stripe.accounts.create(accountParams);
    this.logger.log(`Created Connect account: ${account.id} for merchant: ${params.merchantId}`);

    return account;
  }

  /**
   * 生成账户入驻链接（Account Link）
   * 
   * 用于商户完成 KYC 和银行账户绑定
   */
  async createAccountLink(
    accountId: string,
    refreshUrl: string,
    returnUrl: string,
  ): Promise<Stripe.AccountLink> {
    if (!this.stripe) {
      throw new Error('Stripe is not configured');
    }

    const accountLink = await this.stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });

    this.logger.log(`Created account link for: ${accountId}`);
    return accountLink;
  }

  /**
   * 获取 Connect 账户信息
   */
  async getAccount(accountId: string): Promise<Stripe.Account> {
    if (!this.stripe) {
      throw new Error('Stripe is not configured');
    }
    return await this.stripe.accounts.retrieve(accountId);
  }

  /**
   * 检查账户是否已完成入驻
   */
  async isAccountOnboarded(accountId: string): Promise<boolean> {
    const account = await this.getAccount(accountId);
    return account.charges_enabled && account.payouts_enabled;
  }

  /**
   * 获取账户余额
   */
  async getAccountBalance(accountId: string): Promise<Stripe.Balance> {
    if (!this.stripe) {
      throw new Error('Stripe is not configured');
    }
    return await this.stripe.balance.retrieve({
      stripeAccount: accountId,
    });
  }

  // ==================== 分账功能 ====================

  /**
   * 创建 Transfer（分账转账）
   * 
   * 将资金从平台账户转移到商户的 Connect 账户
   */
  async createTransfer(params: CreateTransferParams): Promise<Stripe.Transfer> {
    if (!this.stripe) {
      throw new Error('Stripe is not configured');
    }

    const amount = Math.round(params.amount * 100); // 转换为分
    const currency = params.currency?.toLowerCase() || 'usd';

    const transferParams: Stripe.TransferCreateParams = {
      amount,
      currency,
      destination: params.destinationAccountId,
      ...(params.sourceTransaction && { source_transaction: params.sourceTransaction }),
      ...(params.description && { description: params.description }),
      metadata: {
        platform: 'agentrix',
        ...params.metadata,
      },
    };

    const transfer = await this.stripe.transfers.create(transferParams);
    this.logger.log(`Created transfer: ${transfer.id}, amount: ${params.amount} ${currency.toUpperCase()} to ${params.destinationAccountId}`);

    return transfer;
  }

  /**
   * 创建带目标账户的 PaymentIntent（Destination Charges）
   * 
   * 这是推荐的分账方式：
   * - 资金先进入平台账户
   * - 自动扣除平台分佣后转入商户账户
   * - 支持设置 application_fee_amount（平台手续费）
   */
  async createPaymentIntentWithDestination(params: {
    amount: number;
    currency?: string;
    destinationAccountId: string;
    applicationFeeAmount: number;  // 平台收取的手续费（美元）
    paymentMethodTypes?: string[];
    metadata?: Record<string, string>;
    customerId?: string;
  }): Promise<{
    clientSecret: string;
    paymentIntentId: string;
    destinationAccountId: string;
    applicationFeeAmount: number;
  }> {
    if (!this.stripe) {
      throw new Error('Stripe is not configured');
    }

    const amount = Math.round(params.amount * 100);
    const applicationFeeAmount = Math.round(params.applicationFeeAmount * 100);
    const currency = params.currency?.toLowerCase() || 'usd';

    const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
      amount,
      currency,
      automatic_payment_methods: { enabled: true },
      // 关键：使用 transfer_data 实现自动分账
      transfer_data: {
        destination: params.destinationAccountId,
      },
      // 平台手续费（会自动留在平台账户）
      application_fee_amount: applicationFeeAmount,
      metadata: {
        platform: 'agentrix',
        destinationAccountId: params.destinationAccountId,
        applicationFeeAmount: params.applicationFeeAmount.toString(),
        ...params.metadata,
      },
    };

    if (params.customerId) {
      paymentIntentParams.customer = params.customerId;
    }

    const paymentIntent = await this.stripe.paymentIntents.create(paymentIntentParams);

    this.logger.log(`Created PaymentIntent with destination: ${paymentIntent.id}, fee: ${params.applicationFeeAmount}`);

    return {
      clientSecret: paymentIntent.client_secret!,
      paymentIntentId: paymentIntent.id,
      destinationAccountId: params.destinationAccountId,
      applicationFeeAmount: params.applicationFeeAmount,
    };
  }

  /**
   * 执行结算分账（基于数据库记录）
   * 
   * 用于 T+3 批量结算时，将商户应得金额转入其 Connect 账户
   */
  async executeSettlementTransfer(settlementId: string): Promise<{
    settlement: StripeSettlement;
    transfer?: Stripe.Transfer;
    success: boolean;
    error?: string;
  }> {
    const settlement = await this.stripeSettlementRepository.findOne({
      where: { id: settlementId },
    });

    if (!settlement) {
      return { settlement: null!, success: false, error: 'Settlement not found' };
    }

    if (settlement.status !== StripeSettlementStatus.PENDING) {
      return { settlement, success: false, error: `Settlement is not pending (status: ${settlement.status})` };
    }

    if (!settlement.stripeConnectAccountId) {
      // 没有 Connect 账户，标记为需要手动结算
      settlement.metadata = {
        ...settlement.metadata,
        requiresManualSettlement: true,
        reason: 'No Stripe Connect account configured',
      };
      await this.stripeSettlementRepository.save(settlement);
      return { settlement, success: false, error: 'Merchant has no Stripe Connect account' };
    }

    try {
      // 更新状态为处理中
      settlement.status = StripeSettlementStatus.PROCESSING;
      await this.stripeSettlementRepository.save(settlement);

      // 执行转账
      const transfer = await this.createTransfer({
        amount: Number(settlement.merchantAmount),
        currency: settlement.currency,
        destinationAccountId: settlement.stripeConnectAccountId,
        description: `Settlement for payment ${settlement.paymentIntentId}`,
        metadata: {
          settlementId: settlement.id,
          paymentIntentId: settlement.paymentIntentId,
          merchantId: settlement.merchantId || '',
        },
      });

      // 更新结算记录
      settlement.status = StripeSettlementStatus.SETTLED;
      settlement.stripeTransferId = transfer.id;
      settlement.transferredAt = new Date();
      settlement.settledAt = new Date();
      await this.stripeSettlementRepository.save(settlement);

      this.logger.log(`Settlement ${settlementId} transferred successfully: ${transfer.id}`);
      return { settlement, transfer, success: true };

    } catch (error) {
      settlement.status = StripeSettlementStatus.FAILED;
      settlement.failureReason = error instanceof Error ? error.message : String(error);
      await this.stripeSettlementRepository.save(settlement);

      this.logger.error(`Settlement ${settlementId} transfer failed:`, error);
      return { settlement, success: false, error: settlement.failureReason };
    }
  }

  /**
   * 批量执行结算分账
   */
  async executeBatchSettlementTransfers(settlementIds: string[]): Promise<{
    total: number;
    succeeded: number;
    failed: number;
    results: Array<{ settlementId: string; success: boolean; error?: string }>;
  }> {
    const results: Array<{ settlementId: string; success: boolean; error?: string }> = [];
    let succeeded = 0;
    let failed = 0;

    for (const settlementId of settlementIds) {
      const result = await this.executeSettlementTransfer(settlementId);
      results.push({
        settlementId,
        success: result.success,
        error: result.error,
      });
      if (result.success) {
        succeeded++;
      } else {
        failed++;
      }
    }

    return {
      total: settlementIds.length,
      succeeded,
      failed,
      results,
    };
  }

  // ==================== 报表与查询 ====================

  /**
   * 获取平台账户的 Transfer 列表
   */
  async listTransfers(params?: {
    destinationAccountId?: string;
    limit?: number;
    startingAfter?: string;
    createdGte?: Date;
    createdLte?: Date;
  }): Promise<Stripe.ApiList<Stripe.Transfer>> {
    if (!this.stripe) {
      throw new Error('Stripe is not configured');
    }

    const listParams: Stripe.TransferListParams = {
      limit: params?.limit || 100,
    };

    if (params?.destinationAccountId) {
      listParams.destination = params.destinationAccountId;
    }
    if (params?.startingAfter) {
      listParams.starting_after = params.startingAfter;
    }
    if (params?.createdGte || params?.createdLte) {
      listParams.created = {};
      if (params?.createdGte) {
        listParams.created.gte = Math.floor(params.createdGte.getTime() / 1000);
      }
      if (params?.createdLte) {
        listParams.created.lte = Math.floor(params.createdLte.getTime() / 1000);
      }
    }

    return await this.stripe.transfers.list(listParams);
  }

  /**
   * 获取应用费用（Application Fee）列表
   * 
   * 这些是平台通过 application_fee_amount 收取的费用
   */
  async listApplicationFees(params?: {
    chargeId?: string;
    limit?: number;
    startingAfter?: string;
  }): Promise<Stripe.ApiList<Stripe.ApplicationFee>> {
    if (!this.stripe) {
      throw new Error('Stripe is not configured');
    }

    return await this.stripe.applicationFees.list({
      limit: params?.limit || 100,
      ...(params?.chargeId && { charge: params.chargeId }),
      ...(params?.startingAfter && { starting_after: params.startingAfter }),
    });
  }

  /**
   * V5.0 分账费率配置
   * 不同商品类型对应不同的费率
   */
  private readonly V5_FEE_CONFIGS: Record<string, {
    baseFeeRate: number;      // 平台管理费率
    poolRate: number;         // 激励池费率
    description: string;
  }> = {
    // 实物商品：总佣金 3%
    'PHYSICAL': { baseFeeRate: 0.005, poolRate: 0.025, description: '实物商品' },
    // 数字商品：总佣金 5%
    'DIGITAL': { baseFeeRate: 0.01, poolRate: 0.04, description: '数字商品' },
    // 服务类：总佣金 8%
    'SERVICE': { baseFeeRate: 0.015, poolRate: 0.065, description: '服务类' },
    // 技能调用（INFRA）：总佣金 2.5%
    'INFRA': { baseFeeRate: 0.005, poolRate: 0.02, description: '基础设施层技能' },
    // 技能调用（RESOURCE）：总佣金 3%
    'RESOURCE': { baseFeeRate: 0.005, poolRate: 0.025, description: '资源层技能' },
    // 技能调用（LOGIC）：总佣金 5%
    'LOGIC': { baseFeeRate: 0.01, poolRate: 0.04, description: '逻辑层技能' },
    // 技能调用（COMPOSITE）：总佣金 10%
    'COMPOSITE': { baseFeeRate: 0.02, poolRate: 0.08, description: '复合层技能' },
  };

  /**
   * V5.0 分账分配比例
   */
  private readonly V5_SPLIT_RATIOS = {
    // 激励池分配（执行:推荐 = 7:3）
    executionAgentRatio: 0.70,      // 执行 Agent 获得激励池的 70%
    recommendationAgentRatio: 0.30, // 推荐 Agent 获得激励池的 30%
    // 平台管理费分配
    referralAgentRatio: 0.20,       // 推广 Agent 获得平台管理费的 20%
    platformNetRatio: 0.80,         // 平台净收益获得平台管理费的 80%
  };

  /**
   * 计算 V5.0 分账明细
   * 
   * 分账模型：
   * 1. Stripe 通道费：2.9% + $0.30
   * 2. 平台管理费 (Base)：基于商品类型（如 0.5%）
   * 3. 激励池 (Pool)：基于商品类型（如 2.5%）
   * 4. 商户所得 = 净额 - 平台管理费 - 激励池
   * 
   * 激励池分配：执行 Agent 70% + 推荐 Agent 30%
   * 平台管理费分配：推广 Agent 20% + 平台净收益 80%
   * 
   * @param amount 总金额（美元）
   * @param productType 商品/技能类型
   * @param hasExecutionAgent 是否有执行 Agent
   * @param hasRecommendationAgent 是否有推荐 Agent
   * @param hasReferralAgent 是否有推广 Agent
   */
  calculateV5ConnectFees(
    amount: number,
    productType: string = 'PHYSICAL',
    hasExecutionAgent: boolean = false,
    hasRecommendationAgent: boolean = false,
    hasReferralAgent: boolean = false,
  ): {
    // 输入
    totalAmount: number;
    productType: string;
    
    // Stripe 费用
    stripeFee: number;
    netAmount: number;
    
    // 平台侧费用
    baseFee: number;              // 平台管理费总额
    poolFee: number;              // 激励池总额
    totalPlatformFee: number;     // 平台侧总扣除（baseFee + poolFee）
    
    // 各方分配
    merchantAmount: number;       // 商户最终所得
    executionAgentAmount: number; // 执行 Agent 所得
    recommendationAgentAmount: number; // 推荐 Agent 所得
    referralAgentAmount: number;  // 推广 Agent 所得
    platformNetAmount: number;    // 平台净收益
    
    // Transfer 指令（Stripe Connect 需要的）
    transfers: Array<{
      recipient: string;
      amount: number;
      description: string;
    }>;
    
    // 明细
    breakdown: {
      stripeRate: string;
      baseFeeRate: string;
      poolRate: string;
      totalCommissionRate: string;
    };
  } {
    // 获取费率配置
    const config = this.V5_FEE_CONFIGS[productType] || this.V5_FEE_CONFIGS['PHYSICAL'];
    const { baseFeeRate, poolRate } = config;
    
    // 1. Stripe 通道费（基于总金额）
    const stripeFee = amount * 0.029 + 0.30;
    const netAmount = amount - stripeFee;
    
    // 2. 平台管理费（基于总金额）
    const baseFee = amount * baseFeeRate;
    
    // 3. 激励池（基于总金额）
    const poolFee = amount * poolRate;
    
    // 4. 平台侧总扣除
    const totalPlatformFee = baseFee + poolFee;
    
    // 5. 商户最终所得
    const merchantAmount = netAmount - totalPlatformFee;
    
    // 6. 激励池分配
    const executionAgentAmount = hasExecutionAgent 
      ? poolFee * this.V5_SPLIT_RATIOS.executionAgentRatio 
      : 0;
    const recommendationAgentAmount = hasRecommendationAgent 
      ? poolFee * this.V5_SPLIT_RATIOS.recommendationAgentRatio 
      : 0;
    
    // 未分配的激励池归平台
    const unallocatedPool = poolFee - executionAgentAmount - recommendationAgentAmount;
    
    // 7. 平台管理费分配
    const referralAgentAmount = hasReferralAgent 
      ? baseFee * this.V5_SPLIT_RATIOS.referralAgentRatio 
      : 0;
    
    // 8. 平台净收益 = 平台管理费剩余 + 未分配的激励池
    const platformNetAmount = (baseFee - referralAgentAmount) + unallocatedPool;
    
    // 9. 生成 Transfer 指令
    const transfers: Array<{ recipient: string; amount: number; description: string }> = [];
    
    if (merchantAmount > 0) {
      transfers.push({
        recipient: 'merchant',
        amount: Math.round(merchantAmount * 100) / 100,
        description: 'Merchant settlement',
      });
    }
    
    if (executionAgentAmount > 0) {
      transfers.push({
        recipient: 'execution_agent',
        amount: Math.round(executionAgentAmount * 100) / 100,
        description: 'Execution Agent commission (70% of pool)',
      });
    }
    
    if (recommendationAgentAmount > 0) {
      transfers.push({
        recipient: 'recommendation_agent',
        amount: Math.round(recommendationAgentAmount * 100) / 100,
        description: 'Recommendation Agent commission (30% of pool)',
      });
    }
    
    if (referralAgentAmount > 0) {
      transfers.push({
        recipient: 'referral_agent',
        amount: Math.round(referralAgentAmount * 100) / 100,
        description: 'Referral Agent commission (20% of base fee)',
      });
    }
    
    return {
      totalAmount: amount,
      productType,
      stripeFee: Math.round(stripeFee * 100) / 100,
      netAmount: Math.round(netAmount * 100) / 100,
      baseFee: Math.round(baseFee * 100) / 100,
      poolFee: Math.round(poolFee * 100) / 100,
      totalPlatformFee: Math.round(totalPlatformFee * 100) / 100,
      merchantAmount: Math.round(merchantAmount * 100) / 100,
      executionAgentAmount: Math.round(executionAgentAmount * 100) / 100,
      recommendationAgentAmount: Math.round(recommendationAgentAmount * 100) / 100,
      referralAgentAmount: Math.round(referralAgentAmount * 100) / 100,
      platformNetAmount: Math.round(platformNetAmount * 100) / 100,
      transfers,
      breakdown: {
        stripeRate: '2.9% + $0.30',
        baseFeeRate: `${baseFeeRate * 100}%`,
        poolRate: `${poolRate * 100}%`,
        totalCommissionRate: `${(baseFeeRate + poolRate) * 100}%`,
      },
    };
  }

  /**
   * 执行 V5.0 多方分账（批量 Transfer）
   * 
   * @param paymentIntentId 原始支付的 PaymentIntent ID
   * @param feeCalculation 费用计算结果
   * @param accountIds 各方的 Stripe Connect 账户 ID
   */
  async executeV5Transfers(
    paymentIntentId: string,
    feeCalculation: ReturnType<typeof this.calculateV5ConnectFees>,
    accountIds: {
      merchantAccountId?: string;
      executionAgentAccountId?: string;
      recommendationAgentAccountId?: string;
      referralAgentAccountId?: string;
    },
  ): Promise<{
    success: boolean;
    transfers: Array<{
      recipient: string;
      transferId?: string;
      amount: number;
      error?: string;
    }>;
    platformRetained: number;
  }> {
    if (!this.stripe) {
      throw new Error('Stripe is not configured');
    }

    const results: Array<{
      recipient: string;
      transferId?: string;
      amount: number;
      error?: string;
    }> = [];

    // 获取原始 charge ID（用于 source_transaction）
    const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
    const chargeId = typeof paymentIntent.latest_charge === 'string' 
      ? paymentIntent.latest_charge 
      : paymentIntent.latest_charge?.id;

    // 1. Transfer to Merchant
    if (accountIds.merchantAccountId && feeCalculation.merchantAmount > 0) {
      try {
        const transfer = await this.createTransfer({
          amount: feeCalculation.merchantAmount,
          destinationAccountId: accountIds.merchantAccountId,
          sourceTransaction: chargeId,
          description: `Merchant settlement for ${paymentIntentId}`,
          metadata: {
            role: 'merchant',
            paymentIntentId,
          },
        });
        results.push({
          recipient: 'merchant',
          transferId: transfer.id,
          amount: feeCalculation.merchantAmount,
        });
      } catch (error) {
        results.push({
          recipient: 'merchant',
          amount: feeCalculation.merchantAmount,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // 2. Transfer to Execution Agent
    if (accountIds.executionAgentAccountId && feeCalculation.executionAgentAmount > 0) {
      try {
        const transfer = await this.createTransfer({
          amount: feeCalculation.executionAgentAmount,
          destinationAccountId: accountIds.executionAgentAccountId,
          sourceTransaction: chargeId,
          description: `Execution Agent commission for ${paymentIntentId}`,
          metadata: {
            role: 'execution_agent',
            paymentIntentId,
          },
        });
        results.push({
          recipient: 'execution_agent',
          transferId: transfer.id,
          amount: feeCalculation.executionAgentAmount,
        });
      } catch (error) {
        results.push({
          recipient: 'execution_agent',
          amount: feeCalculation.executionAgentAmount,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // 3. Transfer to Recommendation Agent
    if (accountIds.recommendationAgentAccountId && feeCalculation.recommendationAgentAmount > 0) {
      try {
        const transfer = await this.createTransfer({
          amount: feeCalculation.recommendationAgentAmount,
          destinationAccountId: accountIds.recommendationAgentAccountId,
          sourceTransaction: chargeId,
          description: `Recommendation Agent commission for ${paymentIntentId}`,
          metadata: {
            role: 'recommendation_agent',
            paymentIntentId,
          },
        });
        results.push({
          recipient: 'recommendation_agent',
          transferId: transfer.id,
          amount: feeCalculation.recommendationAgentAmount,
        });
      } catch (error) {
        results.push({
          recipient: 'recommendation_agent',
          amount: feeCalculation.recommendationAgentAmount,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // 4. Transfer to Referral Agent
    if (accountIds.referralAgentAccountId && feeCalculation.referralAgentAmount > 0) {
      try {
        const transfer = await this.createTransfer({
          amount: feeCalculation.referralAgentAmount,
          destinationAccountId: accountIds.referralAgentAccountId,
          sourceTransaction: chargeId,
          description: `Referral Agent commission for ${paymentIntentId}`,
          metadata: {
            role: 'referral_agent',
            paymentIntentId,
          },
        });
        results.push({
          recipient: 'referral_agent',
          transferId: transfer.id,
          amount: feeCalculation.referralAgentAmount,
        });
      } catch (error) {
        results.push({
          recipient: 'referral_agent',
          amount: feeCalculation.referralAgentAmount,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const success = results.every(r => !r.error);

    return {
      success,
      transfers: results,
      platformRetained: feeCalculation.platformNetAmount,
    };
  }

  /**
   * 旧版计算方法（保留兼容性）
   * @deprecated 请使用 calculateV5ConnectFees
   */
  calculateConnectFees(
    amount: number,
    skillLayerType: string = 'LOGIC',
    hasAgent: boolean = false,
  ) {
    // 使用 V5 模型计算
    const v5Result = this.calculateV5ConnectFees(
      amount,
      skillLayerType,
      hasAgent, // execution agent
      false,    // recommendation agent
      false,    // referral agent
    );

    return {
      totalAmount: amount,
      stripeFee: v5Result.stripeFee,
      netAmount: v5Result.netAmount,
      platformFee: v5Result.totalPlatformFee,
      agentFee: v5Result.executionAgentAmount,
      merchantAmount: v5Result.merchantAmount,
      breakdown: {
        stripeRate: '2.9% + $0.30',
        platformRate: v5Result.breakdown.totalCommissionRate,
        agentRate: hasAgent ? '70% of pool' : '0%',
      },
    };
  }
}
