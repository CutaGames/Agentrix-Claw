import { MigrationInterface, QueryRunner, Table } from 'typeorm';

/**
 * Aeon 现场活动/演出排期(社交场所 Step 3)— aeon_events + aeon_event_rsvps。
 * 列名遵循 SnakeNamingStrategy。
 */
export class AeonEvents_1800400000000 implements MigrationInterface {
  name = 'AeonEvents_1800400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('aeon_events'))) {
      await queryRunner.createTable(
        new Table({
          name: 'aeon_events',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
            { name: 'epoch', type: 'varchar', length: '16', default: `'earth'`, isNullable: false },
            { name: 'kind', type: 'varchar', length: '24', default: `'talk_show'`, isNullable: false },
            { name: 'title', type: 'varchar', length: '80', isNullable: false },
            { name: 'description', type: 'varchar', length: '500', default: `''`, isNullable: false },
            { name: 'host_user_id', type: 'uuid', isNullable: false },
            { name: 'host_name', type: 'varchar', length: '64', default: `'主办方'`, isNullable: false },
            { name: 'starts_at', type: 'timestamp', isNullable: false },
            { name: 'ends_at', type: 'timestamp', isNullable: true },
            { name: 'plot_id', type: 'uuid', isNullable: true },
            { name: 'build_item_id', type: 'uuid', isNullable: true },
            { name: 'cancelled', type: 'boolean', default: false, isNullable: false },
            { name: 'cover_url', type: 'varchar', length: '512', isNullable: true },
            { name: 'created_at', type: 'timestamp', default: 'now()', isNullable: false },
            { name: 'updated_at', type: 'timestamp', default: 'now()', isNullable: false },
          ],
        }),
        true,
      );
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_aeon_events_epoch" ON "aeon_events" ("epoch")`);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_aeon_events_starts" ON "aeon_events" ("starts_at")`);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_aeon_events_host" ON "aeon_events" ("host_user_id")`);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_aeon_events_plot" ON "aeon_events" ("plot_id")`);
    }

    if (!(await queryRunner.hasTable('aeon_event_rsvps'))) {
      await queryRunner.createTable(
        new Table({
          name: 'aeon_event_rsvps',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
            { name: 'event_id', type: 'uuid', isNullable: false },
            { name: 'user_id', type: 'uuid', isNullable: false },
            { name: 'user_name', type: 'varchar', length: '64', default: `'居民'`, isNullable: false },
            { name: 'created_at', type: 'timestamp', default: 'now()', isNullable: false },
          ],
        }),
        true,
      );
      await queryRunner.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "uq_aeon_event_rsvps_event_user" ON "aeon_event_rsvps" ("event_id","user_id")`,
      );
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_aeon_event_rsvps_event" ON "aeon_event_rsvps" ("event_id")`);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_aeon_event_rsvps_user" ON "aeon_event_rsvps" ("user_id")`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_aeon_event_rsvps_event_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_aeon_event_rsvps_event"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_aeon_event_rsvps_user"`);
    await queryRunner.dropTable('aeon_event_rsvps', true);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_aeon_events_epoch"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_aeon_events_starts"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_aeon_events_host"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_aeon_events_plot"`);
    await queryRunner.dropTable('aeon_events', true);
  }
}
