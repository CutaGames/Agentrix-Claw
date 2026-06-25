import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates creation_game_bundles (world-creation-feed · Plan A playable games):
 *   - Stores the self-contained HTML5 game bundle for a `game` Creation.
 *   - source = 'llm' (model-generated) | 'template' (built-in fallback).
 *   - Latest version per creation = current playable build.
 *
 * Column names auto-derived to snake_case by the global SnakeNamingStrategy.
 * Created idempotently (IF NOT EXISTS).
 */
export class CreateCreationGameBundles1808000000000 implements MigrationInterface {
  name = 'CreateCreationGameBundles1808000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "creation_game_bundles" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "creation_id" uuid NOT NULL,
        "version" integer NOT NULL DEFAULT 1,
        "title" varchar(120) NOT NULL,
        "engine" varchar(32) NOT NULL DEFAULT 'html5-canvas',
        "source" varchar(16) NOT NULL DEFAULT 'template',
        "html" text NOT NULL,
        "prompt" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_creation_game_bundles" PRIMARY KEY ("id"),
        CONSTRAINT "fk_creation_game_bundles_creation" FOREIGN KEY ("creation_id")
          REFERENCES "creations" ("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_creation_game_bundles_creation_id" ON "creation_game_bundles" ("creation_id");`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_creation_game_bundles_creation_version" ON "creation_game_bundles" ("creation_id", "version");`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "creation_game_bundles";`);
  }
}
