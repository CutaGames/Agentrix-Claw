import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Prediction Market (BTC 5min up/down) MVP schema.
 *
 * Tables:
 *   - prediction_rounds         （轮次：开/锁/结/废）
 *   - prediction_bets           （下注记录）
 *   - prediction_user_balances  （虚拟 USDC 余额）
 *
 * 全部使用 snake_case 列名以匹配 TypeORM SnakeNamingStrategy。
 */
export class CreatePredictionMarket1782100000000 implements MigrationInterface {
  name = 'CreatePredictionMarket1782100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── enums ───────────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "prediction_rounds_asset_enum" AS ENUM ('BTC','ETH','SOL');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "prediction_rounds_status_enum" AS ENUM ('open','locked','settled','voided');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "prediction_rounds_outcome_enum" AS ENUM ('up','down','tie','unknown');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "prediction_bets_side_enum" AS ENUM ('up','down');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "prediction_bets_status_enum" AS ENUM ('placed','won','lost','refunded');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "prediction_bets_outcome_enum" AS ENUM ('up','down','tie','unknown');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // ─── prediction_rounds ───────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "prediction_rounds" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "asset" "prediction_rounds_asset_enum" NOT NULL DEFAULT 'BTC',
        "interval_seconds" INTEGER NOT NULL DEFAULT 300,
        "status" "prediction_rounds_status_enum" NOT NULL DEFAULT 'open',
        "open_time" TIMESTAMPTZ NOT NULL,
        "lock_time" TIMESTAMPTZ NOT NULL,
        "expiry_time" TIMESTAMPTZ NOT NULL,
        "lock_price" NUMERIC(20,8),
        "close_price" NUMERIC(20,8),
        "outcome" "prediction_rounds_outcome_enum" NOT NULL DEFAULT 'unknown',
        "total_pool" NUMERIC(18,4) NOT NULL DEFAULT 0,
        "up_pool" NUMERIC(18,4) NOT NULL DEFAULT 0,
        "down_pool" NUMERIC(18,4) NOT NULL DEFAULT 0,
        "up_count" INTEGER NOT NULL DEFAULT 0,
        "down_count" INTEGER NOT NULL DEFAULT 0,
        "fee_rate" NUMERIC(5,4) NOT NULL DEFAULT 0.05,
        "fee_collected" NUMERIC(18,4) NOT NULL DEFAULT 0,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_prediction_rounds_asset_status"
        ON "prediction_rounds" ("asset", "status");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_prediction_rounds_lock_time"
        ON "prediction_rounds" ("lock_time");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_prediction_rounds_expiry_time"
        ON "prediction_rounds" ("expiry_time");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_prediction_rounds_status"
        ON "prediction_rounds" ("status");
    `);

    // ─── prediction_bets ─────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "prediction_bets" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL,
        "round_id" UUID NOT NULL REFERENCES "prediction_rounds"("id") ON DELETE CASCADE,
        "side" "prediction_bets_side_enum" NOT NULL,
        "amount" NUMERIC(18,4) NOT NULL,
        "status" "prediction_bets_status_enum" NOT NULL DEFAULT 'placed',
        "payout" NUMERIC(18,4) NOT NULL DEFAULT 0,
        "outcome" "prediction_bets_outcome_enum" NOT NULL DEFAULT 'unknown',
        "mode" VARCHAR(10) NOT NULL DEFAULT 'demo',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "settled_at" TIMESTAMPTZ
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_prediction_bets_user_created"
        ON "prediction_bets" ("user_id", "created_at" DESC);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_prediction_bets_round"
        ON "prediction_bets" ("round_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_prediction_bets_status"
        ON "prediction_bets" ("status");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_prediction_bets_user"
        ON "prediction_bets" ("user_id");
    `);

    // ─── prediction_user_balances ────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "prediction_user_balances" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL,
        "balance" NUMERIC(18,4) NOT NULL DEFAULT 1000,
        "total_wagered" NUMERIC(18,4) NOT NULL DEFAULT 0,
        "total_payout" NUMERIC(18,4) NOT NULL DEFAULT 0,
        "net_pnl" NUMERIC(18,4) NOT NULL DEFAULT 0,
        "total_bets" INTEGER NOT NULL DEFAULT 0,
        "wins_count" INTEGER NOT NULL DEFAULT 0,
        "losses_count" INTEGER NOT NULL DEFAULT 0,
        "current_streak" INTEGER NOT NULL DEFAULT 0,
        "best_streak" INTEGER NOT NULL DEFAULT 0,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_prediction_user_balances_user_unique"
        ON "prediction_user_balances" ("user_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "prediction_bets"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "prediction_user_balances"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "prediction_rounds"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "prediction_bets_outcome_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "prediction_bets_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "prediction_bets_side_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "prediction_rounds_outcome_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "prediction_rounds_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "prediction_rounds_asset_enum"`);
  }
}
