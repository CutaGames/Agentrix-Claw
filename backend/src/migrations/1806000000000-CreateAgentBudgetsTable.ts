import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `agent_budgets` table (world-creation-feed task 9.2 / 9.4).
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design}.md
 *   - req 13.4: Agent-on-behalf consuming verbs (order/book/subscribe/donate) are
 *     gated by the user's **preset budget** — within budget auto-approve, over
 *     budget reject and require re-authorization.
 *   - design §Agent Invocation — preset budget model (per-period cap + spend +
 *     optional whitelist).
 *
 * One row per user account (unique on_behalf_of_account_id). Rolling weekly period:
 * `period_start` + `period_spent_axp`, reset cross-period by AgentBudgetService.
 * Column names auto-derived to snake_case by the global SnakeNamingStrategy.
 * Created idempotently (IF NOT EXISTS).
 */
export class CreateAgentBudgetsTable1806000000000 implements MigrationInterface {
  name = 'CreateAgentBudgetsTable1806000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_budgets" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "on_behalf_of_account_id" uuid NOT NULL,
        "preset_budget_axp" numeric(18,6) NOT NULL DEFAULT 0,
        "period_start" timestamptz NOT NULL DEFAULT now(),
        "period_spent_axp" numeric(18,6) NOT NULL DEFAULT 0,
        "whitelist_creation_ids" jsonb NOT NULL DEFAULT '[]',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_agent_budgets" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_agent_budgets_account" ON "agent_budgets" ("on_behalf_of_account_id");`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_agent_budgets_account";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_budgets";`);
  }
}
