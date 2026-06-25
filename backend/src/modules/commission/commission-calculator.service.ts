import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Payment } from '../../entities/payment.entity';
import { Commission, PayeeType, AgentType } from '../../entities/commission.entity';
import { Product, ProductType } from '../../entities/product.entity';
import { Order, AssetType, OrderStatus } from '../../entities/order.entity';
import {
  FINANCIAL_PROFILES,
  PROMOTER_SHARE_OF_BASE,
  EXECUTOR_SHARE_OF_POOL,
  REFERRER_SHARE_OF_POOL,
  SYSTEM_REBATE_POOL_ID,
  getSettlementConfig,
  resolveRates,
} from './financial-architecture.config';

/**
 * 订单类型
 */
export type OrderType = 'nft' | 'virtual' | 'service' | 'product' | 'physical';

/**
 * 分成配置
 */
export interface CommissionConfig {
  merchant: number;  // 商家分成比例（0-1）
  agent: number;     // Agent分成比例（0-1）
  paymind: number;  // PayMind分成比例（0-1）
}

/**
 * 结算条件
 */
export interface SettlementCondition {
  type: 'instant' | 'service_started' | 'delivery_confirmed';
  requiresUserConfirmation: boolean;
  autoConfirmDays?: number;  // 自动确认天数
  canRefund: boolean;
  autoSettle?: boolean;  // 是否自动结算
}

@Injectable()
export class CommissionCalculatorService {
  private readonly logger = new Logger(CommissionCalculatorService.name);

  constructor(
    @InjectRepository(Commission)
    private commissionRepository: Repository<Commission>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    private configService: ConfigService,
  ) {}

  /**
   * 根据产品类型获取佣金比例（新规则 V4.0）
   * 实体商品：激励池 2.2% + 平台费 0.5% + 通道费 0.3% = 3.0%
   * 服务类：激励池 3.7% + 平台费 1.0% + 通道费 0.3% = 5.0%
   * 虚拟资产：激励池 2.2% + 平台费 0.5% + 通道费 0.3% = 3.0%
   */
  getCommissionRates(
    productType: ProductType | string,
  ): { totalRate: number; agentRate: number; paymindRate: number } {
    const type = productType.toString().toLowerCase();

    if (type === 'physical' || type === 'physical_product') {
      const rates = resolveRates(AssetType.PHYSICAL);
      return {
        totalRate: rates.baseRate + rates.poolRate,
        agentRate: rates.poolRate,
        paymindRate: rates.baseRate,
      };
    } else if (type === 'service') {
      const rates = resolveRates(AssetType.SERVICE);
      return {
        totalRate: rates.baseRate + rates.poolRate,
        agentRate: rates.poolRate,
        paymindRate: rates.baseRate,
      };
    } else if (type === 'nft' || type === 'nft_rwa') {
      const rates = resolveRates(AssetType.NFT_RWA);
      return {
        totalRate: rates.baseRate + rates.poolRate,
        agentRate: rates.poolRate,
        paymindRate: rates.baseRate,
      };
    } else if (type === 'dev_tool' || type === 'x402_skill') {
      const rates = resolveRates(AssetType.DEV_TOOL);
      return {
        totalRate: rates.baseRate + rates.poolRate,
        agentRate: rates.poolRate,
        paymindRate: rates.baseRate,
      };
    } else if (type === 'subscription' || type === 'membership') {
      const rates = resolveRates(AssetType.SUBSCRIPTION);
      return {
        totalRate: rates.baseRate + rates.poolRate,
        agentRate: rates.poolRate,
        paymindRate: rates.baseRate,
      };
    } else if (type === 'other') {
      const rates = resolveRates(AssetType.OTHER);
      return {
        totalRate: rates.baseRate + rates.poolRate,
        agentRate: rates.poolRate,
        paymindRate: rates.baseRate,
      };
    } else {
      // 默认虚拟资产/数字商品
      const rates = resolveRates(AssetType.VIRTUAL);
      return {
        totalRate: rates.baseRate + rates.poolRate,
        agentRate: rates.poolRate,
        paymindRate: rates.baseRate,
      };
    }
  }

