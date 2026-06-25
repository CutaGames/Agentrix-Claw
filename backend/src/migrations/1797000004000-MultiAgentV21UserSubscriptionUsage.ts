import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Multi-Agent v2.1 — user_subscription_usage table.
 *
 * Per-user, per-month aggregated counter of multi-agent sub-task spend that
 * the WorkerLlmRouter / spawn dispatcher consult to enforce free-tier daily
 * caps and pro-tier monthly inclusions, and that
 * MULTI_AGENT_V2_1_PRODUCT_DECISIONS §3 documents.
 *
 * Schema:
 *   - user_id (uuid)              — owner
 *   - period_year_month (varchar) — `YYYY-MM`
 *   - period_day (date, nullable) — when row is the day bucket; NULL for monthly
 *   - sub_tasks_count (int)       — number of sub-tasks billed
 *   - total_cost_usd (decimal)    — sum of estimatedCostUsd from agent_cost_records
 *   - subscription_tier (varchar) — snapshot at write time
 *   - last_updated_at (timestamptz)
 *
 * Indexes: (user_id, period_year_month) unique for monthly rows; (user_id,
 * period_day) unique for day rows. We use a composite unique index on
 * (user_id, period_year_month, period_day) where NULL day represents monthly.
 *
 * Refresh strategy:
 *   - daily cron at 02:30 UTC+8 aggregates yesterday's `agent_cost_records`
 *     rows whose `event_type='sub_task_complete'` per user → upsert day +
 *     month rows
 *   - WorkerLlmRouter's free-tier enforcement reads the day row at request
 *     time (best-effort; tolerates a stale cron run)
 */
export class MultiAgentV21UserSubscriptionUsage1797000004000
  implements MigrationInterface
{
  name = 'MultiAgentV21UserSubscriptionUsage1797000004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_subscription_usage (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        period_year_month varchar(7) NOT NULL,
        period_day date NULL,
        sub_tasks_count int NOT NULL DEFAULT 0,
        total_cost_usd decimal(18, 6) NOT NULL DEFAULT 0,
        subscription_tier varchar(16) NOT NULL DEFAULT 'free',
        last_updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    // Unique index: one row per (user, year-month, day-or-null).
    // Postgres treats NULL as not equal so we need a partial index pair.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_usu_user_month_day
        ON user_subscription_usage (user_id, period_year_month, period_day)
        WHERE period_day IS NOT NULL;
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_usu_user_month_only
        ON user_subscription_usage (user_id, period_year_month)
        WHERE period_day IS NULL;
    `);

    // Lookup index for free-tier daily cap query
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_usu_user_day
        ON user_subscription_usage (user_id, period_day DESC)
        WHERE period_day IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_usu_user_day`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_usu_user_month_only`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_usu_user_month_day`);
    await queryRunner.query(`DROP TABLE IF EXISTS user_subscription_usage`);
  }
}
