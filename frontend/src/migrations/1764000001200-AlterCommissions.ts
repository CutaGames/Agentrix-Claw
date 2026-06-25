import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class AlterCommissions1764000001200 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 检查表是否存在
    const tableExists = await queryRunner.hasTable('commissions');
    if (!tableExists) {
      console.warn('⚠️  commissions 表不存在，跳过 AlterCommissions 迁移');
      return;
    }

    // 获取表对象（用于检查列和索引是否存在）
    const commissionsTable = await queryRunner.getTable('commissions');

    // 添加Agent类型字段（检查是否已存在）
    if (!commissionsTable?.findColumnByName('agentType')) {
      await queryRunner.addColumn(
        'commissions',
        new TableColumn({
          name: 'agentType',
          type: 'varchar',
          length: '50',
          isNullable: true,
        }),
      );
    }

    // 添加佣金计算基础字段（商户税前价格）（检查是否已存在）
    if (!commissionsTable?.findColumnByName('commissionBase')) {
      await queryRunner.addColumn(
        'commissions',
        new TableColumn({
          name: 'commissionBase',
          type: 'decimal',
          precision: 18,
          scale: 2,
          isNullable: true,
        }),
      );
    }

    // 添加通道费用字段（检查是否已存在）
    if (!commissionsTable?.findColumnByName('channelFee')) {
      await queryRunner.addColumn(
        'commissions',
        new TableColumn({
          name: 'channelFee',
          type: 'decimal',
          precision: 18,
          scale: 2,
          isNullable: true,
        }),
      );
    }

    // 添加Session ID字段（检查是否已存在）
    if (!commissionsTable?.findColumnByName('sessionId')) {
      await queryRunner.addColumn(
        'commissions',
        new TableColumn({
          name: 'sessionId',
          type: 'uuid',
          isNullable: true,
        }),
      );
    }

    // 创建Session ID索引（检查是否已存在）
    const sessionIdIndexExists = commissionsTable?.indices.some(
      (idx) => idx.name === 'IDX_commissions_session_id',
    );
    if (!sessionIdIndexExists) {
      await queryRunner.createIndex(
        'commissions',
        new TableIndex({
          name: 'IDX_commissions_session_id',
          columnNames: ['sessionId'],
        }),
      );
    }

    // 创建Agent类型索引（检查是否已存在）
    const agentTypeIndexExists = commissionsTable?.indices.some(
      (idx) => idx.name === 'IDX_commissions_agent_type',
    );
    if (!agentTypeIndexExists) {
      await queryRunner.createIndex(
        'commissions',
        new TableIndex({
          name: 'IDX_commissions_agent_type',
          columnNames: ['agentType'],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('commissions', 'IDX_commissions_session_id');
    await queryRunner.dropIndex('commissions', 'IDX_commissions_agent_type');
    await queryRunner.dropColumn('commissions', 'agentType');
    await queryRunner.dropColumn('commissions', 'commissionBase');
    await queryRunner.dropColumn('commissions', 'channelFee');
    await queryRunner.dropColumn('commissions', 'sessionId');
  }
}

