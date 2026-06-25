import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('memory_items')
@Index(['userId', 'tier', 'tsMs'])
@Index(['userId', 'tier', 'memoryKey'])
export class MemoryItemEntity {
  @PrimaryColumn({ type: 'varchar', length: 160 })
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 20 })
  tier: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  memoryKey?: string | null;

  @Column({ type: 'text' })
  text: string;

  @Column({ type: 'jsonb' })
  tags: string[];

  @Column({ type: 'varchar', length: 100, nullable: true })
  agentId?: string | null;

  @Column({ type: 'bigint' })
  tsMs: string;

  @Column({ type: 'bigint', nullable: true })
  expiresAtMs?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
