import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('skill_listings')
@Index(['developerUserId', 'status'])
@Index(['status', 'category'])
export class SkillListingEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'uuid' })
  developerUserId: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 120, unique: true })
  slug: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'integer' })
  priceCents: number;

  @Column({ type: 'integer' })
  revenueSplitBps: number;

  @Column({ type: 'varchar', length: 24 })
  category: string;

  @Column({ type: 'varchar', length: 20 })
  status: string;

  @Column({ type: 'integer', default: 0 })
  installCount: number;

  @Column({ type: 'integer', default: 0 })
  invokeCount: number;

  @Column({ type: 'integer', default: 0 })
  totalRevenueCents: number;

  @Column({ type: 'integer', default: 0 })
  developerRevenueCents: number;

  @Column({ type: 'integer', default: 0 })
  platformRevenueCents: number;

  @Column({ type: 'bigint' })
  createdAtMs: string;

  @Column({ type: 'bigint' })
  updatedAtMs: string;

  @Column({ type: 'bigint', nullable: true })
  reviewedAtMs?: string | null;

  @Column({ type: 'text', nullable: true })
  reviewerNote?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
