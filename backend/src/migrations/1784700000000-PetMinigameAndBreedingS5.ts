import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pet Phase 6 S5 — 迷你游戏 + 社交繁育
 */
export class PetMinigameAndBreedingS51784700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pet_minigame_scores" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "game_key" varchar(32) NOT NULL,
        "score" integer NOT NULL DEFAULT 0,
        "intimacy_xp_awarded" integer NOT NULL DEFAULT 0,
        "energy_awarded" integer NOT NULL DEFAULT 0,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_pet_minigame_scores_user_created"
        ON "pet_minigame_scores" ("user_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_pet_minigame_scores_user_game_created"
        ON "pet_minigame_scores" ("user_id", "game_key", "created_at")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pet_breeding_eggs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "initiator_user_id" uuid NOT NULL,
        "partner_user_id" uuid NOT NULL,
        "initiator_pet_skin_id" varchar(64) NOT NULL,
        "partner_pet_skin_id" varchar(64) NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'invited',
        "hatch_at" bigint,
        "child_skin_id_initiator" uuid,
        "child_skin_id_partner" uuid,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_pet_breeding_eggs_initiator_status"
        ON "pet_breeding_eggs" ("initiator_user_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_pet_breeding_eggs_partner_status"
        ON "pet_breeding_eggs" ("partner_user_id", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "pet_breeding_eggs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pet_minigame_scores"`);
  }
}
