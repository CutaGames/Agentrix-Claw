import { Injectable, BadRequestException, Inject, forwardRef, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommerceOrder, CommerceOrderStatus, CommerceOrderType } from '../../entities/commerce-order.entity';
import { CommerceSettlement, CommerceSettlementStatus } from '../../entities/commerce-settlement.entity';
import { CommerceLedgerEntry, LedgerEntryType } from '../../entities/commerce-ledger.entity';
import { SplitPlanService } from './split-plan.service';
import { BudgetPoolService } from './budget-pool.service';
import { UsagePatternService, UsageHint } from './usage-pattern.service';
import { CreateSplitPlanDto, UpdateSplitPlanDto, PreviewAllocationDto } from './dto/split-plan.dto';
import { 
  CreateBudgetPoolDto, 
  UpdateBudgetPoolDto, 
  FundBudgetPoolDto,
  CreateMilestoneDto,
  SubmitMilestoneDto,
  ApproveMilestoneDto,
  RejectMilestoneDto,
} from './dto/budget-pool.dto';
import { PaymentService } from '../payment/payment.service';
import { PayIntent, PayIntentStatus, PayIntentType } from '../../entities/pay-intent.entity';
import { Payment, PaymentStatus, PaymentMethod } from '../../entities/payment.entity';
import { v4 as uuidv4 } from 'uuid';
import { CacheService } from '../cache/cache.service';

// Order Item (保留此类型定义)
export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  metadata?: Record<string, any>;
}

export type CommerceMode = 'PAY_ONLY' | 'SPLIT_ONLY' | 'PAY_AND_SPLIT';

export type CommerceAction = 
  // 订单
  | 'createOrder'
  | 'getOrder'
  | 'updateOrder'
  // 支付
  | 'createPaymentIntent'
  | 'capturePayment'
  | 'refundPayment'
  // 分佣计划
  | 'createSplitPlan'
  | 'getSplitPlan'
  | 'getSplitPlans'
  | 'updateSplitPlan'
  | 'activateSplitPlan'
  | 'archiveSplitPlan'
  | 'deleteSplitPlan'
  | 'previewAllocation'
  // 预算池
  | 'createBudgetPool'
  | 'getBudgetPool'
  | 'getBudgetPools'
  | 'updateBudgetPool'
  | 'fundBudgetPool'
  | 'cancelBudgetPool'
  | 'getPoolStats'
  // 里程碑
  | 'createMilestone'
  | 'getMilestones'
  | 'getMilestone'
  | 'startMilestone'
  | 'submitMilestone'
  | 'approveMilestone'
  | 'rejectMilestone'
  | 'releaseMilestone'
  // 结算
  | 'getSettlements'
  | 'payoutSettlement'
  // 账本
  | 'getLedger';

@Injectable()
export class CommerceService {
  private readonly logger = new Logger(CommerceService.name);

  constructor(
    @InjectRepository(CommerceOrder)
    private readonly orderRepository: Repository<CommerceOrder>,
    @InjectRepository(CommerceSettlement)
    private readonly settlementRepository: Repository<CommerceSettlement>,
    @InjectRepository(CommerceLedgerEntry)
    private readonly ledgerRepository: Repository<CommerceLedgerEntry>,
    private readonly splitPlanService: SplitPlanService,
    private readonly budgetPoolService: BudgetPoolService,
    private readonly usagePatternService: UsagePatternService,
    private readonly cacheService: CacheService,
    @Inject(forwardRef(() => PaymentService))
    private readonly paymentService?: PaymentService,
  ) {}

  /**
   * 幂等性检查
   */
  private async checkIdempotency(key: string): Promise<{ cached: boolean; result?: any }> {
    const cached = await this.cacheService.get<{ result: any; expiresAt: number }>(`idempotency:${key}`);
    if (cached) {
      this.logger.debug(`Idempotency cache hit for key: ${key}`);
      return { cached: true, result: cached.result };
    }
    return { cached: false };
  }

