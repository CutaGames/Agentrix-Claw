import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVideoGenerationTasks1781100000000 implements MigrationInterface {
  name = 'CreateVideoGenerationTasks1781100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "video_generation_tasks_status_enum" AS ENUM (
          'queued',
          'submitting',
          'processing',
          'completed',
          'failed',
          'cancelled'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "video_generation_tasks" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL,
        "task_id" VARCHAR(100) NOT NULL,
        "session_id" VARCHAR(100),
        "device_id" VARCHAR(100),
        "provider" VARCHAR(60) NOT NULL DEFAULT 'fal',
        "model" VARCHAR(180) NOT NULL DEFAULT 'fal-ai/kling-video/v1/standard/text-to-video',
        "title" VARCHAR(240) NOT NULL,
        "prompt" TEXT NOT NULL,
        "negative_prompt" TEXT,
        "status" "video_generation_tasks_status_enum" NOT NULL DEFAULT 'queued',
        "provider_status" VARCHAR(40),
        "provider_request_id" VARCHAR(255),
        "response_url" TEXT,
        "status_url" TEXT,
        "output_url" TEXT,
        "thumbnail_url" TEXT,
        "error" TEXT,
        "input" JSONB,
        "result" JSONB,
        "metadata" JSONB,
        "started_at" TIMESTAMPTZ,
        "completed_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_video_generation_tasks_user_task"
        ON "video_generation_tasks" ("user_id", "task_id");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_video_generation_tasks_status_updated"
        ON "video_generation_tasks" ("status", "updated_at" DESC);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_video_generation_tasks_session_created"
        ON "video_generation_tasks" ("session_id", "created_at" DESC);
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No-op: keeps async task history intact.
  }
}