  /**
   * 根据订单类型获取手续费比例（保留旧方法以兼容）
   * @deprecated 使用getCommissionRates代替
   */
  getFeeRates(
    orderType: OrderType,
    hasAgent: boolean,
  ): { agentRate: number; paymindRate: number } {
    // PayMind手续费
    let paymindRate: number;
    if (orderType === 'product' || orderType === 'physical') {
      paymindRate = 0.005; // 实体商品：0.5%
    } else if (orderType === 'service') {
      paymindRate = 0.01; // 服务类：1.0%
    } else {
      paymindRate = 0.005; // 其他（虚拟资产）：0.5%
    }

    // Agent手续费
    let agentRate = 0;
    if (hasAgent) {
      if (orderType === 'product' || orderType === 'physical') {
        agentRate = 0.022; // 实体商品：2.2%
      } else if (orderType === 'service') {
        agentRate = 0.037; // 服务类：3.7%
      } else {
        agentRate = 0.022; // 虚拟资产：2.2%
      }
    }

    return { agentRate, paymindRate };
  }

  /**
   * 计算总手续费（用于前端显示）
   * @param orderType 订单类型
   * @param hasAgent 是否有Agent
   * @param hasProvider 是否通过Provider（法币转数字货币）
   * @param providerRate Provider手续费比例（默认3%）
   */
  calculateTotalFeeRate(
    orderType: OrderType,
    hasAgent: boolean,
    hasProvider: boolean = false,
    providerRate: number = 0.03,
  ): number {
    const { agentRate, paymindRate } = this.getFeeRates(orderType, hasAgent);
    
    // 总手续费 = Provider手续费 + Agent手续费 + PayMind手续费
    return providerRate + agentRate + paymindRate;
  }

  /**
   * 根据订单类型获取分成配置和结算条件
   */
  getCommissionAndSettlementConfig(
    orderType: OrderType,
    amount: number,
  ): { commission: CommissionConfig; settlement: SettlementCondition } {
    if (orderType === 'nft' || orderType === 'virtual') {
      // 链上资产（NFT、虚拟资产）：即时结算
      // V4.0: Pool 2.2% + Platform 0.5% + Channel 0.3% = 3.0%
      // Merchant gets 97.0%
      return {
        commission: {
          merchant: 0.97,
          agent: 0.022,
          paymind: 0.008, // 0.5% platform + 0.3% channel
        },
        settlement: {
          type: 'instant',
          requiresUserConfirmation: false,
          autoSettle: true,
          canRefund: false,
        },
      };
    }

    if (orderType === 'service') {
      // 服务类：服务开始后结算
      // V4.0: Pool 3.7% + Platform 1.0% + Channel 0.3% = 5.0%
      // Merchant gets 95.0%
      return {
        commission: {
          merchant: 0.95,
          agent: 0.037,
          paymind: 0.013, // 1.0% platform + 0.3% channel
        },
        settlement: {
          type: 'service_started',
          requiresUserConfirmation: true,
          canRefund: true,
        },
      };
    }

    if (orderType === 'product' || orderType === 'physical') {
      // 实体商品：确认收货后结算
      // V4.0: Pool 2.2% + Platform 0.5% + Channel 0.3% = 3.0%
      // Merchant gets 97.0%
      return {
        commission: {
          merchant: 0.97,
          agent: 0.022,
          paymind: 0.008, // 0.5% platform + 0.3% channel
        },
        settlement: {
          type: 'delivery_confirmed',
          requiresUserConfirmation: true,
          autoConfirmDays: 7, // 7天后自动确认
          canRefund: true,
        },
      };
    }

    // 默认配置（商品）
    return {
      commission: {
        merchant: 0.97,
        agent: 0.022,
        paymind: 0.008,
      },
      settlement: {
        type: 'delivery_confirmed',
        requiresUserConfirmation: true,
        autoConfirmDays: 7,
        canRefund: true,
      },
    };
  }

