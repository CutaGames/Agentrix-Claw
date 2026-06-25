import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Remix lineage (2026-06, P0-③) — creations 增加血缘列。
 * parent_creation_id / root_creation_id;衍生作品成交时按血缘给上游分润。
 * 全部 additive + nullable,存量行不受影响。
 */
export class AddCreationLineage1815000000000 implements MigrationInterface {
  name = 'AddCreationLineage1815000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "creations" ADD COLUMN IF NOT EXISTS "parent_creation_id" uuid;`);
    await queryRunner.query(`ALTER TABLE "creations" ADD COLUMN IF NOT EXISTS "root_creation_id" uuid;`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_creations_parent" ON "creations" ("parent_creation_id");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_creations_parent";`);
    await queryRunner.query(`ALTER TABLE "creations" DROP COLUMN IF EXISTS "root_creation_id";`);
    await queryRunner.query(`ALTER TABLE "creations" DROP COLUMN IF EXISTS "parent_creation_id";`);
  }
}
