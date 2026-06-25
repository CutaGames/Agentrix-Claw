import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the crypto-native agent-ops base tables (spec: crypto-native-agent-ops, task 1):
 *   - agent_ops_task         — 任务记录(尽调/监控/安全/增长…)
 *   - agent_ops_deliverable  — 任务产出的可交付物
 *   - agent_ops_action_log   — 每步动作的可审计轨迹(append-only)
 *   - approval_grant         — 会话/任务级自动放行预算窗口
 *   - monitor_subscription   — 散户监控/告警订阅
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md §Data Models
 *   - 需求 2.4(可审计轨迹) / 8.4(交付物落库) / 9.4(监控可暂停/修改/删除 + 上次检查)。
 *
 * Additive & idempotent (CREATE TABLE/INDEX IF NOT EXISTS). Column names are
 * auto-derived to snake_case by the global SnakeNamingStrategy — entity props use
 * camelCase and map 1:1 (e.g. `agentId` → `agent_id`).
 */
export class CreateAgentOpsTables1816000000000 implements MigrationInterface {
  name = 'CreateAgentOpsTables1816000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── agent_ops_task ──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_ops_task" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "agent_id" uuid NOT NULL,
        "owner_id" uuid NOT NULL,
        "type" varchar(64) NOT NULL,
        "input" jsonb NOT NULL DEFAULT '{}',
        "status" varchar(32) NOT NULL DEFAULT 'pending',
        "risk_tier" varchar(16) NOT NULL DEFAULT 'read',
        "approval_state" varchar(16) NOT NULL DEFAULT 'auto',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_agent_ops_task" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_agent_ops_task_agent" ON "agent_ops_task" ("agent_id");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_agent_ops_task_owner" ON "agent_ops_task" ("owner_id");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_agent_ops_task_status" ON "agent_ops_task" ("status");`,
    );

    // ── agent_ops_deliverable ───────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_ops_deliverable" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "task_id" uuid NOT NULL,
        "agent_id" uuid NOT NULL,
        "type" varchar(64) NOT NULL,
        "content" jsonb NOT NULL DEFAULT '{}',
        "source_links" jsonb NOT NULL DEFAULT '[]',
        "collected_at" timestamptz,
        "qualified" boolean,
        "quality_checked_by" varchar(128),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_agent_ops_deliverable" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_agent_ops_deliverable_task" ON "agent_ops_deliverable" ("task_id");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_agent_ops_deliverable_agent" ON "agent_ops_deliverable" ("agent_id");`,
    );

    // ── agent_ops_action_log ────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_ops_action_log" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "task_id" uuid NOT NULL,
        "step" integer NOT NULL DEFAULT 0,
        "target" text,
        "action" varchar(64) NOT NULL,
        "result" jsonb NOT NULL DEFAULT '{}',
        "risk_tier" varchar(16) NOT NULL DEFAULT 'read',
        "approved_by" uuid,
        "at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_agent_ops_action_log" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_agent_ops_action_log_task" ON "agent_ops_action_log" ("task_id");`,
    );

    // ── approval_grant ──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "approval_grant" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "agent_id" uuid NOT NULL,
        "scope" varchar(16) NOT NULL,
        "scope_id" uuid NOT NULL,
        "budget_cap" numeric(18,6) NOT NULL DEFAULT 0,
        "used" numeric(18,6) NOT NULL DEFAULT 0,
        "expires_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_approval_grant" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_approval_grant_user" ON "approval_grant" ("user_id");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_approval_grant_agent" ON "approval_grant" ("agent_id");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_approval_grant_scope" ON "approval_grant" ("scope", "scope_id");`,
    );

    // ── monitor_subscription ────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "monitor_subscription" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "owner_id" uuid NOT NULL,
        "agent_id" uuid NOT NULL,
        "monitor_type" varchar(32) NOT NULL,
        "condition" jsonb NOT NULL DEFAULT '{}',
        "interval" integer NOT NULL DEFAULT 3600,
        "last_checked_at" timestamptz,
        "last_result" jsonb,
        "status" varchar(16) NOT NULL DEFAULT 'active',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_monitor_subscription" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_monitor_subscription_owner" ON "monitor_subscription" ("owner_id");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_monitor_subscription_agent" ON "monitor_subscription" ("agent_id");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_monitor_subscription_status" ON "monitor_subscription" ("status");`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "monitor_subscription";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "approval_grant";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_ops_action_log";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_ops_deliverable";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_ops_task";`);
  }
}