  /**
   * 计算并记录分润（根据新的佣金规则）
   * @param paymentId 支付ID
   * @param payment 支付记录
   * @param commissionBase 佣金计算基础（商户税前价格，扣除通道费用前）
   * @param sessionId Session ID（三层ID之一）
   */
  async calculateAndRecordCommission(
    paymentId: string,
    payment: Payment,
    commissionBase?: number,
    sessionId?: string,
  ): Promise<Commission[]> {
    const commissions: Commission[] = [];
    const baseAmount = commissionBase || payment.amount;
    const channelFee = payment.channelFee || 0;

    // X402 V2 通道费处理（从平台费中扣除）
    const isX402 = payment.metadata?.isX402 || payment.metadata?.paymentMethod === 'x402';
    // 通道费率默认为 0%（X402通道费已取消），支持通过环境变量 X402_CHANNEL_FEE_RATE 配置
    const x402ChannelFeeRate = parseFloat(this.configService.get('X402_CHANNEL_FEE_RATE', '0'));
    let x402ChannelFee = 0;

    let order: Order | null = null;
    if (payment.metadata?.orderId) {
      try {
        order = await this.orderRepository.findOne({
          where: { id: payment.metadata.orderId },
        });
      } catch (error) {
        this.logger.warn(`查询订单失败: ${error.message}`);
      }
    }

    // 获取产品类型
    let productType: ProductType | string = ProductType.PHYSICAL;
    if (payment.metadata?.productId) {
      try {
        const product = await this.productRepository.findOne({
          where: { id: payment.metadata.productId },
        });
        if (product) {
          productType = product.productType || ProductType.PHYSICAL;
        }
      } catch (error) {
        this.logger.warn(`获取产品类型失败: ${error.message}，使用默认类型`);
      }
    } else {
      const orderType = (payment.metadata?.orderType || 'product') as OrderType;
      if (orderType === 'service') {
        productType = ProductType.SERVICE;
      } else if (orderType === 'nft' || orderType === 'virtual') {
        productType = ProductType.NFT;
      }
    }

    const assetType = this.resolveAssetType(productType, payment, order);
    const settlementConfig = getSettlementConfig(assetType);

    const platformTaxRate =
      payment.metadata?.platformTaxRate ??
      order?.platformTaxRate ??
      payment.metadata?.platformFeeRate ??
      0;
    const platformTax = this.roundCurrency(baseAmount * platformTaxRate);
    
    // On-ramp 平台费用（Agentrix 平台额外收取的费用）
    // 注意：这个费用是在用户支付时额外收取的，应该被包含在 platformFee 中
    const onRampAgentrixFee = payment.metadata?.agentrixFee || payment.metadata?.onRampAgentrixFee || 0;
    
    const netRevenue = Math.max(this.roundCurrency(baseAmount - platformTax), 0);

    const rateOverrides = {
      poolRateOverride: payment.metadata?.commissionPoolRate,
      baseRateOverride: payment.metadata?.baseRateOverride,
      upstreamCommissionRate:
        payment.metadata?.upstreamCommissionRate ??
        order?.metadata?.upstreamCommissionRate,
      swapFeeRate:
        payment.metadata?.swapFeeRate ?? order?.metadata?.swapFeeRate,
    };

    const rates = resolveRates(assetType, rateOverrides);

    let paymindBaseRevenue = this.roundCurrency(netRevenue * rates.baseRate);
    let intendedCommissionPool = this.roundCurrency(netRevenue * rates.poolRate);
    let commissionPool = intendedCommissionPool;

    // X402 V2 通道费计算：从平台费中扣除 0.3%
    if (isX402) {
      x402ChannelFee = this.roundCurrency(baseAmount * x402ChannelFeeRate);
      // 从平台基础收入中扣除通道费
      paymindBaseRevenue = Math.max(this.roundCurrency(paymindBaseRevenue - x402ChannelFee), 0);
      this.logger.log(`X402 通道费计算: 基础金额=${baseAmount}, 通道费率=${x402ChannelFeeRate}, 通道费=${x402ChannelFee}`);
    }

    // 将 On-ramp 平台费用添加到 PayMind 最终收入中
    // 这样在分账时，这部分费用会被正确分配到 paymindTreasury
    const paymindBaseRevenueWithOnRampFee = paymindBaseRevenue + onRampAgentrixFee;

    const promoterId = payment.metadata?.promoterId || order?.promoterId;
    let promoterPayout = 0;
    if (promoterId && paymindBaseRevenueWithOnRampFee > 0) {
      promoterPayout = this.roundCurrency(
        paymindBaseRevenueWithOnRampFee * PROMOTER_SHARE_OF_BASE,
      );
    }
    let paymindFinalRevenue = paymindBaseRevenueWithOnRampFee - promoterPayout;

    const refAgentId =
      payment.metadata?.recommendationAgentId ||
      payment.metadata?.referrerId ||
      order?.refAgentId;
    const execAgentId =
      payment.agentId ||
      order?.execAgentId ||
      payment.metadata?.executionAgentId;
    const executorHasWallet =
      order?.executorHasWallet ??
      payment.metadata?.executorHasWallet ??
      true;

    let referrerPayout = 0;
    let executorPayout = 0;
    let rebatePayout = 0;
    let developerAmount = 0;

    let merchantAmount = this.roundCurrency(
      netRevenue - paymindBaseRevenue - commissionPool - channelFee,
    );
    if (merchantAmount < 0) {
      merchantAmount = 0;
    }

    if (assetType === AssetType.DEV_TOOL) {
      const devProfile = FINANCIAL_PROFILES[AssetType.DEV_TOOL].rates.developerSplit!;
      developerAmount = this.roundCurrency(netRevenue * devProfile.developer);

      // 开发者模式也简化为单层 Agent
      let agentShare = this.roundCurrency(netRevenue * devProfile.agent);
      
      if (refAgentId) {
        referrerPayout = agentShare;
      } else if (execAgentId) {
        executorPayout = agentShare;
      } else {
        developerAmount = this.roundCurrency(developerAmount + agentShare);
      }

      paymindBaseRevenue = this.roundCurrency(
        netRevenue * devProfile.paymind,
      );
      paymindFinalRevenue = paymindBaseRevenue - promoterPayout;
      commissionPool = this.roundCurrency(
        referrerPayout + executorPayout + rebatePayout,
      );
      intendedCommissionPool = commissionPool;

      merchantAmount = this.roundCurrency(developerAmount - channelFee);
      if (merchantAmount < 0) {
        merchantAmount = 0;
      }
    } else {
      // V5.0: Agent 分佣 (执行:推荐 = 7:3)，缺席方佣金进 Treasury
      if (refAgentId && execAgentId) {
        // 双 Agent: 执行 70%, 推荐 30%
        executorPayout = this.roundCurrency(commissionPool * EXECUTOR_SHARE_OF_POOL);
        referrerPayout = this.roundCurrency(commissionPool * REFERRER_SHARE_OF_POOL);
      } else if (execAgentId) {
        // 仅执行 Agent: 执行 70%, 推荐缺席 30% 进 Treasury
        executorPayout = this.roundCurrency(commissionPool * EXECUTOR_SHARE_OF_POOL);
        rebatePayout = this.roundCurrency(commissionPool * REFERRER_SHARE_OF_POOL);
      } else if (refAgentId) {
        // 仅推荐 Agent: 推荐 30%, 执行缺席 70% 进 Treasury
        referrerPayout = this.roundCurrency(commissionPool * REFERRER_SHARE_OF_POOL);
        rebatePayout = this.roundCurrency(commissionPool * EXECUTOR_SHARE_OF_POOL);
      } else {
        // 无 Agent: 全部进 Treasury
        rebatePayout = commissionPool;
      }

      // 执行 Agent 无钱包时，其份额进 Treasury
      if (executorPayout > 0 && !executorHasWallet) {
        rebatePayout = this.roundCurrency(rebatePayout + executorPayout);
        executorPayout = 0;
      }
    }

    const { triggerTime, availableAt } = this.deriveInitialSettlementWindow(
      assetType,
      settlementConfig,
    );
    const initialStatus =
      availableAt && availableAt <= new Date() ? 'ready' : 'locked';

    const createCommissionRecord = async (data: Partial<Commission>) => {
      const record = this.commissionRepository.create({
        paymentId,
        orderId: order?.id,
        assetType,
        currency: payment.currency,
        commissionBase: netRevenue,
        channelFee,
        sessionId,
        settlementAvailableAt: availableAt ?? null,
        status: initialStatus,
        ...data,
      });
      const saved = await this.commissionRepository.save(record);
      commissions.push(saved);
    };

    if (promoterPayout > 0 && promoterId) {
      await createCommissionRecord({
        payeeId: promoterId,
        payeeType: PayeeType.AGENT,
        agentType: AgentType.REFERRAL,
        amount: promoterPayout,
        breakdown: { type: 'promoter', share: PROMOTER_SHARE_OF_BASE },
      });
    }

    if (referrerPayout > 0 && refAgentId) {
      await createCommissionRecord({
        payeeId: refAgentId,
        payeeType: PayeeType.AGENT,
        agentType: AgentType.RECOMMENDATION,
        amount: referrerPayout,
        breakdown: { type: 'referrer' },
      });
    }

    if (executorPayout > 0 && execAgentId) {
      await createCommissionRecord({
        payeeId: execAgentId,
        payeeType: PayeeType.AGENT,
        agentType: AgentType.EXECUTION,
        amount: executorPayout,
        breakdown: { type: 'executor', executorHasWallet },
      });
    }

    if (rebatePayout > 0) {
      await createCommissionRecord({
        payeeId: SYSTEM_REBATE_POOL_ID,
        payeeType: PayeeType.AGENTRIX,
        amount: rebatePayout,
        breakdown: { type: 'rebate_pool' },
      });
      paymindFinalRevenue = this.roundCurrency(paymindFinalRevenue + rebatePayout);
    }

    // X402 通道费记录（如果使用 X402 支付）
    if (isX402 && x402ChannelFee > 0) {
      await createCommissionRecord({
        payeeId: 'x402_channel',
        payeeType: PayeeType.AGENTRIX,
        amount: x402ChannelFee,
        breakdown: { 
          type: 'x402_channel_fee', 
          rate: x402ChannelFeeRate,
          baseAmount,
          deductedFromPlatformFee: true, // 标记是从平台费中扣除的
        },
      });
    }

    if (paymindFinalRevenue > 0) {
      await createCommissionRecord({
        payeeId: 'agentrix',
        payeeType: PayeeType.AGENTRIX,
        amount: paymindFinalRevenue,
        breakdown: { 
          type: 'platform', 
          promoterPayout,
          onRampAgentrixFee: onRampAgentrixFee > 0 ? onRampAgentrixFee : undefined, // 记录 On-ramp 平台费用
          x402ChannelFee: isX402 && x402ChannelFee > 0 ? x402ChannelFee : undefined, // 记录 X402 通道费
        },
      });
    }

    if (order) {
      order.assetType = assetType;
      order.platformTaxRate = platformTaxRate;
      order.platformTax = platformTax;
      order.netRevenue = netRevenue;
      order.merchantNetAmount = merchantAmount;
      order.execAgentId = execAgentId || order.execAgentId;
      order.refAgentId = refAgentId || order.refAgentId;
      order.promoterId = promoterId || order.promoterId;
      order.executorHasWallet = executorHasWallet;
      if (triggerTime && !order.settlementTriggerTime) {
        order.settlementTriggerTime = triggerTime;
      }
      if (availableAt) {
        order.settlementDueTime = availableAt;
      }
      order.settlementTimeline = {
        triggerDescription: settlementConfig?.triggerDescription,
        lockupDays: settlementConfig?.lockupDays,
        payoutDescription: settlementConfig?.payoutDescription,
        autoConfirm: settlementConfig?.autoConfirm,
        autoFallbackDays: settlementConfig?.autoFallbackDays,
        autoFallbackDescription: settlementConfig?.autoFallbackDescription,
        rawConfig: settlementConfig,
      };
      if (this.shouldAutoDeliver(assetType)) {
        order.status = OrderStatus.DELIVERED;
      } else if (order.status === OrderStatus.PENDING) {
        order.status = OrderStatus.PAID;
      }
      await this.orderRepository.save(order);
    }

    const commissionPoolDistributed = this.roundCurrency(
      referrerPayout + executorPayout + rebatePayout,
    );
    const financials = {
      assetType,
      netRevenue,
      platformTaxRate,
      platformTax,
      channelFee,
      baseRate: rates.baseRate,
      poolRate: rates.poolRate,
      paymindBaseRevenue,
      paymindFinalRevenue,
      promoterPayout,
      commissionPoolRequested: intendedCommissionPool,
      commissionPoolDistributed,
      referrerPayout,
      executorPayout,
      rebatePayout,
      merchantAmount,
      onRampAgentrixFee: onRampAgentrixFee > 0 ? onRampAgentrixFee : undefined, // 记录 On-ramp 平台费用
      // X402 V2 通道费信息
      isX402,
      x402ChannelFee: isX402 && x402ChannelFee > 0 ? x402ChannelFee : undefined,
      x402ChannelFeeRate: isX402 ? x402ChannelFeeRate : undefined,
    };

    payment.metadata = {
      ...payment.metadata,
      financials,
      commissionBase: netRevenue,
      channelFee,
      merchantAmount,
      sessionId,
      settlement: {
        trigger: settlementConfig?.triggerDescription,
        dueTime: availableAt,
      },
    };

    this.logger.log(
      `佣金计算完成: payment=${paymentId}, asset=${assetType}, netRevenue=${netRevenue}, paymind=${paymindFinalRevenue}, pool=${commissionPoolDistributed}, merchant=${merchantAmount}`,
    );

    return commissions;
  }

