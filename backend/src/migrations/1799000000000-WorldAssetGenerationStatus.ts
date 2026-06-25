import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * World Engine 方案 B (2026-05-29) — 让 WorldAsset 支持"卡片先于 3D"的中间态。
 *
 * 背景: 原 scan→generate 链路从不创建 WorldAsset(资产库永远空)。方案 B 改成:
 *   1. generate 时立即用 AI 属性创建一个 card_ready 资产(秒出角色卡, meshUrl 为空)
 *   2. 后台混元 3D 完成后 UPDATE mesh + generation_status=complete + 推送通知
 *   3. 3D 失败/超时 → generation_status=mesh_failed, 但卡片与属性仍保留(资产不丢)
 *
 * 因此需要:
 *   - 新增 generation_status 列(存量行默认 'complete' 向后兼容)
 *   - mesh_url / styled_mesh_url 改 nullable(card_ready 阶段还没有 3D)
 *   - source 增加 'guest_trial' 取值由应用层控制(enum 用 varchar 存, 无需改类型)
 *
 * 注意: stats/skills/semantic_description 等仍 NOT NULL — 卡片阶段这些已由
 * Character Generator 同步算出(秒级), 不依赖 3D, 所以创建时就能填。
 */
export class WorldAssetGenerationStatus1799000000000 implements MigrationInterface {
  name = 'WorldAssetGenerationStatus1799000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) generation_status — 生成生命周期状态
    const table = await queryRunner.getTable('world_assets');
    const hasCol = table?.findColumnByName('generation_status');
    if (!hasCol) {
      await queryRunner.addColumn(
        'world_assets',
        new TableColumn({
          name: 'generation_status',
          type: 'varchar',
          length: '20',
          isNullable: false,
          default: `'complete'`, // 存量资产视为已完成
        }),
      );
    }

    // 2) mesh_url / styled_mesh_url 改 nullable (card_ready 阶段无 3D)
    await queryRunner.query(
      `ALTER TABLE "world_assets" ALTER COLUMN "mesh_url" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "world_assets" ALTER COLUMN "styled_mesh_url" DROP NOT NULL`,
    );

    // 3) 索引: 按 owner + status 查"生成中"的资产
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_world_assets_owner_genstatus" ON "world_assets" ("ownerId", "generation_status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_world_assets_owner_genstatus"`,
    );
    // 还原 NOT NULL 前先把空值填占位, 避免 down 失败
    await queryRunner.query(
      `UPDATE "world_assets" SET "mesh_url" = '' WHERE "mesh_url" IS NULL`,
    );
    await queryRunner.query(
      `UPDATE "world_assets" SET "styled_mesh_url" = '' WHERE "styled_mesh_url" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "world_assets" ALTER COLUMN "mesh_url" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "world_assets" ALTER COLUMN "styled_mesh_url" SET NOT NULL`,
    );
    const table = await queryRunner.getTable('world_assets');
    if (table?.findColumnByName('generation_status')) {
      await queryRunner.dropColumn('world_assets', 'generation_status');
    }
  }
}
