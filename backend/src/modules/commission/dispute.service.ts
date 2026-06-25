import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan } from 'typeorm';
import { Order, OrderStatus } from '../../entities/order.entity';
import { Commission } from '../../entities/commission.entity';
import { Cron, CronExpression } from '@nestjs/schedule';

/**
 * 争议状态
 */
export enum DisputeStatus {
  OPEN = 'open',
  UNDER_REVIEW = 'under_review',
  RESOLVED_FAVOR_BUYER = 'resolved_favor_buyer',
  RESOLVED_FAVOR_SELLER = 'resolved_favor_seller',
  ESCALATED = 'escalated',
  CLOSED = 'closed',
}

/**
 * 争议类型
 */
export enum DisputeType {
  PRODUCT_NOT_RECEIVED = 'product_not_received',
  PRODUCT_NOT_AS_DESCRIBED = 'product_not_as_described',
  UNAUTHORIZED_TRANSACTION = 'unauthorized_transaction',
  DUPLICATE_CHARGE = 'duplicate_charge',
  SERVICE_NOT_PROVIDED = 'service_not_provided',
  AGENT_TASK_INCOMPLETE = 'agent_task_incomplete',
  OTHER = 'other',
}

/**
 * 争议记录
 */
export interface DisputeRecord {
  id: string;
  orderId: string;
  paymentId?: string;
  type: DisputeType;
  status: DisputeStatus;
  initiator: string; // 发起方（买家/卖家）
  respondent: string; // 响应方
  amount: number;
  currency: string;
  description: string;
  evidence?: {
    type: 'text' | 'image' | 'document' | 'transaction';
    content: string;
    submittedBy: string;
    submittedAt: Date;
  }[];
  arbitrator?: string; // 仲裁者
  resolution?: {
    outcome: 'refund' | 'partial_refund' | 'no_refund' | 'custom';
    refundAmount?: number;
    decision: string;
    decidedBy: string;
    decidedAt: Date;
  };
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date; // 争议期截止时间
}

/**
 * 结算冻结记录
 */
export interface FreezeRecord {
  orderId: string;
  commissionIds: string[];
  reason: string;
  frozenAt: Date;
  unfreezeAt?: Date;
  disputeId?: string;
}

/**
 * 争议期与结算冻结服务
 * 
 * 功能：
 * 1. 实现"自动观察期"逻辑（如 24 小时内无争议才最终结算）
 * 2. 基于 Commission.sol 的 isDisputed 标志管理争议状态
 * 3. 引入第三方仲裁 Agent 概念
 */
@Injectable()
export class DisputeService {
  private readonly logger = new Logger(DisputeService.name);

  // 默认观察期（毫秒）
  private readonly DEFAULT_OBSERVATION_PERIOD = 24 * 60 * 60 * 1000; // 24 小时

  // 争议记录存储（实际应使用数据库实体）
  private disputes: Map<string, DisputeRecord> = new Map();

  // 冻结记录存储
  private freezeRecords: Map<string, FreezeRecord> = new Map();