  /**
   * 保存幂等性结果
   */
  private async saveIdempotencyResult(key: string, result: any, ttlMs: number = 24 * 60 * 60 * 1000): Promise<void> {
    const ttlSeconds = Math.floor(ttlMs / 1000);
    await this.cacheService.set(`idempotency:${key}`, {
      result,
      expiresAt: Date.now() + ttlMs,
    }, ttlSeconds);
  }

  /**
   * 统一执行入口
   */
  async execute(
    action: CommerceAction,
    mode: CommerceMode,
    params: Record<string, any>,
    userId?: string,
    idempotencyKey?: string,
  ) {
    // 幂等性检查
    if (idempotencyKey) {
      const { cached, result } = await this.checkIdempotency(idempotencyKey);
      if (cached) {
        return result;
      }
    }

    // 记录调用（用于模式分析）
    if (userId) {
      this.usagePatternService.recordCall(userId, action, params);
    }

    let result: any;

    switch (action) {
      // ===== 分佣计划 =====
      case 'createSplitPlan':
        if (!userId) throw new BadRequestException('User authentication required');
        return this.splitPlanService.create(userId, params as CreateSplitPlanDto);

      case 'getSplitPlans':
        if (!userId) throw new BadRequestException('User authentication required');
        return this.splitPlanService.findByUser(userId, params);

      case 'getSplitPlan':
        return this.splitPlanService.findById(params.id, userId);

      case 'updateSplitPlan':
        if (!userId) throw new BadRequestException('User authentication required');
        return this.splitPlanService.update(params.id, userId, params as UpdateSplitPlanDto);

      case 'activateSplitPlan':
        if (!userId) throw new BadRequestException('User authentication required');
        return this.splitPlanService.activate(params.id, userId);

      case 'archiveSplitPlan':
        if (!userId) throw new BadRequestException('User authentication required');
        return this.splitPlanService.archive(params.id, userId);

      case 'deleteSplitPlan':
        if (!userId) throw new BadRequestException('User authentication required');
        await this.splitPlanService.remove(params.id, userId);
        return { success: true };

      case 'previewAllocation':
        return this.splitPlanService.previewAllocation(params as PreviewAllocationDto);

      // ===== 预算池 =====
      case 'createBudgetPool':
        if (!userId) throw new BadRequestException('User authentication required');
        return this.budgetPoolService.createPool(userId, params as CreateBudgetPoolDto);

      case 'getBudgetPools':
        if (!userId) throw new BadRequestException('User authentication required');
        return this.budgetPoolService.findPoolsByUser(userId, params);

      case 'getBudgetPool':
        return this.budgetPoolService.findPoolById(params.id, userId);

      case 'updateBudgetPool':
        if (!userId) throw new BadRequestException('User authentication required');
        return this.budgetPoolService.updatePool(params.id, userId, params as UpdateBudgetPoolDto);

      case 'fundBudgetPool':
        if (!userId) throw new BadRequestException('User authentication required');
        return this.budgetPoolService.fundPool(params.id, userId, params as FundBudgetPoolDto);

      case 'cancelBudgetPool':
        if (!userId) throw new BadRequestException('User authentication required');
        return this.budgetPoolService.cancelPool(params.id, userId);

      case 'getPoolStats':
        if (!userId) throw new BadRequestException('User authentication required');
        return this.budgetPoolService.getPoolStats(params.id, userId);

      // ===== 里程碑 =====
      case 'createMilestone':
        if (!userId) throw new BadRequestException('User authentication required');
        return this.budgetPoolService.createMilestone(userId, params as CreateMilestoneDto);

      case 'getMilestones':
        return this.budgetPoolService.findMilestonesByPool(params.budgetPoolId);

      case 'getMilestone':
        return this.budgetPoolService.findMilestoneById(params.id);

      case 'startMilestone':
        if (!userId) throw new BadRequestException('User authentication required');
        return this.budgetPoolService.startMilestone(params.id, userId);

      case 'submitMilestone':
        return this.budgetPoolService.submitMilestone(params.id, params as SubmitMilestoneDto);

      case 'approveMilestone':
        if (!userId) throw new BadRequestException('User authentication required');
        return this.budgetPoolService.approveMilestone(params.id, userId, params as ApproveMilestoneDto);

      case 'rejectMilestone':
        if (!userId) throw new BadRequestException('User authentication required');
        return this.budgetPoolService.rejectMilestone(params.id, userId, params as RejectMilestoneDto);

      case 'releaseMilestone':
        if (!userId) throw new BadRequestException('User authentication required');
        result = await this.budgetPoolService.releaseMilestone(params.id, userId);
        break;

      // ===== 订单管理 =====
      case 'createOrder':
        if (!userId) throw new BadRequestException('User authentication required');
        result = await this.createOrder(userId, params as any);
        break;

      case 'getOrder':
        result = await this.getOrder(params.id, userId);
        break;

      case 'updateOrder':
        if (!userId) throw new BadRequestException('User authentication required');
        result = await this.updateOrder(params.id, userId, params);
        break;

      // ===== 支付处理 =====
      case 'createPaymentIntent':
        if (!userId) throw new BadRequestException('User authentication required');
        result = await this.createPaymentIntentForOrder(userId, params as any);
        break;

      case 'capturePayment':
        if (!userId) throw new BadRequestException('User authentication required');
        result = await this.capturePayment(userId, params as any);
        break;

      case 'refundPayment':
        if (!userId) throw new BadRequestException('User authentication required');
        result = await this.refundPayment(userId, params as any);
        break;

      // ===== 结算 =====
      case 'getSettlements':
        if (!userId) throw new BadRequestException('User authentication required');
        result = await this.getSettlements(userId, params);
        break;

      case 'payoutSettlement':
        if (!userId) throw new BadRequestException('User authentication required');
        result = await this.payoutSettlement(userId, params as any);
        break;

      // ===== 账本 =====
      case 'getLedger':
        if (!userId) throw new BadRequestException('User authentication required');
        result = await this.getLedger(userId, params);
        break;

      default:
        throw new BadRequestException(`Unknown action: ${action}`);
    }

    // 保存幂等性结果
    if (idempotencyKey && result) {
      await this.saveIdempotencyResult(idempotencyKey, result);
    }

    return result;
  }

