import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the agent spending idempotency ledger (spec: crypto-native-agent-ops, task 2.1):
 *   - agent_spending_records — 每条真实成交记一行,`idempotency_key` 唯一去重。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - 需求 7.1/7.2/7.4(A 组 额度联动 · 自动记账 + 幂等 + 账实一致)。
 *   - design §C1:recordSpending 引入幂等键(结算事件 id)防重复计数。
 *   - Correctness Property 1(账实一致)。
 *
 * Additive & idempotent (CREATE TABLE/INDEX IF NOT EXISTS)。列名由全局
 * SnakeNamingStrategy 自动派生为 snake_case(agentId → agent_id 等)。
 * idempotency_key 部分唯一索引:仅对非空键强制「同一结算事件至多一行」。
 */
export class CreateAgentSpendingRecords1817000000000 implements MigrationInterface {
  name = 'CreateAgentSpendingRecords1817000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_spending_records" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "agent_id" uuid NOT NULL,
        "idempotency_key" text,
        "amount" numeric(18,2) NOT NULL DEFAULT 0,
        "success" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_agent_spending_records" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_agent_spending_records_agent" ON "agent_spending_records" ("agent_id");`,
    );
    // 部分唯一索引:同一结算事件(idempotency_key)至多一行;空键不参与去重。
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_agent_spending_records_idem"
        ON "agent_spending_records" ("idempotency_key")
        WHERE "idempotency_key" IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_agent_spending_records_idem";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_spending_records";`);
  }
}
