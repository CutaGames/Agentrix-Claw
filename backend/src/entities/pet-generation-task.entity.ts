import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum PetGenerationStatusEnum {
  QUEUED = 'queued',
  SUBMITTING = 'submitting',
  PROCESSING = 'processing',
  REFINING = 'refining',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * PetGenerationTask — async 3D pet/avatar generation lifecycle.
 *
 * Mirrors VideoGenerationTask: each task is owned by a user, persisted across
 * restarts, polled every ~20s by PetGenerationService, and pushed to the
 * desktop timeline via DesktopSyncService when state changes.
 *
 * outputUrl is the raw `.glb`/`.fbx` mesh produced by the provider.
 * vrmUrl (when present) is the VRM 1.0 file produced by the auto-rig step,
 * which is what the desktop PetVRM renderer actually loads.
 */
@Entity('pet_generation_tasks')
@Index(['userId', 'taskId'], { unique: true })
@Index(['status', 'updatedAt'])
@Index(['sessionId', 'createdAt'])
export class PetGenerationTask {
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

  /** Provider id: meshy | hunyuan3d (extensible) */
  @Column({ length: 60, default: 'meshy' })
  provider: string;

  /** Provider-specific model id (Meshy: "meshy-4", "meshy-5"; HF: endpoint repo). */
  @Column({ length: 180, nullable: true })
  model?: string;

  /** Generation mode: text | image */
  @Column({ length: 30, default: 'text' })
  mode: string;

  /** Visual style hint forwarded to provider (anime, realistic, chibi, sculpture). */
  @Column({ length: 30, nullable: true })
  style?: string;

  @Column({ length: 240 })
  title: string;

  @Column({ type: 'text' })
  prompt: string;

  @Column({ type: 'text', nullable: true })
  negativePrompt?: string;

  /** Source image URL when mode=image. */
  @Column({ type: 'text', nullable: true })
  referenceImageUrl?: string;

  @Column({
    type: 'enum',
    enum: PetGenerationStatusEnum,
    default: PetGenerationStatusEnum.QUEUED,
  })
  status: PetGenerationStatusEnum;

  @Column({ length: 60, nullable: true })
  providerStatus?: string;

  @Column({ length: 255, nullable: true })
  providerRequestId?: string;

  /** Raw generated mesh (.glb / .fbx). */
  @Column({ type: 'text', nullable: true })
  outputUrl?: string;

  /** VRM 1.0 file produced by auto-rig (loadable by desktop PetVRM). */
  @Column({ type: 'text', nullable: true })
  vrmUrl?: string;

  /** Static preview image of the generated mesh. */
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
