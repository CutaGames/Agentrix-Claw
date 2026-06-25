import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 2 W1 — 配额 / 审核 / Rive 资产 三块骨架
 *
 * 新增 3 张表：
 *  - pet_gen_quotas    : 月度配额账本（user × month）
 *  - moderation_logs   : 审核审计
 *  - pet_rive_assets   : Rive 资产清单（按 soul_template_id 索引）
 *
 * down() 完整反向，可回滚。
 */
export class PetGenQuotaModerationRivePhase21782710000000 implements MigrationInterface {
  name = 'PetGenQuotaModerationRivePhase21782710000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---- 1. pet_gen_quotas ----
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pet_gen_quotas" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL,
        "period" VARCHAR(7) NOT NULL,
        "plan" VARCHAR(24) NOT NULL DEFAULT 'free',
        "included" INTEGER NOT NULL DEFAULT 3,
        "used" INTEGER NOT NULL DEFAULT 0,
        "overage_used" INTEGER NOT NULL DEFAULT 0,
        "reserved" INTEGER NOT NULL DEFAULT 0,
        "overage_unit_price_usd" NUMERIC(6,2) NOT NULL DEFAULT 0.5,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_pet_gen_quotas_user_period" ON "pet_gen_quotas" ("user_id", "period");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pet_gen_quotas_period" ON "pet_gen_quotas" ("period");`,
    );

    // ---- 2. moderation_logs ----
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "moderation_logs" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NULL,
        "kind" VARCHAR(16) NOT NULL,
        "decision" VARCHAR(16) NOT NULL,
        "score" NUMERIC(4,3) NOT NULL DEFAULT 0,
        "reason" VARCHAR(64) NULL,
        "input_hash" VARCHAR(64) NULL,
        "ref_id" VARCHAR(120) NULL,
        "detail" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_moderation_logs_user_created" ON "moderation_logs" ("user_id", "created_at");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_moderation_logs_decision_created" ON "moderation_logs" ("decision", "created_at");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_moderation_logs_kind" ON "moderation_logs" ("kind");`,
    );

    // ---- 3. pet_rive_assets ----
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pet_rive_assets" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "soul_template_id" VARCHAR(64) NULL,
        "skin_id" UUID NULL,
        "kind" VARCHAR(24) NOT NULL DEFAULT 'default',
        "display_name" VARCHAR(120) NOT NULL,
        "url" TEXT NOT NULL,
        "thumbnail_url" TEXT NULL,
        "state_machine" VARCHAR(120) NOT NULL DEFAULT 'PetSM',
        "emotion_map" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "perf_baseline" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "version" INTEGER NOT NULL DEFAULT 1,
        "retired" BOOLEAN NOT NULL DEFAULT false,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pet_rive_assets_soul_kind" ON "pet_rive_assets" ("soul_template_id", "kind");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pet_rive_assets_retired" ON "pet_rive_assets" ("retired");`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_pet_rive_assets_retired";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_pet_rive_assets_soul_kind";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pet_rive_assets";`);

    await queryRunner.query(`DROP INDEX IF EXISTS "idx_moderation_logs_kind";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_moderation_logs_decision_created";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_moderation_logs_user_created";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "moderation_logs";`);

    await queryRunner.query(`DROP INDEX IF EXISTS "idx_pet_gen_quotas_period";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_pet_gen_quotas_user_period";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pet_gen_quotas";`);
  }
}
