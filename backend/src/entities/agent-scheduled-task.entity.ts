import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum TaskTriggerType {
  CRON = 'cron',
  INTERVAL = 'interval',
  ONE_TIME = 'one_time',
  EVENT = 'event',
}

export enum TaskActionType {
  SEND_MESSAGE = 'send_message',
  CHECK_CHANNEL = 'check_channel',
  DIGEST_SUMMARY = 'digest_summary',
  MEMORY_CLEANUP = 'memory_cleanup',
  CUSTOM = 'custom',
}

export enum ScheduledTaskStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * AgentScheduledTask — Agent-driven scheduled/recurring tasks.
 *
 * Allows agents to schedule periodic actions like:
 * - Send daily digest to a Telegram channel
 * - Check social mentions every hour
 * - Clean up stale memories weekly
 * - Post scheduled content to Twitter
 */
@Entity('agent_scheduled_tasks')
@Index(['userId', 'agentId', 'status'])
@Index(['status', 'nextRunAt'])
export class AgentScheduledTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  agentId: string;

  @Column({ length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'enum', enum: TaskTriggerType })
  triggerType: TaskTriggerType;

  @Column({ length: 100, nullable: true })
  cronExpression?: string; // For CRON type

  @Column({ type: 'int', nullable: true })
  intervalSeconds?: number; // For INTERVAL type

  @Column({ type: 'enum', enum: TaskActionType })
  actionType: TaskActionType;

  @Column({ type: 'jsonb', nullable: true })
  actionConfig?: {
    channel?: string;
    channelId?: string;
    messageTemplate?: string;
    customPayload?: Record<string, any>;
  };

  @Column({
    type: 'enum',
    enum: ScheduledTaskStatus,
    default: ScheduledTaskStatus.ACTIVE,
  })
  status: ScheduledTaskStatus;

  @Column({ type: 'timestamptz', nullable: true })
  nextRunAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastRunAt?: Date;

  @Column({ type: 'int', default: 0 })
  runCount: number;

  @Column({ type: 'int', default: 0 })
  failCount: number;

  @Column({ type: 'text', nullable: true })
  lastError?: string;

  @Column({ type: 'int', nullable: true })
  maxRuns?: number; // null = unlimited

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
