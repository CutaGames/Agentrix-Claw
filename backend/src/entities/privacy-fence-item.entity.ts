import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('privacy_fence_items')
@Index(['userId', 'category'])
@Index(['familyPartition'])
export class PrivacyFenceItemEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 24 })
  category: string;

  @Column({ type: 'text' })
  text: string;

  @Column({ type: 'jsonb' })
  visibleToRoles: string[];

  @Column({ type: 'varchar', length: 64, nullable: true })
  familyPartition?: string | null;

  @Column({ type: 'bigint' })
  tsMs: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
