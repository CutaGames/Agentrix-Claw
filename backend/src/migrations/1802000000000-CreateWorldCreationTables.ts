import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates all AI World Creation Platform (v6) tables on top of the shipped v5
 * Reality → AI World Engine. Reuses existing v5 `world_assets` / `battles` /
 * `dungeons` and `agent_cost_records` WITHOUT recreating them.
 *
 * New tables:
 * - world_plots: scarce, ownable map plots (optimistic-lock acquisition/transfer)
 * - ecs_world_versions: ECS_World snapshot anchors
 * - ecs_world_diffs: incremental JSON-Patch diff chain (author-attributed)
 * - creation_tasks: cross-surface creation task queue
 * - plot_listings: Marketplace listings for plots/experiences (optimistic lock)
 * - plot_moderation_decisions: UGC moderation audit trail (cn-region retention)
 * - plot_leaderboards: per-plot seasonal leaderboards
 *
 * Column names are auto-derived to snake_case by the global SnakeNamingStrategy.
 */
export class CreateWorldCreationTables1802000000000 implements MigrationInterface {
  name = 'CreateWorldCreationTables1802000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── Enum types ────────────────────────────────────────────────────

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "world_plot_substrate_tier_enum" AS ENUM ('A', 'B', 'C');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "world_plot_status_enum" AS ENUM ('draft', 'published', 'listed', 'unpublished', 'suspended');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "ecs_world_diff_author_type_enum" AS ENUM ('user', 'agent');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "creation_task_target_enum" AS ENUM ('self', 'desktop', 'agent');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "creation_task_substrate_tier_enum" AS ENUM ('A', 'B', 'C');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "creation_task_status_enum" AS ENUM ('queued', 'running', 'completed', 'failed');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "plot_listing_sale_type_enum" AS ENUM ('first', 'secondary');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "plot_listing_status_enum" AS ENUM ('active', 'sold', 'cancelled', 'pending_review');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "plot_moderation_stage_enum" AS ENUM ('pre_publish', 'cn_region', 'static_code_scan', 'post_publish_report');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "plot_moderation_decision_enum" AS ENUM ('approved', 'rejected', 'pending');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    // ─── world_plots ───────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "world_plots" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "owner_account_id" uuid,
        "substrate_tier" "world_plot_substrate_tier_enum" NOT NULL,
        "ecs_version_id" uuid,
        "map_x" integer NOT NULL,
        "map_y" integer NOT NULL,
        "status" "world_plot_status_enum" NOT NULL DEFAULT 'draft',
        "title" varchar(60),
        "bound_agent_id" uuid,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_world_plots" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_world_plots_owner_account_id"
        ON "world_plots" ("owner_account_id");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_world_plots_status"
        ON "world_plots" ("status");
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_world_plots_map_x_map_y"
        ON "world_plots" ("map_x", "map_y");
    `);

    // ─── ecs_world_versions ────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ecs_world_versions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "plot_id" uuid NOT NULL,
        "snapshot_json" jsonb NOT NULL,
        "ts" bigint NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_ecs_world_versions" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ecs_world_versions_plot_id"
        ON "ecs_world_versions" ("plot_id");
    `);

    // ─── ecs_world_diffs ───────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ecs_world_diffs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "plot_id" uuid NOT NULL,
        "parent_version_id" uuid,
        "author_type" "ecs_world_diff_author_type_enum" NOT NULL,
        "author_id" varchar NOT NULL,
        "ops_json" jsonb NOT NULL,
        "ts" bigint NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_ecs_world_diffs" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ecs_world_diffs_plot_id"
        ON "ecs_world_diffs" ("plot_id");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ecs_world_diffs_parent_version_id"
        ON "ecs_world_diffs" ("parent_version_id");
    `);

    // ─── creation_tasks ────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "creation_tasks" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "plot_id" uuid,
        "target" "creation_task_target_enum" NOT NULL,
        "substrate_tier" "creation_task_substrate_tier_enum",
        "status" "creation_task_status_enum" NOT NULL DEFAULT 'queued',
        "input_json" jsonb NOT NULL,
        "result_ref" varchar,
        "fail_reason" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_creation_tasks" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_creation_tasks_user_id"
        ON "creation_tasks" ("user_id");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_creation_tasks_status"
        ON "creation_tasks" ("status");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_creation_tasks_plot_id"
        ON "creation_tasks" ("plot_id");
    `);

    // ─── plot_listings ─────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "plot_listings" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "plot_id" uuid NOT NULL,
        "seller_account_id" uuid NOT NULL,
        "price_usd" numeric(10,2),
        "price_axp" bigint,
        "sale_type" "plot_listing_sale_type_enum" NOT NULL,
        "status" "plot_listing_status_enum" NOT NULL DEFAULT 'active',
        "version" integer NOT NULL DEFAULT 1,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_plot_listings" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_plot_listings_plot_id"
        ON "plot_listings" ("plot_id");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_plot_listings_seller_account_id"
        ON "plot_listings" ("seller_account_id");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_plot_listings_status"
        ON "plot_listings" ("status");
    `);

    // ─── plot_moderation_decisions ─────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "plot_moderation_decisions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "plot_id" uuid NOT NULL,
        "stage" "plot_moderation_stage_enum" NOT NULL,
        "decision" "plot_moderation_decision_enum" NOT NULL,
        "reason" text,
        "reviewer_id" uuid,
        "ts" bigint NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_plot_moderation_decisions" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_plot_moderation_decisions_plot_id"
        ON "plot_moderation_decisions" ("plot_id");
    `);

    // ─── plot_leaderboards ─────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "plot_leaderboards" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "plot_id" uuid NOT NULL,
        "season" varchar(40) NOT NULL,
        "entries_json" jsonb NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_plot_leaderboards" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_plot_leaderboards_plot_id_season"
        ON "plot_leaderboards" ("plot_id", "season");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_plot_leaderboards_plot_id_season";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_plot_moderation_decisions_plot_id";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_plot_listings_status";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_plot_listings_seller_account_id";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_plot_listings_plot_id";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_creation_tasks_plot_id";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_creation_tasks_status";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_creation_tasks_user_id";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ecs_world_diffs_parent_version_id";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ecs_world_diffs_plot_id";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ecs_world_versions_plot_id";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_world_plots_map_x_map_y";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_world_plots_status";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_world_plots_owner_account_id";`);

    // Drop tables
    await queryRunner.query(`DROP TABLE IF EXISTS "plot_leaderboards";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "plot_moderation_decisions";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "plot_listings";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "creation_tasks";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ecs_world_diffs";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ecs_world_versions";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "world_plots";`);

    // Drop enum types
    await queryRunner.query(`DROP TYPE IF EXISTS "plot_moderation_decision_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "plot_moderation_stage_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "plot_listing_status_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "plot_listing_sale_type_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "creation_task_status_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "creation_task_substrate_tier_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "creation_task_target_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "ecs_world_diff_author_type_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "world_plot_status_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "world_plot_substrate_tier_enum";`);
  }
}
