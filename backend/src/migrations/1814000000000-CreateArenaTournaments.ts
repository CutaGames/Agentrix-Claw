import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Arena Tournaments (2026-06) — 技能对赛奖池(P0-②)。
 * arena_tournaments / arena_entries;报名费进池,结算按窗口内最高分瓜分。IF NOT EXISTS 幂等。
 */
export class CreateArenaTournaments1814000000000 implements MigrationInterface {
  name = 'CreateArenaTournaments1814000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "arena_tournaments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "creation_id" uuid NOT NULL,
        "title" varchar(160) NOT NULL,
        "entry_fee_axp" integer NOT NULL,
        "rake_bps" integer NOT NULL DEFAULT 1000,
        "payout_splits" jsonb NOT NULL DEFAULT '[0.5,0.3,0.2]',
        "status" varchar(16) NOT NULL DEFAULT 'open',
        "prize_pool" integer NOT NULL DEFAULT 0,
        "starts_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "ends_at" TIMESTAMP WITH TIME ZONE,
        "created_by" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "settled_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "pk_arena_tournaments" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_arena_tournaments_creation" ON "arena_tournaments" ("creation_id");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_arena_tournaments_status" ON "arena_tournaments" ("status");`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "arena_entries" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tournament_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "paid" integer NOT NULL,
        "best_score" integer,
        "payout" integer,
        "refunded" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_arena_entries" PRIMARY KEY ("id"),
        CONSTRAINT "uq_arena_entry_user" UNIQUE ("tournament_id","user_id")
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_arena_entries_tournament" ON "arena_entries" ("tournament_id");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_arena_entries_user" ON "arena_entries" ("user_id");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "arena_entries";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "arena_tournaments";`);
  }
}
