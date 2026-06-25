import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Multi-Agent v2 W8 — Pet Arena match record.
 *
 * One row per match. Aside A vs Bside B,with ELO before/after for
 * deterministic ranking. `agent_task_id` links to the agent task that
 * ran the match logic (so cost + duration are auditable).
 *
 * Spec: design.md §14.5; tasks.md W8.2
 */
export type PetArenaMode = 'task_arena' | 'tournament' | 'arena_room';
export type PetArenaOutcome = 'pending' | 'running' | 'completed' | 'canceled';

@Entity('pet_arena_match')
@Index(['aUserId', 'createdAt'])
@Index(['bUserId', 'createdAt'])
@Index(['outcome', 'createdAt'])
export class PetArenaMatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 24 })
  mode: PetArenaMode;

  @Column({ name: 'a_user_id', length: 64 })
  aUserId: string;

  @Column({ name: 'a_living_pet_id', type: 'uuid' })
  aLivingPetId: string;

  @Column({ name: 'a_agent_account_id', length: 64, nullable: true })
  aAgentAccountId: string | null;

  @Column({ name: 'b_user_id', length: 64 })
  bUserId: string;

  @Column({ name: 'b_living_pet_id', type: 'uuid' })
  bLivingPetId: string;

  @Column({ name: 'b_agent_account_id', length: 64, nullable: true })
  bAgentAccountId: string | null;

  /** 'A' | 'B' | null (draw / pending) */
  @Column({ name: 'winner_side', type: 'char', length: 1, nullable: true })
  winnerSide: string | null;

  @Column({ length: 24, default: 'pending' })
  outcome: PetArenaOutcome;

  @Column({ name: 'score_a', type: 'integer', default: 0 })
  scoreA: number;

  @Column({ name: 'score_b', type: 'integer', default: 0 })
  scoreB: number;

  @Column({ name: 'a_elo_before', type: 'integer', default: 1200 })
  aEloBefore: number;

  @Column({ name: 'b_elo_before', type: 'integer', default: 1200 })
  bEloBefore: number;

  @Column({ name: 'a_elo_after', type: 'integer', default: 1200 })
  aEloAfter: number;

  @Column({ name: 'b_elo_after', type: 'integer', default: 1200 })
  bEloAfter: number;

  @Column({ name: 'cost_usd', type: 'double precision', default: 0 })
  costUsd: number;

  /** v2 W8 — agent_tasks row that ran the match logic. */
  @Column({ name: 'agent_task_id', type: 'uuid', nullable: true })
  agentTaskId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;
}
