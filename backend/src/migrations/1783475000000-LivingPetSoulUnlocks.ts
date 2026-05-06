import { MigrationInterface, QueryRunner } from 'typeorm';

export class LivingPetSoulUnlocks1783475000000 implements MigrationInterface {
  name = 'LivingPetSoulUnlocks1783475000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "living_pets"
        ADD COLUMN IF NOT EXISTS "unlocked_soul_template_ids" JSONB NOT NULL DEFAULT '["claw"]'::jsonb;
    `);
    await queryRunner.query(`
      UPDATE "living_pets"
      SET "unlocked_soul_template_ids" = to_jsonb(ARRAY[
        'claw',
        COALESCE(NULLIF("soul_template_id", ''), 'claw')
      ])
      WHERE "unlocked_soul_template_ids" IS NULL
         OR jsonb_typeof("unlocked_soul_template_ids") <> 'array'
         OR jsonb_array_length("unlocked_soul_template_ids") = 0;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "living_pets"
        DROP COLUMN IF EXISTS "unlocked_soul_template_ids";
    `);
  }
}