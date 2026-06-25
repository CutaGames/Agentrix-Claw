/**
 * AX Skill Entity
 * 
 * 统一的 Skill 定义实体，支持自动转换为各 AI 平台格式
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum SkillCategory {
  PAYMENT = 'payment',
  COMMERCE = 'commerce',
  DATA = 'data',
  UTILITY = 'utility',
  INTEGRATION = 'integration',
  CUSTOM = 'custom',
  // V2.0 新增分类
  IDENTITY = 'identity',
  AUTHORIZATION = 'authorization',
  CHAIN = 'chain',
  ASSET = 'asset',
  ALGORITHM = 'algorithm',
  ANALYSIS = 'analysis',
  WORKFLOW = 'workflow',
}

// V2.0: Skill 四层架构
export enum SkillLayer {
  INFRA = 'infra',           // 基础设施层: 支付、钱包、身份、授权
  RESOURCE = 'resource',     // 资源层: 商品、服务、数字资产
  LOGIC = 'logic',           // 逻辑层: 算法、分析、工具
  COMPOSITE = 'composite',   // 组合层: 工作流、多 Skill 编排
}

// V2.0: 商业价值类型 (Marketplace 准入分类)
export enum SkillValueType {
  ACTION = 'action',           // 交易/权利型: 改变现实世界状态
  DELIVERABLE = 'deliverable', // 结果交付型: 输出确定性交付物
  DECISION = 'decision',       // 高风险决策型: 带责任背书的判断
  DATA = 'data',               // 专有数据访问: 独家实时数据
}

// V2.0: 资源类型
export enum SkillResourceType {
  PHYSICAL = 'physical',     // 实物商品
  SERVICE = 'service',       // 专业服务
  DIGITAL = 'digital',       // 数字商品
  DATA = 'data',             // 数据资源
  LOGIC = 'logic',           // 逻辑代码
}

// V2.0: Skill 来源
export enum SkillSource {
  NATIVE = 'native',         // Agentrix 原生
  IMPORTED = 'imported',     // 外部导入
  CONVERTED = 'converted',   // 商品转换
}

// V2.0: 原始平台
export enum SkillOriginalPlatform {
  CLAUDE = 'claude',
  OPENAI = 'openai',
  GEMINI = 'gemini',
  GROK = 'grok',
  THIRD_PARTY = 'third_party',
  OPENCLAW = 'openclaw',        // V2.2: OpenClaw 社区 Hub
}

export enum SkillStatus {
  DRAFT = 'draft',
  PENDING_REVIEW = 'pending_review',
  PUBLISHED = 'published',
  ACTIVE = 'active',
  REJECTED = 'rejected',
  DEPRECATED = 'deprecated',
}

export enum SkillPricingType {
  FREE = 'free',
  PER_CALL = 'per_call',
  SUBSCRIPTION = 'subscription',
  REVENUE_SHARE = 'revenue_share',  // V2.0: 分成模式
  PERCENTAGE = 'percentage',        // V2.0: 百分比模式 (分佣/支付 Skill)
}

export interface SkillInputSchema {
  type: 'object';
  properties: Record<string, {
    type: string;
    description: string;
    required?: boolean;
    enum?: string[];
    default?: any;
    minimum?: number;
    maximum?: number;
  }>;
  required: string[];
}

export interface SkillOutputSchema {
  type: 'object';
  properties: Record<string, any>;
}

export interface SkillExecutor {
  type: 'http' | 'internal' | 'mcp' | 'contract';  // V2.0: 新增 mcp 和 contract 类型
  endpoint?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  internalHandler?: string;    // 内部处理器名称
  mcpServer?: string;          // V2.0: MCP Server 名称
  contractAddress?: string;    // V2.0: 链上合约地址
}

export interface SkillPlatformSchemas {
  openai?: any;
  claude?: any;
  gemini?: any;
  grok?: any;
  qwen?: any;
}

export interface SkillPricing {
  type: SkillPricingType;
  pricePerCall?: number;
  currency?: string;
  freeQuota?: number;
  commissionRate?: number;     // V2.0: 分佣比例 (0-100)
  platformFeeRate?: number;    // V2.0: 平台费率 (如 0.3%)
  minFee?: number;             // V2.0: 最低收费 (如 0.01)
}

// V2.0: Skill 作者信息
export interface SkillAuthor {
  id: string;
  name: string;
  type: 'platform' | 'merchant' | 'developer';
}

@Entity('skills')
export class Skill {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  // V2.0: 人类可读名称
  @Column({ length: 200, nullable: true })
  displayName: string;

  @Column({ length: 500 })
  description: string;

  @Column({ length: 20, default: '1.0.0' })
  version: string;

  @Column({
    type: 'enum',
    enum: SkillCategory,
    default: SkillCategory.CUSTOM,
  })
  category: SkillCategory;

  // V2.0: 四层架构
  @Column({
    type: 'enum',
    enum: SkillLayer,
    default: SkillLayer.LOGIC,
  })
  layer: SkillLayer;

  // V2.0: 商业价值类型
  @Column({
    type: 'enum',
    enum: SkillValueType,
    nullable: true,
  })
  valueType: SkillValueType;

  // V2.0: 资源类型 (仅 resource 层使用)
  @Column({
    type: 'enum',
    enum: SkillResourceType,
    nullable: true,
  })
  resourceType: SkillResourceType;

  // V2.0: Skill 来源
  @Column({
    type: 'enum',
    enum: SkillSource,
    default: SkillSource.NATIVE,
  })
  source: SkillSource;

  // V2.0: 原始平台 (仅 imported 来源使用)
  @Column({
    type: 'enum',
    enum: SkillOriginalPlatform,
    nullable: true,
  })
  originalPlatform: SkillOriginalPlatform;

  @Column({
    type: 'enum',
    enum: SkillStatus,
    default: SkillStatus.DRAFT,
  })
  status: SkillStatus;

  @Column({ type: 'jsonb' })
  inputSchema: SkillInputSchema;

  @Column({ type: 'jsonb', nullable: true })
  outputSchema: SkillOutputSchema;

  @Column({ type: 'jsonb' })
  executor: SkillExecutor;

  @Column({ type: 'jsonb', nullable: true })
  platformSchemas: SkillPlatformSchemas;

  @Column({ type: 'jsonb', nullable: true })
  pricing: SkillPricing;

  @Column({ type: 'simple-array', nullable: true })
  tags: string[];

  @Column({ nullable: true })
  authorId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn()
  author: User;

  @Column({ nullable: true })
  pluginId: string;

  @Column({ default: 0 })
  callCount: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  rating: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  // V2.0: 是否对人类直接开放
  @Column({ default: true })
  humanAccessible: boolean;

  // V2.0: 兼容的 Agent 列表 (空数组或 ['all'] 表示所有)
  @Column({ type: 'jsonb', default: '["all"]' })
  compatibleAgents: string[];

  // V2.0: 所需权限
  @Column({ type: 'jsonb', default: '["read"]' })
  permissions: string[];

  // V2.0: 作者详细信息
  @Column({ type: 'jsonb', nullable: true })
  authorInfo: SkillAuthor;

  // V2.0: 关联的商品 ID (仅 converted 来源使用)
  @Column({ nullable: true })
  productId: string;

  // V2.0: 外部 Skill ID (仅 imported 来源使用)
  @Column({ nullable: true })
  externalSkillId: string;

  // V2.0: 图片 URL (主图)
  @Column({ nullable: true })
  imageUrl: string;

  // V2.0: 缩略图 URL
  @Column({ nullable: true })
  thumbnailUrl: string;

  // V2.1: UCP 兼容性标记
  @Column({ default: true })
  ucpEnabled: boolean;

  // V2.1: UCP 结账端点 (用于外部 UCP 发现)
  @Column({ nullable: true })
  ucpCheckoutEndpoint: string;

  // V2.1: X402 兼容性标记
  @Column({ default: false })
  x402Enabled: boolean;

  // V2.1: X402 服务端点
  @Column({ nullable: true })
  x402ServiceEndpoint: string;

  // V2.0: AI 生态优先级 (high_priority 标记用于 Gemini sync)
  @Column({ type: 'varchar', length: 20, default: 'normal' })
  aiPriority: 'high' | 'normal' | 'low';

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
