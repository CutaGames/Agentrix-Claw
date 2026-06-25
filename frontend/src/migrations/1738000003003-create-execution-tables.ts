import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

/**
 * 创建交易执行层相关表
 * - atomic_settlements: 原子结算记录
 * - smart_splits: 智能拆单记录
 * - batch_executions: 批处理交易记录
 */
export class CreateExecutionTables1738000003003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 原子结算表
    await queryRunner.createTable(
      new Table({
        name: 'atomic_settlements',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'settlement_id', type: 'varchar', length: '255', isUnique: true, isNullable: false },
          { name: 'user_id', type: 'uuid', isNullable: false },
          { name: 'agent_id', type: 'varchar', length: '255', isNullable: true },
          { name: 'strategy_graph_id', type: 'uuid', isNullable: true },
          { name: 'settlement_type', type: 'varchar', length: '50', isNullable: false }, // 'cross_chain' | 'multi_asset' | 'conditional'
          { name: 'status', type: 'varchar', length: '50', isNullable: true }, // 'pending' | 'executing' | 'completed' | 'failed' | 'rolled_back'
          { name: 'chains', type: 'text', isArray: true, isNullable: false }, // 涉及的链
          { name: 'transactions', type: 'jsonb', isNullable: false }, // 交易详情数组
          { name: 'total_amount', type: 'decimal', precision: 18, scale: 6, isNullable: false },
          { name: 'total_fee', type: 'decimal', precision: 18, scale: 6, isNullable: true },
          { name: 'executed_at', type: 'timestamp', isNullable: true },
          { name: 'completed_at', type: 'timestamp', isNullable: true },
          { name: 'rollback_reason', type: 'text', isNullable: true },
          { name: 'metadata', type: 'jsonb', isNullable: true },
          { name: 'created_at', type: 'timestamp', default: 'NOW()' },
          { name: 'updated_at', type: 'timestamp', default: 'NOW()' },
        ],
      }),
    );

    await queryRunner.createIndex('atomic_settlements', new TableIndex({ columnNames: ['settlement_id'] }));
    await queryRunner.createIndex('atomic_settlements', new TableIndex({ columnNames: ['user_id'] }));
    await queryRunner.createIndex('atomic_settlements', new TableIndex({ columnNames: ['status'] }));
    await queryRunner.createIndex('atomic_settlements', new TableIndex({ columnNames: ['created_at'] }));
    
    // 设置 status 列的默认值和 NOT NULL 约束
    await queryRunner.query(`
      ALTER TABLE "atomic_settlements" 
      ALTER COLUMN "status" SET DEFAULT 'pending',
      ALTER COLUMN "status" SET NOT NULL;
    `);

    // 智能拆单表
    await queryRunner.createTable(
      new Table({
        name: 'smart_splits',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'split_id', type: 'varchar', length: '255', isUnique: true, isNullable: false },
          { name: 'user_id', type: 'uuid', isNullable: false },
          { name: 'agent_id', type: 'varchar', length: '255', isNullable: true },
          { name: 'original_order_id', type: 'varchar', length: '255', isNullable: true },
          { name: 'from_token', type: 'varchar', length: '255', isNullable: false },
          { name: 'to_token', type: 'varchar', length: '255', isNullable: false },
          { name: 'chain', type: 'varchar', length: '50', isNullable: false },
          { name: 'total_amount', type: 'decimal', precision: 18, scale: 6, isNullable: false },
          { name: 'split_strategy', type: 'varchar', length: '50', isNullable: false }, // 'time_weighted' | 'liquidity_weighted' | 'price_weighted' | 'custom'
          { name: 'split_config', type: 'jsonb', isNullable: false }, // 拆分配置
          { name: 'sub_orders', type: 'jsonb', isNullable: false }, // 子订单列表
          { name: 'execution_order', type: 'jsonb', isNullable: true }, // 执行顺序
          { name: 'status', type: 'varchar', length: '50', isNullable: true }, // 'pending' | 'splitting' | 'executing' | 'completed' | 'failed' | 'partial'
          { name: 'executed_count', type: 'integer', default: 0 },
          { name: 'success_count', type: 'integer', default: 0 },
          { name: 'failed_count', type: 'integer', default: 0 },
          { name: 'total_executed_amount', type: 'decimal', precision: 18, scale: 6, default: 0 },
          { name: 'started_at', type: 'timestamp', isNullable: true },
          { name: 'completed_at', type: 'timestamp', isNullable: true },
          { name: 'metadata', type: 'jsonb', isNullable: true },
          { name: 'created_at', type: 'timestamp', default: 'NOW()' },
          { name: 'updated_at', type: 'timestamp', default: 'NOW()' },
        ],
      }),
    );

    await queryRunner.createIndex('smart_splits', new TableIndex({ columnNames: ['split_id'] }));
    await queryRunner.createIndex('smart_splits', new TableIndex({ columnNames: ['user_id'] }));
    await queryRunner.createIndex('smart_splits', new TableIndex({ columnNames: ['status'] }));
    await queryRunner.createIndex('smart_splits', new TableIndex({ columnNames: ['created_at'] }));
    
    // 设置 status 列的默认值和 NOT NULL 约束
    await queryRunner.query(`
      ALTER TABLE "smart_splits" 
      ALTER COLUMN "status" SET DEFAULT 'pending',
      ALTER COLUMN "status" SET NOT NULL;
    `);

    // 批处理交易表
    await queryRunner.createTable(
      new Table({
        name: 'batch_executions',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'batch_id', type: 'varchar', length: '255', isUnique: true, isNullable: false },
          { name: 'user_id', type: 'uuid', isNullable: false },
          { name: 'agent_id', type: 'varchar', length: '255', isNullable: true },
          { name: 'batch_type', type: 'varchar', length: '50', isNullable: false }, // 'parallel' | 'sequential' | 'optimized'
          { name: 'orders', type: 'jsonb', isNullable: false }, // 订单列表
          { name: 'execution_plan', type: 'jsonb', isNullable: true }, // 执行计划
          { name: 'status', type: 'varchar', length: '50', isNullable: true }, // 'pending' | 'executing' | 'completed' | 'failed' | 'partial'
          { name: 'total_orders', type: 'integer', default: 0 },
          { name: 'executed_orders', type: 'integer', default: 0 },
          { name: 'success_orders', type: 'integer', default: 0 },
          { name: 'failed_orders', type: 'integer', default: 0 },
          { name: 'total_gas_saved', type: 'decimal', precision: 18, scale: 6, default: 0 }, // 节省的gas费用
          { name: 'started_at', type: 'timestamp', isNullable: true },
          { name: 'completed_at', type: 'timestamp', isNullable: true },
          { name: 'metadata', type: 'jsonb', isNullable: true },
          { name: 'created_at', type: 'timestamp', default: 'NOW()' },
          { name: 'updated_at', type: 'timestamp', default: 'NOW()' },
        ],
      }),
    );

    await queryRunner.createIndex('batch_executions', new TableIndex({ columnNames: ['batch_id'] }));
    await queryRunner.createIndex('batch_executions', new TableIndex({ columnNames: ['user_id'] }));
    await queryRunner.createIndex('batch_executions', new TableIndex({ columnNames: ['status'] }));
    await queryRunner.createIndex('batch_executions', new TableIndex({ columnNames: ['created_at'] }));
    
    // 设置 status 列的默认值和 NOT NULL 约束
    await queryRunner.query(`
      ALTER TABLE "batch_executions" 
      ALTER COLUMN "status" SET DEFAULT 'pending',
      ALTER COLUMN "status" SET NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('batch_executions');
    await queryRunner.dropTable('smart_splits');
    await queryRunner.dropTable('atomic_settlements');
  }
}

