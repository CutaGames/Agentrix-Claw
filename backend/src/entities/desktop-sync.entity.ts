import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

// ── Desktop Device Presence (persistent device online state) ─────────────────

@Entity('desktop_device_presence')
export class DesktopDevicePresence {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Index()
  @Column({ length: 100 })
  deviceId: string;

  @Column({ length: 50 })
  platform: string;

  @Column({ length: 30, nullable: true })
  appVersion?: string;

  @Column({ type: 'jsonb', nullable: true })
  context?: Record<string, unknown>;

  @Column({ type: 'timestamptz' })
  lastSeenAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}

// ── Desktop Session (chat history cross-device sync) ─────────────────────────

@Entity('desktop_sessions')
export class DesktopSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Index()
  @Column({ length: 100 })
  sessionId: string;

  @Column({ length: 200, default: 'New Chat' })
  title: string;

  @Column({ type: 'int', default: 0 })
  messageCount: number;

  @Column({ length: 100 })
  deviceId: string;

  @Column({ length: 20, default: 'desktop' })
  deviceType: string;

  @Column({ type: 'jsonb', default: '[]' })
  messages: any[];

  @UpdateDateColumn()
  updatedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}

// ── Desktop Task (agent task execution history) ──────────────────────────────

export enum DesktopTaskStatusEnum {
  IDLE = 'idle',
  EXECUTING = 'executing',
  NEED_APPROVE = 'need-approve',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('desktop_tasks')
export class DesktopTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Index()
  @Column({ length: 100 })
  taskId: string;

  @Column({ length: 100 })
  deviceId: string;

  @Column({ length: 100, nullable: true })
  sessionId?: string;

  @Column({ length: 300 })
  title: string;

  @Column({ type: 'text', nullable: true })
  summary?: string;

  @Column({
    type: 'enum',
    enum: DesktopTaskStatusEnum,
    default: DesktopTaskStatusEnum.IDLE,
  })
  status: DesktopTaskStatusEnum;

  @Column({ type: 'bigint', nullable: true })
  startedAt?: number;

  @Column({ type: 'bigint', nullable: true })
  finishedAt?: number;

  @Column({ type: 'jsonb', default: '[]' })
  timeline: any[];

  @Column({ type: 'jsonb', nullable: true })
  context?: Record<string, unknown>;

  @UpdateDateColumn()
  updatedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}

// ── Desktop Approval (risk-gated action approvals) ───────────────────────────

@Entity('desktop_approvals')
export class DesktopApproval {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ length: 100 })
  deviceId: string;

  @Column({ length: 100 })
  taskId: string;

  @Column({ length: 100, nullable: true })
  timelineEntryId?: string;

  @Column({ length: 300 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ length: 10, default: 'L1' })
  riskLevel: string;

  @Column({ length: 200, nullable: true })
  sessionKey?: string;

  @Column({ length: 20, default: 'pending' })
  status: string;

  @Column({ type: 'timestamptz', nullable: true })
  respondedAt?: Date;

  @Column({ length: 100, nullable: true })
  responseDeviceId?: string;

  @Column({ type: 'boolean', default: false })
  rememberForSession: boolean;

  @Column({ type: 'jsonb', nullable: true })
  context?: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAtCol: Date;
}

// ── Desktop Command (cross-device remote commands) ───────────────────────────

@Entity('desktop_commands')
export class DesktopCommand {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ length: 300 })
  title: string;

  @Column({ length: 50 })
  kind: string;

  @Column({ length: 20, default: 'pending' })
  status: string;

  @Column({ length: 100, nullable: true })
  targetDeviceId?: string;

  @Column({ length: 100, nullable: true })
  requesterDeviceId?: string;

  @Column({ length: 100, nullable: true })
  sessionId?: string;

  @Column({ type: 'jsonb', nullable: true })
  payload?: Record<string, unknown>;

  @Column({ type: 'timestamptz', nullable: true })
  claimedAt?: Date;

  @Column({ length: 100, nullable: true })
  claimedByDeviceId?: string;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt?: Date;

  @Column({ type: 'jsonb', nullable: true })
  result?: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  error?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
