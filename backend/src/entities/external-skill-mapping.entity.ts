/**
 * External Skill Mapping Entity
 * 
 * V2.0: 外部 Skill 映射表，用于管理从 Claude MCP / GPT Actions 等平台导入的 Skill
 */

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
import { Skill } from './skill.entity';

export enum ExternalPlatform {
  CLAUDE_MCP = 'claude_mcp',
  OPENAI_GPT = 'openai_gpt',
  GEMINI = 'gemini',
  GROK = 'grok',
  ZAPIER = 'zapier',
  PLUGIN_LAB = 'plugin_lab',
  OTHER = 'other',
}

export enum SyncStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  ERROR = 'error',
  DEPRECATED = 'deprecated',
}

export interface ProxyConfig {
  enabled: boolean;
  timeout?: number;
  retryCount?: number;
  headers?: Record<string, string>;
  authType?: 'none' | 'api_key' | 'oauth' | 'bearer';
  authConfig?: Record<string, any>;
  transport?: string;
  endpoint?: string;
}

@Entity('external_skill_mappings')
@Index(['externalPlatform', 'externalId'], { unique: true })
export class ExternalSkillMapping {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 关联的 Agentrix Skill
  @Column({ nullable: true })
  agentrixSkillId: string;

  @ManyToOne(() => Skill, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn()
  agentrixSkill: Skill;

  // 外部平台
  @Column({
    type: 'enum',
    enum: ExternalPlatform,
  })
  externalPlatform: ExternalPlatform;

  // 外部 Skill ID
  @Column({ length: 200 })
  externalId: string;

  // 外部 Skill 名称
  @Column({ length: 200 })
  externalName: string;

  // 外部端点 URL
  @Column({ length: 500, nullable: true })
  externalEndpoint: string;

  // 原始 Schema (JSON)
  @Column({ type: 'jsonb', nullable: true })
  originalSchema: Record<string, any>;

  // 代理配置
  @Column({ type: 'jsonb', nullable: true })
  proxyConfig: ProxyConfig;

  // 同步状态
  @Column({ type: 'enum',
    enum: SyncStatus,
    default: SyncStatus.ACTIVE })
  syncStatus: SyncStatus;

  // 最后同步时间
  @Column({ type: 'timestamp', nullable: true })
  lastSyncedAt: Date;

  // 同步错误信息
  @Column({ type: 'text', nullable: true })
  syncError: string;

  // 调用统计
  @Column({ default: 0 })
  callCount: number;

  // 是否透传计费
  @Column({ default: true })
  passthroughPricing: boolean;

  // Agentrix 加价比例 (0-100)
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  agentrixMarkup: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
