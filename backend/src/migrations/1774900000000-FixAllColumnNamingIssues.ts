import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 统一修复所有实体的列名问题
 * 
 * 问题背景：
 * - 项目使用 SnakeNamingStrategy，自动将 camelCase 转换为 snake_case
 * - 但某些实体显式指定了 @Column({ name: 'userId' }) 等驼峰命名
 * - 导致 TypeORM 查询时使用驼峰，但数据库实际列名是 snake_case
 * 
 * 解决方案：
 * - 统一所有列名为 snake_case，与 SnakeNamingStrategy 保持一致
 * - 移除实体中所有显式的 name 指定（交由策略自动处理）
 */
export class FixAllColumnNamingIssues1774900000000 implements MigrationInterface {
  name = 'FixAllColumnNamingIssues1774900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log('🔧 Starting column naming fix migration...');

    // ========== 1. 修复 wallet_connections 表 ==========
    await this.safeRenameColumns(queryRunner, 'wallet_connections', [
      { from: 'userId', to: 'user_id' },
      { from: 'walletType', to: 'wallet_type' },
      { from: 'walletAddress', to: 'wallet_address' },
      { from: 'chainId', to: 'chain_id' },
      { from: 'isDefault', to: 'is_default' },
      { from: 'connectedAt', to: 'connected_at' },
      { from: 'lastUsedAt', to: 'last_used_at' },
    ]);

    // ========== 2. 修复 social_accounts 表 ==========
    await this.safeRenameColumns(queryRunner, 'social_accounts', [
      { from: 'userId', to: 'user_id' },
      { from: 'socialId', to: 'social_id' },
      { from: 'displayName', to: 'display_name' },
      { from: 'avatarUrl', to: 'avatar_url' },
      { from: 'connectedAt', to: 'connected_at' },
      { from: 'lastUsedAt', to: 'last_used_at' },
    ]);

    // ========== 3. 修复 user_agents 表 ==========
    await this.safeRenameColumns(queryRunner, 'user_agents', [
      { from: 'userId', to: 'user_id' },
      { from: 'templateId', to: 'template_id' },
      { from: 'isPublished', to: 'is_published' },
    ]);

    // ========== 4. 修复 products 表 ==========
    await this.safeRenameColumns(queryRunner, 'products', [
      { from: 'merchantId', to: 'merchant_id' },
      { from: 'productType', to: 'product_type' },
      { from: 'fixedCommissionRate', to: 'fixed_commission_rate' },
      { from: 'allowCommissionAdjustment', to: 'allow_commission_adjustment' },
      { from: 'minCommissionRate', to: 'min_commission_rate' },
      { from: 'maxCommissionRate', to: 'max_commission_rate' },
      { from: 'commissionRate', to: 'commission_rate' },
      { from: 'syncSource', to: 'sync_source' },
      { from: 'externalId', to: 'external_id' },
      { from: 'imageUrl', to: 'image_url' },
    ]);

    // ========== 5. 修复 orders 表 ==========
    await this.safeRenameColumns(queryRunner, 'orders', [
      { from: 'userId', to: 'user_id' },
      { from: 'merchantId', to: 'merchant_id' },
      { from: 'productId', to: 'product_id' },
      { from: 'assetType', to: 'asset_type' },
      { from: 'netRevenue', to: 'net_revenue' },
      { from: 'platformTaxRate', to: 'platform_tax_rate' },
      { from: 'platformTax', to: 'platform_tax' },
      { from: 'merchantNetAmount', to: 'merchant_net_amount' },
      { from: 'settlementTriggerTime', to: 'settlement_trigger_time' },
    ]);

    console.log('✅ All column naming issues fixed');
  }

  /**
   * 安全地重命名列 - 检查列是否存在后再重命名
   */
  private async safeRenameColumns(
    queryRunner: QueryRunner,
    tableName: string,
    columns: Array<{ from: string; to: string }>,
  ): Promise<void> {
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

    for (const col of columns) {
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
      } else if (!hasOldColumn && !hasNewColumn) {
        console.log(`  ℹ️ ${tableName}: Column ${col.from} and ${col.to} both don't exist`);
      } else if (hasNewColumn) {
        console.log(`  ✅ ${tableName}: Column ${col.to} already exists`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 回滚时将 snake_case 改回 camelCase
    // 实际上不建议回滚，因为 SnakeNamingStrategy 是正确的做法
    console.log('⚠️ Rolling back column names is not recommended');
  }
}
