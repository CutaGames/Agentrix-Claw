import { MigrationInterface, QueryRunner, Table } from 'typeorm';

/**
 * Aeon(永曜城)Phase 1 — 世界骨架表(spec: .kiro/specs/agentrix-world)。
 *
 * 新建:
 *   - aeon_plots:用户在真实坐标圈定的地块(R4)。唯一约束 (epoch, grid_cell)。
 *   - aeon_rooms:共同在场容器(R5)。挂在 plot 上,公司房间关联 org。
 * 列名遵循 SnakeNamingStrategy(ownerUserId → owner_user_id 等)。
 */
export class AeonWorldPhase1_1800000000000 implements MigrationInterface {
  name = 'AeonWorldPhase1_1800000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── aeon_plots ──────────────────────────────────────────────
    if (!(await queryRunner.hasTable('aeon_plots'))) {
      await queryRunner.createTable(
        new Table({
          name: 'aeon_plots',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
            { name: 'owner_user_id', type: 'uuid', isNullable: false },
            { name: 'epoch', type: 'varchar', length: '16', default: `'earth'`, isNullable: false },
            { name: 'lat', type: 'double precision', isNullable: false },
            { name: 'lng', type: 'double precision', isNullable: false },
            { name: 'grid_cell', type: 'varchar', length: '32', isNullable: false },
            { name: 'status', type: 'varchar', length: '16', default: `'active'`, isNullable: false },
            { name: 'display_name', type: 'varchar', length: '64', default: `'未命名领地'`, isNullable: false },
            { name: 'last_activity_at', type: 'bigint', isNullable: true },
            { name: 'version', type: 'integer', default: 1, isNullable: false },
            { name: 'created_at', type: 'timestamp', default: 'now()', isNullable: false },
            { name: 'updated_at', type: 'timestamp', default: 'now()', isNullable: false },
          ],
        }),
        true,
      );
      await queryRunner.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "idx_aeon_plots_epoch_cell" ON "aeon_plots" ("epoch", "grid_cell")`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_aeon_plots_owner" ON "aeon_plots" ("owner_user_id")`,
      );
    }

    // ── aeon_rooms ──────────────────────────────────────────────
    if (!(await queryRunner.hasTable('aeon_rooms'))) {
      await queryRunner.createTable(
        new Table({
          name: 'aeon_rooms',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
            { name: 'plot_id', type: 'uuid', isNullable: false },
            { name: 'org_id', type: 'uuid', isNullable: true },
            { name: 'epoch', type: 'varchar', length: '16', default: `'earth'`, isNullable: false },
            { name: 'kind', type: 'varchar', length: '16', default: `'public'`, isNullable: false },
            { name: 'capacity', type: 'integer', default: 20, isNullable: false },
            { name: 'display_name', type: 'varchar', length: '64', default: `'房间'`, isNullable: false },
            { name: 'config', type: 'jsonb', isNullable: true },
            { name: 'created_at', type: 'timestamp', default: 'now()', isNullable: false },
            { name: 'updated_at', type: 'timestamp', default: 'now()', isNullable: false },
          ],
        }),
        true,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_aeon_rooms_plot" ON "aeon_rooms" ("plot_id")`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_aeon_rooms_org" ON "aeon_rooms" ("org_id")`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_aeon_rooms_org"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_aeon_rooms_plot"`);
    if (await queryRunner.hasTable('aeon_rooms')) await queryRunner.dropTable('aeon_rooms');
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_aeon_plots_owner"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_aeon_plots_epoch_cell"`);
    if (await queryRunner.hasTable('aeon_plots')) await queryRunner.dropTable('aeon_plots');
  }
}
