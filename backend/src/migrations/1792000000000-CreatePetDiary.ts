import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase C / C-7 — pet_diary table.
 *
 * One row per (user_id, date_key in Asia/Shanghai). Stores the rendered
 * one-sentence diary for each day so subsequent reads are O(1).
 *
 * Backed by `backend/src/entities/pet-diary-entry.entity.ts`.
 */
export class CreatePetDiary1792000000000 implements MigrationInterface {
  name = 'CreatePetDiary1792000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pet_diary" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "date_key" varchar(10) NOT NULL,
        "emotion" varchar(32) NOT NULL,
        "intimacy_level" smallint NOT NULL,
        "text_zh" text NOT NULL,
        "text_en" text NOT NULL,
        "generated_at" bigint NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_pet_diary" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_pet_diary_user_date"
        ON "pet_diary" ("user_id", "date_key");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pet_diary_user_date";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pet_diary";`);
  }
}
