import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum ConversationChannel {
  MOBILE = 'mobile',
  DESKTOP = 'desktop',
  WEB = 'web',
  WATCH = 'watch',
  BAND = 'band',
  IOT = 'iot',
  TELEGRAM = 'telegram',
  DISCORD = 'discord',
  TWITTER = 'twitter',
  FEISHU = 'feishu',
  WECOM = 'wecom',
  SLACK = 'slack',
  WHATSAPP = 'whatsapp',
  SYSTEM = 'system',
}

export enum MessageDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
  SYSTEM = 'system',
}

export enum MessageRole {
  USER = 'user',
  AGENT = 'agent',
  SYSTEM = 'system',
  EXTERNAL_USER = 'external_user',
}

export enum ContentType {
  TEXT = 'text',
  VOICE = 'voice',
  IMAGE = 'image',
  FILE = 'file',
  CARD = 'card',
  ACTION = 'action',
}

export enum DeliveryStatus {
  PENDING = 'pending',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  READ = 'read',
}

export enum ApprovalStatus {
  AUTO = 'auto',
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('conversation_events')
@Index(['userId', 'agentId', 'createdAt'])
@Index(['sessionId', 'createdAt'])
@Index(['channel', 'createdAt'])
@Index(['userId', 'createdAt'])
export class ConversationEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  agentId: string;

  @Column({ type: 'uuid', nullable: true })
  sessionId?: string;

  // ── Channel ───────────────────────────────────────────────────────────────

  @Column({ length: 30 })
  channel: string;

  @Column({ length: 255, nullable: true })
  channelMessageId?: string;

  // ── Content ───────────────────────────────────────────────────────────────

  @Column({ length: 10 })
  direction: string;

  @Column({ length: 20 })
  role: string;

  @Column({ length: 20, default: 'text' })
  contentType: string;

  @Column({ type: 'text' })
  content: string;

  // ── External sender (social messages) ─────────────────────────────────────

  @Column({ length: 255, nullable: true })
  externalSenderId?: string;

  @Column({ length: 255, nullable: true })
  externalSenderName?: string;

  // ── Metadata ──────────────────────────────────────────────────────────────

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  rawPayload?: Record<string, any>;

  // ── Delivery ──────────────────────────────────────────────────────────────

  @Column({ length: 20, default: 'delivered' })
  deliveryStatus: string;

  // ── Approval ──────────────────────────────────────────────────────────────

  @Column({ length: 20, nullable: true })
  approvalStatus?: string;

  @Column({ type: 'text', nullable: true })
  approvalDraft?: string;

  @Column({ type: 'timestamptz', nullable: true })
  approvedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
