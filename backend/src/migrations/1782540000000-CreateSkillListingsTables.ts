import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSkillListingsTables1782540000000 implements MigrationInterface {
  name = 'CreateSkillListingsTables1782540000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "skill_listings" (
        "id" varchar(64) NOT NULL,
        "developer_user_id" uuid NOT NULL,
        "name" varchar(120) NOT NULL,
        "slug" varchar(120) NOT NULL,
        "description" text NOT NULL,
        "price_cents" integer NOT NULL,
        "revenue_split_bps" integer NOT NULL,
        "category" varchar(24) NOT NULL,
        "status" varchar(20) NOT NULL,
        "install_count" integer NOT NULL DEFAULT 0,
        "invoke_count" integer NOT NULL DEFAULT 0,
        "total_revenue_cents" integer NOT NULL DEFAULT 0,
        "developer_revenue_cents" integer NOT NULL DEFAULT 0,
        "platform_revenue_cents" integer NOT NULL DEFAULT 0,
        "created_at_ms" bigint NOT NULL,
        "updated_at_ms" bigint NOT NULL,
        "reviewed_at_ms" bigint,
        "reviewer_note" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_skill_listings_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_skill_listings_slug" UNIQUE ("slug")
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_skill_listings_developer_status"
      ON "skill_listings" ("developer_user_id", "status");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_skill_listings_status_category"
      ON "skill_listings" ("status", "category");
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "skill_invokes" (
        "id" varchar(64) NOT NULL,
        "skill_id" varchar(64) NOT NULL,
        "invoker_user_id" uuid NOT NULL,
        "amount_cents" integer NOT NULL,
        "developer_share_cents" integer NOT NULL,
        "platform_share_cents" integer NOT NULL,
        "ts_ms" bigint NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_skill_invokes_id" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_skill_invokes_skill_ts"
      ON "skill_invokes" ("skill_id", "ts_ms");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_skill_invokes_invoker_ts"
      ON "skill_invokes" ("invoker_user_id", "ts_ms");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "skill_invokes";');
    await queryRunner.query('DROP TABLE IF EXISTS "skill_listings";');
  }
}
