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
import { AgentRegistry } from './agent-registry.entity';

export enum AuthorizationStatus {
  ACTIVE = 'active',
  REVOKED = 'revoked',
  EXPIRED = 'expired',
  SUSPENDED = 'suspended',
}

/**
 * 授权类型
 * - manual: 手动授权（需要用户确认）
 * - auto_pay: 自动支付授权（在限额内自动执行）
 */
export enum AuthorizationType {
  MANUAL = 'manual',
  AUTO_PAY = 'auto_pay',
}

/**
 * 统一授权实体
 * 合并了原 Authorization 和 AutoPayGrant 的功能
 * 支持手动授权和自动支付授权两种类型
 */
@Entity('authorizations')
@Index(['userId', 'agentId'])
@Index(['userId', 'status'])
export class Authorization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn()
  user: User;

  @Column()
  userId: string;

  @ManyToOne(() => AgentRegistry, { nullable: true })
  @JoinColumn()
  agent: AgentRegistry;

  @Column({ nullable: true })
  agentId: string;

  /**
   * 授权类型：手动授权或自动支付
   */
  @Column({ type: 'enum',
    enum: AuthorizationType,
    default: AuthorizationType.MANUAL })
  authorizationType: AuthorizationType;

  /**
   * 是否为自动支付授权（兼容旧代码的快捷属性）
   */
  @Column({ default: false })
  isAutoPay: boolean;

  @Column({ type: 'simple-array', nullable: true })
  merchantScope: string[]; // 允许的商户ID列表，null表示全部

  @Column({ type: 'simple-array', nullable: true })
  categoryScope: string[]; // 允许的商品类目列表

  @Column('decimal', { name: 'single_tx_limit', precision: 15, scale: 2, nullable: true })
  singleTxLimit: number;

  @Column('decimal', { name: 'daily_limit', precision: 15, scale: 2, nullable: true })
  dailyLimit: number;

  @Column('decimal', { name: 'monthly_limit', precision: 15, scale: 2, nullable: true })
  monthlyLimit: number;

  /**
   * 今日已使用金额（用于自动支付限额控制）
   */
  @Column('decimal', { name: 'used_today', precision: 15, scale: 2, default: 0 })
  usedToday: number;

  /**
   * 本月已使用金额
   */
  @Column('decimal', { name: 'used_this_month', precision: 15, scale: 2, default: 0 })
  usedThisMonth: number;

  /**
   * 累计使用金额
   */
  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  totalUsed: number;

  /**
   * 上次每日限额重置日期
   */
  @Column({ type: 'date', nullable: true })
  lastDailyResetDate: Date;

  /**
   * 上次每月限额重置日期
   */
  @Column({ type: 'date', nullable: true })
  lastMonthlyResetDate: Date;

  @Column({
    type: 'enum',
    enum: AuthorizationStatus,
    default: AuthorizationStatus.ACTIVE,
  })
  status: AuthorizationStatus;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date;

  /**
   * 授权描述/备注
   */
  @Column({ nullable: true, length: 500 })
  description: string;

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
