import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * World Engagement (2026-06) — 游戏周榜(分数权威)+ 事件预测市场(parimutuel,AXP)。
 *   - game_scores:每局分数提交;周榜取每用户每周最高分。
 *   - prediction_markets / prediction_stakes:事件预测彩池 + 下注。
 * 全部 IF NOT EXISTS 幂等;列名 snake_case(SnakeNamingStrategy 同源)。
 * 末尾种入一个"世界杯"演示市场(固定 id,ON CONFLICT DO NOTHING)。
 */
export class CreateWorldEngagement1813000000000 implements MigrationInterface {
  name = 'CreateWorldEngagement1813000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "game_scores" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "creation_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "score" integer NOT NULL,
        "week_key" varchar(12) NOT NULL,
        "state_snapshot" jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_game_scores" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_game_scores_board" ON "game_scores" ("creation_id","week_key","score");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_game_scores_user" ON "game_scores" ("creation_id","user_id");`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "prediction_markets" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "title" varchar(200) NOT NULL,
        "category" varchar(40) NOT NULL DEFAULT 'custom',
        "subtitle" varchar(400),
        "options" jsonb NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'open',
        "winning_option_id" varchar(64),
        "pool_by_option" jsonb NOT NULL DEFAULT '{}',
        "total_pool" integer NOT NULL DEFAULT 0,
        "rake_bps" integer NOT NULL DEFAULT 500,
        "locks_at" TIMESTAMP WITH TIME ZONE,
        "created_by" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "settled_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "pk_prediction_markets" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_prediction_markets_status" ON "prediction_markets" ("status");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_prediction_markets_category" ON "prediction_markets" ("category");`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "prediction_stakes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "market_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "option_id" varchar(64) NOT NULL,
        "amount" integer NOT NULL,
        "payout" integer,
        "refunded" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_prediction_stakes" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_prediction_stakes_market" ON "prediction_stakes" ("market_id");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_prediction_stakes_user" ON "prediction_stakes" ("user_id");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_prediction_stakes_market_user" ON "prediction_stakes" ("market_id","user_id");`);

    // ── 种子:世界杯演示市场(固定 id 幂等) ──
    await queryRunner.query(`
      INSERT INTO "prediction_markets" ("id","title","category","subtitle","options","status","rake_bps")
      VALUES (
        'b1000001-0000-4000-a000-000000000001',
        '世界杯决赛:谁能夺冠?',
        'worldcup',
        '示例预测 · 用 AXP 押注你看好的球队 · 命中按彩池比例瓜分',
        '[{"id":"bra","label":"巴西"},{"id":"arg","label":"阿根廷"},{"id":"fra","label":"法国"},{"id":"other","label":"其他球队"}]'::jsonb,
        'open',
        500
      ) ON CONFLICT ("id") DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "prediction_stakes";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "prediction_markets";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "game_scores";`);
  }
}
