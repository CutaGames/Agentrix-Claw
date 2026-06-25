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

export enum SocialPostType {
  TEXT = 'text',
  AGENT_RESULT = 'agent_result',
  SKILL_SHARE = 'skill_share',
  INSTALL_SUCCESS = 'install_success',
  SHOWCASE = 'showcase',
  WORKFLOW_RESULT = 'workflow_result',
  TASK_COMPLETE = 'task_complete',
  AGENT_DEPLOY = 'agent_deploy',
  CONVERSATION_HIGHLIGHT = 'conversation_highlight',
}

export enum SocialPostStatus {
  ACTIVE = 'active',
  HIDDEN = 'hidden',
  REMOVED = 'removed',
}

@Entity('social_posts')
export class SocialPost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  authorId: string;

  @Column({ length: 150, nullable: true })
  authorName?: string;

  @Column({ length: 255, nullable: true })
  authorAvatar?: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'enum', enum: SocialPostType, default: SocialPostType.TEXT })
  type: SocialPostType;

  @Column({ type: 'enum', enum: SocialPostStatus, default: SocialPostStatus.ACTIVE })
  status: SocialPostStatus;

  /** Referenced skill/agent ID for SKILL_SHARE or AGENT_RESULT posts */
  @Column({ nullable: true })
  referenceId?: string;

  @Column({ length: 150, nullable: true })
  referenceName?: string;

  @Column({ type: 'jsonb', nullable: true })
  media?: { url: string; type: 'image' | 'video' }[];

  @Column({ default: 0 })
  likeCount: number;

  @Column({ default: 0 })
  commentCount: number;

  @Column({ default: 0 })
  shareCount: number;

  @Column({ type: 'jsonb', nullable: true })
  tags?: string[];

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('social_comments')
export class SocialComment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  postId: string;

  @Index()
  @Column({ type: 'uuid' })
  authorId: string;

  @Column({ length: 150, nullable: true })
  authorName?: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ nullable: true })
  parentCommentId?: string;

  @Column({ default: 0 })
  likeCount: number;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('social_likes')
export class SocialLike {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Index()
  @Column({ type: 'uuid' })
  targetId: string;

  @Column({ length: 20 })
  targetType: 'post' | 'comment';

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('social_follows')
export class SocialFollow {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  followerId: string;

  @Index()
  @Column({ type: 'uuid' })
  followeeId: string;

  @CreateDateColumn()
  createdAt: Date;
}

// ── Social Events (persisted social listener events) ──────────────────────────

export enum SocialEventPlatform {
  TWITTER = 'twitter',
  TELEGRAM = 'telegram',
  DISCORD = 'discord',
}

export enum SocialEventType {
  MENTION = 'mention',
  DM = 'dm',
  MESSAGE = 'message',
  COMMAND = 'command',
}

export enum SocialReplyStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  SENT = 'sent',
  FAILED = 'failed',
  AUTO_SENT = 'auto_sent',
}

@Entity('social_events')
export class SocialEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  userId?: string;

  @Column({ type: 'enum', enum: SocialEventPlatform })
  platform: SocialEventPlatform;

  @Column({ type: 'enum', enum: SocialEventType })
  eventType: SocialEventType;

  @Column({ length: 255 })
  senderId: string;

  @Column({ length: 255, nullable: true })
  senderName?: string;

  @Column({ type: 'text' })
  text: string;

  @Column({ type: 'jsonb', nullable: true })
  rawPayload?: Record<string, any>;

  @Column({ type: 'enum', enum: SocialReplyStatus, default: SocialReplyStatus.PENDING })
  replyStatus: SocialReplyStatus;

  @Column({ type: 'text', nullable: true })
  agentDraftReply?: string;

  @Column({ type: 'text', nullable: true })
  finalReply?: string;

  @Column({ nullable: true })
  repliedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;
}

// ── Social Auto-Reply Strategy ────────────────────────────────────────────────

export enum ReplyStrategy {
  AUTO = 'auto',
  APPROVAL = 'approval',
  NOTIFY_ONLY = 'notify_only',
  DISABLED = 'disabled',
}

@Entity('social_reply_configs')
export class SocialReplyConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'enum', enum: SocialEventPlatform })
  platform: SocialEventPlatform;

  @Column({ type: 'enum', enum: ReplyStrategy, default: ReplyStrategy.APPROVAL })
  strategy: ReplyStrategy;

  @Column({ length: 500, nullable: true })
  replyPrompt?: string;

  @Column({ length: 10, default: 'en' })
  replyLanguage: string;

  @Column({ default: true })
  enabled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
