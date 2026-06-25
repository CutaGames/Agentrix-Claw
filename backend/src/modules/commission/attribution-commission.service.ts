import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../../entities/order.entity';
import { PayIntent } from '../../entities/pay-intent.entity';
import { Commission, PayeeType, AgentType } from '../../entities/commission.entity';
import { CommissionStrategyV4Service, SplitRoles, SplitOptions, SplitResult } from './commission-strategy-v4.service';

/**
 * P1: 归因与分润服务
 * 
 * 职责：
 * 1. 记录订单归因信息（agent_id, channel, referrer 等）
 * 2. 在支付完成后计算并生成分润记录
 * 3. 支持多种归因模型（首次触达、末次触达、线性分配）
 */

export interface AttributionData {
  /** 下单 Agent（推荐者） */
  agentId?: string;
  /** 执行 Agent（实际触发支付的） */
  execAgentId?: string;
  /** 推荐人（邀请用户的人） */
  referrerId?: string;
  /** 推广者（营销活动） */
  promoterId?: string;
  /** 来源渠道 */
  channel?: string;
  /** 营销活动 ID */
  campaignId?: string;
  /** 会话 ID */
  sessionId?: string;
  /** 归因模型 */
  attributionModel?: 'first_touch' | 'last_touch' | 'linear' | 'position_based';
  /** 额外元数据 */
  metadata?: Record<string, any>;
}

export interface CommissionDistribution {
  /** 商户收入 */
  merchantAmount: number;
  /** 平台收入 */
  platformAmount: number;
  /** Agent 佣金 */
  agentCommission: number;
  /** 执行 Agent 佣金 */
  execAgentCommission: number;
  /** 推荐人佣金 */
  referrerCommission: number;
  /** 推广者佣金 */
  promoterCommission: number;
  /** 渠道费用 */
  channelFee: number;
  /** 平台基金 */
  platformFund: number;
  /** 详细分配 */
  breakdown: SplitResult;
}

@Injectable()
export class AttributionCommissionService {
  private readonly logger = new Logger(AttributionCommissionService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(PayIntent)
    private readonly payIntentRepository: Repository<PayIntent>,
    @InjectRepository(Commission)
    private readonly commissionRepository: Repository<Commission>,
    private readonly commissionStrategyService: CommissionStrategyV4Service,
  ) {}

  /**
   * 记录订单归因信息
   */
  async recordAttribution(
    orderId: string,
    attribution: AttributionData,
  ): Promise<Order> {
    const order = await this.orderRepository.findOne({ where: { id: orderId } });

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    // 更新归因字段
    if (attribution.agentId) {
      order.agentId = attribution.agentId;
    }
    if (attribution.execAgentId) {
      order.execAgentId = attribution.execAgentId;
    }
    if (attribution.referrerId) {
      order.refAgentId = attribution.referrerId;
    }
    if (attribution.promoterId) {
      order.promoterId = attribution.promoterId;
    }

    // 更新 metadata
    order.metadata = {
      ...(order.metadata || {}),
      attribution: {
        channel: attribution.channel,
        campaignId: attribution.campaignId,
        sessionId: attribution.sessionId,
        attributionModel: attribution.attributionModel || 'last_touch',
        recordedAt: new Date().toISOString(),
        ...attribution.metadata,
      },
    };

    await this.orderRepository.save(order);
    this.logger.log(`记录订单归因: orderId=${orderId}, agentId=${attribution.agentId}`);

    return order;
  }

  /**
   * 记录 PayIntent 归因信息
   */
  async recordPayIntentAttribution(
    payIntentId: string,
    attribution: AttributionData,
  ): Promise<PayIntent> {
    const payIntent = await this.payIntentRepository.findOne({ where: { id: payIntentId } });

    if (!payIntent) {
      throw new Error(`PayIntent not found: ${payIntentId}`);
    }

    payIntent.attribution = {
      agentId: attribution.agentId,
      channel: attribution.channel,
      campaignId: attribution.campaignId,
      referrer: attribution.referrerId,
      sessionId: attribution.sessionId,
    };

    // 同时更新顶级 agentId 字段
    if (attribution.agentId) {
      payIntent.agentId = attribution.agentId;
    }

    await this.payIntentRepository.save(payIntent);
    this.logger.log(`记录 PayIntent 归因: payIntentId=${payIntentId}, agentId=${attribution.agentId}`);

    return payIntent;
  }

