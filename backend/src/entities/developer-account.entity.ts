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

/**
 * 开发者账户状态
 */
export enum DeveloperAccountStatus {
  PENDING = 'pending',         // 待审核
  ACTIVE = 'active',           // 活跃
  SUSPENDED = 'suspended',     // 暂停
  REVOKED = 'revoked',         // 撤销
  BANNED = 'banned',           // 封禁
}

/**
 * 开发者等级
 */
export enum DeveloperTier {
  STARTER = 'starter',         // 入门级
  PROFESSIONAL = 'professional', // 专业级
  ENTERPRISE = 'enterprise',   // 企业级
  PARTNER = 'partner',         // 合作伙伴
}

/**
 * 开发者类型
 */
export enum DeveloperType {
  INDIVIDUAL = 'individual',   // 个人开发者
  TEAM = 'team',               // 团队
  COMPANY = 'company',         // 公司
  AGENCY = 'agency',           // 代理商
}

/**
 * 开发者账户实体
 * 管理开发者的身份、API 访问、收益、SDK 使用等
 */
@Entity('developer_accounts')
@Index(['status'])
@Index(['tier'])
@Index(['userId'], { unique: true })
@Index(['developerUniqueId'], { unique: true })
export class DeveloperAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * 全局唯一开发者标识
   * 格式: DEV-{timestamp}-{random}
   */
  @Column({ unique: true })
  developerUniqueId: string;

  /**
   * 关联用户
   */
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @Column()
  userId: string;

  /**
   * 开发者名称/品牌
   */
  @Column({ length: 100 })
  name: string;

  /**
   * 开发者描述
   */
  @Column({ type: 'text', nullable: true })
  description?: string;

  /**
   * 开发者网站
   */
  @Column({ nullable: true })
  website?: string;

  /**
   * 联系邮箱
   */
  @Column({ nullable: true })
  contactEmail?: string;

  /**
   * 开发者类型
   */
  @Column({
    type: 'enum',
    enum: DeveloperType,
    default: DeveloperType.INDIVIDUAL,
  })
  type: DeveloperType;

  /**
   * 开发者等级
   */
  @Column({
    type: 'enum',
    enum: DeveloperTier,
    default: DeveloperTier.STARTER,
  })
  tier: DeveloperTier;

  /**
   * 账户状态
   */
  @Column({
    type: 'enum',
    enum: DeveloperAccountStatus,
    default: DeveloperAccountStatus.PENDING,
  })
  status: DeveloperAccountStatus;

  /**
   * 状态原因
   */
  @Column({ nullable: true, length: 500 })
  statusReason?: string;

  /**
   * 状态更新时间
   */
  @Column({ nullable: true })
  statusUpdatedAt?: Date;

  // ========== API 访问配置 ==========

  /**
   * API Key 数量限制（根据等级）
   */
  @Column({ default: 3 })
  maxApiKeys: number;

  /**
   * 当前 API Key 数量
   */
  @Column({ default: 0 })
  currentApiKeyCount: number;

  /**
   * 全局速率限制（每分钟请求数）
   */
  @Column({ default: 100 })
  globalRateLimit: number;

  /**
   * 日请求限制
   */
  @Column({ default: 10000 })
  dailyRequestLimit: number;

  /**
   * 月请求限制
   */
  @Column({ default: 300000 })
  monthlyRequestLimit: number;

  /**
   * 允许的 API 范围/权限
   */
  @Column({ type: 'simple-array', nullable: true })
  allowedScopes?: string[];

  // ========== SDK & 集成 ==========

  /**
   * 允许使用的 SDK 列表
   */
  @Column({ type: 'simple-array', nullable: true })
  allowedSdks?: string[];

  /**
   * Webhook URL
   */
  @Column({ nullable: true })
  webhookUrl?: string;

  /**
   * Webhook 密钥
   */
  @Column({ nullable: true })
  webhookSecret?: string;

  /**
   * OAuth 回调 URLs
   */
  @Column({ type: 'simple-array', nullable: true })
  oauthCallbackUrls?: string[];

  // ========== 收益分成配置 ==========

  /**
   * 默认资金账户 ID
   */
  @Column({ nullable: true })
  defaultAccountId?: string;

  /**
   * 收益分成比例（百分比，如 70 表示开发者获得 70%）
   */
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 70 })
  revenueSharePercent: number;

  /**
   * 最低提现金额
   */
  @Column({ type: 'decimal', precision: 18, scale: 2, default: 10 })
  minWithdrawalAmount: number;

  /**
   * 结算周期（天）
   */
  @Column({ name: 'settlement_period_days', default: 7 })
  settlementPeriodDays: number;

  // ========== 统计数据 ==========

  /**
   * 发布的 Skill 数量
   */
  @Column({ default: 0 })
  publishedSkillCount: number;

  /**
   * 发布的 Agent 数量
   */
  @Column({ default: 0 })
  publishedAgentCount: number;

  /**
   * 总 API 调用次数
   */
  @Column({ type: 'bigint', default: 0 })
  totalApiCalls: number;

  /**
   * 今日 API 调用次数
   */
  @Column({ default: 0 })
  todayApiCalls: number;

  /**
   * 本月 API 调用次数
   */
  @Column({ default: 0 })
  monthApiCalls: number;

  /**
   * 累计收益
   */
  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  totalRevenue: number;

  /**
   * 待结算收益
   */
  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  pendingRevenue: number;

  /**
   * 已提现收益
   */
  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  withdrawnRevenue: number;

  /**
   * 用户评分（1-5）
   */
  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  rating: number;

  /**
   * 评分数量
   */
  @Column({ default: 0 })
  ratingCount: number;

  // ========== 认证与合规 ==========

  /**
   * 是否已验证邮箱
   */
  @Column({ default: false })
  isEmailVerified: boolean;

  /**
   * 是否已签署开发者协议
   */
  @Column({ default: false })
  hasSignedAgreement: boolean;

  /**
   * 协议签署时间
   */
  @Column({ nullable: true })
  agreementSignedAt?: Date;

  /**
   * 是否通过 KYC
   */
  @Column({ default: false })
  isKycVerified: boolean;

  /**
   * KYC 记录 ID
   */
  @Column({ nullable: true })
  kycRecordId?: string;

  // ========== 元数据 ==========

  /**
   * 扩展元数据
   */
  @Column({ type: 'jsonb', nullable: true })
  metadata?: {
    // GitHub 账号
    githubUrl?: string;
    // 社交媒体
    socialLinks?: {
      twitter?: string;
      discord?: string;
      telegram?: string;
    };
    // 技术栈标签
    techStack?: string[];
    // 应用场景
    useCases?: string[];
    // 公司信息（如果是公司）
    companyInfo?: {
      legalName?: string;
      registrationNumber?: string;
      address?: string;
      country?: string;
    };
    // 其他自定义数据
    [key: string]: any;
  };

  /**
   * 审核通过时间
   */
  @Column({ nullable: true })
  approvedAt?: Date;

  /**
   * 审核人 ID
   */
  @Column({ nullable: true })
  approvedBy?: string;

  /**
   * 最后活跃时间
   */
  @Column({ nullable: true })
  lastActiveAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/**
 * 开发者等级配置
 */
