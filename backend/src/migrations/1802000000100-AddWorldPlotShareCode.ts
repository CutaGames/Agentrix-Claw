import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the shareable `share_code` column to `world_plots` (Task 12.4, R11.5).
 *
 * A published Plot (e.g. a Battle Arena) becomes discoverable on the World_Map
 * and produces a share code whose format matches the shipped v5 dungeon
 * `share_code` model (6–12 alphanumeric chars, SHA-256-derived, DB-unique),
 * reusing the same `agentrix://world-engine/dungeon/{share_code}` deep-link /
 * share-card model. The partial UNIQUE index mirrors the dungeon uniqueness
 * guarantee while allowing many unpublished (NULL) plots.
 *
 * Column name auto-derived to snake_case by the global SnakeNamingStrategy.
 */
export class AddWorldPlotShareCode1802000000100 implements MigrationInterface {
  name = 'AddWorldPlotShareCode1802000000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "world_plots"
        ADD COLUMN IF NOT EXISTS "share_code" varchar(12);
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_world_plots_share_code"
        ON "world_plots" ("share_code")
        WHERE "share_code" IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_world_plots_share_code";`);
    await queryRunner.query(`
      ALTER TABLE "world_plots" DROP COLUMN IF EXISTS "share_code";
    `);
  }
}
