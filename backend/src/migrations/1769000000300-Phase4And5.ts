import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase4And51769000000300 implements MigrationInterface {
  name = 'Phase4And51769000000300';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Phase 5: Agent Scheduled Tasks ──────────────────────────────────

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_scheduled_task_trigger_type_enum" AS ENUM (
          'cron', 'interval', 'one_time', 'event'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_scheduled_task_action_type_enum" AS ENUM (
          'send_message', 'check_channel', 'digest_summary', 'memory_cleanup', 'custom'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_scheduled_task_status_enum" AS ENUM (
          'active', 'paused', 'completed', 'failed'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_scheduled_tasks" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL,
        "agent_id" UUID NOT NULL,
        "name" VARCHAR(200) NOT NULL,
        "description" TEXT,
        "trigger_type" "agent_scheduled_task_trigger_type_enum" NOT NULL,
        "cron_expression" VARCHAR(100),
        "interval_seconds" INTEGER,
        "action_type" "agent_scheduled_task_action_type_enum" NOT NULL,
        "action_config" JSONB,
        "status" "agent_scheduled_task_status_enum" NOT NULL DEFAULT 'active',
        "next_run_at" TIMESTAMPTZ,
        "last_run_at" TIMESTAMPTZ,
        "run_count" INTEGER NOT NULL DEFAULT 0,
        "fail_count" INTEGER NOT NULL DEFAULT 0,
        "last_error" TEXT,
        "max_runs" INTEGER,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_agent_scheduled_tasks" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_agent_sched_user_agent_status"
      ON "agent_scheduled_tasks" ("user_id", "agent_id", "status")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_agent_sched_status_next_run"
      ON "agent_scheduled_tasks" ("status", "next_run_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_agent_sched_status_next_run"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_agent_sched_user_agent_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_scheduled_tasks"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_scheduled_task_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_scheduled_task_action_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_scheduled_task_trigger_type_enum"`);
  }
}
