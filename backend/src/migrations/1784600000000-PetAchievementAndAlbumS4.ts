import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pet Phase 6 S4 — 成就 + 时光相册
 */
export class PetAchievementAndAlbumS41784600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pet_achievements" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "achievement_key" varchar(64) NOT NULL,
        "snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "unlocked_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_pet_achievements_user_key"
        ON "pet_achievements" ("user_id", "achievement_key")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_pet_achievements_user_unlocked"
        ON "pet_achievements" ("user_id", "unlocked_at")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pet_memory_albums" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "category" varchar(32) NOT NULL DEFAULT 'chat',
        "title" varchar(200) NOT NULL,
        "body" text NOT NULL DEFAULT '',
        "thumbnail_url" text,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_pet_memory_albums_user_created"
        ON "pet_memory_albums" ("user_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_pet_memory_albums_user_cat_created"
        ON "pet_memory_albums" ("user_id", "category", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "pet_memory_albums"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pet_achievements"`);
  }
}
