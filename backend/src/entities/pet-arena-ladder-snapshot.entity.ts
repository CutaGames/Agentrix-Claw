import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';

/**
 * Multi-Agent v2 W8 — daily ladder snapshot.
 *
 * One row per (livingPetId, snapshotDate). Written daily by the
 * `pet-arena.ladder.scheduler` cron. Read-side view of
 * `pet_productivity_snapshot` (W5) blended with match outcomes from
 * `pet_arena_match` (W8).
 *
 * Spec: design.md §14.5; tasks.md W8.2
 */
@Entity('pet_arena_ladder_snapshot')
@Index(['userId', 'elo'])
@Unique('uniq_pals_pet_date', ['livingPetId', 'snapshotDate'])
export class PetArenaLadderSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'living_pet_id', type: 'uuid' })
  livingPetId: string;

  @Column({ name: 'user_id', length: 64 })
  userId: string;

  @Column({ name: 'snapshot_date', type: 'date' })
  snapshotDate: string;

  @Column({ type: 'integer', default: 1200 })
  elo: number;

  @Column({ type: 'integer', default: 0 })
  wins: number;

  @Column({ type: 'integer', default: 0 })
  losses: number;

  @Column({ name: 'rank_in_user_pool', type: 'integer', nullable: true })
  rankInUserPool: number | null;

  @Column({ name: 'rank_global', type: 'integer', nullable: true })
  rankGlobal: number | null;

  /** Sum from pet_productivity_snapshot last 4 weeks. */
  @Column({ name: 'productivity_score', type: 'integer', default: 0 })
  productivityScore: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