  // 指定的仲裁 Agent 列表
  private arbitrators: Set<string> = new Set();

  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(Commission)
    private commissionRepository: Repository<Commission>,
  ) {
    // 添加默认仲裁者（可配置）
    this.arbitrators.add('arbitrator-agent-1');
    this.arbitrators.add('arbitrator-agent-2');
  }

  /**
   * 创建争议
   */
  async createDispute(params: {
    orderId: string;
    type: DisputeType;
    initiator: string;
    description: string;
    evidence?: DisputeRecord['evidence'];
  }): Promise<DisputeRecord> {
    // 1. 验证订单存在
    const order = await this.orderRepository.findOne({ where: { id: params.orderId } });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // 2. 检查是否已有未解决的争议
    const existingDispute = Array.from(this.disputes.values()).find(
      d => d.orderId === params.orderId && d.status === DisputeStatus.OPEN
    );
    if (existingDispute) {
      throw new BadRequestException('An open dispute already exists for this order');
    }

    // 3. 检查是否在争议期内
    const orderAge = Date.now() - new Date(order.createdAt).getTime();
    const disputeWindow = 7 * 24 * 60 * 60 * 1000; // 7 天争议窗口
    if (orderAge > disputeWindow) {
      throw new BadRequestException('Dispute window has expired');
    }

    // 4. 创建争议记录
    const dispute: DisputeRecord = {
      id: `dispute-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      orderId: params.orderId,
      paymentId: order.paymentId,
      type: params.type,
      status: DisputeStatus.OPEN,
      initiator: params.initiator,
      respondent: params.initiator === order.userId ? order.merchantId : order.userId,
      amount: order.amount,
      currency: order.currency,
      description: params.description,
      evidence: params.evidence || [],
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 天后过期
    };

    this.disputes.set(dispute.id, dispute);

    // 5. 冻结相关结算
    await this.freezeSettlement(params.orderId, dispute.id, 'Dispute opened');

    // 6. 更新订单状态
    order.status = OrderStatus.DISPUTED; // 争议中状态
    await this.orderRepository.save(order);

    this.logger.log(`Dispute created: ${dispute.id} for order ${params.orderId}`);

    return dispute;
  }

  /**
   * 提交争议证据
   */
  async submitEvidence(
    disputeId: string,
    evidence: DisputeRecord['evidence'][0],
  ): Promise<void> {
    const dispute = this.disputes.get(disputeId);
    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    if (dispute.status !== DisputeStatus.OPEN && dispute.status !== DisputeStatus.UNDER_REVIEW) {
      throw new BadRequestException('Dispute is not open for evidence submission');
    }

    dispute.evidence = dispute.evidence || [];
    dispute.evidence.push(evidence);
    dispute.updatedAt = new Date();

    this.disputes.set(disputeId, dispute);
    this.logger.log(`Evidence submitted for dispute ${disputeId}`);
  }

  /**
   * 升级到仲裁
   */
  async escalateToArbitration(disputeId: string): Promise<{ arbitrator: string }> {
    const dispute = this.disputes.get(disputeId);
    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    if (dispute.status !== DisputeStatus.OPEN) {
      throw new BadRequestException('Only open disputes can be escalated');
    }

    // 选择仲裁者（轮询或随机）
    const arbitratorArray = Array.from(this.arbitrators);
    const arbitrator = arbitratorArray[Math.floor(Math.random() * arbitratorArray.length)];

    dispute.status = DisputeStatus.ESCALATED;
    dispute.arbitrator = arbitrator;
    dispute.updatedAt = new Date();

    this.disputes.set(disputeId, dispute);
    this.logger.log(`Dispute ${disputeId} escalated to arbitrator ${arbitrator}`);

    return { arbitrator };
  }

  /**
   * 仲裁者做出裁决
   */
  async resolveDispute(
    disputeId: string,
    resolution: {
      outcome: 'refund' | 'partial_refund' | 'no_refund' | 'custom';
      refundAmount?: number;
      decision: string;
    },
    arbitratorId: string,
  ): Promise<void> {
    const dispute = this.disputes.get(disputeId);
    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    // 验证仲裁者权限
    if (dispute.arbitrator && dispute.arbitrator !== arbitratorId) {
      throw new BadRequestException('Only the assigned arbitrator can resolve this dispute');
    }

    if (!this.arbitrators.has(arbitratorId)) {
      throw new BadRequestException('Not a valid arbitrator');
    }

    // 更新争议状态
    let newStatus: DisputeStatus;
    if (resolution.outcome === 'refund') {
      newStatus = DisputeStatus.RESOLVED_FAVOR_BUYER;
    } else if (resolution.outcome === 'no_refund') {
      newStatus = DisputeStatus.RESOLVED_FAVOR_SELLER;
    } else {
      newStatus = DisputeStatus.CLOSED;
    }

    dispute.status = newStatus;
    dispute.resolution = {
      outcome: resolution.outcome,
      refundAmount: resolution.refundAmount,
      decision: resolution.decision,
      decidedBy: arbitratorId,
      decidedAt: new Date(),
    };
    dispute.updatedAt = new Date();

    this.disputes.set(disputeId, dispute);

    // 根据裁决执行操作
    if (resolution.outcome === 'refund' || resolution.outcome === 'partial_refund') {
      // 处理退款
      await this.processRefund(dispute, resolution.refundAmount || dispute.amount);
    } else {
      // 解冻结算
      await this.unfreezeSettlement(dispute.orderId);
    }

    this.logger.log(`Dispute ${disputeId} resolved: ${resolution.outcome}`);
  }

  /**
   * 冻结结算
   */
  async freezeSettlement(orderId: string, disputeId: string, reason: string): Promise<void> {
    // 查找相关的分润记录
    const commissions = await this.commissionRepository.find({
      where: { orderId, status: 'pending' },
    });

    const commissionIds = commissions.map(c => c.id);

    // 更新分润状态为冻结
    for (const commission of commissions) {
      commission.status = 'frozen';
      await this.commissionRepository.save(commission);
    }

    // 记录冻结
    const freeze: FreezeRecord = {
      orderId,
      commissionIds,
      reason,
      frozenAt: new Date(),
      disputeId,
    };

    this.freezeRecords.set(orderId, freeze);
    this.logger.log(`Settlement frozen for order ${orderId}: ${commissionIds.length} commissions`);
  }

  /**
   * 解冻结算
   */
  async unfreezeSettlement(orderId: string): Promise<void> {
    const freeze = this.freezeRecords.get(orderId);
    if (!freeze) {
      return;
    }

    // 恢复分润状态
    for (const commissionId of freeze.commissionIds) {
      const commission = await this.commissionRepository.findOne({ where: { id: commissionId } });
      if (commission && commission.status === 'frozen') {
        commission.status = 'pending';
        await this.commissionRepository.save(commission);
      }
    }

    freeze.unfreezeAt = new Date();
    this.freezeRecords.set(orderId, freeze);
    this.logger.log(`Settlement unfrozen for order ${orderId}`);
  }

  /**
   * 检查订单是否可以结算
   * 实现"自动观察期"逻辑
   */
  async canSettle(orderId: string): Promise<{
    canSettle: boolean;
    reason?: string;
    waitUntil?: Date;
  }> {
    // 1. 检查是否有未解决的争议
    const activeDispute = Array.from(this.disputes.values()).find(
      d => d.orderId === orderId && 
           (d.status === DisputeStatus.OPEN || 
            d.status === DisputeStatus.UNDER_REVIEW ||
            d.status === DisputeStatus.ESCALATED)
    );

    if (activeDispute) {
      return {
        canSettle: false,
        reason: `Active dispute: ${activeDispute.id}`,
      };
    }

    // 2. 检查观察期
    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) {
      return { canSettle: false, reason: 'Order not found' };
    }

    const orderCompletedAt = order.updatedAt || order.createdAt;
    const observationEndTime = new Date(orderCompletedAt.getTime() + this.DEFAULT_OBSERVATION_PERIOD);

    if (Date.now() < observationEndTime.getTime()) {
      return {
        canSettle: false,
        reason: 'Observation period not ended',
        waitUntil: observationEndTime,
      };
    }

    // 3. 检查是否被冻结
    const freeze = this.freezeRecords.get(orderId);
    if (freeze && !freeze.unfreezeAt) {
      return {
        canSettle: false,
        reason: 'Settlement is frozen',
      };
    }

    return { canSettle: true };
  }

  /**
   * 自动结算检查（定时任务）
   */
  @Cron(CronExpression.EVERY_HOUR)
  async checkAndSettlePendingOrders(): Promise<void> {
    this.logger.log('Running automatic settlement check...');

    // 查找所有观察期已过且无争议的待结算订单
    const observationCutoff = new Date(Date.now() - this.DEFAULT_OBSERVATION_PERIOD);

    try {
      const pendingOrders = await this.orderRepository.find({
        where: {
          status: OrderStatus.COMPLETED,
          updatedAt: LessThan(observationCutoff),
        },
        take: 100, // 每次最多处理 100 个
      });

      for (const order of pendingOrders) {
        const { canSettle, reason } = await this.canSettle(order.id);
        if (canSettle) {
          // 触发结算
          await this.triggerSettlement(order.id);
        } else {
          this.logger.debug(`Order ${order.id} cannot be settled: ${reason}`);
        }
      }

      this.logger.log(`Processed ${pendingOrders.length} orders for settlement`);
    } catch (error: any) {
      this.logger.error(`Settlement check failed: ${error.message}`);
    }
  }

  /**
   * 获取争议详情
   */
  getDispute(disputeId: string): DisputeRecord | null {
    return this.disputes.get(disputeId) || null;
  }

  /**
   * 获取订单的所有争议
   */
  getOrderDisputes(orderId: string): DisputeRecord[] {
    return Array.from(this.disputes.values()).filter(d => d.orderId === orderId);
  }

  /**
   * 添加仲裁者
   */
  addArbitrator(agentId: string): void {
    this.arbitrators.add(agentId);
    this.logger.log(`Added arbitrator: ${agentId}`);
  }

  /**
   * 移除仲裁者
   */
  removeArbitrator(agentId: string): void {
    this.arbitrators.delete(agentId);
    this.logger.log(`Removed arbitrator: ${agentId}`);
  }

  // ========== 私有方法 ==========

  private async processRefund(dispute: DisputeRecord, refundAmount: number): Promise<void> {
    // TODO: 实现退款逻辑
    // 1. 调用支付服务发起退款
    // 2. 更新订单状态
    // 3. 取消相关分润
    this.logger.log(`Processing refund for dispute ${dispute.id}: ${refundAmount} ${dispute.currency}`);

    // 取消冻结的分润
    const freeze = this.freezeRecords.get(dispute.orderId);
    if (freeze) {
      for (const commissionId of freeze.commissionIds) {
        const commission = await this.commissionRepository.findOne({ where: { id: commissionId } });
        if (commission) {
          commission.status = 'cancelled';
          await this.commissionRepository.save(commission);
        }
      }
    }
  }

  private async triggerSettlement(orderId: string): Promise<void> {
    // TODO: 调用结算服务执行结算
    // 1. 获取所有待结算的分润
    // 2. 调用合约的 distribute 函数
    // 3. 更新分润状态

    this.logger.log(`Triggering settlement for order ${orderId}`);

    const commissions = await this.commissionRepository.find({
      where: { orderId, status: 'pending' },
    });

    for (const commission of commissions) {
      commission.status = 'ready'; // 标记为可结算
      await this.commissionRepository.save(commission);
    }
  }
}
