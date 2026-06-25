import { MigrationInterface, QueryRunner, TableIndex, TableColumn } from 'typeorm';

export class CreateAgentSessions1764000002000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 检查表是否存在
    const table = await queryRunner.getTable('agent_sessions');
    
    if (!table) {
      // 如果表不存在，创建新表（这种情况不应该发生，因为原有迁移已创建）
      throw new Error('agent_sessions table should already exist. Please check migrations.');
    }

    // 添加新字段（用于支付 Session）
    // 检查字段是否已存在，避免重复添加
    const hasSessionId = table.findColumnByName('session_id');
    if (!hasSessionId) {
      await queryRunner.addColumn(
        'agent_sessions',
        new TableColumn({
          name: 'session_id',
          type: 'varchar',
          length: '66',
          isNullable: true, // 允许为空，因为原有记录没有这个字段
        }),
      );
    }

    const hasAgentId = table.findColumnByName('agent_id');
    if (!hasAgentId) {
      await queryRunner.addColumn(
        'agent_sessions',
        new TableColumn({
          name: 'agent_id',
          type: 'varchar',
          isNullable: true,
        }),
      );
    }

    const hasSignerAddress = table.findColumnByName('signer_address');
    if (!hasSignerAddress) {
      await queryRunner.addColumn(
        'agent_sessions',
        new TableColumn({
          name: 'signer_address',
          type: 'varchar',
          length: '42',
          isNullable: true,
        }),
      );
    }

    const hasOwnerAddress = table.findColumnByName('owner_address');
    if (!hasOwnerAddress) {
      await queryRunner.addColumn(
        'agent_sessions',
        new TableColumn({
          name: 'owner_address',
          type: 'varchar',
          length: '42',
          isNullable: true,
        }),
      );
    }

    const hasSingleLimit = table.findColumnByName('single_limit');
    if (!hasSingleLimit) {
      await queryRunner.addColumn(
        'agent_sessions',
        new TableColumn({
          name: 'single_limit',
          type: 'decimal',
          precision: 18,
          scale: 6,
          isNullable: true,
          default: '0',
        }),
      );
    }

    const hasDailyLimit = table.findColumnByName('daily_limit');
    if (!hasDailyLimit) {
      await queryRunner.addColumn(
        'agent_sessions',
        new TableColumn({
          name: 'daily_limit',
          type: 'decimal',
          precision: 18,
          scale: 6,
          isNullable: true,
          default: '0',
        }),
      );
    }

    const hasUsedToday = table.findColumnByName('used_today');
    if (!hasUsedToday) {
      await queryRunner.addColumn(
        'agent_sessions',
        new TableColumn({
          name: 'used_today',
          type: 'decimal',
          precision: 18,
          scale: 6,
          isNullable: true,
          default: '0',
        }),
      );
    }

    const hasExpiry = table.findColumnByName('expiry');
    if (!hasExpiry) {
      await queryRunner.addColumn(
        'agent_sessions',
        new TableColumn({
          name: 'expiry',
          type: 'timestamp',
          isNullable: true,
        }),
      );
    }

    // 更新 status 枚举（添加 archived）
    // 注意：PostgreSQL 的枚举类型修改比较复杂，这里先跳过
    // 如果需要，可以单独创建一个迁移来修改枚举类型

    // 创建新索引（如果不存在）
    const indexes = table.indices || [];
    const hasSessionIdIndex = indexes.find(idx => idx.name === 'IDX_agent_sessions_session_id');
    if (!hasSessionIdIndex && hasSessionId) {
      await queryRunner.createIndex(
        'agent_sessions',
        new TableIndex({
          name: 'IDX_agent_sessions_session_id',
          columnNames: ['session_id'],
        }),
      );
    }

    const hasUserStatusIndex = indexes.find(idx => idx.name === 'IDX_agent_sessions_user_status');
    if (!hasUserStatusIndex) {
      await queryRunner.createIndex(
        'agent_sessions',
        new TableIndex({
          name: 'IDX_agent_sessions_user_status',
          columnNames: ['userId', 'status'],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 删除添加的字段
    const table = await queryRunner.getTable('agent_sessions');
    if (table) {
      const columnsToRemove = [
        'session_id',
        'agent_id',
        'signer_address',
        'owner_address',
        'single_limit',
        'daily_limit',
        'used_today',
        'expiry',
      ];

      for (const columnName of columnsToRemove) {
        const column = table.findColumnByName(columnName);
        if (column) {
          await queryRunner.dropColumn('agent_sessions', columnName);
        }
      }

      // 删除索引
      await queryRunner.dropIndex('agent_sessions', 'IDX_agent_sessions_session_id');
      await queryRunner.dropIndex('agent_sessions', 'IDX_agent_sessions_user_status');
    }
  }
}

