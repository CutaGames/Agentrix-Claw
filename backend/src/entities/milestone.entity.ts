import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { BudgetPool } from './budget-pool.entity';

export enum MilestoneStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  PENDING_REVIEW = 'pending_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  RELEASED = 'released',
}

export enum ApprovalType {
  AUTO = 'auto',
  MANUAL = 'manual',
  QUALITY_GATE = 'quality_gate',
}

/**
 * 里程碑参与者
 */
export interface MilestoneParticipant {
  /** Agent ID */
  agentId: string;
  /** 钱包地址 */
  address: string;
  /** 角色 */
  role: string;
  /** 分佣比例覆盖 (可选, bps) */
  shareOverride?: number;
}

/**
 * 质量门槛配置
 */
export interface QualityGate {
  /** 指标名称 */
  metric: 'test_pass_rate' | 'score' | 'custom';
  /** 阈值 */
  threshold: number;
  /** 比较操作符 */
  operator: '>=' | '>' | '=' | '<' | '<=';
  /** 自定义指标名称 */
  customMetricName?: string;
}

/**
 * 产出证明
 */
export interface Artifact {
  /** 类型 */
  type: 'document' | 'code' | 'design' | 'report' | 'other';
  /** URL */
  url?: string;
  /** 内容哈希 */
  hash?: string;
  /** 描述 */
  description?: string;
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * Milestone Entity - 里程碑
 * 
 * 预算池下的子任务单元，支持分阶段验收和资金释放
 */
@Entity('milestones')
@Index(['budgetPoolId', 'status'])
@Index(['orderId'])
export class Milestone {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 里程碑名称 */
  @Column({ length: 200 })
  name: string;

  /** 描述 */
  @Column({ type: 'text', nullable: true })
  description: string;

  /** 关联的预算池ID */
  @Column({ type: 'uuid' })
  budgetPoolId: string;

  @ManyToOne(() => BudgetPool, (pool) => pool.milestones)
  @JoinColumn({ name: 'budget_pool_id' })
  budgetPool: BudgetPool;

  /** 关联的订单ID (可选) */
  @Column({ type: 'uuid', nullable: true })
  orderId: string;

  /** 预留金额 (微单位) */
  @Column({ type: 'bigint', default: 0 })
  reservedAmount: string;

  /** 已释放金额 */
  @Column({ type: 'bigint', default: 0 })
  releasedAmount: string;

  /** 参与者列表 (覆盖 SplitPlan 的默认值) */
  @Column({ type: 'jsonb', default: [] })
  participants: MilestoneParticipant[];

  /** 状态 */
  @Column({
    type: 'enum',
    enum: MilestoneStatus,
    default: MilestoneStatus.PENDING,
  })
  status: MilestoneStatus;

  /** 验收类型 */
  @Column({
    type: 'enum',
    enum: ApprovalType,
    default: ApprovalType.MANUAL,
  })
  approvalType: ApprovalType;

  /** 质量门槛 (仅当 approvalType = QUALITY_GATE 时) */
  @Column({ type: 'jsonb', nullable: true })
  qualityGate: QualityGate;

  /** 产出证明 */
  @Column({ type: 'jsonb', default: [] })
  artifacts: Artifact[];

  /** 审核人ID */
  @Column({ type: 'uuid', nullable: true })
  reviewedById: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'reviewed_by_id' })
  reviewedBy: User;

  /** 审核时间 */
  @Column({ type: 'timestamp', nullable: true })
  reviewedAt: Date;

  /** 审核备注 */
  @Column({ type: 'text', nullable: true })
  reviewNote: string;

  /** 释放时间 */
  @Column({ type: 'timestamp', nullable: true })
  releasedAt: Date;

  /** 截止日期 */
  @Column({ type: 'timestamp', nullable: true })
  dueDate: Date;

  /** 排序顺序 */
  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  /** 元数据 */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;


  /** On-chain BudgetPool contract milestoneId */
  @Column({ nullable: true })
  onchainMilestoneId: number;

  /** Release transaction hash */
  @Column({ type: 'varchar', nullable: true })
  releaseTxHash: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
