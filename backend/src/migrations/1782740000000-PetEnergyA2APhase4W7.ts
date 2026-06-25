import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 4 W7 — pet energy + LLM usage events + A2A dispatches.
 */
export class PetEnergyA2APhase4W71782740000000 implements MigrationInterface {
  name = 'PetEnergyA2APhase4W71782740000000';

  public async up(q: QueryRunner): Promise<void> {
    // 1. pet_energy_states (composite PK userId,petSkinId)
    await q.query(`
      CREATE TABLE IF NOT EXISTS "pet_energy_states" (
        "user_id" uuid NOT NULL,
        "pet_skin_id" uuid NOT NULL,
        "energy" integer NOT NULL DEFAULT 100,
        "daily_llm_calls" integer NOT NULL DEFAULT 0,
        "daily_spend_cents" integer NOT NULL DEFAULT 0,
        "paused" boolean NOT NULL DEFAULT false,
        "paused_reason" varchar(80),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_pet_energy_states" PRIMARY KEY ("user_id", "pet_skin_id")
      )
    `);

    // 2. pet_llm_usage_events
    await q.query(`
      CREATE TABLE IF NOT EXISTS "pet_llm_usage_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "pet_skin_id" uuid NOT NULL,
        "model" varchar(64) NOT NULL,
        "cost_cents" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_pet_llm_usage_events" PRIMARY KEY ("id")
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_plue_user_pet_created" ON "pet_llm_usage_events" ("user_id", "pet_skin_id", "created_at")`,
    );

    // 3. pet_a2a_dispatches
    await q.query(`
      CREATE TABLE IF NOT EXISTS "pet_a2a_dispatches" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "pet_skin_id" uuid NOT NULL,
        "task_name" varchar(80) NOT NULL,
        "target_agent_id" varchar(120) NOT NULL,
        "payload" jsonb NOT NULL DEFAULT '{}',
        "reward_cents" integer NOT NULL DEFAULT 0,
        "status" varchar(16) NOT NULL DEFAULT 'queued',
        "result" jsonb,
        "error_message" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_pet_a2a_dispatches" PRIMARY KEY ("id")
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "idx_a2a_user_pet_status" ON "pet_a2a_dispatches" ("user_id", "pet_skin_id", "status")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "pet_a2a_dispatches"`);
    await q.query(`DROP TABLE IF EXISTS "pet_llm_usage_events"`);
    await q.query(`DROP TABLE IF EXISTS "pet_energy_states"`);
  }
}
