import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

/**
 * Co-Raising feed event — per docs §6.1.
 *
 * Each row = one feeding action by one user on one invite. The first
 * feed on an invite also counts toward `feedersCount` on the invite.
 * Anti-abuse: unique(inviteId, feederId, feed_date) — at most one feed
 * per day per invite-feeder pair.
 */
@Entity({ name: 'pet_coraising_feeds' })
@Index(['inviteId', 'createdAt'])
@Index(['feederId', 'createdAt'])
@Index(['inviteId', 'feederId', 'feedDate'], { unique: true })
export class PetCoRaisingFeed {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  inviteId!: string;

  /** The user who fed the pet. NULL = anonymous guest (first-tap UX). */
  @Column({ type: 'uuid', nullable: true })
  feederId?: string | null;

  /**
   * Kind of interaction — feed / water / walk / praise / photo — extensible
   * to richer daily tasks without schema changes.
   */
  @Column({ type: 'varchar', length: 16, default: 'feed' })
  kind!: string;

  /** Energy delivered to the target pet. */
  @Column({ type: 'int', default: 2 })
  energy!: number;

  /** AXP rewarded to the feeder at feed time. Cached for history display. */
  @Column({ type: 'int', default: 5 })
  axpAwarded!: number;

  /** Date string (YYYY-MM-DD UTC) used for the unique(invite,feeder,day) constraint. */
  @Column({ type: 'date' })
  feedDate!: string;

  /** IP / device fingerprint for abuse detection (hashed). */
  @Column({ type: 'varchar', length: 64, nullable: true })
  clientHash?: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
