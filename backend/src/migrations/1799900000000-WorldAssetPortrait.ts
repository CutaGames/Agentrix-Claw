import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * World Engine 2D 立绘兜底 (2026-05-30)。
 *
 * world_assets 加 portrait_url (varchar 1024, null): 角色卡 2D 形象图。
 * 创建时用用户扫描照片填充, 保证"拍照→秒得有形象的角色"100% 成功, 不依赖 3D。
 * 列名遵循 SnakeNamingStrategy (portraitUrl → portrait_url)。
 */
export class WorldAssetPortrait1799900000000 implements MigrationInterface {
  name = 'WorldAssetPortrait1799900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('world_assets');
    if (!table?.findColumnByName('portrait_url')) {
      await queryRunner.addColumn(
        'world_assets',
        new TableColumn({ name: 'portrait_url', type: 'varchar', length: '1024', isNullable: true }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('world_assets');
    if (table?.findColumnByName('portrait_url')) {
      await queryRunner.dropColumn('world_assets', 'portrait_url');
    }
  }
}
