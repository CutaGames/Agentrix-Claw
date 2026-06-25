import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Multi-Agent Collaboration v1 Wave 5 — schema part 3.
 *
 * Spec: `multi-agent-collaboration-2026-06`
 * See: design.md §2.2 新增 4 + 7; tasks.md W5.1
 *
 * Adds:
 *   - agent_cost_records.parent_task_id (uuid nullable) — links a cost
 *     row to a sub-task for weekly aggregation (R10.1)
 *   - agent_cost_records.event_type (varchar 32 nullable) — discriminator:
 *     'llm_call' | 'sub_task_complete' | 'tool_call' | etc.
 *   - pet_productivity_snapshot table — per-pet rolling 7-day metrics
 *     written daily by the weekly aggregation cron (R15.3, v1 writes,
 *     v2 W8 reads)
 *
 * NOT done in this migration (deferred to W6 World Engine wave):
 *   - battle_mode enum extensions (task_arena / tournament / arena_room)
 *   - world_engine_battles.subject_kind
 *
 * All additive + nullable. Existing rows unaffected.
 */
export class MultiAgentSchemaPart31797000002000 implements MigrationInterface {
  name = 'MultiAgentSchemaPart31797000002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. agent_cost_records.parent_task_id + event_type
    await queryRunner.query(`
      ALTER TABLE agent_cost_records
      ADD COLUMN IF NOT EXISTS parent_task_id uuid NULL
    `);

    await queryRunner.query(`
      ALTER TABLE agent_cost_records
      ADD COLUMN IF NOT EXISTS event_type varchar(32) NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_acr_parent_task
      ON agent_cost_records (parent_task_id, created_at DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_acr_event_type
      ON agent_cost_records (event_type, created_at DESC)
    `);

    // 2. pet_productivity_snapshot — daily rolling 7-day aggregate per pet
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS pet_productivity_snapshot (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar(64) NOT NULL,
        living_pet_id uuid NOT NULL,
        agent_account_id varchar(64) NULL,
        snapshot_date date NOT NULL,
        sub_task_count integer NOT NULL DEFAULT 0,
        succeeded_count integer NOT NULL DEFAULT 0,
        failed_count integer NOT NULL DEFAULT 0,
        total_cost_usd double precision NOT NULL DEFAULT 0,
        avg_duration_ms bigint NOT NULL DEFAULT 0,
        xp_earned integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uniq_pps_pet_date UNIQUE (living_pet_id, snapshot_date)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pps_user_date
      ON pet_productivity_snapshot (user_id, snapshot_date DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pps_pet_date
      ON pet_productivity_snapshot (living_pet_id, snapshot_date DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_pps_pet_date`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_pps_user_date`);
    await queryRunner.query(`DROP TABLE IF EXISTS pet_productivity_snapshot`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_acr_event_type`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_acr_parent_task`);
    await queryRunner.query(
      `ALTER TABLE agent_cost_records DROP COLUMN IF EXISTS event_type`,
    );
    await queryRunner.query(
      `ALTER TABLE agent_cost_records DROP COLUMN IF EXISTS parent_task_id`,
    );
  }
}
