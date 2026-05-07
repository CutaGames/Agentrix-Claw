import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSandboxInstances1784000000000 implements MigrationInterface {
  name = 'CreateSandboxInstances1784000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "sandbox_instances_status_enum" AS ENUM (
          'creating',
          'running',
          'stopped',
          'destroyed',
          'error'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sandbox_instances" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL,
        "task_id" VARCHAR(64),
        "session_id" VARCHAR(64),
        "container_id" VARCHAR(128),
        "image" VARCHAR(256) NOT NULL,
        "status" "sandbox_instances_status_enum" NOT NULL DEFAULT 'creating',
        "limits" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "work_dir" VARCHAR(256) NOT NULL DEFAULT '/workspace',
        "error_message" TEXT,
        "started_at_ms" BIGINT,
        "destroyed_at_ms" BIGINT,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_sandbox_instances_user_status" ON "sandbox_instances" ("user_id", "status");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_sandbox_instances_container" ON "sandbox_instances" ("container_id");`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sandbox_instances_container";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sandbox_instances_user_status";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sandbox_instances";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "sandbox_instances_status_enum";`);
  }
}
