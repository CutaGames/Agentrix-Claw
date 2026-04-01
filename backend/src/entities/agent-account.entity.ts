import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { User } from './user.entity';

/**
 * AI Agent 状态
 */
export enum AgentAccountStatus {
  DRAFT = 'draft',           // 草稿（未激活）
  ACTIVE = 'active',         // 活跃
  SUSPENDED = 'suspended',   // 暂停
  REVOKED = 'revoked',       // 已撤销
}

/**
 * Agent 风险等级
 */
export enum AgentRiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Agent 类型
 */
export enum AgentType {
  PERSONAL = 'personal',     // 个人 Agent（用户创建的助手）
  MERCHANT = 'merchant',     // 商户 Agent（代表商户执行任务）
  PLATFORM = 'platform',     // 平台 Agent（Agentrix 官方）
  THIRD_PARTY = 'third_party', // 第三方 Agent（外部接入）
}

/**
 * AI Agent 独立账户实体
 * 
 * 设计目标：让 AI Agent 成为真正的经济主体
 * - 独立身份标识
 * - 独立资金账户
 * - 独立授权管理
 * - 信用评分体系
 * - 链上存证支持
 */
@Entity('agent_accounts')
@Index(['agentUniqueId'], { unique: true })
@Index(['ownerId'])
@Index(['status'])
@Index(['agentType'])
export class AgentAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * 全局唯一 Agent ID
   * 格式：AGT-{timestamp}-{random}
   * 用于外部识别和 API 调用
   */
  @Column({ unique: true, length: 50 })
  agentUniqueId: string;

  /**
   * Agent 名称
   */
  @Column({ length: 150 })
  name: string;

  /**
   * Agent 描述
   */
  @Column({ type: 'text', nullable: true })
  description?: string;

  /**
   * Agent 头像
   */
  @Column({ nullable: true, length: 500 })
  avatarUrl?: string;

  // ========== 归属关系 ==========

  /**
   * 所有者（创建者）
   * 可以是用户或另一个 Agent
   */
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn()
  owner?: User;

  @Column({ nullable: true })
  ownerId?: string;

  /**
   * 父 Agent ID（用于 Agent 创建 Agent 的场景）
   */
  @Column({ nullable: true })
  parentAgentId?: string;

  /**
   * Agent 类型
   */
  @Column({ type: 'enum',
    enum: AgentType,
    default: AgentType.PERSONAL })
  agentType: AgentType;

  // ========== 身份验证 ==========

  /**
   * Agent 公钥（用于签名验证）
   * Ed25519 或 ECDSA 公钥
   */
  @Column({ name: 'public_key', nullable: true, length: 255 })
  publicKey?: string;

  /**
   * API Secret Hash（用于 API 认证）
   */
  @Column({ nullable: true, select: false })
  apiSecretHash?: string;

  /**
   * API Key 前缀（便于识别）
   */
  @Column({ nullable: true, length: 20 })
  apiKeyPrefix?: string;

  // ========== 资金账户 ==========

  /**
   * 默认资金账户 ID
   * 关联到 Account 实体
   */
  @Column({ nullable: true })
  defaultAccountId?: string;

  /**
   * 托管钱包 ID（MPC Wallet）
   */
  @Column({ nullable: true })
  mpcWalletId?: string;

  /**
   * 非托管钱包地址
   */
  @Column({ nullable: true, length: 100 })
  externalWalletAddress?: string;

  // ========== 信用评分 ==========

  /**
   * 信用评分 (0-1000)
   * 基于历史行为计算
   */
  @Column('decimal', { name: 'credit_score', precision: 7, scale: 2, default: 500 })
  creditScore: number;

  /**
   * 风险等级
   */
  @Column({ type: 'enum',
    enum: AgentRiskLevel,
    default: AgentRiskLevel.MEDIUM })
  riskLevel: AgentRiskLevel;

  /**
   * 信用评分更新时间
   */
  @Column({ nullable: true })
  creditScoreUpdatedAt?: Date;

  // ========== 能力与授权 ==========

  /**
   * 能力列表（MCP Tool 格式）
   */
  @Column({ type: 'jsonb', nullable: true })
  capabilities?: string[];

  /**
   * 运行时权限配置
   */
  @Column({ type: 'jsonb', nullable: true })
  permissions?: Record<string, any>;

  /**
   * 支出限制
   */
  @Column({ type: 'jsonb', nullable: true })
  spendingLimits?: {
    singleTxLimit: number;      // 单笔限额
    dailyLimit: number;         // 日限额
    monthlyLimit: number;       // 月限额
    currency: string;           // 币种
  };

  /**
   * 已用额度（当日）
   */
  @Column('decimal', { name: 'used_today_amount', precision: 18, scale: 2, default: 0 })
  usedTodayAmount: number;

  /**
   * 已用额度（当月）
   */
  @Column('decimal', { name: 'used_month_amount', precision: 18, scale: 2, default: 0 })
  usedMonthAmount: number;

  /**
   * 额度重置日期
   */
  @Column({ type: 'date', nullable: true })
  limitResetDate?: Date;

  // ========== 链上存证 ==========

  /**
   * EAS (Ethereum Attestation Service) UID
   * 链上身份证明
   */
  @Column({ nullable: true, length: 100 })
  easAttestationUid?: string;

  /**
   * ERC-8004 Identity Session ID
   * 链上经济身份
   */
  @Column({ nullable: true, length: 100 })
  erc8004SessionId?: string;

  /**
   * ERC-8004 Session 过期时间
   */
  @Column({ nullable: true })
  sessionExpiry?: Date;

  /**
   * 链上注册交易哈希
   */
  @Column({ nullable: true, length: 100 })
  onchainRegistrationTxHash?: string;

  /**
   * 注册链
   */
  @Column({ nullable: true, length: 20 })
  registrationChain?: string;

  // ========== 生命周期 ==========

  /**
   * Agent 状态
   */
  @Column({
    type: 'enum',
    enum: AgentAccountStatus,
    default: AgentAccountStatus.DRAFT,
  })
  status: AgentAccountStatus;

  /**
   * 状态变更原因
   */
  @Column({ nullable: true, length: 500 })
  statusReason?: string;

  /**
   * 激活时间
   */
  @Column({ nullable: true })
  activatedAt?: Date;

  /**
   * 最后活跃时间
   */
  @Column({ nullable: true })
  lastActiveAt?: Date;

  // ========== 统计信息 ==========

  /**
   * 总交易次数
   */
  @Column({ default: 0 })
  totalTransactions: number;

  /**
   * 总交易金额
   */
  @Column('decimal', { name: 'total_transaction_amount', precision: 18, scale: 2, default: 0 })
  totalTransactionAmount: number;

  /**
   * 成功交易次数
   */
  @Column({ default: 0 })
  successfulTransactions: number;

  /**
   * 失败交易次数
   */
  @Column({ default: 0 })
  failedTransactions: number;

  // ========== 回调配置 ==========

  /**
   * 回调 URL 配置
   */
  @Column({ type: 'jsonb', nullable: true })
  callbacks?: {
    webhookUrl?: string;
    paymentSuccessUrl?: string;
    paymentFailureUrl?: string;
    authCallbackUrl?: string;
  };

  // ========== AI 模型偏好 ==========

  /** 覆盖全局默认模型 */
  @Column({ name: 'preferred_model', length: 100, nullable: true })
  preferredModel?: string;

  /** 覆盖全局默认厂商 */
  @Column({ name: 'preferred_provider', length: 50, nullable: true })
  preferredProvider?: string;

  // ========== 元数据 ==========

  /**
   * 扩展元数据
   */
  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
