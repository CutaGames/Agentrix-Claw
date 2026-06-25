import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

export enum TaskStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  IN_PROGRESS = 'in_progress',
  DELIVERED = 'delivered',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  DISPUTED = 'disputed',
}

export enum TaskType {
  CUSTOM_SERVICE = 'custom_service',
  CONSULTATION = 'consultation',
  DESIGN = 'design',
  DEVELOPMENT = 'development',
  CONTENT = 'content',
  OTHER = 'other',
}

export enum TaskVisibility {
  PRIVATE = 'private',     // 仅发布者和指定商户可见
  PUBLIC = 'public',       // 公开市场可见
  INVITE_ONLY = 'invite_only', // 仅受邀者可见
}

@Entity('merchant_tasks')
@Index(['visibility', 'status'])
@Index(['type', 'status'])
@Index(['createdAt'])
export class MerchantTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  user: User;

  @Column()
  @Index()
  userId: string; // 发起任务的用户

  @ManyToOne(() => User, { nullable: true })
  merchant: User;

  @Column({ nullable: true })
  merchantId: string; // 接收任务的商户（接单后设置）

  @Column({
    type: 'enum',
    enum: TaskType,
  })
  type: TaskType;

  @Column({
    type: 'enum',
    enum: TaskStatus,
    default: TaskStatus.PENDING,
  })
  @Index()
  status: TaskStatus;

  @Column({
    type: 'enum',
    enum: TaskVisibility,
    default: TaskVisibility.PRIVATE,
  })
  @Index()
  visibility: TaskVisibility;

  @Column()
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column('decimal', { precision: 15, scale: 2 })
  budget: number;

  @Column({ length: 10 })
  currency: string;

  @Column({ type: 'simple-array', nullable: true })
  tags: string[]; // 任务标签，用于搜索和匹配

  @Column({ type: 'jsonb', nullable: true })
  requirements: {
    deadline?: Date;
    deliverables?: string[];
    specifications?: Record<string, any>;
  };

  @Column({ type: 'jsonb', nullable: true })
  progress: {
    currentStep?: string;
    completedSteps?: string[];
    percentage?: number;
    updates?: Array<{
      message: string;
      timestamp: Date;
      attachments?: string[];
    }>;
  };

  @Column({ nullable: true })
  orderId: string; // 关联的订单ID

  @Column({ nullable: true })
  agentId: string; // 如果是Agent发起的任务

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    source?: string;
    priority?: 'low' | 'medium' | 'high';
    tags?: string[];
    skillRequirements?: string[]; // 需要的技能
    locationPreference?: string; // 地理位置偏好
    rating?: number; // 任务完成后的评分
    review?: string; // 评价内容
  };

  // ===== Commission Fields =====

  /** Platform commission rate in basis points (500 = 5%) */
  @Column({ type: 'int', default: 500 })
  commissionBps: number;

  /** Calculated platform commission amount */
  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  commissionAmount: number;

  /** Net amount payable to service provider after commission */
  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  netPayoutAmount: number;

  /** Commission settlement status */
  @Column({ type: 'varchar', length: 20, default: 'pending' })
  commissionStatus: 'pending' | 'calculated' | 'settled' | 'waived';

  /** Commission settlement transaction hash (on-chain) */
  @Column({ type: 'varchar', nullable: true })
  commissionTxHash: string;

  @CreateDateColumn()
  @Index()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  completedAt: Date;
}

