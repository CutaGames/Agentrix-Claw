import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 6 M6 — sovereign pet profile table.
 *
 * PRD: docs/PRD_PET_PHASED_DEV_PLAN.zh-CN.md §9.2 M6
 */
export class PetSovereignProfilePhase6M61782930000000 implements MigrationInterface {
  name = 'PetSovereignProfilePhase6M61782930000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pet_sovereign_profiles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "living_pet_id" uuid NOT NULL,
        "custody_mode" varchar(16) NOT NULL DEFAULT 'platform',
        "mpc_user_share_commitment" varchar(256),
        "mpc_device_fingerprint" varchar(256),
        "mpc_server_kms_key_id" varchar(256),
        "wallet_address" varchar(96),
        "memory_storage" varchar(16) NOT NULL DEFAULT 'platform',
        "memory_uri" varchar(256),
        "memory_hash" varchar(96),
        "supported_chains" jsonb NOT NULL DEFAULT '["base"]'::jsonb,
        "status" varchar(16) NOT NULL DEFAULT 'active',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_pet_sovereign_profiles" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_pet_sovereign_profiles_pet"
       ON "pet_sovereign_profiles" ("living_pet_id");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pet_sovereign_profiles_user"
       ON "pet_sovereign_profiles" ("user_id");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pet_sovereign_profiles_status"
       ON "pet_sovereign_profiles" ("status");`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_pet_sovereign_profiles_status";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_pet_sovereign_profiles_user";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_pet_sovereign_profiles_pet";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pet_sovereign_profiles";`);
  }
}
