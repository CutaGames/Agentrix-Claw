import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 6 M2 — multi-pet team table.
 *
 * PRD: docs/PRD_PET_PHASED_DEV_PLAN.zh-CN.md §9.2 M2
 *
 *   - 1 主宠（living_pets.id） + ≤11 子宠（pet_team_members rows）
 *   - role 在每个 (parent, role) 下唯一 → 自然约束 11 个槽位
 *   - status: active | paused | revoked
 *   - 子宠独立 budget / wallet / scope（工具白名单 + 风险等级 + 区域）
 */
export class PetTeamMembersPhase6M21782900000000 implements MigrationInterface {
  name = 'PetTeamMembersPhase6M21782900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pet_team_members" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "parent_living_pet_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "role" varchar(32) NOT NULL,
        "soul_template_id" varchar(64) NOT NULL,
        "display_name" varchar(64) NOT NULL DEFAULT '',
        "scope" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "daily_budget_usd" numeric(8,2) NOT NULL DEFAULT 0.5,
        "wallet_address" varchar(96),
        "status" varchar(16) NOT NULL DEFAULT 'active',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_pet_team_members" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_pet_team_members_parent_role"
       ON "pet_team_members" ("parent_living_pet_id", "role");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pet_team_members_user" ON "pet_team_members" ("user_id");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pet_team_members_status" ON "pet_team_members" ("status");`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_pet_team_members_status";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_pet_team_members_user";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_pet_team_members_parent_role";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pet_team_members";`);
  }
}
