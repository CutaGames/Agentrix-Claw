import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `creation_moderation_decisions` audit table (world-creation-feed task 2.4).
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design}.md
 *   - req 3.4: any user may report a published Creation; on a confirmed violation
 *     it is suspended and removed from discovery.
 *   - req 3.5: keep a per-Creation moderation decision audit record
 *     (who / when / result / reason) for compliance traceability.
 *
 * Mirrors `plot_moderation_decisions` (world-creation) but on the unified Creation
 * dimension, distinguishing the reporter (reporter_id) from the reviewer
 * (reviewer_id). Column names auto-derived to snake_case by the global
 * SnakeNamingStrategy. Created idempotently (IF NOT EXISTS / duplicate-object guards).
 */
export class CreateCreationModerationDecisionsTable1805000000000
  implements MigrationInterface
{
  name = 'CreateCreationModerationDecisionsTable1805000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── Enum types ────────────────────────────────────────────────────

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "creation_moderation_decisions_stage_enum" AS ENUM ('report', 'takedown', 'unpublish');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "creation_moderation_decisions_decision_enum" AS ENUM ('pending', 'approved', 'rejected', 'unpublished');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    // ─── creation_moderation_decisions (audit: who / when / result / reason) ──

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "creation_moderation_decisions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "creation_id" uuid NOT NULL,
        "stage" "creation_moderation_decisions_stage_enum" NOT NULL,
        "decision" "creation_moderation_decisions_decision_enum" NOT NULL,
        "reason" text,
        "reporter_id" uuid,
        "reviewer_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_creation_moderation_decisions" PRIMARY KEY ("id"),
        CONSTRAINT "fk_creation_moderation_decisions_creation" FOREIGN KEY ("creation_id")
          REFERENCES "creations" ("id") ON DELETE CASCADE
      );
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_creation_moderation_decisions_creation_id" ON "creation_moderation_decisions" ("creation_id");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_creation_moderation_decisions_reporter_id" ON "creation_moderation_decisions" ("reporter_id");`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_creation_moderation_decisions_reporter_id";`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_creation_moderation_decisions_creation_id";`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "creation_moderation_decisions";`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "creation_moderation_decisions_decision_enum";`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "creation_moderation_decisions_stage_enum";`,
    );
  }
}
