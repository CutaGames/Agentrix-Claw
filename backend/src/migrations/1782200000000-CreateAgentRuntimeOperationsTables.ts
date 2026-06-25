import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAgentRuntimeOperationsTables1782200000000 implements MigrationInterface {
  name = 'CreateAgentRuntimeOperationsTables1782200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_lane_jobs_kind_enum" AS ENUM ('coordinator', 'lane');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_lane_jobs_status_enum" AS ENUM ('queued', 'running', 'completed', 'failed', 'timeout', 'cancelled');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_repair_jobs_status_enum" AS ENUM ('created', 'running', 'needs_approval', 'patched', 'passed', 'failed', 'cancelled');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_repair_attempts_status_enum" AS ENUM ('passed', 'patched', 'failed', 'needs_patch_generator', 'needs_approval');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_repair_patches_status_enum" AS ENUM ('pending_approval', 'approved', 'rejected', 'applied', 'rolled_back');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_lane_jobs" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL,
        "parent_job_id" UUID,
        "kind" "agent_lane_jobs_kind_enum" NOT NULL DEFAULT 'lane',
        "role" VARCHAR,
        "agent_account_id" VARCHAR,
        "handle_id" VARCHAR,
        "lane_index" INTEGER NOT NULL DEFAULT 0,
        "task" TEXT NOT NULL,
        "model" VARCHAR,
        "budget_usd" NUMERIC(10,4),
        "retry_count" INTEGER NOT NULL DEFAULT 0,
        "max_retries" INTEGER NOT NULL DEFAULT 0,
        "timeout_ms" INTEGER,
        "lease_owner" VARCHAR,
        "heartbeat_at" TIMESTAMPTZ,
        "cancelled_by" VARCHAR,
        "tool_policy" JSONB,
        "transcript_pointer" TEXT,
        "status" "agent_lane_jobs_status_enum" NOT NULL DEFAULT 'queued',
        "result" TEXT,
        "error" TEXT,
        "usage" JSONB,
        "completed_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agent_lane_jobs_user_status_created" ON "agent_lane_jobs" ("user_id", "status", "created_at")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agent_lane_jobs_parent_lane" ON "agent_lane_jobs" ("parent_job_id", "lane_index")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agent_lane_jobs_lease_heartbeat" ON "agent_lane_jobs" ("lease_owner", "heartbeat_at")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_lane_events" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "job_id" UUID NOT NULL REFERENCES "agent_lane_jobs"("id") ON DELETE CASCADE,
        "parent_job_id" UUID,
        "sequence" INTEGER NOT NULL,
        "type" VARCHAR(80) NOT NULL,
        "payload" JSONB,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agent_lane_events_job_sequence" ON "agent_lane_events" ("job_id", "sequence")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agent_lane_events_parent_created" ON "agent_lane_events" ("parent_job_id", "created_at")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agent_lane_events_type_created" ON "agent_lane_events" ("type", "created_at")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_lane_artifacts" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "job_id" UUID NOT NULL REFERENCES "agent_lane_jobs"("id") ON DELETE CASCADE,
        "kind" VARCHAR(60) NOT NULL,
        "uri" TEXT,
        "content" TEXT,
        "metadata" JSONB,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agent_lane_artifacts_job_kind" ON "agent_lane_artifacts" ("job_id", "kind")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_repair_jobs" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID,
        "agent_id" UUID,
        "session_id" VARCHAR,
        "command" TEXT NOT NULL,
        "workspace_root" TEXT,
        "approval_required" BOOLEAN NOT NULL DEFAULT true,
        "status" "agent_repair_jobs_status_enum" NOT NULL DEFAULT 'created',
        "attempts_count" INTEGER NOT NULL DEFAULT 0,
        "final_diagnostics" JSONB,
        "metadata" JSONB,
        "created_by" VARCHAR,
        "cancelled_by" VARCHAR,
        "completed_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agent_repair_jobs_user_status_created" ON "agent_repair_jobs" ("user_id", "status", "created_at")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agent_repair_jobs_session_created" ON "agent_repair_jobs" ("session_id", "created_at")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_repair_attempts" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "job_id" UUID NOT NULL REFERENCES "agent_repair_jobs"("id") ON DELETE CASCADE,
        "attempt" INTEGER NOT NULL,
        "status" "agent_repair_attempts_status_enum" NOT NULL,
        "command_result" JSONB NOT NULL,
        "diagnostics" JSONB NOT NULL,
        "repair_prompt" TEXT,
        "patch_plan" JSONB,
        "metadata" JSONB,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agent_repair_attempts_job_attempt" ON "agent_repair_attempts" ("job_id", "attempt")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agent_repair_attempts_job_status" ON "agent_repair_attempts" ("job_id", "status")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_repair_patches" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "job_id" UUID NOT NULL REFERENCES "agent_repair_jobs"("id") ON DELETE CASCADE,
        "attempt_id" UUID,
        "attempt" INTEGER NOT NULL,
        "status" "agent_repair_patches_status_enum" NOT NULL DEFAULT 'pending_approval',
        "patch_plan" JSONB NOT NULL,
        "affected_files" JSONB NOT NULL,
        "unified_diff" TEXT,
        "reverse_diff" TEXT,
        "approval_reason" TEXT,
        "requested_by" VARCHAR,
        "approved_by" VARCHAR,
        "approved_at" TIMESTAMPTZ,
        "metadata" JSONB,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agent_repair_patches_job_status" ON "agent_repair_patches" ("job_id", "status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agent_repair_patches_attempt_created" ON "agent_repair_patches" ("attempt_id", "created_at")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_memory_edges" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL,
        "agent_id" UUID,
        "session_id" VARCHAR,
        "source_kind" VARCHAR(30) NOT NULL,
        "source_id" VARCHAR(255) NOT NULL,
        "target_kind" VARCHAR(30) NOT NULL,
        "target_id" VARCHAR(255) NOT NULL,
        "relationship" VARCHAR(80) NOT NULL,
        "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
        "metadata" JSONB,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agent_memory_edges_user_source" ON "agent_memory_edges" ("user_id", "source_kind", "source_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agent_memory_edges_user_target" ON "agent_memory_edges" ("user_id", "target_kind", "target_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agent_memory_edges_session_created" ON "agent_memory_edges" ("session_id", "created_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_memory_edges"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_repair_patches"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_repair_attempts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_repair_jobs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_lane_artifacts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_lane_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_lane_jobs"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_repair_patches_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_repair_attempts_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_repair_jobs_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_lane_jobs_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_lane_jobs_kind_enum"`);
  }
}