import { MigrationInterface, QueryRunner, Table, TableColumn } from 'typeorm';

/**
 * Aeon(永曜城)Phase 4 — 留存与共建表(spec: .kiro/specs/agentrix-world)。
 *
 * 新建:
 *   - aeon_build_items:地块建造布局(放置/移动/链接,R10)
 * 变更:
 *   - aeon_plots 增加 config jsonb 列(建造授权名单 buildGrantees 等,R10.3)
 * 列名遵循 SnakeNamingStrategy。
 */
export class AeonWorldPhase4_1800200000000 implements MigrationInterface {
  name = 'AeonWorldPhase4_1800200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── aeon_build_items ────────────────────────────────────────
    if (!(await queryRunner.hasTable('aeon_build_items'))) {
      await queryRunner.createTable(
        new Table({
          name: 'aeon_build_items',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
            { name: 'plot_id', type: 'uuid', isNullable: false },
            { name: 'source_asset_id', type: 'uuid', isNullable: true },
            { name: 'catalog_id', type: 'varchar', length: '64', isNullable: true },
            { name: 'x', type: 'int', default: 0, isNullable: false },
            { name: 'y', type: 'int', default: 0, isNullable: false },
            { name: 'rotation', type: 'int', default: 0, isNullable: false },
            { name: 'links_to_id', type: 'uuid', isNullable: true },
            { name: 'links_to_kind', type: 'varchar', length: '16', default: `'none'`, isNullable: false },
            { name: 'label', type: 'varchar', length: '80', default: `'建筑'`, isNullable: false },
            { name: 'created_at', type: 'timestamp', default: 'now()', isNullable: false },
            { name: 'updated_at', type: 'timestamp', default: 'now()', isNullable: false },
          ],
        }),
        true,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_aeon_build_items_plot" ON "aeon_build_items" ("plot_id")`,
      );
    }

    // ── aeon_plots.config ───────────────────────────────────────
    const plots = await queryRunner.getTable('aeon_plots');
    if (plots && !plots.findColumnByName('config')) {
      await queryRunner.addColumn(
        'aeon_plots',
        new TableColumn({ name: 'config', type: 'jsonb', isNullable: true }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const plots = await queryRunner.getTable('aeon_plots');
    if (plots && plots.findColumnByName('config')) {
      await queryRunner.dropColumn('aeon_plots', 'config');
    }
    if (await queryRunner.hasTable('aeon_build_items')) {
      await queryRunner.dropTable('aeon_build_items');
    }
  }
}
