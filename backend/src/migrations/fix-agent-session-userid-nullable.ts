import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class FixAgentSessionUserIdNullable1700000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 检查表是否存在
    const table = await queryRunner.getTable('agent_sessions');
    if (!table) {
      console.log('⚠️  agent_sessions 表不存在，跳过此迁移');
      return;
    }

    // 检查字段是否存在
    const userIdColumn = table.findColumnByName('userId');
    if (!userIdColumn) {
      console.log('⚠️  userId 字段不存在，跳过此迁移');
      return;
    }

    // 如果字段已经是 nullable，跳过
    if (userIdColumn.isNullable) {
      console.log('⚠️  userId 字段已经是 nullable，跳过此迁移');
      return;
    }

    // 修改 userId 字段允许 null
    await queryRunner.changeColumn(
      'agent_sessions',
      'userId',
      new TableColumn({
        name: 'userId',
        type: userIdColumn.type, // 使用原有类型
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 回滚：不允许 null
    await queryRunner.changeColumn(
      'agent_sessions',
      'userId',
      new TableColumn({
        name: 'userId',
        type: 'varchar',
        isNullable: false,
      }),
    );
  }
}

