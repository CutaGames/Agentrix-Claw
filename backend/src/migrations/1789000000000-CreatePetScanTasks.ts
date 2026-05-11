import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the pet_generation_scan_tasks table for multi-angle photo
 * 3D reconstruction tasks.
 *
 * Supports multiple providers: Meshy, Tripo3D, TripoSR (self-hosted).
 * Rate limited to 3 scans per user per day.
 */
export class CreatePetScanTasks1789000000000 implements MigrationInterface {
  name = 'CreatePetScanTasks1789000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum type for scan task status
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "pet_scan_task_status_enum" AS ENUM (
          'queued', 'uploading', 'processing', 'completed', 'failed', 'cancelled'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // Create the scan tasks table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pet_generation_scan_tasks" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "status" "pet_scan_task_status_enum" NOT NULL DEFAULT 'queued',
        "provider" varchar(30) NOT NULL DEFAULT 'meshy',
        "external_task_id" varchar(255),
        "photo_urls" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "photo_count" integer NOT NULL DEFAULT 0,
        "output_url" text,
        "vrm_url" text,
        "thumbnail_url" text,
        "progress" integer NOT NULL DEFAULT 0,
        "error" text,
        "metadata" jsonb,
        "started_at" timestamptz,
        "completed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_pet_generation_scan_tasks" PRIMARY KEY ("id")
      );
    `);

    // Indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_pet_scan_tasks_user_created"
        ON "pet_generation_scan_tasks" ("user_id", "created_at" DESC);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_pet_scan_tasks_status_updated"
        ON "pet_generation_scan_tasks" ("status", "updated_at");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pet_scan_tasks_status_updated";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pet_scan_tasks_user_created";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pet_generation_scan_tasks";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "pet_scan_task_status_enum";`);
  }
}
