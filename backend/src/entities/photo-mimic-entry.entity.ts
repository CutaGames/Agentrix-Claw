import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

@Entity({ name: 'photo_mimic_entries' })
@Index(['seasonId', 'voteCount'])
@Index(['userId', 'createdAt'])
@Index(['seasonId', 'status'])
export class PhotoMimicEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  seasonId!: string;

  @Column('uuid')
  userId!: string;

  @Column({ type: 'varchar', length: 96, nullable: true })
  petGenerationTaskId?: string | null;

  @Column({ type: 'text' })
  sourceImageUrl!: string;

  @Column({ type: 'text', nullable: true })
  generatedModelUrl?: string | null;

  @Column({ type: 'text', nullable: true })
  generatedThumbnailUrl?: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  caption?: string | null;

  @Column({ type: 'int', default: 0 })
  voteCount!: number;

  @Column({ type: 'int', nullable: true })
  finalRank?: number | null;

  @Column({ type: 'int', default: 0 })
  axpRewarded!: number;

  @Column({ type: 'varchar', length: 16, default: 'generating' })
  status!: 'generating' | 'active' | 'disqualified' | 'archived';

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