  /**
   * 计算并生成分润记录
   * 在支付成功后调用
   */
  async calculateAndCreateCommissions(
    orderId: string,
    options?: {
      isX402?: boolean;
      transactionHash?: string;
    },
  ): Promise<CommissionDistribution> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['merchant', 'user'],
    });

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    // 确定产品类型
    const productType = this.mapAssetTypeToProductType(order.assetType);

    // 构建分润角色
    const roles: SplitRoles = {
      promoter: order.promoterId,
      referrer: order.refAgentId,
      executor: order.execAgentId,
    };

    // 构建分润选项
    const splitOptions: SplitOptions = {
      isX402: options?.isX402 || false,
      paymentId: order.paymentId,
      orderId: order.id,
      transactionHash: options?.transactionHash,
      customerAddress: order.metadata?.customerAddress,
      merchantAddress: order.metadata?.merchantAddress,
    };

    // 计算分润
    const amountInWei = BigInt(Math.floor(order.amount * 1e6)); // 假设 6 位小数
    const splitResult = this.commissionStrategyService.calculate(
      amountInWei,
      productType,
      roles,
      splitOptions,
    );

    // 转换为普通数字（用于展示和存储）
    const distribution: CommissionDistribution = {
      merchantAmount: Number(splitResult.merchant) / 1e6,
      platformAmount: Number(splitResult.platform) / 1e6,
      agentCommission: order.agentId ? Number(splitResult.promoter) / 1e6 : 0,
      execAgentCommission: Number(splitResult.executor) / 1e6,
      referrerCommission: Number(splitResult.referrer) / 1e6,
      promoterCommission: Number(splitResult.promoter) / 1e6,
      channelFee: Number(splitResult.channel) / 1e6,
      platformFund: Number(splitResult.platformFund) / 1e6,
      breakdown: splitResult,
    };

    // 创建分润记录
    await this.createCommissionRecords(order, distribution, splitResult);

    this.logger.log(`计算分润完成: orderId=${orderId}, merchant=${distribution.merchantAmount}, platform=${distribution.platformAmount}`);

    return distribution;
  }

  /**
   * 创建分润记录
   */
  private async createCommissionRecords(
    order: Order,
    distribution: CommissionDistribution,
    splitResult: SplitResult,
  ): Promise<void> {
    const commissions: Partial<Commission>[] = [];

    // 1. 推广者分润（如果有）
    if (order.promoterId && distribution.promoterCommission > 0) {
      commissions.push({
        orderId: order.id,
        paymentId: order.paymentId || order.id,
        payeeId: order.promoterId,
        payeeType: PayeeType.AGENT,
        agentType: AgentType.RECOMMENDATION,
        amount: distribution.promoterCommission,
        currency: order.currency,
        status: 'pending',
        breakdown: {
          source: 'attribution',
          type: 'promotion',
          originalAmount: order.amount,
        },
      });
    }

    // 2. 推荐人分润（如果有）
    if (order.refAgentId && distribution.referrerCommission > 0) {
      commissions.push({
        orderId: order.id,
        paymentId: order.paymentId || order.id,
        payeeId: order.refAgentId,
        payeeType: PayeeType.AGENT,
        agentType: AgentType.REFERRAL,
        amount: distribution.referrerCommission,
        currency: order.currency,
        status: 'pending',
        breakdown: {
          source: 'attribution',
          type: 'referral',
          originalAmount: order.amount,
        },
      });
    }

    // 3. 执行 Agent 分润（如果有）
    if (order.execAgentId && distribution.execAgentCommission > 0) {
      commissions.push({
        orderId: order.id,
        paymentId: order.paymentId || order.id,
        payeeId: order.execAgentId,
        payeeType: PayeeType.AGENT,
        agentType: AgentType.EXECUTION,
        amount: distribution.execAgentCommission,
        currency: order.currency,
        status: 'pending',
        breakdown: {
          source: 'attribution',
          type: 'execution',
          originalAmount: order.amount,
        },
      });
    }

    // 4. Agent 佣金（如果有独立的 agentId）
    if (order.agentId && order.agentId !== order.promoterId && order.agentId !== order.execAgentId) {
      // Agent 可能同时是推广者或执行者，避免重复
      const agentShare = Number(splitResult.promoter) / 1e6 * 0.5; // 示例：给 Agent 一半推广者分成
      if (agentShare > 0) {
        commissions.push({
          orderId: order.id,
          paymentId: order.paymentId || order.id,
          payeeId: order.agentId,
          payeeType: PayeeType.AGENT,
          amount: agentShare,
          currency: order.currency,
          status: 'pending',
          breakdown: {
            source: 'attribution',
            type: 'agent',
            originalAmount: order.amount,
          },
        });
      }
    }

    // 5. 渠道费用（X402）
    if (splitResult.isX402 && distribution.channelFee > 0) {
      commissions.push({
        orderId: order.id,
        paymentId: order.paymentId || order.id,
        payeeId: 'x402_channel', // 或具体的渠道 ID
        payeeType: PayeeType.AGENTRIX,
        channelFee: distribution.channelFee,
        amount: distribution.channelFee,
        currency: order.currency,
        status: 'pending',
        breakdown: {
          source: 'x402',
          type: 'channel',
          isX402: true,
          originalAmount: order.amount,
        },
      });
    }

    // 批量保存分润记录
    if (commissions.length > 0) {
      await this.commissionRepository.save(commissions);
      this.logger.log(`创建 ${commissions.length} 条分润记录: orderId=${order.id}`);
    }
  }

  /**
   * 获取订单的分润详情
   */
  async getOrderCommissions(orderId: string): Promise<Commission[]> {
    return this.commissionRepository.find({
      where: { orderId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 获取用户的所有分润（作为收款方）
   */
  async getUserCommissions(
    userId: string,
    options?: {
      status?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    },
  ): Promise<{ commissions: Commission[]; total: number; totalAmount: number }> {
    const queryBuilder = this.commissionRepository.createQueryBuilder('commission')
      .where('commission.payeeId = :userId', { userId });

    if (options?.status) {
      queryBuilder.andWhere('commission.status = :status', { status: options.status });
    }

    if (options?.startDate) {
      queryBuilder.andWhere('commission.createdAt >= :startDate', { startDate: options.startDate });
    }

    if (options?.endDate) {
      queryBuilder.andWhere('commission.createdAt <= :endDate', { endDate: options.endDate });
    }

    queryBuilder.orderBy('commission.createdAt', 'DESC');

    if (options?.limit) {
      queryBuilder.limit(options.limit);
    }

    const [commissions, total] = await queryBuilder.getManyAndCount();
    const totalAmount = commissions.reduce((sum, c) => sum + Number(c.amount), 0);

    return { commissions, total, totalAmount };
  }

  /**
   * 获取 Agent 的分润统计
   */
  async getAgentCommissionStats(agentId: string): Promise<{
    totalEarnings: number;
    pendingAmount: number;
    settledAmount: number;
    orderCount: number;
    commissionsByType: Record<string, number>;
  }> {
    const commissions = await this.commissionRepository.find({
      where: { payeeId: agentId },
    });

    const stats = {
      totalEarnings: 0,
      pendingAmount: 0,
      settledAmount: 0,
      orderCount: new Set<string>(),
      commissionsByType: {} as Record<string, number>,
    };

    for (const commission of commissions) {
      const amount = Number(commission.amount);
      stats.totalEarnings += amount;

      if (commission.status === 'pending' || commission.status === 'ready') {
        stats.pendingAmount += amount;
      } else if (commission.status === 'settled') {
        stats.settledAmount += amount;
      }

      stats.orderCount.add(commission.orderId);

      const type = commission.agentType || commission.payeeType || 'other';
      stats.commissionsByType[type] = (stats.commissionsByType[type] || 0) + amount;
    }

    return {
      totalEarnings: stats.totalEarnings,
      pendingAmount: stats.pendingAmount,
      settledAmount: stats.settledAmount,
      orderCount: stats.orderCount.size,
      commissionsByType: stats.commissionsByType,
    };
  }

  /**
   * 映射 AssetType 到 ProductType
   */
  private mapAssetTypeToProductType(assetType: string): 'physical' | 'service' | 'virtual' | 'nft' {
    const mapping: Record<string, 'physical' | 'service' | 'virtual' | 'nft'> = {
      physical: 'physical',
      service: 'service',
      virtual: 'virtual',
      nft_rwa: 'nft',
      dev_tool: 'service',
      subscription: 'service',
      aggregated_web2: 'service',
      aggregated_web3: 'virtual',
    };

    return mapping[assetType] || 'physical';
  }
}
