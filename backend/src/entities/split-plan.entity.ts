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

export enum SplitPlanStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

export enum SplitSource {
  POOL = 'pool',
  PLATFORM = 'platform',
  MERCHANT = 'merchant',
}

/**
 * 分佣规则 - 单条分佣规则
 */
export interface SplitRule {
  /** 接收方地址 (钱包地址或用户ID) */
  recipient: string;
  /** 分佣比例 (bps: 1 = 0.01%, 10000 = 100%) */
  shareBps: number;
  /** 角色标识 */
  role: 'executor' | 'referrer' | 'promoter' | 'l1' | 'l2' | 'l3' | 'custom';
  /** 来源 */
  source: SplitSource;
  /** 自定义角色名称 */
  customRoleName?: string;
  /** 是否启用 */
  active: boolean;
}

/**
 * 费率配置
 */
export interface FeeConfig {
  /** 法币入金费率 bps (默认 10 = 0.1%) */
  onrampFeeBps: number;
  /** 法币出金费率 bps (默认 10 = 0.1%) */
  offrampFeeBps: number;
  /** 分佣费率 bps (默认 30 = 0.3%) */
  splitFeeBps: number;
  /** 最低分佣费 (微单位, 默认 100000 = 0.1 USDC) */
  minSplitFee: number;
}

/**
 * 阶梯规则 - 根据金额范围调整分佣比例
 */
export interface AllocationTier {
  /** 最小金额 */
  minAmount: number;
  /** 最大金额 (null 表示无上限) */
  maxAmount: number | null;
  /** 该阶梯的分佣比例调整系数 */
  multiplier: number;
}

/**
 * 封顶规则
 */
export interface AllocationCap {
  /** 角色 */
  role: string;
  /** 最大金额 */
  maxAmount: number;
  /** 周期 (单次/日/月) */
  period: 'once' | 'daily' | 'monthly';
}

/**
 * SplitPlan Entity - 分佣计划
 * 
 * Commerce Skill 的核心配置实体，定义了如何分配交易收入
 */
@Entity('split_plans')
@Index(['ownerId', 'status'])
@Index(['productType', 'status'])
export class SplitPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 计划名称 */
  @Column({ length: 100 })
  name: string;

  /** 计划描述 */
  @Column({ type: 'text', nullable: true })
  description: string;

  /** 版本号 - 每次更新递增，支付时锁定当前版本 */
  @Column({ type: 'int', default: 1 })
  version: number;

  /** 关联的商品类型 (作为默认模板选择器) */
  @Column({ type: 'varchar', length: 20, default: 'service', nullable: true })
  productType: 'physical' | 'service' | 'virtual' | 'nft' | 'skill' | 'agent_task';

  /** 分佣规则列表 (JSON) */
  @Column({ type: 'jsonb', default: [] })
  rules: SplitRule[];

  /** 费率配置 (JSON) */
  @Column({
    type: 'jsonb',
    default: {
      onrampFeeBps: 10,
      offrampFeeBps: 10,
      splitFeeBps: 30,
      minSplitFee: 100000,
    },
  })
  feeConfig: FeeConfig;

  /** 阶梯规则 (可选) */
  @Column({ type: 'jsonb', nullable: true })
  tiers: AllocationTier[];

  /** 封顶规则 (可选) */
  @Column({ type: 'jsonb', nullable: true })
  caps: AllocationCap[];

  /** 计划状态 */
  @Column({
    type: 'enum',
    enum: SplitPlanStatus,
    default: SplitPlanStatus.DRAFT,
  })
  status: SplitPlanStatus;

  /** 是否为系统默认模板 */
  @Column({ type: 'boolean', default: false })
  isSystemTemplate: boolean;

  /** 所有者ID */
  @Column({ type: 'uuid', nullable: true })
  ownerId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  /** 使用次数统计 */
  @Column({ type: 'int', default: 0 })
  usageCount: number;

  /** 元数据 */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
