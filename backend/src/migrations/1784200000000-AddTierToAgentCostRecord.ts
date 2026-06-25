import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Codex-borrow P1 — record the user-facing tier preference (`local | smart | cloud`)
 * on each cost record so the dashboard can break down spend / privacy posture
 * by tier.
 */
export class AddTierToAgentCostRecord1784200000000 implements MigrationInterface {
  name = 'AddTierToAgentCostRecord1784200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "agent_cost_records"
      ADD COLUMN IF NOT EXISTS "tier" VARCHAR(16) NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_agent_cost_records_tier"
      ON "agent_cost_records" ("tier")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_agent_cost_records_tier"`);
    await queryRunner.query(`ALTER TABLE "agent_cost_records" DROP COLUMN IF EXISTS "tier"`);
  }
}
