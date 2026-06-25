import { MigrationInterface, QueryRunner, Table } from 'typeorm';

/**
 * Aeon 地块留言板(地图社交) — aeon_plot_messages。
 * 访客在别人领地留言;owner 可看自己收到的留言。列名遵循 SnakeNamingStrategy。
 */
export class AeonPlotMessages_1800300000000 implements MigrationInterface {
  name = 'AeonPlotMessages_1800300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('aeon_plot_messages'))) {
      await queryRunner.createTable(
        new Table({
          name: 'aeon_plot_messages',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
            { name: 'plot_id', type: 'uuid', isNullable: false },
            { name: 'plot_owner_user_id', type: 'uuid', isNullable: false },
            { name: 'author_user_id', type: 'uuid', isNullable: false },
            { name: 'author_name', type: 'varchar', length: '64', default: `'匿名居民'`, isNullable: false },
            { name: 'body', type: 'varchar', length: '280', isNullable: false },
            { name: 'created_at', type: 'timestamp', default: 'now()', isNullable: false },
          ],
        }),
        true,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_aeon_plot_messages_plot" ON "aeon_plot_messages" ("plot_id")`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_aeon_plot_messages_owner" ON "aeon_plot_messages" ("plot_owner_user_id")`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_aeon_plot_messages_owner"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_aeon_plot_messages_plot"`);
    await queryRunner.dropTable('aeon_plot_messages', true);
  }
}
