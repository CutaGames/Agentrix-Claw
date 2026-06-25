import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * World Engine Phase B — 玩家决策战斗 (design §3 支柱3)。
 *
 * battles 表加:
 *   - mode (varchar(16), default 'auto'): 区分 auto / interactive 战斗。
 *   - decisions (jsonb, null): 交互战斗的逐回合决策序列(+ randomSeed 可完整重放)。
 *   - interactive_state (jsonb, null): 进行中/最终的可序列化局面。
 *
 * 全部向后兼容(存量 battles mode='auto', decisions/interactive_state = null)。
 * 列名遵循 SnakeNamingStrategy (interactiveState → interactive_state)。
 */
export class BattleInteractiveMode1799700000000 implements MigrationInterface {
  name = 'BattleInteractiveMode1799700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('battles');

    if (!table?.findColumnByName('mode')) {
      await queryRunner.addColumn(
        'battles',
        new TableColumn({
          name: 'mode',
          type: 'varchar',
          length: '16',
          isNullable: false,
          default: `'auto'`,
        }),
      );
    }
    if (!table?.findColumnByName('decisions')) {
      await queryRunner.addColumn(
        'battles',
        new TableColumn({ name: 'decisions', type: 'jsonb', isNullable: true }),
      );
    }
    if (!table?.findColumnByName('interactive_state')) {
      await queryRunner.addColumn(
        'battles',
        new TableColumn({ name: 'interactive_state', type: 'jsonb', isNullable: true }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('battles');
    if (table?.findColumnByName('interactive_state')) {
      await queryRunner.dropColumn('battles', 'interactive_state');
    }
    if (table?.findColumnByName('decisions')) {
      await queryRunner.dropColumn('battles', 'decisions');
    }
    if (table?.findColumnByName('mode')) {
      await queryRunner.dropColumn('battles', 'mode');
    }
  }
}
