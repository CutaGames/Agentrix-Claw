import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateA2AMatchingTables1782550000000 implements MigrationInterface {
  name = 'CreateA2AMatchingTables1782550000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "a2a_match_tasks" (
        "id" varchar(64) NOT NULL,
        "owner_user_id" uuid NOT NULL,
        "owner_agent_id" varchar(100),
        "title" varchar(160) NOT NULL,
        "description" text NOT NULL,
        "budget_cents" integer NOT NULL,
        "skill_tags" jsonb NOT NULL,
        "status" varchar(20) NOT NULL,
        "matched_bid_id" varchar(64),
        "created_at_ms" bigint NOT NULL,
        "updated_at_ms" bigint NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_a2a_match_tasks_id" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_a2a_match_tasks_owner_status"
      ON "a2a_match_tasks" ("owner_user_id", "status");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_a2a_match_tasks_status_created"
      ON "a2a_match_tasks" ("status", "created_at_ms");
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "a2a_match_bids" (
        "id" varchar(64) NOT NULL,
        "task_id" varchar(64) NOT NULL,
        "bidder_user_id" uuid NOT NULL,
        "bidder_agent_id" varchar(100),
        "price_cents" integer NOT NULL,
        "eta_minutes" integer NOT NULL,
        "note" text,
        "status" varchar(16) NOT NULL,
        "created_at_ms" bigint NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_a2a_match_bids_id" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_a2a_match_bids_task_status"
      ON "a2a_match_bids" ("task_id", "status");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_a2a_match_bids_bidder_created"
      ON "a2a_match_bids" ("bidder_user_id", "created_at_ms");
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "a2a_match_trades" (
        "id" varchar(64) NOT NULL,
        "task_id" varchar(64) NOT NULL,
        "bid_id" varchar(64) NOT NULL,
        "buyer_user_id" uuid NOT NULL,
        "seller_user_id" uuid NOT NULL,
        "amount_cents" integer NOT NULL,
        "status" varchar(16) NOT NULL,
        "created_at_ms" bigint NOT NULL,
        "settled_at_ms" bigint,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_a2a_match_trades_id" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_a2a_match_trades_buyer_created"
      ON "a2a_match_trades" ("buyer_user_id", "created_at_ms");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_a2a_match_trades_seller_created"
      ON "a2a_match_trades" ("seller_user_id", "created_at_ms");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "a2a_match_trades";');
    await queryRunner.query('DROP TABLE IF EXISTS "a2a_match_bids";');
    await queryRunner.query('DROP TABLE IF EXISTS "a2a_match_tasks";');
  }
}
