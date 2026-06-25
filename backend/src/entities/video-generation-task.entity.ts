import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum VideoGenerationStatusEnum {
  QUEUED = 'queued',
  SUBMITTING = 'submitting',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

@Entity('video_generation_tasks')
@Index(['userId', 'taskId'], { unique: true })
@Index(['status', 'updatedAt'])
@Index(['sessionId', 'createdAt'])
export class VideoGenerationTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ length: 100 })
  taskId: string;

  @Column({ length: 100, nullable: true })
  sessionId?: string;

  @Column({ length: 100, nullable: true })
  deviceId?: string;

  @Column({ length: 60, default: 'fal' })
  provider: string;

  @Column({ length: 180, default: 'fal-ai/kling-video/v1/standard/text-to-video' })
  model: string;

  @Column({ length: 240 })
  title: string;

  @Column({ type: 'text' })
  prompt: string;

  @Column({ type: 'text', nullable: true })
  negativePrompt?: string;

  @Column({
    type: 'enum',
    enum: VideoGenerationStatusEnum,
    default: VideoGenerationStatusEnum.QUEUED,
  })
  status: VideoGenerationStatusEnum;

  @Column({ length: 40, nullable: true })
  providerStatus?: string;

  @Column({ length: 255, nullable: true })
  providerRequestId?: string;

  @Column({ type: 'text', nullable: true })
  responseUrl?: string;

  @Column({ type: 'text', nullable: true })
  statusUrl?: string;

  @Column({ type: 'text', nullable: true })
  outputUrl?: string;

  @Column({ type: 'text', nullable: true })
  thumbnailUrl?: string;

  @Column({ type: 'text', nullable: true })
  error?: string;

  @Column({ type: 'jsonb', nullable: true })
  input?: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  result?: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}