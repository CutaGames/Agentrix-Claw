import { MigrationInterface, QueryRunner, Table } from 'typeorm';

/**
 * Aeon 地理签到(到访真实地点的领地得 AXP)— aeon_plot_checkins。
 * (plot,user,day) 唯一 → 每地块每用户每天一次。列名遵循 SnakeNamingStrategy。
 */
export class AeonPlotCheckins_1800700000000 implements MigrationInterface {
  name = 'AeonPlotCheckins_1800700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('aeon_plot_checkins'))) {
      await queryRunner.createTable(
        new Table({
          name: 'aeon_plot_checkins',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
            { name: 'plot_id', type: 'uuid', isNullable: false },
            { name: 'user_id', type: 'uuid', isNullable: false },
            { name: 'day', type: 'varchar', length: '10', isNullable: false },
            { name: 'lat', type: 'double precision', isNullable: true },
            { name: 'lng', type: 'double precision', isNullable: true },
            { name: 'reward_axp', type: 'int', default: 0, isNullable: false },
            { name: 'created_at', type: 'timestamp', default: 'now()', isNullable: false },
          ],
        }),
        true,
      );
      await queryRunner.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "uq_aeon_plot_checkins_plot_user_day" ON "aeon_plot_checkins" ("plot_id","user_id","day")`,
      );
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_aeon_plot_checkins_user" ON "aeon_plot_checkins" ("user_id")`);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_aeon_plot_checkins_plot" ON "aeon_plot_checkins" ("plot_id")`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_aeon_plot_checkins_plot_user_day"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_aeon_plot_checkins_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_aeon_plot_checkins_plot"`);
    await queryRunner.dropTable('aeon_plot_checkins', true);
  }
}
