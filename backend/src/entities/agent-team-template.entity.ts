import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * 团队模板可见性
 */
export enum TeamTemplateVisibility {
  PUBLIC = 'public',       // 所有用户可见
  PRIVATE = 'private',     // 仅创建者可见
  OFFICIAL = 'official',   // 官方推荐（置顶）
}

/**
 * Agent 角色定义（模板中每个 Agent 的配置）
 */
export interface AgentRoleDefinition {
  /** 角色代号，如 ceo, dev, qa-ops */
  codename: string;
  /** 显示名称 */
  name: string;
  /** 角色描述 */
  description: string;
  /** 头像 URL */
  avatarUrl?: string;
  /** 推荐模型（如 claude-opus-4-20250514, gpt-4o） */
  preferredModel?: string;
  /** 模型提供商 */
  preferredProvider?: string;
  /** 模型层级标签（展示用） */
  modelTier?: string;
  /** Agent 能力标签 */
  capabilities?: string[];
  /** 审批级别: auto / timeout-auto / manual */
  approvalLevel?: 'auto' | 'timeout-auto' | 'manual';
  /** 支出限额 */
  spendingLimits?: {
    singleTxLimit: number;
    dailyLimit: number;
    monthlyLimit: number;
    currency: string;
  };
  /** 初始信用评分 */
  initialCreditScore?: number;
}

/**
 * Agent 团队模板实体
 * 
 * 将 Agent Team 的蓝图标准化为可复用的模板。
 * 任意用户均可从模板一键创建自己的 Agent 团队。
 */
@Entity('agent_team_templates')
@Index(['visibility'])
@Index(['slug'], { unique: true })
export class AgentTeamTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * 模板 slug（唯一标识）
   */
  @Column({ unique: true, length: 100 })
  slug: string;

  /**
   * 模板名称
   */
  @Column({ length: 200 })
  name: string;

  /**
   * 模板描述
   */
  @Column({ type: 'text', nullable: true })
  description?: string;

  /**
   * 模板图标 / 封面
   */
  @Column({ nullable: true, length: 500 })
  iconUrl?: string;

  /**
   * 可见性
   */
  @Column({
    type: 'enum',
    enum: TeamTemplateVisibility,
    default: TeamTemplateVisibility.PUBLIC,
  })
  visibility: TeamTemplateVisibility;

  /**
   * 模板分类标签
   */
  @Column({ type: 'jsonb', nullable: true })
  tags?: string[];

  /**
   * Agent 角色列表（核心数据 — 定义团队中每个 Agent 的配置）
   */
  @Column({ type: 'jsonb' })
  roles: AgentRoleDefinition[];

  /**
   * 团队规模（即 roles.length，冗余字段便于查询）
   */
  @Column({ default: 0 })
  teamSize: number;

  /**
   * 模板创建者 ID
   */
  @Column({ nullable: true })
  creatorId?: string;

  /**
   * 被使用次数
   */
  @Column({ default: 0 })
  usageCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
