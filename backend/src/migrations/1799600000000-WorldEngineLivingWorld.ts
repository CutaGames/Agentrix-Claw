import { MigrationInterface, QueryRunner, Table, TableColumn } from 'typeorm';

/**
 * World Engine Phase A2 — 活世界 (design WORLD_ENGINE_X_AGENTRIX_ABILITY_BINDING §7)。
 *
 *   1. 新建 world_events 表(append-only 剧情日志)。
 *   2. world_assets 加 world_state(jsonb, null) + last_tick_at(bigint, null)。
 *
 * 列名遵循全局 SnakeNamingStrategy (worldState → world_state, actorAssetId → actor_asset_id)。
 * 全部向后兼容(存量资产 world_state/last_tick_at = null = 未进入活世界)。
 */
export class WorldEngineLivingWorld1799600000000 implements MigrationInterface {
  name = 'WorldEngineLivingWorld1799600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) world_events 表
    const hasTable = await queryRunner.hasTable('world_events');
    if (!hasTable) {
      await queryRunner.createTable(
        new Table({
          name: 'world_events',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
            { name: 'user_id', type: 'uuid', isNullable: false },
            { name: 'actor_asset_id', type: 'uuid', isNullable: false },
            { name: 'actor_name', type: 'varchar', length: '64', isNullable: false },
            { name: 'type', type: 'varchar', length: '24', isNullable: false },
            { name: 'summary', type: 'varchar', length: '280', isNullable: false },
            { name: 'outcome', type: 'varchar', length: '16', default: `'neutral'`, isNullable: false },
            { name: 'delta_stats', type: 'jsonb', isNullable: true },
            { name: 'delta_xp', type: 'integer', default: 0, isNullable: false },
            { name: 'delta_axp', type: 'integer', default: 0, isNullable: false },
            { name: 'tick_seed', type: 'bigint', isNullable: true },
            { name: 'created_at', type: 'timestamp', default: 'now()', isNullable: false },
          ],
        }),
        true,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_world_events_user_created" ON "world_events" ("user_id", "created_at")`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_world_events_actor_created" ON "world_events" ("actor_asset_id", "created_at")`,
      );
    }

    // 2) world_assets 加 world_state + last_tick_at
    const table = await queryRunner.getTable('world_assets');
    if (!table?.findColumnByName('world_state')) {
      await queryRunner.addColumn(
        'world_assets',
        new TableColumn({ name: 'world_state', type: 'jsonb', isNullable: true }),
      );
    }
    if (!table?.findColumnByName('last_tick_at')) {
      await queryRunner.addColumn(
        'world_assets',
        new TableColumn({ name: 'last_tick_at', type: 'bigint', isNullable: true }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('world_assets');
    if (table?.findColumnByName('last_tick_at')) {
      await queryRunner.dropColumn('world_assets', 'last_tick_at');
    }
    if (table?.findColumnByName('world_state')) {
      await queryRunner.dropColumn('world_assets', 'world_state');
    }
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_world_events_actor_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_world_events_user_created"`);
    const hasTable = await queryRunner.hasTable('world_events');
    if (hasTable) {
      await queryRunner.dropTable('world_events');
    }
  }
}
