import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates Creation social tables (world-creation-feed task 8.1):
 *   - creation_comments  (req 8.1)
 *   - creation_likes     (req 8.2, idempotent via unique (creation_id, account_id))
 *   - creation_follows   (req 8.3, idempotent via unique (follower, creator))
 *
 * Column names auto-derived to snake_case by the global SnakeNamingStrategy.
 * Created idempotently (IF NOT EXISTS).
 */
export class CreateCreationSocialTables1807000000000 implements MigrationInterface {
  name = 'CreateCreationSocialTables1807000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── creation_comments ──
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "creation_comments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "creation_id" uuid NOT NULL,
        "author_account_id" uuid NOT NULL,
        "text" text NOT NULL,
        "parent_comment_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_creation_comments" PRIMARY KEY ("id"),
        CONSTRAINT "fk_creation_comments_creation" FOREIGN KEY ("creation_id")
          REFERENCES "creations" ("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_creation_comments_creation_id" ON "creation_comments" ("creation_id");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_creation_comments_author" ON "creation_comments" ("author_account_id");`,
    );

    // ── creation_likes ──
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "creation_likes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "creation_id" uuid NOT NULL,
        "account_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_creation_likes" PRIMARY KEY ("id"),
        CONSTRAINT "fk_creation_likes_creation" FOREIGN KEY ("creation_id")
          REFERENCES "creations" ("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_creation_likes_creation_account" ON "creation_likes" ("creation_id", "account_id");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_creation_likes_account" ON "creation_likes" ("account_id");`,
    );

    // ── creation_follows ──
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "creation_follows" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "follower_account_id" uuid NOT NULL,
        "creator_account_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_creation_follows" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_creation_follows_pair" ON "creation_follows" ("follower_account_id", "creator_account_id");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_creation_follows_follower" ON "creation_follows" ("follower_account_id");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_creation_follows_creator" ON "creation_follows" ("creator_account_id");`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "creation_follows";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "creation_likes";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "creation_comments";`);
  }
}
