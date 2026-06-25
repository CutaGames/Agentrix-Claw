import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * 修复 wallet_connections 表的 user_id 列名问题
 * 
 * 背景：
 * - WalletConnection 实体使用 userId (驼峰) 
 * - 但数据库可能创建了 user_id (下划线) 列
 * - 导致 TypeORM 查询失败
 * 
 * 解决方案：
 * - 检查并重命名 user_id 为 userId
 * - 确保与实体定义一致
 */
export class FixWalletConnectionUserIdColumn1774800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('wallet_connections');
    
    if (!table) {
      // 如果表不存在，创建表
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "wallet_connections" (
          "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
          "userId" character varying NOT NULL,
          "walletType" character varying NOT NULL,
          "walletAddress" character varying NOT NULL,
          "chain" character varying NOT NULL,
          "chainId" character varying,
          "isDefault" boolean NOT NULL DEFAULT false,
          "connectedAt" TIMESTAMP NOT NULL DEFAULT now(),
          "lastUsedAt" TIMESTAMP NOT NULL DEFAULT now(),
          CONSTRAINT "FK_wallet_connections_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
        )
      `);
      
      // 创建唯一索引
      await queryRunner.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "IDX_wallet_connections_address" 
        ON "wallet_connections" ("walletAddress")
      `);
      
      console.log('✅ Created wallet_connections table with userId column');
      return;
    }
    
    // 检查是否存在 user_id 列（下划线命名）
    const hasUserIdColumn = table.columns.find(col => col.name === 'user_id');
    const hasUserIdCamelCase = table.columns.find(col => col.name === 'userId');
    
    if (hasUserIdColumn && !hasUserIdCamelCase) {
      // 重命名 user_id 为 userId
      console.log('🔄 Renaming user_id to userId...');
      await queryRunner.renameColumn('wallet_connections', 'user_id', 'userId');
      console.log('✅ Renamed user_id to userId');
    } else if (hasUserIdCamelCase) {
      console.log('✅ Column userId already exists, no changes needed');
    } else {
      // 如果两者都不存在，添加 userId 列
      console.log('➕ Adding userId column...');
      await queryRunner.addColumn(
        'wallet_connections',
        new TableColumn({
          name: 'userId',
          type: 'varchar',
          isNullable: false,
        }),
      );
      console.log('✅ Added userId column');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 回滚：将 userId 重命名为 user_id
    const table = await queryRunner.getTable('wallet_connections');
    
    if (table) {
      const hasUserIdCamelCase = table.columns.find(col => col.name === 'userId');
      
      if (hasUserIdCamelCase) {
        await queryRunner.renameColumn('wallet_connections', 'userId', 'user_id');
        console.log('↩️  Reverted userId to user_id');
      }
    }
  }
}
