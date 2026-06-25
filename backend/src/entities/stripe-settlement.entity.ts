import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Stripe 结算状态
 */
export enum StripeSettlementStatus {
  PENDING = 'pending',           // 等待结算
  PROCESSING = 'processing',     // 处理中
  SETTLED = 'settled',           // 已结算（资金已转移）
  FAILED = 'failed',             // 结算失败
  DISPUTED = 'disputed',         // 争议中
  REFUNDED = 'refunded',         // 已退款
}

/**
 * Stripe 结算记录实体
 * 
 * 用于持久化 Webhook 接收到的支付成功记录，
 * 支持 T+3 批量结算和分佣计算
 */
@Entity('stripe_settlements')
export class StripeSettlement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Stripe PaymentIntent ID
   * 用于幂等性检查和 Stripe API 关联
   */
  @Column({ unique: true })
  @Index()
  paymentIntentId: string;

  /**
   * 关联的内部 Payment ID
   */
  @Column({ nullable: true })
  @Index()
  paymentId: string;

  /**
   * 关联的订单 ID
   */
  @Column({ nullable: true })
  @Index()
  orderId: string;

  /**
   * 原始支付金额（单位：美元）
   */
  @Column('decimal', { precision: 15, scale: 2 })
  amount: number;

  /**
   * 货币
   */
  @Column({ length: 10, default: 'USD' })
  currency: string;

  /**
   * Stripe 手续费
   */
  @Column('decimal', { precision: 15, scale: 2 })
  stripeFee: number;

  /**
   * 扣除 Stripe 手续费后的净额
   */
  @Column('decimal', { precision: 15, scale: 2 })
  netAmount: number;

  /**
   * 商户 ID
   */
  @Column({ nullable: true })
  @Index()
  merchantId: string;

  /**
   * Stripe Connect 商户账户 ID
   * 用于 Connect 原生分账
   */
  @Column({ nullable: true })
  stripeConnectAccountId: string;

  /**
   * Agent ID
   */
  @Column({ nullable: true })
  @Index()
  agentId: string;

  /**
   * 执行 Agent ID（V5.0）
   */
  @Column({ nullable: true })
  executionAgentId: string;

  /**
   * 执行 Agent Connect 账户 ID
   */
  @Column({ nullable: true })
  executionAgentConnectId: string;

  /**
   * 推荐 Agent ID（V5.0）
   */
  @Column({ nullable: true })
  recommendationAgentId: string;

  /**
   * 推荐 Agent Connect 账户 ID
   */
  @Column({ nullable: true })
  recommendationAgentConnectId: string;

  /**
   * 推广 Agent ID（V5.0）
   */
  @Column({ nullable: true })
  referralAgentId: string;

  /**
   * 推广 Agent Connect 账户 ID
   */
  @Column({ nullable: true })
  referralAgentConnectId: string;

  /**
   * 商品/技能类型（V5.0）
   * PHYSICAL | DIGITAL | SERVICE | INFRA | RESOURCE | LOGIC | COMPOSITE
   */
  @Column({ length: 20, default: 'PHYSICAL' })
  productType: string;

  /**
   * 技能层类型（旧版兼容）
   * INFRA | RESOURCE | LOGIC | COMPOSITE
   */
  @Column({ length: 20, default: 'LOGIC' })
  skillLayerType: string;

  /**
   * 分佣率（旧版兼容）
   */
  @Column('decimal', { precision: 5, scale: 4, default: 0.03 })
  commissionRate: number;

  /**
   * 平台管理费（V5.0 Base Fee）
   */
  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  baseFee: number;

  /**
   * 激励池（V5.0 Pool Fee）
   */
  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  poolFee: number;

  /**
   * 平台分佣金额（旧版兼容，= baseFee + poolFee）
   */
  @Column('decimal', { precision: 15, scale: 2 })
  platformCommission: number;

  /**
   * 平台净收益（V5.0）
   */
  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  platformNetAmount: number;

  /**
   * 商户应得金额
   */
  @Column('decimal', { precision: 15, scale: 2 })
  merchantAmount: number;

  /**
   * Agent 应得金额（旧版兼容）
   */
  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  agentAmount: number;

  /**
   * 执行 Agent 应得金额（V5.0）
   */
  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  executionAgentAmount: number;

  /**
   * 推荐 Agent 应得金额（V5.0）
   */
  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  recommendationAgentAmount: number;

  /**
   * 推广 Agent 应得金额（V5.0）
   */
  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  referralAgentAmount: number;

  /**
   * 结算状态
   */
  @Column({
    type: 'enum',
    enum: StripeSettlementStatus,
    default: StripeSettlementStatus.PENDING,
  })
  @Index()
  status: StripeSettlementStatus;

  /**
   * 结算批次 ID
   */
  @Column({ nullable: true })
  @Index()
  settlementBatchId: string;

  /**
   * Stripe Transfer ID（商户转账）
   */
  @Column({ nullable: true })
  stripeTransferId: string;

  /**
   * 执行 Agent Transfer ID（V5.0）
   */
  @Column({ nullable: true })
  executionAgentTransferId: string;

  /**
   * 推荐 Agent Transfer ID（V5.0）
   */
  @Column({ nullable: true })
  recommendationAgentTransferId: string;

  /**
   * 推广 Agent Transfer ID（V5.0）
   */
  @Column({ nullable: true })
  referralAgentTransferId: string;

  /**
   * Stripe Transfer 创建时间
   */
  @Column({ type: 'timestamp', nullable: true })
  transferredAt: Date;

  /**
   * 结算完成时间
   */
  @Column({ type: 'timestamp', nullable: true })
  settledAt: Date;

  /**
   * 审计哈希（链上存证）
   */
  @Column({ length: 128, nullable: true })
  auditProofHash: string;

  /**
   * 审计交易哈希（链上存证）
   */
  @Column({ length: 128, nullable: true })
  auditTxHash: string;

  /**
   * 失败原因
   */
  @Column({ type: 'text', nullable: true })
  failureReason: string;

  /**
   * 原始 Stripe 事件 ID（用于幂等性）
   */
  @Column({ nullable: true })
  @Index()
  stripeEventId: string;

  /**
   * 额外元数据
   */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
