import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ScanTaskStatus {
  QUEUED = 'queued',
  UPLOADING = 'uploading',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * PetScanTask — Multi-angle photo scan for 3D pet reconstruction.
 *
 * Users upload 8-12 photos from different angles. The backend dispatches
 * to a configured provider (Meshy, Tripo3D, or self-hosted TripoSR)
 * for image-to-3D reconstruction.
 *
 * Rate limit: max 3 scans per user per day.
 */
@Entity('pet_generation_scan_tasks')
@Index(['userId', 'createdAt'])
@Index(['status', 'updatedAt'])
export class PetScanTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({
    type: 'enum',
    enum: ScanTaskStatus,
    default: ScanTaskStatus.QUEUED,
  })
  status: ScanTaskStatus;

  /** Provider used: meshy | tripo3d | triposr */
  @Column({ type: 'varchar', length: 30, default: 'meshy' })
  provider: string;

  /** Provider-specific external task ID for polling */
  @Column({ type: 'varchar', length: 255, nullable: true })
  externalTaskId: string | null;

  /** S3 URLs of uploaded photos (JSON array) */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  photoUrls: string[];

  /** Number of photos submitted */
  @Column({ type: 'integer', default: 0 })
  photoCount: number;

  /** Generated .glb/.fbx mesh URL (raw output) */
  @Column({ type: 'text', nullable: true })
  outputUrl: string | null;

  /** Generated .vrm file URL (after auto-rig) */
  @Column({ type: 'text', nullable: true })
  vrmUrl: string | null;

  /** Preview thumbnail URL */
  @Column({ type: 'text', nullable: true })
  thumbnailUrl: string | null;

  /** Processing progress (0-100) */
  @Column({ type: 'integer', default: 0 })
  progress: number;

  /** Error message if failed */
  @Column({ type: 'text', nullable: true })
  error: string | null;

  /** Additional metadata (platform, device info, etc.) */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
