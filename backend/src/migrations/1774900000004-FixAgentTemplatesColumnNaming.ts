import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixAgentTemplatesColumnNaming1774900000004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log('🔧 Starting agent_templates column naming fix migration...');

    // 获取现有列
    const existingColumns = await queryRunner.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'agent_templates'
    `);
    const columnNames = existingColumns.map((c: any) => c.column_name);
    console.log('  📋 Existing columns:', columnNames.join(', '));

    // 重命名 camelCase 列到 snake_case
    const columnsToRename = [
      { old: 'createdBy', new: 'created_by' },
      { old: 'isFeatured', new: 'is_featured' },
      { old: 'usageCount', new: 'usage_count' },
      { old: 'coverImage', new: 'cover_image' },
    ];

    for (const col of columnsToRename) {
      if (columnNames.includes(col.old)) {
        // 如果新列已存在，需要处理数据迁移
        if (columnNames.includes(col.new)) {
          // 先复制数据到新列，然后删除旧列
          await queryRunner.query(`
            UPDATE "agent_templates" SET "${col.new}" = "${col.old}" WHERE "${col.new}" IS NULL
          `);
          await queryRunner.query(`
            ALTER TABLE "agent_templates" DROP COLUMN "${col.old}"
          `);
          console.log(`  ✅ Migrated data from ${col.old} to ${col.new} and dropped ${col.old}`);
        } else {
          // 直接重命名
          await queryRunner.query(`
            ALTER TABLE "agent_templates" RENAME COLUMN "${col.old}" TO "${col.new}"
          `);
          console.log(`  ✅ Renamed: ${col.old} -> ${col.new}`);
        }
      } else if (columnNames.includes(col.new)) {
        console.log(`  ✅ Column ${col.new} already correct`);
      }
    }

    console.log('✅ agent_templates column naming fix complete');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log('Skipping down migration - column renames are permanent');
  }
}
