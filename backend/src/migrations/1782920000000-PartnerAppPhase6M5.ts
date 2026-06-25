import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 6 M5 — partner app SDK tables.
 *
 * PRD: docs/PRD_PET_PHASED_DEV_PLAN.zh-CN.md §9.2 M5
 */
export class PartnerAppPhase6M51782920000000 implements MigrationInterface {
  name = 'PartnerAppPhase6M51782920000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "partner_apps" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "owner_user_id" uuid NOT NULL,
        "name" varchar(64) NOT NULL,
        "slug" varchar(64) NOT NULL,
        "api_key_hash" varchar(96) NOT NULL,
        "redirect_uris" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "scopes" jsonb NOT NULL DEFAULT '["pet.read"]'::jsonb,
        "billing_mode" varchar(16) NOT NULL DEFAULT 'per_call',
        "per_call_usd" numeric(8,4) NOT NULL DEFAULT 0.001,
        "monthly_flat_usd" numeric(10,2) NOT NULL DEFAULT 0,
        "monthly_cap_usd" numeric(10,2) NOT NULL DEFAULT 100,
        "status" varchar(16) NOT NULL DEFAULT 'active',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_partner_apps" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_partner_apps_owner" ON "partner_apps" ("owner_user_id");`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_partner_apps_slug" ON "partner_apps" ("slug");`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_partner_apps_api_key_hash" ON "partner_apps" ("api_key_hash");`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "partner_app_usage" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "partner_app_id" uuid NOT NULL,
        "day" varchar(10) NOT NULL,
        "calls" integer NOT NULL DEFAULT 0,
        "cost_usd" numeric(12,4) NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_partner_app_usage" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_partner_app_usage_app_day"
       ON "partner_app_usage" ("partner_app_id", "day");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_partner_app_usage_day" ON "partner_app_usage" ("day");`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_partner_app_usage_day";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_partner_app_usage_app_day";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "partner_app_usage";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_partner_apps_api_key_hash";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_partner_apps_slug";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_partner_apps_owner";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "partner_apps";`);
  }
}
