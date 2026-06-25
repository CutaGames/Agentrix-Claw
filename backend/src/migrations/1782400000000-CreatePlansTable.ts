import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Plan-Runner 持久化（顿领 §5.4 / §9.3）
 *
 * 表:
 *   plans   PlanRunnerService 的持久化承载，替换原 in-memory Map。
 */
export class CreatePlansTable1782400000000 implements MigrationInterface {
  name = 'CreatePlansTable1782400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "plans_status_enum" AS ENUM (
          'draft','awaiting_approval','approved','denied',
          'running','done','failed'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "plans" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "external_id" varchar(64) NOT NULL,
        "user_id" uuid NOT NULL,
        "title" varchar(200) NOT NULL,
        "intent" text NOT NULL,
        "steps" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "approval_id" uuid,
        "status" "plans_status_enum" NOT NULL DEFAULT 'draft',
        "created_at_ms" bigint NOT NULL,
        "started_at_ms" bigint,
        "finished_at_ms" bigint,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_plans_id" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_plans_external_id" ON "plans" ("external_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_plans_user_status" ON "plans" ("user_id", "status");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_plans_approval_id" ON "plans" ("approval_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "plans"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "plans_status_enum"`);
  }
}
