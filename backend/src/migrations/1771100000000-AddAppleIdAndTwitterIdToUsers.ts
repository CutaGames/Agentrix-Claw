import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddAppleIdAndTwitterIdToUsers1771100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('users');
    
    if (table) {
      const appleIdColumn = table.findColumnByName('appleId');
      if (!appleIdColumn) {
        await queryRunner.addColumn(
          'users',
          new TableColumn({
            name: 'appleId',
            type: 'varchar',
            isNullable: true,
            isUnique: true,
          }),
        );
        
        await queryRunner.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_appleId" 
          ON "users" ("appleId") 
          WHERE "appleId" IS NOT NULL;
        `);
      }

      const twitterIdColumn = table.findColumnByName('twitterId');
      if (!twitterIdColumn) {
        await queryRunner.addColumn(
          'users',
          new TableColumn({
            name: 'twitterId',
            type: 'varchar',
            isNullable: true,
            isUnique: true,
          }),
        );
        
        await queryRunner.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_twitterId" 
          ON "users" ("twitterId") 
          WHERE "twitterId" IS NOT NULL;
        `);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('users');
    
    if (table) {
      const appleIdColumn = table.findColumnByName('appleId');
      if (appleIdColumn) {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_appleId";`);
        await queryRunner.dropColumn('users', 'appleId');
      }

      const twitterIdColumn = table.findColumnByName('twitterId');
      if (twitterIdColumn) {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_twitterId";`);
        await queryRunner.dropColumn('users', 'twitterId');
      }
    }
  }
}
