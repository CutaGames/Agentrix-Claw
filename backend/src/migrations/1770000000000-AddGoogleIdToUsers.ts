import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddGoogleIdToUsers1770000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('users');
    
    if (table) {
      const googleIdColumn = table.findColumnByName('googleId');
      
      // 如果列不存在，才添加
      if (!googleIdColumn) {
        await queryRunner.addColumn(
          'users',
          new TableColumn({
            name: 'googleId',
            type: 'varchar',
            isNullable: true,
            isUnique: true,
          }),
        );
        
        // 创建唯一索引（只对非空值）
        await queryRunner.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_googleId" 
          ON "users" ("googleId") 
          WHERE "googleId" IS NOT NULL;
        `);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('users');
    
    if (table) {
      const googleIdColumn = table.findColumnByName('googleId');
      
      // 如果列存在，才删除
      if (googleIdColumn) {
        // 删除索引
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_googleId";`);
        
        // 删除列
        await queryRunner.dropColumn('users', 'googleId');
      }
    }
  }
}

