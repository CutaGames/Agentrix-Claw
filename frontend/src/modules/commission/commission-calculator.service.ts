import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from '../../entities/payment.entity';
import { Commission, PayeeType, AgentType } from '../../entities/commission.entity';
import { Product, ProductType } from '../../entities/product.entity';
import { Order, AssetType, OrderStatus } from '../../entities/order.entity';
import {
  FINANCIAL_PROFILES,
  PROMOTER_SHARE_OF_BASE,
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
  agentrix: number;  // Agentrix分成比例（0-1）
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
  ) {}

  /**
   * 根据产品类型获取佣金比例（新规则）
   * 实体商品：总佣金3%（推荐Agent 0.9% + 执行Agent 2.1% + Agentrix 0.5%）
   * 服务类：总佣金5%（推荐Agent 1.5% + 执行Agent 3.5% + Agentrix 1%）
   * 链上资产：根据场景不同（在calculateAndRecordCommission中处理）
   */
  getCommissionRates(
    productType: ProductType | string,
  ): { totalRate: number; recommendationRate: number; executionRate: number; agentrixRate: number } {
    if (productType === ProductType.PHYSICAL || productType === 'physical') {
      // 实体商品：总佣金3%
      return {
        totalRate: 0.03,
        recommendationRate: 0.009, // 0.9%
        executionRate: 0.021, // 2.1%
        agentrixRate: 0.005, // 0.5%
      };
    } else if (productType === ProductType.SERVICE || productType === 'service') {
      // 服务类：总佣金5%
      return {
        totalRate: 0.05,
        recommendationRate: 0.015, // 1.5%
        executionRate: 0.035, // 3.5%
        agentrixRate: 0.01, // 1%
      };
    } else {
      // 链上资产：根据场景不同，默认使用NFT二级市场比例
      // 平台聚合NFT：2.5%（Agentrix 1% + 其他 1.5%）
      return {
        totalRate: 0.025,
        recommendationRate: 0.0075, // 0.75%
        executionRate: 0.0175, // 1.75%
        agentrixRate: 0.01, // 1%
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
  ): { agentRate: number; agentrixRate: number } {
    // Agentrix手续费
    let agentrixRate: number;
    if (orderType === 'product' || orderType === 'physical') {
      agentrixRate = 0.005; // 实体商品：0.5%
    } else {
      agentrixRate = 0.01; // 其他（服务/数字资产）：1%
    }

    // Agent手续费（只和商品属性有关系，跟转换没关系）
    let agentRate = 0;
    if (hasAgent) {
      if (orderType === 'product' || orderType === 'physical') {
        agentRate = 0.02; // 实体商品：2%
      } else {
        agentRate = 0.03; // 服务/数字资产：3%
      }
    }

    return { agentRate, agentrixRate };
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
    const { agentRate, agentrixRate } = this.getFeeRates(orderType, hasAgent);
    
    // 总手续费 = Provider手续费 + Agent手续费 + Agentrix手续费
    return providerRate + agentRate + agentrixRate;
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
      return {
        commission: {
          merchant: 0.88,
          agent: 0.06,
          agentrix: 0.06,
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
      return {
        commission: {
          merchant: 0.82,
          agent: 0.10,
          agentrix: 0.08,
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
      return {
        commission: {
          merchant: 0.78,
          agent: 0.12,
          agentrix: 0.10,
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
        merchant: 0.78,
        agent: 0.12,
        agentrix: 0.10,
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

    let agentrixBaseRevenue = this.roundCurrency(netRevenue * rates.baseRate);
    let intendedCommissionPool = this.roundCurrency(netRevenue * rates.poolRate);
    let commissionPool = intendedCommissionPool;

    const promoterId = payment.metadata?.promoterId || order?.promoterId;
    let promoterPayout = 0;
    if (promoterId && agentrixBaseRevenue > 0) {
      promoterPayout = this.roundCurrency(
        agentrixBaseRevenue * PROMOTER_SHARE_OF_BASE,
      );
    }
    let agentrixFinalRevenue = agentrixBaseRevenue - promoterPayout;

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
      netRevenue - agentrixBaseRevenue - commissionPool - channelFee,
    );
    if (merchantAmount < 0) {
      merchantAmount = 0;
    }

    if (assetType === AssetType.DEV_TOOL) {
      const devProfile = FINANCIAL_PROFILES[AssetType.DEV_TOOL].rates.developerSplit!;
      developerAmount = this.roundCurrency(netRevenue * devProfile.developer);

      let recommendationShare = this.roundCurrency(
        netRevenue * devProfile.recommendation,
      );
      if (!refAgentId) {
        developerAmount = this.roundCurrency(developerAmount + recommendationShare);
        recommendationShare = 0;
      }
      referrerPayout = recommendationShare;

      let executionShare = this.roundCurrency(
        netRevenue * devProfile.execution,
      );
      if (!execAgentId) {
        developerAmount = this.roundCurrency(developerAmount + executionShare);
        executionShare = 0;
      } else if (!executorHasWallet) {
        rebatePayout = executionShare;
        executionShare = 0;
      } else {
        executorPayout = executionShare;
      }

      agentrixBaseRevenue = this.roundCurrency(
        netRevenue * devProfile.agentrix,
      );
      agentrixFinalRevenue = agentrixBaseRevenue - promoterPayout;
      commissionPool = this.roundCurrency(
        referrerPayout + executorPayout + rebatePayout,
      );
      intendedCommissionPool = commissionPool;

      merchantAmount = this.roundCurrency(developerAmount - channelFee);
      if (merchantAmount < 0) {
        merchantAmount = 0;
      }
    } else {
      const scene = this.getAgentScene(refAgentId, execAgentId);
      if (scene === 'dual') {
        referrerPayout = this.roundCurrency(commissionPool * 0.3);
        executorPayout = this.roundCurrency(commissionPool * 0.7);
      } else if (scene === 'execution-only') {
        executorPayout = commissionPool;
      } else {
        agentrixFinalRevenue = this.roundCurrency(
          agentrixFinalRevenue + commissionPool,
        );
        commissionPool = 0;
      }

      if (executorPayout > 0 && !executorHasWallet) {
        rebatePayout = executorPayout;
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
      agentrixFinalRevenue = this.roundCurrency(agentrixFinalRevenue + rebatePayout);
    }

    if (agentrixFinalRevenue > 0) {
      await createCommissionRecord({
        payeeId: 'agentrix',
      payeeType: PayeeType.AGENTRIX,
        amount: agentrixFinalRevenue,
        breakdown: { type: 'platform', promoterPayout },
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
      agentrixBaseRevenue,
      agentrixFinalRevenue,
      promoterPayout,
      commissionPoolRequested: intendedCommissionPool,
      commissionPoolDistributed,
      referrerPayout,
      executorPayout,
      rebatePayout,
      merchantAmount,
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
      `佣金计算完成: payment=${paymentId}, asset=${assetType}, netRevenue=${netRevenue}, agentrix=${agentrixFinalRevenue}, pool=${commissionPoolDistributed}, merchant=${merchantAmount}`,
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

