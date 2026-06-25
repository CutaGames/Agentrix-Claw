import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 杠杆滚球预测市场（LSM）建表（spec: agentrix-leverage-sports-market）。
 *
 * 9 张表：盘口/赔率快照/订单/订单腿/金库/金库持仓/金库事件/承接订阅/盘口承接绑定。
 * 资金口径全程整数 AXP（numeric(38,0)）。列名由全局 SnakeNamingStrategy 自动派生，
 * 实体 props 用 camelCase 1:1 映射（如 `externalMarketId` → `external_market_id`）。
 * 枚举列以 varchar 落库（值与实体枚举字符串一致），避免 PG enum 类型迁移负担。
 *
 * Additive & idempotent（CREATE TABLE/INDEX IF NOT EXISTS）。生产 synchronize=off，
 * 本迁移为表结构权威来源。
 */
export class CreateLsmTables1819000000000 implements MigrationInterface {
  name = 'CreateLsmTables1819000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── lsm_markets ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "lsm_markets" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "external_market_id" varchar(128) NOT NULL,
        "event_id" varchar(128),
        "sport" varchar(64) NOT NULL DEFAULT 'soccer',
        "league" varchar(128),
        "home_team" varchar(128) NOT NULL,
        "away_team" varchar(128) NOT NULL,
        "outcome_count" integer NOT NULL DEFAULT 2,
        "status" varchar(16) NOT NULL DEFAULT 'pre',
        "kickoff_at" timestamptz,
        "last_odds_at" timestamptz,
        "winning_outcome_idx" integer,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_lsm_markets" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_lsm_markets_external" ON "lsm_markets" ("external_market_id");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_lsm_markets_event" ON "lsm_markets" ("event_id");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_lsm_markets_league" ON "lsm_markets" ("league");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_lsm_markets_status_kickoff" ON "lsm_markets" ("status", "kickoff_at");`,
    );

    // ── lsm_odds_snapshots ──────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "lsm_odds_snapshots" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "market_id" varchar NOT NULL,
        "outcome_idx" integer NOT NULL,
        "fair_odds" numeric(12,4) NOT NULL,
        "source" varchar(64),
        "ts" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_lsm_odds_snapshots" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_lsm_odds_market_outcome_ts" ON "lsm_odds_snapshots" ("market_id", "outcome_idx", "ts");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_lsm_odds_market" ON "lsm_odds_snapshots" ("market_id");`,
    );

    // ── lsm_orders ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "lsm_orders" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" varchar NOT NULL,
        "market_id" varchar NOT NULL,
        "outcome_idx" integer NOT NULL,
        "stake" numeric(38,0) NOT NULL,
        "leverage" integer NOT NULL DEFAULT 1,
        "entry_odds" numeric(12,4) NOT NULL,
        "notional" numeric(38,0) NOT NULL,
        "max_profit" numeric(38,0) NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'open',
        "payout" numeric(38,0) NOT NULL DEFAULT 0,
        "close_pnl" numeric(38,0) NOT NULL DEFAULT 0,
        "idem_key" varchar(128) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "settled_at" timestamptz,
        CONSTRAINT "pk_lsm_orders" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_lsm_orders_idem" ON "lsm_orders" ("idem_key");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_lsm_orders_user_created" ON "lsm_orders" ("user_id", "created_at");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_lsm_orders_market_status" ON "lsm_orders" ("market_id", "status");`,
    );

    // ── lsm_order_legs ──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "lsm_order_legs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "order_id" uuid NOT NULL,
        "vault_id" uuid NOT NULL,
        "alloc_bps" integer NOT NULL,
        "stake_share" numeric(38,0) NOT NULL,
        "reserve_share" numeric(38,0) NOT NULL,
        "pnl_share" numeric(38,0) NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_lsm_order_legs" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_lsm_order_legs_order" ON "lsm_order_legs" ("order_id");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_lsm_order_legs_vault" ON "lsm_order_legs" ("vault_id");`,
    );

    // ── lsm_vault ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "lsm_vault" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "kind" varchar(16) NOT NULL DEFAULT 'user',
        "singleton_key" varchar(32),
        "name" varchar(128),
        "leader_user_id" uuid,
        "status" varchar(16) NOT NULL DEFAULT 'active',
        "min_leader_share_bps" integer NOT NULL DEFAULT 500,
        "profit_share_bps" integer NOT NULL DEFAULT 0,
        "deposit_lock_secs" integer NOT NULL DEFAULT 86400,
        "high_water_nav" numeric(38,0) NOT NULL DEFAULT 0,
        "asset_unit" varchar(10) NOT NULL DEFAULT 'AXP',
        "bankroll" numeric(38,0) NOT NULL DEFAULT 0,
        "reserved" numeric(38,0) NOT NULL DEFAULT 0,
        "total_shares" numeric(38,0) NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_lsm_vault" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_lsm_vault_singleton" ON "lsm_vault" ("singleton_key");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_lsm_vault_kind_status" ON "lsm_vault" ("kind", "status");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_lsm_vault_leader" ON "lsm_vault" ("leader_user_id");`,
    );

    // ── lsm_vault_positions ─────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "lsm_vault_positions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "vault_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "shares" numeric(38,0) NOT NULL DEFAULT 0,
        "cost_basis" numeric(38,0) NOT NULL DEFAULT 0,
        "locked_until" timestamptz,
        "is_leader" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_lsm_vault_positions" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_lsm_vault_positions_vault_user" ON "lsm_vault_positions" ("vault_id", "user_id");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_lsm_vault_positions_user" ON "lsm_vault_positions" ("user_id");`,
    );

    // ── lsm_vault_events ────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "lsm_vault_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "vault_id" uuid NOT NULL,
        "type" varchar(16) NOT NULL,
        "user_id" uuid,
        "amount" numeric(38,0) NOT NULL DEFAULT 0,
        "shares_delta" numeric(38,0) NOT NULL DEFAULT 0,
        "nav_at" numeric(38,0) NOT NULL DEFAULT 0,
        "idem_key" varchar(160) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_lsm_vault_events" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_lsm_vault_events_idem" ON "lsm_vault_events" ("idem_key");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_lsm_vault_events_vault_created" ON "lsm_vault_events" ("vault_id", "created_at");`,
    );

    // ── lsm_vault_subscriptions ─────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "lsm_vault_subscriptions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "vault_id" uuid NOT NULL,
        "scope_type" varchar(16) NOT NULL,
        "scope_value" varchar(128) NOT NULL,
        "capacity" numeric(38,0) NOT NULL DEFAULT 0,
        "fee_bid_bps" integer NOT NULL DEFAULT 0,
        "enabled" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_lsm_vault_subscriptions" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_lsm_vault_subs_scope" ON "lsm_vault_subscriptions" ("scope_type", "scope_value", "enabled");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_lsm_vault_subs_vault" ON "lsm_vault_subscriptions" ("vault_id");`,
    );

    // ── lsm_market_house ────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "lsm_market_house" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "market_id" uuid NOT NULL,
        "vault_id" uuid NOT NULL,
        "alloc_bps" integer NOT NULL,
        "assigned_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_lsm_market_house" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_lsm_market_house_market" ON "lsm_market_house" ("market_id");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_lsm_market_house_vault" ON "lsm_market_house" ("vault_id");`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "lsm_market_house";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "lsm_vault_subscriptions";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "lsm_vault_events";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "lsm_vault_positions";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "lsm_vault";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "lsm_order_legs";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "lsm_orders";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "lsm_odds_snapshots";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "lsm_markets";`);
  }
}
