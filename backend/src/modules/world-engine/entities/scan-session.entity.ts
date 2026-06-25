import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * ScanSession — 一次完整的扫描会话记录。
 *
 * 从启动摄像头到生成最终 WorldAsset 的全过程元数据，
 * 包括扫描模式、图像数量、质量评分、管线选择等。
 */
@Entity('scan_sessions')
@Index(['userId'])
export class ScanSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** User who initiated the scan (FK → users.id) */
  @Column()
  userId: string;

  /** Scan mode selected by the user */
  @Column({ type: 'enum', enum: ['quick', 'detail', 'room'] })
  scanMode: string;

  /** Number of images captured in this session */
  @Column({ default: 0 })
  imageCount: number;

  /** Per-frame quality scores from Quality Gate Layer 2 */
  @Column({ type: 'jsonb' })
  qualityScores: Record<string, unknown>[];

  /** Overall Generation Quality Prediction (1-5 stars, Layer 3) */
  @Column({ type: 'float', nullable: true })
  overallPredictionScore: number | null;

  /** Session lifecycle status */
  @Column({ type: 'enum', enum: ['capturing', 'submitted', 'processing', 'completed', 'failed'] })
  status: string;

  /** Resulting WorldAsset ID after successful generation (FK → world_assets.id) */
  @Column({ nullable: true })
  resultAssetId: string | null;

  /** Which reconstruction pipeline was used */
  @Column({ type: 'enum', enum: ['fast', 'precision'] })
  pipelineUsed: string;

  /** Error message if the session failed */
  @Column({ nullable: true })
  errorMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
