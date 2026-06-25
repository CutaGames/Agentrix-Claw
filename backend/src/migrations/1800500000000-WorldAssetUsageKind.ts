import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * world_assets.usage_kind(#2 共建素材):标记资产用途。
 *   character(默认)/ build_material / decor。
 * 让用户拍照生成的资产能被标为"建材",在永曜城建造里摆放。
 */
export class WorldAssetUsageKind_1800500000000 implements MigrationInterface {
  name = 'WorldAssetUsageKind_1800500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasCol = await queryRunner.hasColumn('world_assets', 'usage_kind');
    if (!hasCol) {
      await queryRunner.query(
        `ALTER TABLE "world_assets" ADD COLUMN "usage_kind" varchar(20) NOT NULL DEFAULT 'character'`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_world_assets_usage_kind" ON "world_assets" ("usage_kind")`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_world_assets_usage_kind"`);
    const hasCol = await queryRunner.hasColumn('world_assets', 'usage_kind');
    if (hasCol) {
      await queryRunner.query(`ALTER TABLE "world_assets" DROP COLUMN "usage_kind"`);
    }
  }
}