  private resolveAssetType(
    productType: ProductType | string,
    payment: Payment,
    order?: Order | null,
  ): AssetType {
    const explicit = payment.metadata?.assetType || order?.assetType;
    if (explicit) {
      return explicit as AssetType;
    }

    if (payment.metadata?.aggregatorId) {
      return AssetType.AGGREGATED_WEB2;
    }

    if (payment.metadata?.dexRoute || payment.metadata?.swapFeeRate) {
      return AssetType.AGGREGATED_WEB3;
    }

    if (
      payment.metadata?.productCategory === 'dev_tool' ||
      order?.metadata?.category === 'dev_tool'
    ) {
      return AssetType.DEV_TOOL;
    }

    if (payment.metadata?.isOnChain && payment.metadata?.isRwa) {
      return AssetType.NFT_RWA;
    }

    if (payment.metadata?.isOnChain) {
      return AssetType.VIRTUAL;
    }

    switch (productType) {
      case ProductType.SERVICE:
        return AssetType.SERVICE;
      case ProductType.NFT:
      case ProductType.RWA:
        return AssetType.NFT_RWA;
      case ProductType.GAME_ASSET:
      case ProductType.FT:
        return AssetType.VIRTUAL;
      case 'service':
        return AssetType.SERVICE;
      case 'virtual':
        return AssetType.VIRTUAL;
      default:
        return AssetType.PHYSICAL;
    }
  }

