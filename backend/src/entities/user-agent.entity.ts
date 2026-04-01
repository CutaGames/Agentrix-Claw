import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum UserAgentStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  PAUSED = 'paused',
  ARCHIVED = 'archived',
}

export enum DelegationLevel {
  OBSERVER = 'observer',       // 仅监听，不回复
  ASSISTANT = 'assistant',     // 草稿需审核
  REPRESENTATIVE = 'representative', // 自动回复，高风险需审核
  AUTONOMOUS = 'autonomous',   // 完全自主
}

export interface ChannelBinding {
  platform: string;            // 'telegram' | 'discord' | 'twitter' | 'feishu' | 'wecom' | 'slack' | 'whatsapp'
  channelId: string;           // 平台侧 ID（如 Telegram chat ID）
  channelName?: string;        // 显示名
  boundAt: string;             // ISO timestamp
  config?: Record<string, any>; // 渠道特定配置
}

export interface MemoryConfig {
  scope: 'private' | 'user_shared';  // 私有 or 用户级共享
  retentionDays?: number;            // 记忆保留天数，null = 永久
  maxEntries?: number;               // 最大记忆条数
  autoPromote: boolean;              // 是否自动将高重要性 session 记忆提升为 agent 级
}

/**
 * @deprecated Use OpenClawInstance + AgentAccount instead.
 * Retained for backward compatibility. No new records should be created.
 * Fields like channelBindings, delegationLevel, memoryConfig have been
 * migrated to openclaw_instances table.
 */
@Entity('user_agents')
export class UserAgent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  templateId?: string | null;

  @Column({ length: 150 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'enum', enum: UserAgentStatus, default: UserAgentStatus.DRAFT })
  status: UserAgentStatus;

  @Column({ default: false })
  isPublished: boolean;

  @Column({ length: 150, nullable: true })
  slug?: string;

  @Column({ type: 'jsonb', nullable: true })
  settings?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  // ── Agent Presence 新增字段 ──────────────────────────────────────────────

  @Column({ type: 'text', nullable: true })
  personality?: string;

  @Column({ type: 'text', nullable: true })
  systemPrompt?: string;

  @Column({ length: 500, nullable: true })
  avatarUrl?: string;

  @Column({ length: 100, nullable: true })
  defaultModel?: string;

  @Column({ type: 'jsonb', nullable: true })
  capabilities?: string[];

  @Column({ type: 'jsonb', default: '[]' })
  channelBindings: ChannelBinding[];

  @Column({ type: 'jsonb', nullable: true })
  memoryConfig?: MemoryConfig;

  @Column({
    type: 'enum',
    enum: DelegationLevel,
    default: DelegationLevel.ASSISTANT,
  })
  delegationLevel: DelegationLevel;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

