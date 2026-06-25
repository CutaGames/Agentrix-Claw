import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * World Engine Phase A — 能力飞轮 (design WORLD_ENGINE_X_AGENTRIX_ABILITY_BINDING §3)。
 *
 * 给 world_assets 增加三列:
 *   - ability_snapshot (jsonb, null): 能力加成快照 (multiplier + breakdown +
 *     baseStats + effectiveStats), 创建/进化时读真实 agent 战绩算一次写死,
 *     保证战斗回放确定性。
 *   - linked_soul_id (uuid, null): 关联主宠灵魂 LivingPet.id ("化身主宠" 模式, Phase C)。
 *   - source_agent_account_id (uuid, null): 能力加成来源的真实 agent_accounts.id。
 *
 * 全部 nullable, 存量资产默认 null (= 未计算能力加成, 战斗回退用 canonical stats),
 * 向后完全兼容。
 *
 * 列名遵循全局 SnakeNamingStrategy (abilitySnapshot → ability_snapshot)。
 */
export class WorldAssetAbilitySnapshot1799500000000 implements MigrationInterface {
  name = 'WorldAssetAbilitySnapshot1799500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('world_assets');

    if (!table?.findColumnByName('ability_snapshot')) {
      await queryRunner.addColumn(
        'world_assets',
        new TableColumn({
          name: 'ability_snapshot',
          type: 'jsonb',
          isNullable: true,
        }),
      );
    }

    if (!table?.findColumnByName('linked_soul_id')) {
      await queryRunner.addColumn(
        'world_assets',
        new TableColumn({
          name: 'linked_soul_id',
          type: 'uuid',
          isNullable: true,
        }),
      );
    }

    if (!table?.findColumnByName('source_agent_account_id')) {
      await queryRunner.addColumn(
        'world_assets',
        new TableColumn({
          name: 'source_agent_account_id',
          type: 'uuid',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('world_assets');
    if (table?.findColumnByName('source_agent_account_id')) {
      await queryRunner.dropColumn('world_assets', 'source_agent_account_id');
    }
    if (table?.findColumnByName('linked_soul_id')) {
      await queryRunner.dropColumn('world_assets', 'linked_soul_id');
    }
    if (table?.findColumnByName('ability_snapshot')) {
      await queryRunner.dropColumn('world_assets', 'ability_snapshot');
    }
  }
}