  private getAgentScene(
    refAgentId?: string | null,
    execAgentId?: string | null,
  ): 'dual' | 'execution-only' | 'none' {
    if (refAgentId && execAgentId) {
      return 'dual';
    }
    if (execAgentId) {
      return 'execution-only';
    }
    return 'none';
  }

  private deriveInitialSettlementWindow(
    assetType: AssetType,
    settlement?: ReturnType<typeof getSettlementConfig>,
  ): { triggerTime?: Date; availableAt?: Date } {
    if (!settlement) {
      return {};
    }

    if (settlement.lockupDays === 'instant') {
      const now = new Date();
      return { triggerTime: now, availableAt: now };
    }

    if (
      typeof settlement.lockupDays === 'number' &&
      this.shouldAutoDeliver(assetType)
    ) {
      const triggerTime = new Date();
      const due = new Date(triggerTime);
      due.setDate(due.getDate() + settlement.lockupDays);
      return { triggerTime, availableAt: due };
    }

    return {};
  }

  private shouldAutoDeliver(assetType: AssetType): boolean {
    return [
      AssetType.VIRTUAL,
      AssetType.NFT_RWA,
      AssetType.DEV_TOOL,
      AssetType.AGGREGATED_WEB3,
    ].includes(assetType);
  }

  private roundCurrency(value: number): number {
    return Number(Number(value).toFixed(2));
  }

