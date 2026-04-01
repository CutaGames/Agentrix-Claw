import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { AgentAccount } from './agent-account.entity';

export enum OpenClawInstanceStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  PROVISIONING = 'provisioning',
  ERROR = 'error',
  UNLINKED = 'unlinked',
}

export enum OpenClawInstanceType {
  CLOUD = 'cloud',
  SELF_HOSTED = 'self_hosted',
  LOCAL = 'local',
}

/**
 * 委派级别（从 UserAgent 迁入）
 */
export enum DelegationLevel {
  OBSERVER = 'observer',
  ASSISTANT = 'assistant',
  REPRESENTATIVE = 'representative',
  AUTONOMOUS = 'autonomous',
}

/**
 * 记忆配置（从 UserAgent 迁入）
 */
export interface MemoryConfig {
  scope: 'private' | 'user_shared';
  retentionDays?: number;
  maxEntries?: number;
  autoPromote: boolean;
}

/**
 * 频道绑定（从 UserAgent 迁入）
 */
export interface ChannelBinding {
  platform: string;
  channelId: string;
  channelName?: string;
  boundAt: string;
  config?: Record<string, any>;
}

@Entity('openclaw_instances')
export class OpenClawInstance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ length: 150 })
  name: string;

  @Column({ type: 'enum', enum: OpenClawInstanceType, default: OpenClawInstanceType.SELF_HOSTED })
  instanceType: OpenClawInstanceType;

  @Column({ type: 'enum', enum: OpenClawInstanceStatus, default: OpenClawInstanceStatus.ACTIVE })
  status: OpenClawInstanceStatus;

  @Column({ type: 'text', nullable: true })
  instanceUrl?: string;

  @Column({ type: 'text', nullable: true })
  instanceToken?: string;

  @Column({ nullable: true })
  cloudInstanceId?: string;

  @Column({ type: 'text', nullable: true })
  personality?: string;

  @Column({ default: false })
  isPrimary: boolean;

  @Column({ type: 'bigint', nullable: true })
  telegramChatId?: string;

  @Column({ length: 128, nullable: true, unique: true })
  relayToken?: string;

  @Column({ default: false })
  relayConnected: boolean;

  @Column({ nullable: true })
  subscriptionId?: string;

  @Column({ nullable: true })
  subscriptionStatus?: string;

  @Column({ nullable: true })
  localOs?: string;

  @Column({ type: 'jsonb', nullable: true })
  capabilities?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  // ── Agent Account 链接（正式 FK，替代 metadata.agentAccountId 软链接） ──

  @ManyToOne(() => AgentAccount, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn()
  agentAccount?: AgentAccount;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  agentAccountId?: string;

  // ── 从 UserAgent 迁入的字段 ──────────────────────────────────────────

  @Column({ type: 'text', nullable: true })
  systemPrompt?: string;

  @Column({ type: 'jsonb', nullable: true, default: '[]' })
  channelBindings?: ChannelBinding[];

  @Column({ type: 'varchar', length: 20, nullable: true, default: 'assistant' })
  delegationLevel?: string;

  @Column({ type: 'jsonb', nullable: true })
  memoryConfig?: MemoryConfig;

  @Column({ length: 150, nullable: true })
  slug?: string;

  @Column({ length: 100, nullable: true })
  defaultModel?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