export const DEVELOPER_TIER_CONFIGS = {
  [DeveloperTier.STARTER]: {
    maxApiKeys: 3,
    globalRateLimit: 100,
    dailyRequestLimit: 10000,
    monthlyRequestLimit: 300000,
    revenueSharePercent: 70,
    allowedScopes: ['read', 'search', 'order'],
    allowedSdks: ['js', 'python'],
  },
  [DeveloperTier.PROFESSIONAL]: {
    maxApiKeys: 10,
    globalRateLimit: 500,
    dailyRequestLimit: 100000,
    monthlyRequestLimit: 3000000,
    revenueSharePercent: 75,
    allowedScopes: ['read', 'write', 'search', 'order', 'payment', 'webhook'],
    allowedSdks: ['js', 'python', 'go', 'java'],
  },
  [DeveloperTier.ENTERPRISE]: {
    maxApiKeys: 50,
    globalRateLimit: 2000,
    dailyRequestLimit: 1000000,
    monthlyRequestLimit: 30000000,
    revenueSharePercent: 80,
    allowedScopes: ['read', 'write', 'search', 'order', 'payment', 'webhook', 'admin', 'analytics'],
    allowedSdks: ['js', 'python', 'go', 'java', 'rust', 'csharp'],
  },
  [DeveloperTier.PARTNER]: {
    maxApiKeys: 100,
    globalRateLimit: 5000,
    dailyRequestLimit: -1, // 无限制
    monthlyRequestLimit: -1, // 无限制
    revenueSharePercent: 85,
    allowedScopes: ['*'], // 全部权限
    allowedSdks: ['*'], // 全部 SDK
  },
};
