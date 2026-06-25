import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Co-Raising (共养) — per docs §6.1.
 *
 * A pet owner generates an invite token → shares a universal link. When
 * a friend taps the link and "feeds" the pet, the feeder gets a share of
 * the pet's future earnings (default 5%, capped by splitRatio) and an
 * AXP reward.
 *
 * One invite token = one inviter + one target pet + one inviter-configured
 * split ratio. A friend consuming the link creates `PetCoRaisingFeed`
 * rows under `inviteId`.
 */
@Entity({ name: 'pet_coraising_invites' })
@Index(['inviterId', 'createdAt'])
@Index(['token'], { unique: true })
export class PetCoRaisingInvite {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Inviter = pet owner. */
  @Column('uuid')
  inviterId!: string;

  /** Target pet / agent account (links to the pet whose earnings will be split). */
  @Column('uuid')
  agentAccountId!: string;

  /** Short public token embedded in the invite URL — not a UUID to keep URL readable. */
  @Column({ type: 'varchar', length: 32 })
  token!: string;

  /** Percentage of pet earnings shared with feeder. Default 500 (= 5.00%, basis points). */
  @Column({ type: 'int', default: 500 })
  splitBps!: number;

  /** Max feeders allowed. 0 = unlimited. */
  @Column({ type: 'int', default: 0 })
  maxFeeders!: number;

  /** Running count of distinct feeders (for analytics). */
  @Column({ type: 'int', default: 0 })
  feedersCount!: number;

  /** Running count of feed events (aggregated for quick stats). */
  @Column({ type: 'int', default: 0 })
  totalFeeds!: number;

  /** Invite expires after this timestamp. NULL = never expires. */
  @Column({ type: 'timestamptz', nullable: true })
  expiresAt?: Date | null;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: 'active' | 'paused' | 'cancelled' | 'expired';

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
