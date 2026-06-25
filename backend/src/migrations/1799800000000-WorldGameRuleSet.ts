import { MigrationInterface, QueryRunner, Table } from 'typeorm';

/**
 * World Engine Phase D — UGC 规则集 (design §7.4 + Phase D)。
 *
 * 新建 world_game_rulesets 表(用户自定义可分享挑战规则集)。
 * 列名遵循 SnakeNamingStrategy (creatorUserId → creator_user_id)。
 * Phase C(灵魂链接)复用 Phase A 已建的 world_assets.linked_soul_id, 无需新表。
 */
export class WorldGameRuleSet1799800000000 implements MigrationInterface {
  name = 'WorldGameRuleSet1799800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('world_game_rulesets');
    if (!hasTable) {
      await queryRunner.createTable(
        new Table({
          name: 'world_game_rulesets',
          columns: [
            { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
            { name: 'creator_user_id', type: 'uuid', isNullable: false },
            { name: 'name', type: 'varchar', length: '40', isNullable: false },
            { name: 'description', type: 'varchar', length: '200', default: `''`, isNullable: false },
            { name: 'share_code', type: 'varchar', length: '16', isNullable: false },
            { name: 'rules', type: 'jsonb', default: `'{}'`, isNullable: false },
            { name: 'play_count', type: 'integer', default: 0, isNullable: false },
            { name: 'is_public', type: 'boolean', default: true, isNullable: false },
            { name: 'created_at', type: 'timestamp', default: 'now()', isNullable: false },
            { name: 'updated_at', type: 'timestamp', default: 'now()', isNullable: false },
          ],
        }),
        true,
      );
      await queryRunner.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "idx_world_rulesets_sharecode" ON "world_game_rulesets" ("share_code")`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "idx_world_rulesets_creator_created" ON "world_game_rulesets" ("creator_user_id", "created_at")`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_world_rulesets_creator_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_world_rulesets_sharecode"`);
    const hasTable = await queryRunner.hasTable('world_game_rulesets');
    if (hasTable) await queryRunner.dropTable('world_game_rulesets');
  }
}