  /**
   * 计算Agent分润
   */
  private async calculateAgentCommission(
    paymentId: string,
    payment: Payment,
  ): Promise<Commission | null> {
    try {
      // 获取商品信息
      const productId = payment.metadata?.productId;
      if (!productId) {
        this.logger.warn('支付记录中没有productId，无法计算分润');
        return null;
      }

      const product = await this.productRepository.findOne({
        where: { id: productId },
      });

      if (!product) {
        this.logger.warn(`商品不存在: ${productId}`);
        return null;
      }

      // 计算分润金额
      const commissionRate = product.commissionRate / 100; // 转换为小数
      const commissionAmount = payment.amount * commissionRate;

      // 创建分润记录
      const commission = this.commissionRepository.create({
        paymentId,
        payeeId: payment.agentId!,
        payeeType: PayeeType.AGENT,
        amount: commissionAmount,
        currency: payment.currency,
        status: 'pending',
      });

      return this.commissionRepository.save(commission);
    } catch (error) {
      this.logger.error('计算Agent分润失败:', error);
      return null;
    }
  }

  /**
   * 批量计算分润（用于结算）
   */
  async calculateSettlementCommissions(
    payeeId: string,
    payeeType: PayeeType,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    const commissions = await this.commissionRepository.find({
      where: {
        payeeId,
        payeeType,
        status: 'ready',
      },
    });

    // 过滤日期范围
    const filtered = commissions.filter(
      (commission) =>
        (commission.settlementAvailableAt || commission.createdAt) >= startDate &&
        (commission.settlementAvailableAt || commission.createdAt) <= endDate,
    );

    return filtered.reduce((sum, commission) => sum + Number(commission.amount), 0);
  }
}

