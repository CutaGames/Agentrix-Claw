import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Multi-Agent v2 W8 — Pet Arena schema.
 *
 * Spec: `multi-agent-collaboration-2026-06`
 * See: design.md §14.5; tasks.md W8.1, W8.2
 *
 * Adds:
 *   - pet_arena_match table — one row per arena match (winner / loser
 *     / mode / outcome / cost / xp_delta)
 *   - pet_arena_ladder_snapshot — daily ladder cache (read-side
 *     materialized view of pet_productivity_snapshot + match outcomes)
 *
 * v2 W8 SHIP — schema lives in pet-arena domain, NOT
 * `world_engine_battles` (that table is W6 territory and is not yet
 * created in production).
 *
 * All additive. Existing rows unaffected.
 */
export class MultiAgentV2W8PetArena1797000003000 implements MigrationInterface {
  name = 'MultiAgentV2W8PetArena1797000003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. pet_arena_match — one row per match
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS pet_arena_match (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        mode varchar(24) NOT NULL,
        a_user_id varchar(64) NOT NULL,
        a_living_pet_id uuid NOT NULL,
        a_agent_account_id varchar(64),
        b_user_id varchar(64) NOT NULL,
        b_living_pet_id uuid NOT NULL,
        b_agent_account_id varchar(64),
        winner_side char(1),
        outcome varchar(24) NOT NULL DEFAULT 'pending',
        score_a integer NOT NULL DEFAULT 0,
        score_b integer NOT NULL DEFAULT 0,
        a_elo_before integer NOT NULL DEFAULT 1200,
        b_elo_before integer NOT NULL DEFAULT 1200,
        a_elo_after integer NOT NULL DEFAULT 1200,
        b_elo_after integer NOT NULL DEFAULT 1200,
        cost_usd double precision NOT NULL DEFAULT 0,
        agent_task_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        completed_at timestamptz,
        CONSTRAINT chk_pet_arena_match_mode CHECK (mode IN ('task_arena','tournament','arena_room')),
        CONSTRAINT chk_pet_arena_match_outcome CHECK (outcome IN ('pending','running','completed','canceled'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pam_a_user
      ON pet_arena_match (a_user_id, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pam_b_user
      ON pet_arena_match (b_user_id, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pam_a_pet
      ON pet_arena_match (a_living_pet_id, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pam_b_pet
      ON pet_arena_match (b_living_pet_id, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pam_outcome
      ON pet_arena_match (outcome, created_at DESC)
    `);

    // 2. pet_arena_ladder_snapshot — daily ladder cache
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS pet_arena_ladder_snapshot (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        living_pet_id uuid NOT NULL,
        user_id varchar(64) NOT NULL,
        snapshot_date date NOT NULL,
        elo integer NOT NULL DEFAULT 1200,
        wins integer NOT NULL DEFAULT 0,
        losses integer NOT NULL DEFAULT 0,
        rank_in_user_pool integer,
        rank_global integer,
        productivity_score integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uniq_pals_pet_date UNIQUE (living_pet_id, snapshot_date)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pals_user_elo
      ON pet_arena_ladder_snapshot (user_id, elo DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pals_date_rank
      ON pet_arena_ladder_snapshot (snapshot_date DESC, rank_global)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS pet_arena_ladder_snapshot`);
    await queryRunner.query(`DROP TABLE IF EXISTS pet_arena_match`);
  }
}
