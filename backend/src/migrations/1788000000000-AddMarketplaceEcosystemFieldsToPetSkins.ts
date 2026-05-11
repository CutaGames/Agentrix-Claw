import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marketplace Ecosystem — 为 pet_skins 表新增 clan / like_count / view_count / remix_count / featured 字段
 * 支持 Showcase 页面的族群过滤、统计展示和精选排序。
 *
 * Requirements: 1.4, 2.3
 */
export class AddMarketplaceEcosystemFieldsToPetSkins1788000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "pet_skins" ADD COLUMN "clan" varchar(2) DEFAULT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "pet_skins" ADD COLUMN "like_count" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "pet_skins" ADD COLUMN "view_count" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "pet_skins" ADD COLUMN "remix_count" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "pet_skins" ADD COLUMN "featured" boolean NOT NULL DEFAULT false`,
    );

    // Index for clan filtering
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_pet_skins_clan" ON "pet_skins" ("clan")`,
    );
    // Index for featured sorting
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_pet_skins_featured" ON "pet_skins" ("featured", "created_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pet_skins_featured"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pet_skins_clan"`);
    await queryRunner.query(
      `ALTER TABLE "pet_skins" DROP COLUMN "featured"`,
    );
    await queryRunner.query(
      `ALTER TABLE "pet_skins" DROP COLUMN "remix_count"`,
    );
    await queryRunner.query(
      `ALTER TABLE "pet_skins" DROP COLUMN "view_count"`,
    );
    await queryRunner.query(
      `ALTER TABLE "pet_skins" DROP COLUMN "like_count"`,
    );
    await queryRunner.query(`ALTER TABLE "pet_skins" DROP COLUMN "clan"`);
  }
}
