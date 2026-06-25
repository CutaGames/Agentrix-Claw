import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixAgentTemplatesTable1774900000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log('🔧 Starting agent_templates table fix migration...');

    // 检查表是否存在
    const tableExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'agent_templates'
      )
    `);

    if (!tableExists[0].exists) {
      console.log('  ⚠️ agent_templates table does not exist, skipping...');
      return;
    }

    // 获取现有列
    const existingColumns = await queryRunner.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'agent_templates'
    `);
    const columnNames = existingColumns.map((c: any) => c.column_name);
    console.log('  📋 Existing columns:', columnNames.join(', '));

    // 添加缺失的列
    const columnsToAdd = [
      { name: 'visibility', type: "VARCHAR(20) DEFAULT 'private'" },
      { name: 'created_by', type: 'UUID' },
      { name: 'is_featured', type: 'BOOLEAN DEFAULT false' },
      { name: 'usage_count', type: 'INTEGER DEFAULT 0' },
      { name: 'cover_image', type: 'VARCHAR(150)' },
      { name: 'metadata', type: 'JSONB' },
      { name: 'created_at', type: 'TIMESTAMPTZ DEFAULT NOW()' },
      { name: 'updated_at', type: 'TIMESTAMPTZ DEFAULT NOW()' },
    ];

    for (const col of columnsToAdd) {
      if (!columnNames.includes(col.name)) {
        try {
          await queryRunner.query(`
            ALTER TABLE "agent_templates" ADD COLUMN IF NOT EXISTS "${col.name}" ${col.type}
          `);
          console.log(`  ✅ Added column: ${col.name}`);
        } catch (error) {
          console.log(`  ⚠️ Failed to add column ${col.name}:`, (error as Error).message);
        }
      } else {
        console.log(`  ✅ Column ${col.name} already exists`);
      }
    }

    // 重命名 camelCase 列到 snake_case（如果存在）
    const camelCaseColumns = [
      { old: 'createdBy', new: 'created_by' },
      { old: 'isFeatured', new: 'is_featured' },
      { old: 'usageCount', new: 'usage_count' },
      { old: 'coverImage', new: 'cover_image' },
      { old: 'createdAt', new: 'created_at' },
      { old: 'updatedAt', new: 'updated_at' },
    ];

    // 重新获取列（可能已经添加了新列）
    const updatedColumns = await queryRunner.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'agent_templates'
    `);
    const updatedColumnNames = updatedColumns.map((c: any) => c.column_name);

    for (const col of camelCaseColumns) {
      if (updatedColumnNames.includes(col.old) && !updatedColumnNames.includes(col.new)) {
        try {
          await queryRunner.query(`
            ALTER TABLE "agent_templates" RENAME COLUMN "${col.old}" TO "${col.new}"
          `);
          console.log(`  ✅ Renamed: ${col.old} -> ${col.new}`);
        } catch (error) {
          console.log(`  ⚠️ Failed to rename ${col.old}:`, (error as Error).message);
        }
      }
    }

    // 创建索引（如果不存在）
    try {
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "IDX_agent_templates_created_by" ON "agent_templates" ("created_by")
      `);
      console.log('  ✅ Index on created_by created or already exists');
    } catch (error) {
      console.log('  ⚠️ Index creation failed:', (error as Error).message);
    }

    console.log('✅ agent_templates table fix complete');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log('Skipping down migration - column additions are permanent');
  }
}
