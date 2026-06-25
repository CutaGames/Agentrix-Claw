import { MigrationInterface, QueryRunner, Table } from 'typeorm';

/**
 * 连接器/插件库:用户已安装连接器 — user_connectors。
 * 列名遵循 SnakeNamingStrategy。
 */
export class UserConnectors_1800600000000 implements MigrationInterface {
  name = 'UserConnectors_1800600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('user_connectors'))) {
      await queryRunner.createTable(
        new Table({
          name: 'user_connectors',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
            { name: 'user_id', type: 'uuid', isNullable: false },
            { name: 'connector_id', type: 'varchar', length: '64', isNullable: false },
            { name: 'enabled', type: 'boolean', default: true, isNullable: false },
            { name: 'credentials', type: 'jsonb', isNullable: true },
            { name: 'imported_skill_id', type: 'uuid', isNullable: true },
            { name: 'mcp_server_id', type: 'uuid', isNullable: true },
            { name: 'created_at', type: 'timestamp', default: 'now()', isNullable: false },
            { name: 'updated_at', type: 'timestamp', default: 'now()', isNullable: false },
          ],
        }),
        true,
      );
      await queryRunner.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_connectors_user_connector" ON "user_connectors" ("user_id","connector_id")`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_user_connectors_user" ON "user_connectors" ("user_id")`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_user_connectors_user_connector"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_connectors_user"`);
    await queryRunner.dropTable('user_connectors', true);
  }
}
