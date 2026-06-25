import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddPaymindIdToUsers1771000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('users');
    
    if (table) {
      const paymindIdColumn = table.findColumnByName('paymindId');
      
      // 如果列不存在，才添加
      if (!paymindIdColumn) {
        // 先添加可空列
        await queryRunner.addColumn(
          'users',
          new TableColumn({
            name: 'paymindId',
            type: 'varchar',
            isNullable: true,
            isUnique: false,
          }),
        );
        
        // 为现有用户生成 paymindId（如果表中有数据）
        await queryRunner.query(`
          UPDATE "users" 
          SET "paymindId" = 'AX-' || EXTRACT(EPOCH FROM NOW())::bigint || '-' || SUBSTRING(MD5(RANDOM()::text), 1, 9)
          WHERE "paymindId" IS NULL OR "paymindId" = '';
        `);
        
        // 设置为 NOT NULL
        await queryRunner.query(`
          ALTER TABLE "users" 
          ALTER COLUMN "paymindId" SET NOT NULL;
        `);
        
        // 创建唯一索引
        await queryRunner.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_paymindId" 
          ON "users" ("paymindId");
        `);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('users');
    
    if (table) {
      const paymindIdColumn = table.findColumnByName('paymindId');
      
      // 如果列存在，才删除
      if (paymindIdColumn) {
        // 删除索引
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_paymindId";`);
        
        // 删除列
        await queryRunner.dropColumn('users', 'paymindId');
      }
    }
  }
}

