import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

/**
 * Pet Phase 6 S4 — 时光相册
 *
 * 每条 memory 关联可选 thumbnail，可由 chat / photo / 成就解锁等场景写入。
 */
@Entity({ name: 'pet_memory_albums' })
@Index(['userId', 'createdAt'])
@Index(['userId', 'category', 'createdAt'])
export class PetMemoryAlbum {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  userId!: string;

  /** chat | achievement | photo | mood | system */
  @Column({ type: 'varchar', length: 32, default: 'chat' })
  category!: string;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text', default: '' })
  body!: string;

  @Column({ type: 'text', nullable: true })
  thumbnailUrl!: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
