import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds creation_game_bundles.model_used (world-creation-feed · Plan A playable games):
 *   - Records which friendly model generated the bundle (e.g. claude-sonnet-4-6).
 *   - NULL for template fallback (source='template') or legacy rows.
 *   - Frontend uses it (+ source) to guide the user: weak model / template fallback
 *     → suggest a stronger model or configuring BYO for more complex games.
 *
 * Column name auto-derived to snake_case by the global SnakeNamingStrategy.
 * Created idempotently (IF NOT EXISTS).
 */
export class AddCreationGameBundleModelUsed1809000000000 implements MigrationInterface {
  name = 'AddCreationGameBundleModelUsed1809000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "creation_game_bundles" ADD COLUMN IF NOT EXISTS "model_used" varchar(64);`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "creation_game_bundles" DROP COLUMN IF EXISTS "model_used";`,
    );
  }
}
