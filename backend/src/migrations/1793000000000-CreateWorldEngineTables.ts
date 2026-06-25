import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates all World Engine tables for the Reality → AI World Engine feature:
 * - world_assets: Core game asset entity with stats, skills, behavior tree
 * - battles: Turn-based combat records between WorldAssets
 * - dungeons: AI-generated dungeon maps from room scans
 * - scan_sessions: Scan session metadata and quality tracking
 * - world_asset_moderation_decisions: Content moderation audit trail (12-month retention)
 */
export class CreateWorldEngineTables1793000000000 implements MigrationInterface {
  name = 'CreateWorldEngineTables1793000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── Enum types ────────────────────────────────────────────────────

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "world_asset_category_enum" AS ENUM ('character', 'dungeon', 'weapon');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "world_asset_scan_mode_enum" AS ENUM ('quick', 'detail');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "world_asset_source_enum" AS ENUM ('scanned', 'purchased', 'gifted');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "battle_status_enum" AS ENUM ('pending', 'active', 'completed', 'cancelled', 'expired');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "scan_session_mode_enum" AS ENUM ('quick', 'detail', 'room');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "scan_session_status_enum" AS ENUM ('capturing', 'submitted', 'processing', 'completed', 'failed');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "scan_session_pipeline_enum" AS ENUM ('fast', 'precision');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "moderation_stage_enum" AS ENUM ('pre_upload_face', 'pre_upload_copyright', 'post_gen_words', 'pre_listing', 'post_publish_report');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "moderation_decision_enum" AS ENUM ('approved', 'rejected', 'pending');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    // ─── world_assets ──────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "world_assets" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "owner_id" varchar NOT NULL,
        "original_creator_id" varchar NOT NULL,
        "name" varchar(30) NOT NULL,
        "category" "world_asset_category_enum" NOT NULL,
        "scan_mode" "world_asset_scan_mode_enum" NOT NULL,
        "mesh_url" varchar NOT NULL,
        "styled_mesh_url" varchar NOT NULL,
        "style_type" varchar(20) NOT NULL,
        "semantic_description" jsonb NOT NULL,
        "stats" jsonb NOT NULL,
        "skills" jsonb NOT NULL,
        "personality_traits" jsonb NOT NULL,
        "backstory" text,
        "behavior_tree" jsonb NOT NULL,
        "level" integer NOT NULL DEFAULT 1,
        "xp" integer NOT NULL DEFAULT 0,
        "unlocked_skill_slots" integer NOT NULL DEFAULT 0,
        "battle_wins" integer NOT NULL DEFAULT 0,
        "battle_losses" integer NOT NULL DEFAULT 0,
        "bound_agent_id" varchar,
        "source" "world_asset_source_enum" NOT NULL,
        "source_images_metadata" jsonb,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_world_assets" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_world_assets_owner_id"
        ON "world_assets" ("owner_id");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_world_assets_bound_agent_id"
        ON "world_assets" ("bound_agent_id");
    `);

    // ─── battles ───────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "battles" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "challenger_asset_id" varchar NOT NULL,
        "defender_asset_id" varchar NOT NULL,
        "challenger_user_id" varchar NOT NULL,
        "defender_user_id" varchar NOT NULL,
        "status" "battle_status_enum" NOT NULL,
        "random_seed" bigint NOT NULL,
        "rounds" jsonb,
        "winner_asset_id" varchar,
        "total_rounds" integer NOT NULL DEFAULT 0,
        "replay_video_url" varchar,
        "xp_awarded" jsonb,
        "expires_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_battles" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_battles_challenger_user_id"
        ON "battles" ("challenger_user_id");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_battles_defender_user_id"
        ON "battles" ("defender_user_id");
    `);

    // ─── dungeons ──────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "dungeons" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "creator_id" varchar NOT NULL,
        "world_asset_id" varchar NOT NULL,
        "share_code" varchar(12) NOT NULL,
        "layout" jsonb NOT NULL,
        "enemies" jsonb NOT NULL,
        "loot_items" jsonb NOT NULL,
        "boss" jsonb NOT NULL,
        "theme" varchar(20) NOT NULL,
        "room_area_sqm" float NOT NULL,
        "coverage_degrees" float NOT NULL,
        "difficulty_rating" integer NOT NULL DEFAULT 1,
        "expires_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_dungeons" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_dungeons_share_code"
        ON "dungeons" ("share_code");
    `);

    // ─── scan_sessions ─────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "scan_sessions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" varchar NOT NULL,
        "scan_mode" "scan_session_mode_enum" NOT NULL,
        "image_count" integer NOT NULL DEFAULT 0,
        "quality_scores" jsonb NOT NULL,
        "overall_prediction_score" float,
        "status" "scan_session_status_enum" NOT NULL,
        "result_asset_id" varchar,
        "pipeline_used" "scan_session_pipeline_enum" NOT NULL,
        "error_message" varchar,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_scan_sessions" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_scan_sessions_user_id"
        ON "scan_sessions" ("user_id");
    `);

    // ─── world_asset_moderation_decisions ──────────────────────────────

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "world_asset_moderation_decisions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "world_asset_id" varchar NOT NULL,
        "stage" "moderation_stage_enum" NOT NULL,
        "decision" "moderation_decision_enum" NOT NULL,
        "reason" varchar,
        "reviewer_id" varchar,
        "automated_score" float,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_world_asset_moderation_decisions" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_moderation_decisions_world_asset_id"
        ON "world_asset_moderation_decisions" ("world_asset_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_moderation_decisions_world_asset_id";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_scan_sessions_user_id";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_dungeons_share_code";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_battles_defender_user_id";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_battles_challenger_user_id";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_world_assets_bound_agent_id";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_world_assets_owner_id";`);

    // Drop tables
    await queryRunner.query(`DROP TABLE IF EXISTS "world_asset_moderation_decisions";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "scan_sessions";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "dungeons";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "battles";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "world_assets";`);

    // Drop enum types
    await queryRunner.query(`DROP TYPE IF EXISTS "moderation_decision_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "moderation_stage_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "scan_session_pipeline_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "scan_session_status_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "scan_session_mode_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "battle_status_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "world_asset_source_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "world_asset_scan_mode_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "world_asset_category_enum";`);
  }
}