  // ==================== 订单管理 ====================

  /**
   * 创建订单
   */
  private async createOrder(userId: string, params: {
    type: 'product' | 'service' | 'subscription';
    items: OrderItem[];
    currency?: string;
    splitPlanId?: string;
    metadata?: Record<string, any>;
  }): Promise<CommerceOrder> {
    const totalAmount = params.items.reduce((sum, item) => sum + item.totalPrice, 0);
    
    const order = this.orderRepository.create({
      userId,
      type: params.type as CommerceOrderType,
      status: CommerceOrderStatus.DRAFT,
      amount: totalAmount,
      currency: params.currency || 'USD',
      items: params.items.map(item => ({
        ...item,
        id: item.id || uuidv4(),
      })),
      splitPlanId: params.splitPlanId,
      metadata: params.metadata,
    });

    const savedOrder = await this.orderRepository.save(order);
    this.logger.log(`Order created: ${savedOrder.id}, amount: ${savedOrder.amount} ${savedOrder.currency}`);

    // 记录账本
    await this.addLedgerEntry({
      type: LedgerEntryType.ORDER_CREATED,
      orderId: savedOrder.id,
      userId,
      amount: savedOrder.amount,
      currency: savedOrder.currency,
    });

    return savedOrder;
  }

  /**
   * 获取订单
   */
  private async getOrder(orderId: string, userId?: string): Promise<CommerceOrder> {
    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) {
      throw new BadRequestException(`Order not found: ${orderId}`);
    }
    if (userId && order.userId !== userId) {
      throw new BadRequestException('Access denied');
    }
    return order;
  }

  /**
   * 更新订单
   */
  private async updateOrder(orderId: string, userId: string, params: {
    status?: CommerceOrderStatus;
    items?: OrderItem[];
    metadata?: Record<string, any>;
  }): Promise<CommerceOrder> {
    const order = await this.getOrder(orderId, userId);

    if (order.status === CommerceOrderStatus.PAID || order.status === CommerceOrderStatus.FULFILLED) {
      throw new BadRequestException('Cannot update a paid or fulfilled order');
    }

    if (params.items) {
      order.items = params.items;
      order.amount = params.items.reduce((sum, item) => sum + item.totalPrice, 0);
    }

    if (params.status) {
      order.status = params.status;
    }

    if (params.metadata) {
      order.metadata = { ...order.metadata, ...params.metadata };
    }

    return await this.orderRepository.save(order);
  }

  // ==================== 支付处理 ====================

  /**
   * 为订单创建支付意图
   */
  private async createPaymentIntentForOrder(userId: string, params: {
    orderId: string;
    paymentMethod?: string;
    returnUrl?: string;
    metadata?: Record<string, any>;
  }): Promise<any> {
    const order = await this.getOrder(params.orderId, userId);

    if (order.status !== CommerceOrderStatus.DRAFT && order.status !== CommerceOrderStatus.PENDING) {
      throw new BadRequestException(`Order is not in a payable state: ${order.status}`);
    }

    // 更新订单状态为 pending
    order.status = CommerceOrderStatus.PENDING;
    await this.orderRepository.save(order);

    // 如果有支付服务，创建真实的支付意图
    if (this.paymentService) {
      try {
        const paymentIntent = await this.paymentService.createPaymentIntent(userId, {
          amount: order.amount,
          currency: order.currency,
          description: `Order ${order.id}`,
          paymentMethod: params.paymentMethod as any,
          metadata: {
            orderId: order.id,
            splitPlanId: order.splitPlanId,
            ...params.metadata,
          },
        });

        order.paymentIntentId = (paymentIntent as any).id || (paymentIntent as any).paymentIntentId;
        await this.orderRepository.save(order);

        return {
          paymentIntent,
          order: {
            id: order.id,
            status: order.status,
            amount: order.amount,
            currency: order.currency,
          },
        };
      } catch (error: any) {
        this.logger.error(`Failed to create payment intent: ${error.message}`);
        throw error;
      }
    }

    // 模拟支付意图（无支付服务时）
    return {
      id: `pi_${uuidv4()}`,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      status: 'requires_payment_method',
      clientSecret: `pi_${uuidv4()}_secret_${uuidv4()}`,
      message: 'Payment service not available, using mock response',
    };
  }

  /**
   * 捕获支付
   */
  private async capturePayment(userId: string, params: {
    orderId: string;
    paymentIntentId?: string;
    txHash?: string;
  }): Promise<any> {
    const order = await this.getOrder(params.orderId, userId);

    if (order.status !== CommerceOrderStatus.PENDING) {
      throw new BadRequestException(`Order is not pending payment: ${order.status}`);
    }

    // 更新订单状态
    order.status = CommerceOrderStatus.PAID;
    order.metadata = {
      ...order.metadata,
      paidAt: new Date(),
      txHash: params.txHash,
      paymentIntentId: params.paymentIntentId,
    };
    await this.orderRepository.save(order);

    // 如果有分佣计划，创建结算记录
    if (order.splitPlanId) {
      await this.createSettlementFromOrder(order);
    }

    // 记录账本
    await this.addLedgerEntry({
      type: LedgerEntryType.PAYMENT_CAPTURED,
      orderId: order.id,
      userId,
      amount: order.amount,
      currency: order.currency,
      metadata: { txHash: params.txHash },
    });

    this.logger.log(`Payment captured for order ${order.id}`);

    return {
      success: true,
      order: {
        id: order.id,
        status: order.status,
        amount: order.amount,
      },
    };
  }

  /**
   * 退款
   */
  private async refundPayment(userId: string, params: {
    orderId: string;
    amount?: number;
    reason?: string;
  }): Promise<any> {
    const order = await this.getOrder(params.orderId, userId);

    if (order.status !== CommerceOrderStatus.PAID && order.status !== CommerceOrderStatus.FULFILLED) {
      throw new BadRequestException(`Order cannot be refunded: ${order.status}`);
    }

    const refundAmount = params.amount || order.amount;

    // 更新订单状态
    order.status = CommerceOrderStatus.REFUNDED;
    order.metadata = {
      ...order.metadata,
      refundedAt: new Date(),
      refundAmount,
      refundReason: params.reason,
    };
    await this.orderRepository.save(order);

    // 记录账本
    await this.addLedgerEntry({
      type: LedgerEntryType.REFUND,
      orderId: order.id,
      userId,
      amount: -refundAmount,
      currency: order.currency,
      reason: params.reason,
    });

    this.logger.log(`Refund processed for order ${order.id}, amount: ${refundAmount}`);

    return {
      success: true,
      refundId: `ref_${uuidv4()}`,
      orderId: order.id,
      amount: refundAmount,
      status: 'refunded',
    };
  }

  // ==================== 结算管理 ====================

  /**
   * 从订单创建结算记录
   */
  private async createSettlementFromOrder(order: CommerceOrder): Promise<void> {
    if (!order.splitPlanId) return;

    try {
      const splitPlan = await this.splitPlanService.findById(order.splitPlanId, order.userId);
      const preview = await this.splitPlanService.previewAllocation({
        splitPlanId: order.splitPlanId,
        amount: order.amount,
        currency: order.currency,
      });

      const settlement = this.settlementRepository.create({
        orderId: order.id,
        splitPlanId: order.splitPlanId,
        totalAmount: order.amount,
        currency: order.currency,
        platformFee: preview.fees.totalFees,
        netAmount: preview.merchantNet,
        allocations: preview.allocations.map(a => ({
          recipientId: a.recipient,
          role: a.role,
          amount: a.amount,
          shareBps: Math.round(a.percentage * 100),
        })),
        status: CommerceSettlementStatus.PENDING,
      });

      const saved = await this.settlementRepository.save(settlement);
      this.logger.log(`Settlement created: ${saved.id} for order ${order.id}`);
    } catch (error: any) {
      this.logger.error(`Failed to create settlement: ${error.message}`);
    }
  }

  /**
   * 获取结算列表
   */
  private async getSettlements(userId: string, params: {
    status?: CommerceSettlementStatus;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }): Promise<any> {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const offset = (page - 1) * limit;

    const queryBuilder = this.settlementRepository.createQueryBuilder('settlement');

    if (params.status) {
      queryBuilder.andWhere('settlement.status = :status', { status: params.status });
    }
    if (params.startDate) {
      queryBuilder.andWhere('settlement.createdAt >= :startDate', { startDate: params.startDate });
    }
    if (params.endDate) {
      queryBuilder.andWhere('settlement.createdAt <= :endDate', { endDate: params.endDate });
    }

    queryBuilder.orderBy('settlement.createdAt', 'DESC');

    const [items, total] = await queryBuilder
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 结算打款
   */
  private async payoutSettlement(userId: string, params: {
    settlementId: string;
  }): Promise<any> {
    const settlement = await this.settlementRepository.findOne({ where: { id: params.settlementId } });
    if (!settlement) {
      throw new BadRequestException(`Settlement not found: ${params.settlementId}`);
    }

    if (settlement.status === CommerceSettlementStatus.PAID) {
      throw new BadRequestException('Settlement already paid');
    }

    // 模拟打款处理
    settlement.status = CommerceSettlementStatus.PAID;
    settlement.paidAt = new Date();
    settlement.paidBy = userId;
    await this.settlementRepository.save(settlement);

    // 记录每个分配的账本条目
    for (const allocation of settlement.allocations) {
      await this.addLedgerEntry({
        type: LedgerEntryType.PAYOUT,
        settlementId: settlement.id,
        recipientId: allocation.recipientId,
        amount: allocation.amount,
        currency: settlement.currency,
      });
    }

    this.logger.log(`Settlement paid: ${settlement.id}`);

    return {
      success: true,
      settlementId: settlement.id,
      status: 'paid',
      paidAt: settlement.paidAt,
      allocations: settlement.allocations,
    };
  }

  // ==================== 账本查询 ====================

  /**
   * 添加账本条目
   */
  private async addLedgerEntry(entry: {
    type: LedgerEntryType;
    userId?: string;
    orderId?: string;
    settlementId?: string;
    recipientId?: string;
    amount: number;
    currency: string;
    reason?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    const ledgerEntry = this.ledgerRepository.create(entry);
    await this.ledgerRepository.save(ledgerEntry);
  }

  /**
   * 获取账本
   */
  private async getLedger(userId: string, params: {
    type?: LedgerEntryType;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }): Promise<any> {
    const page = params.page || 1;
    const limit = params.limit || 50;
    const offset = (page - 1) * limit;

    const queryBuilder = this.ledgerRepository.createQueryBuilder('ledger');

    if (params.type) {
      queryBuilder.andWhere('ledger.type = :type', { type: params.type });
    }
    if (params.startDate) {
      queryBuilder.andWhere('ledger.createdAt >= :startDate', { startDate: params.startDate });
    }
    if (params.endDate) {
      queryBuilder.andWhere('ledger.createdAt <= :endDate', { endDate: params.endDate });
    }

    queryBuilder.orderBy('ledger.createdAt', 'DESC');

    const [items, total] = await queryBuilder
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    // 计算汇总
    const summaryResult = await this.ledgerRepository
      .createQueryBuilder('ledger')
      .select('SUM(CASE WHEN ledger.amount > 0 THEN ledger.amount ELSE 0 END)', 'totalIncome')
      .addSelect('SUM(CASE WHEN ledger.amount < 0 THEN ABS(ledger.amount) ELSE 0 END)', 'totalExpense')
      .addSelect('SUM(ledger.amount)', 'netBalance')
      .getRawOne();

    const summary = {
      totalIncome: parseFloat(summaryResult.totalIncome || '0'),
      totalExpense: parseFloat(summaryResult.totalExpense || '0'),
      netBalance: parseFloat(summaryResult.netBalance || '0'),
    };

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      summary,
    };
  }

  // ===== 引导转化相关方法 =====

  /**
   * 获取用户使用统计
   */
  async getUsageStats(userId: string) {
    return this.usagePatternService.getUsageStats(userId);
  }

  /**
   * 获取用户转化引导建议
   */
  async getConversionHints(userId: string): Promise<UsageHint | null> {
    return this.usagePatternService.generateHints(userId);
  }

  /**
   * 获取推荐的Marketplace配置
   */
  async getSuggestedMarketplaceConfig(userId: string) {
    return this.usagePatternService.getSuggestedMarketplaceConfig(userId);
  }

  /**
   * 关闭特定引导提示
   */
  async dismissHint(userId: string, hintType: string) {
    this.usagePatternService.dismissHint(userId, hintType);
    return { success: true };
  }

  /**
   * 包装响应（附加引导信息）
   */
  wrapResponseWithHints<T>(data: T, userId?: string): { data: T; hints?: UsageHint } {
    if (!userId) {
      return { data };
    }

    const hint = this.usagePatternService.generateHints(userId);
    return {
      data,
      ...(hint && { hints: hint }),
    };
  }
}
