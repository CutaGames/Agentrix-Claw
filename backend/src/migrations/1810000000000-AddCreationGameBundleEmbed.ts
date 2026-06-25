import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds embed-game support to creation_game_bundles (world-creation-feed · 快速扩充游戏库):
 *   - url:      external/embedded HTML5 game URL (source='embed'); WebView loads it directly.
 *   - provider: origin classification (opensource / distribution / upload / host).
 *   - source now also accepts 'embed' (column already varchar — no enum change needed).
 *
 * Lets us onboard existing playable web games (self-upload / distribution networks /
 * open-source libraries) alongside LLM-generated and template games.
 *
 * Column names auto-derived to snake_case by the global SnakeNamingStrategy.
 * Created idempotently (IF NOT EXISTS).
 */
export class AddCreationGameBundleEmbed1810000000000 implements MigrationInterface {
  name = 'AddCreationGameBundleEmbed1810000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "creation_game_bundles" ADD COLUMN IF NOT EXISTS "url" text;`,
    );
    await queryRunner.query(
      `ALTER TABLE "creation_game_bundles" ADD COLUMN IF NOT EXISTS "provider" varchar(64);`,
    );
    // html 列原为 NOT NULL;embed 包没有内联 html,放宽为可空(占位空串亦可)。
    await queryRunner.query(
      `ALTER TABLE "creation_game_bundles" ALTER COLUMN "html" DROP NOT NULL;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "creation_game_bundles" DROP COLUMN IF EXISTS "url";`);
    await queryRunner.query(`ALTER TABLE "creation_game_bundles" DROP COLUMN IF EXISTS "provider";`);
  }
}
