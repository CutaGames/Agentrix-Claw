import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the `original_creator_account_id` column to `world_plots` (Task 16.2, R11.3).
 *
 * The original creator is the AgentAccount that first acquired a scarce Plot and
 * built its experience. Marketplace first-sale listings (saleType='first') are
 * gated to the original creator (R11.3): a secondary owner who bought the Plot may
 * only re-list it as a secondary sale (30% cut), never as a first sale (5% cut).
 * Ownership (`owner_account_id`) flips on transfer, but the original creator is
 * permanent, so it is tracked in its own column.
 *
 * Backfill: existing Plots that already have an owner are assumed to have been
 * created by their current owner (no prior transfer recorded), so we seed
 * `original_creator_account_id` from `owner_account_id` where it is set.
 *
 * Column name auto-derived to snake_case by the global SnakeNamingStrategy.
 */
export class AddWorldPlotOriginalCreator1802000000200
  implements MigrationInterface
{
  name = 'AddWorldPlotOriginalCreator1802000000200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "world_plots"
        ADD COLUMN IF NOT EXISTS "original_creator_account_id" uuid;
    `);

    // Backfill: treat the current owner of pre-existing Plots as the original
    // creator (no transfer history exists for them).
    await queryRunner.query(`
      UPDATE "world_plots"
        SET "original_creator_account_id" = "owner_account_id"
        WHERE "original_creator_account_id" IS NULL
          AND "owner_account_id" IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_world_plots_original_creator_account_id"
        ON "world_plots" ("original_creator_account_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_world_plots_original_creator_account_id";`,
    );
    await queryRunner.query(`
      ALTER TABLE "world_plots" DROP COLUMN IF EXISTS "original_creator_account_id";
    `);
  }
}
