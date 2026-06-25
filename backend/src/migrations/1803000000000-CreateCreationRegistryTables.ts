import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the unified Creation registry (world-creation-feed) tables.
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design}.md (§Data Models)
 *
 * Tables:
 * - creations: single source of truth (deep-merge of Aeon geo + v6 ECS content).
 *     NOTE: task 1.1 shipped the `CreationEntity`/repository/module CODE but
 *     deferred the DDL to this migration (task 1.3). Created here with
 *     IF NOT EXISTS so it stays idempotent and order-safe.
 * - creation_offerings: normalized cache of derived Offerings (req 1.10).
 * - creation_previews: lightweight feed preview media (req 3.2 / 5.2).
 * - creation_capability_manifests: derived MCP-tool manifest cache, versioned
 *     per Property 5 (req 1.5 / 1.11).
 * - agent_invocations: per-call audit + preset-budget settlement
 *     (who / on-behalf-of / creation / verb / amount / result — req 13.5).
 *
 * Column names are auto-derived to snake_case by the global SnakeNamingStrategy.
 */
export class CreateCreationRegistryTables1803000000000 implements MigrationInterface {
  name = 'CreateCreationRegistryTables1803000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── Enum types ────────────────────────────────────────────────────

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "creations_type_enum" AS ENUM ('game', 'shop', 'livestream', 'stage', 'place');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "creations_status_enum" AS ENUM ('draft', 'under_review', 'published', 'listed', 'unpublished', 'suspended');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "creations_substrate_tier_enum" AS ENUM ('A', 'B', 'C');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "creation_offerings_kind_enum" AS ENUM ('product', 'service', 'ticket', 'subscription', 'tip');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "creation_previews_kind_enum" AS ENUM ('cover', 'video', 'replay', 'first_frame');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_invocations_verb_enum" AS ENUM ('query', 'order', 'book', 'message', 'subscribe', 'donate');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_invocations_outcome_enum" AS ENUM ('ok', 'rejected');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    // ─── creations (base, single source of truth) ─────────────────────

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "creations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "owner_account_id" uuid NOT NULL,
        "original_creator_account_id" uuid NOT NULL,
        "type" "creations_type_enum" NOT NULL,
        "status" "creations_status_enum" NOT NULL DEFAULT 'draft',
        "title" varchar(120) NOT NULL,
        "summary" varchar(512),
        "substrate_tier" "creations_substrate_tier_enum" NOT NULL DEFAULT 'A',
        "ecs_version_id" uuid,
        "bound_agent_id" uuid,
        "geo" jsonb,
        "geo_grid_cell" varchar(32),
        "poi" jsonb,
        "preview" jsonb,
        "offerings" jsonb NOT NULL DEFAULT '[]',
        "manifest_version" integer NOT NULL DEFAULT 0,
        "share_code" varchar(12),
        "metrics" jsonb NOT NULL DEFAULT '{"views":0,"likes":0,"sales":0,"comments":0}',
        "version" integer NOT NULL DEFAULT 1,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_creations" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_creations_owner_account_id" ON "creations" ("owner_account_id");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_creations_original_creator_account_id" ON "creations" ("original_creator_account_id");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_creations_status" ON "creations" ("status");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_creations_type" ON "creations" ("type");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_creations_geo_grid_cell" ON "creations" ("geo_grid_cell");`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_creations_share_code" ON "creations" ("share_code") WHERE "share_code" IS NOT NULL;`);

    // ─── creation_offerings ───────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "creation_offerings" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "creation_id" uuid NOT NULL,
        "offering_id" varchar(64) NOT NULL,
        "kind" "creation_offerings_kind_enum" NOT NULL,
        "name" varchar(200) NOT NULL,
        "description" text,
        "price" jsonb,
        "verbs" jsonb NOT NULL DEFAULT '[]',
        "availability" jsonb,
        "derived_from_entity_id" varchar(64),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_creation_offerings" PRIMARY KEY ("id"),
        CONSTRAINT "fk_creation_offerings_creation" FOREIGN KEY ("creation_id")
          REFERENCES "creations" ("id") ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_creation_offerings_creation_id" ON "creation_offerings" ("creation_id");`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_creation_offerings_creation_id_offering_id" ON "creation_offerings" ("creation_id", "offering_id");`);

    // ─── creation_previews ────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "creation_previews" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "creation_id" uuid NOT NULL,
        "kind" "creation_previews_kind_enum" NOT NULL,
        "url" varchar(1024) NOT NULL,
        "thumbnail_url" varchar(1024),
        "width" integer,
        "height" integer,
        "duration_ms" integer,
        "is_primary" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_creation_previews" PRIMARY KEY ("id"),
        CONSTRAINT "fk_creation_previews_creation" FOREIGN KEY ("creation_id")
          REFERENCES "creations" ("id") ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_creation_previews_creation_id" ON "creation_previews" ("creation_id");`);

    // ─── creation_capability_manifests (derived cache, versioned) ─────

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "creation_capability_manifests" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "creation_id" uuid NOT NULL,
        "version" integer NOT NULL,
        "ecs_version_id" uuid,
        "tools" jsonb NOT NULL DEFAULT '[]',
        "custom_tools" jsonb,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_creation_capability_manifests" PRIMARY KEY ("id"),
        CONSTRAINT "fk_creation_capability_manifests_creation" FOREIGN KEY ("creation_id")
          REFERENCES "creations" ("id") ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_creation_capability_manifests_creation_id" ON "creation_capability_manifests" ("creation_id");`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_creation_capability_manifests_creation_id_version" ON "creation_capability_manifests" ("creation_id", "version");`);

    // ─── agent_invocations (audit + budget settlement) ───────────────

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_invocations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "agent_id" uuid NOT NULL,
        "on_behalf_of_account_id" uuid NOT NULL,
        "creation_id" uuid NOT NULL,
        "verb" "agent_invocations_verb_enum" NOT NULL,
        "tool_name" varchar(128) NOT NULL,
        "offering_id" varchar(64),
        "args" jsonb,
        "outcome" "agent_invocations_outcome_enum" NOT NULL,
        "authoritative_amount" numeric(18,6),
        "platform_cut" numeric(18,6),
        "currency" varchar(16),
        "result" jsonb,
        "error_code" varchar(32),
        "error_detail" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_agent_invocations" PRIMARY KEY ("id"),
        CONSTRAINT "fk_agent_invocations_creation" FOREIGN KEY ("creation_id")
          REFERENCES "creations" ("id") ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agent_invocations_creation_id" ON "agent_invocations" ("creation_id");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agent_invocations_agent_id" ON "agent_invocations" ("agent_id");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agent_invocations_on_behalf_of_account_id" ON "agent_invocations" ("on_behalf_of_account_id");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agent_invocations_created_at" ON "agent_invocations" ("created_at");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes (derived tables first)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_agent_invocations_created_at";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_agent_invocations_on_behalf_of_account_id";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_agent_invocations_agent_id";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_agent_invocations_creation_id";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_creation_capability_manifests_creation_id_version";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_creation_capability_manifests_creation_id";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_creation_previews_creation_id";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_creation_offerings_creation_id_offering_id";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_creation_offerings_creation_id";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_creations_share_code";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_creations_geo_grid_cell";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_creations_type";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_creations_status";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_creations_original_creator_account_id";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_creations_owner_account_id";`);

    // Drop tables (derived first, base last)
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_invocations";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "creation_capability_manifests";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "creation_previews";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "creation_offerings";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "creations";`);

    // Drop enum types
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_invocations_outcome_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_invocations_verb_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "creation_previews_kind_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "creation_offerings_kind_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "creations_substrate_tier_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "creations_status_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "creations_type_enum";`);
  }
}
