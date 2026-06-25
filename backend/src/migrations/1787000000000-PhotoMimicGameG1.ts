import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * G1 Photo Mimic Game — docs/G1_PHOTO_MIMIC_GAME_2026-05.zh-CN.md
 * Creates 3 tables + indexes + seeds first season.
 */
export class PhotoMimicGameG11787000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "photo_mimic_seasons" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "theme_code" varchar(48) NOT NULL UNIQUE,
        "theme_title_en" varchar(160) NOT NULL,
        "theme_title_zh" varchar(160) NOT NULL,
        "theme_desc_en" text,
        "theme_desc_zh" text,
        "submit_open_at" timestamptz NOT NULL,
        "submit_close_at" timestamptz NOT NULL,
        "vote_close_at" timestamptz NOT NULL,
        "settled_at" timestamptz,
        "prize_pool_axp" bigint NOT NULL DEFAULT 10000,
        "champion_entry_id" uuid,
        "status" varchar(16) NOT NULL DEFAULT 'upcoming',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pms_status" ON "photo_mimic_seasons" ("status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pms_submit_open" ON "photo_mimic_seasons" ("submit_open_at")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "photo_mimic_entries" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "season_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "pet_generation_task_id" varchar(96),
        "source_image_url" text NOT NULL,
        "generated_model_url" text,
        "generated_thumbnail_url" text,
        "caption" varchar(200),
        "vote_count" int NOT NULL DEFAULT 0,
        "final_rank" int,
        "axp_rewarded" int NOT NULL DEFAULT 0,
        "status" varchar(16) NOT NULL DEFAULT 'generating',
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pme_season_votes" ON "photo_mimic_entries" ("season_id", "vote_count" DESC)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pme_user" ON "photo_mimic_entries" ("user_id", "created_at")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pme_season_status" ON "photo_mimic_entries" ("season_id", "status")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "photo_mimic_votes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "season_id" uuid NOT NULL,
        "entry_id" uuid NOT NULL,
        "voter_user_id" uuid NOT NULL,
        "voted_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_photo_mimic_vote_once" UNIQUE ("season_id", "entry_id", "voter_user_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pmv_voter_day" ON "photo_mimic_votes" ("voter_user_id", "voted_at")`);

    // Seed first season
    await queryRunner.query(`
      INSERT INTO "photo_mimic_seasons" ("theme_code", "theme_title_en", "theme_title_zh", "theme_desc_en", "theme_desc_zh", "submit_open_at", "submit_close_at", "vote_close_at", "status")
      VALUES (
        '2026W20_desktop_things',
        'What''s on your desk?',
        '桌上的东西',
        'Snap a photo of anything on your desk — AI turns it into a pet. Most creative wins 5000 AXP!',
        '拍一张桌上任何东西的照片 — AI 把它变成萌宠。最有创意的赢 5000 AXP！',
        now(),
        now() + interval '5 days',
        now() + interval '7 days',
        'submitting'
      )
      ON CONFLICT ("theme_code") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "photo_mimic_votes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "photo_mimic_entries"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "photo_mimic_seasons"`);
  }
}
