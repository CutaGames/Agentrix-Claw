import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates creation_unlocks (interactive-drama · per-episode AXP entitlement):
 *   - One row per (creation, user, episode) the user has unlocked with AXP.
 *   - Re-entry checks this table to avoid double-charging (idempotent unlock).
 *   - chargedAxp records the authoritative amount spent (audit).
 *
 * Column names auto-derived to snake_case by the global SnakeNamingStrategy.
 * Created idempotently (IF NOT EXISTS).
 */
export class CreateCreationUnlocks1811000000000 implements MigrationInterface {
  name = 'CreateCreationUnlocks1811000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "creation_unlocks" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "creation_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "episode" integer NOT NULL,
        "charged_axp" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_creation_unlocks" PRIMARY KEY ("id"),
        CONSTRAINT "fk_creation_unlocks_creation" FOREIGN KEY ("creation_id")
          REFERENCES "creations" ("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_creation_unlocks_creation_user" ON "creation_unlocks" ("creation_id", "user_id");`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_creation_unlocks_creation_user_episode" ON "creation_unlocks" ("creation_id", "user_id", "episode");`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "creation_unlocks";`);
  }
}
