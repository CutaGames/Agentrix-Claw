import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 修复额外的列命名问题
 * 
 * 问题：
 * - products 和 orders 表的 createdAt/updatedAt 需要改为 created_at/updated_at
 * - orders 表缺少 settlement_due_time 列
 */
export class FixAdditionalColumnNaming1774900000001 implements MigrationInterface {
  name = 'FixAdditionalColumnNaming1774900000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log('🔧 Starting additional column naming fix migration...');

    // ========== 1. 修复 products 表的时间列 ==========
    await this.fixTimestampColumns(queryRunner, 'products');

    // ========== 2. 修复 orders 表的时间列 ==========
    await this.fixTimestampColumns(queryRunner, 'orders');

    // ========== 3. 添加缺失的 settlement_due_time 列 ==========
    await this.addMissingColumns(queryRunner);

    // ========== 4. 修复 accounts 表的时间列 ==========
    await this.fixTimestampColumns(queryRunner, 'accounts');

    // ========== 5. 修复 agent_accounts 表的时间列 ==========
    await this.fixTimestampColumns(queryRunner, 'agent_accounts');

    // ========== 6. 修复 skills 表的时间列 ==========
    await this.fixTimestampColumns(queryRunner, 'skills');

    console.log('✅ Additional column naming issues fixed');
  }

  private async fixTimestampColumns(queryRunner: QueryRunner, tableName: string): Promise<void> {
    // 检查表是否存在
    const tableExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = $1
      )
    `, [tableName]);

    if (!tableExists[0]?.exists) {
      console.log(`  ⚠️ Table ${tableName} does not exist, skipping...`);
      return;
    }

    // 获取表的所有列
    const existingColumns = await queryRunner.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = $1
    `, [tableName]);

    const columnNames = existingColumns.map((c: any) => c.column_name);

    // 时间列的映射
    const timestampRenames = [
      { from: 'createdAt', to: 'created_at' },
      { from: 'updatedAt', to: 'updated_at' },
      { from: 'deletedAt', to: 'deleted_at' },
      { from: 'lastActiveAt', to: 'last_active_at' },
      { from: 'activatedAt', to: 'activated_at' },
      { from: 'settlementDueTime', to: 'settlement_due_time' },
      { from: 'autoConfirmedAt', to: 'auto_confirmed_at' },
    ];

    for (const col of timestampRenames) {
      const hasOldColumn = columnNames.includes(col.from);
      const hasNewColumn = columnNames.includes(col.to);

      if (hasOldColumn && !hasNewColumn) {
        try {
          await queryRunner.query(`
            ALTER TABLE "${tableName}" RENAME COLUMN "${col.from}" TO "${col.to}"
          `);
          console.log(`  ✅ ${tableName}: ${col.from} -> ${col.to}`);
        } catch (e: any) {
          console.log(`  ⚠️ ${tableName}: Failed to rename ${col.from}: ${e.message}`);
        }
      } else if (hasNewColumn) {
        console.log(`  ✅ ${tableName}: Column ${col.to} already exists`);
      }
    }
  }

  private async addMissingColumns(queryRunner: QueryRunner): Promise<void> {
    // 检查 orders 表是否缺少 settlement_due_time
    const ordersColumns = await queryRunner.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'orders'
    `);

    const orderColumnNames = ordersColumns.map((c: any) => c.column_name);

    // 添加缺失的 settlement_due_time 列
    if (!orderColumnNames.includes('settlement_due_time') && !orderColumnNames.includes('settlementDueTime')) {
      try {
        await queryRunner.query(`
          ALTER TABLE "orders" ADD COLUMN "settlement_due_time" TIMESTAMPTZ
        `);
        console.log('  ✅ orders: Added settlement_due_time column');
      } catch (e: any) {
        console.log(`  ⚠️ orders: Failed to add settlement_due_time: ${e.message}`);
      }
    }

    // 添加缺失的 auto_confirmed_at 列
    if (!orderColumnNames.includes('auto_confirmed_at') && !orderColumnNames.includes('autoConfirmedAt')) {
      try {
        await queryRunner.query(`
          ALTER TABLE "orders" ADD COLUMN "auto_confirmed_at" TIMESTAMPTZ
        `);
        console.log('  ✅ orders: Added auto_confirmed_at column');
      } catch (e: any) {
        console.log(`  ⚠️ orders: Failed to add auto_confirmed_at: ${e.message}`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log('⚠️ Rolling back column names is not recommended');
  }
}
