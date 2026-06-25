import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `creation_legacy_map` table (world-creation-feed task 1.4).
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design}.md (§Migration Strategy 阶段 2)
 *
 * Maps legacy ids ↔ unified Creation ids for the deep-merge migration:
 * - aeon_plot  (原 A,真实地理 geo 维度) ↔ creation
 * - world_plot (原 B,world_plots/ecs 内容维度) ↔ creation
 *
 * This is the seam used by dual-write (req 12.1) and idempotent backfill (req 12.2):
 * - UNIQUE(source_type, legacy_id): a legacy object maps to at most one Creation
 *   (idempotent-backfill cornerstone — re-running backfill cannot duplicate rows).
 * - UNIQUE(creation_id, source_type): a Creation has at most one legacy source per
 *   dimension (geo / content), reflecting "one object, two dimensions" (req 12.6).
 * - INDEX(creation_id): reverse lookup (creation → legacy refs) for reconciliation.
 *
 * Follows the conventions of 1803000000000-CreateCreationRegistryTables.ts:
 * DO $$ guards on enum creation, CREATE TABLE/INDEX IF NOT EXISTS, gen_random_uuid,
 * timestamptz. Column names auto-derived to snake_case by the global SnakeNamingStrategy.
 */
export class CreateCreationLegacyMapTable1804000000000 implements MigrationInterface {
  name = 'CreateCreationLegacyMapTable1804000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── Enum type ─────────────────────────────────────────────────────

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "creation_legacy_map_source_type_enum" AS ENUM ('world_plot', 'aeon_plot');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    // ─── creation_legacy_map ───────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "creation_legacy_map" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "source_type" "creation_legacy_map_source_type_enum" NOT NULL,
        "legacy_id" varchar(64) NOT NULL,
        "creation_id" uuid NOT NULL,
        "backfilled_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_creation_legacy_map" PRIMARY KEY ("id"),
        CONSTRAINT "fk_creation_legacy_map_creation" FOREIGN KEY ("creation_id")
          REFERENCES "creations" ("id") ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_creation_legacy_map_creation_id" ON "creation_legacy_map" ("creation_id");`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_creation_legacy_map_source_type_legacy_id" ON "creation_legacy_map" ("source_type", "legacy_id");`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_creation_legacy_map_creation_id_source_type" ON "creation_legacy_map" ("creation_id", "source_type");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_creation_legacy_map_creation_id_source_type";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_creation_legacy_map_source_type_legacy_id";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_creation_legacy_map_creation_id";`);

    await queryRunner.query(`DROP TABLE IF EXISTS "creation_legacy_map";`);

    await queryRunner.query(`DROP TYPE IF EXISTS "creation_legacy_map_source_type_enum";`);
  }
}
