import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateTradingEntities1738000001000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. 策略图（Strategy Graph）表
    await queryRunner.createTable(
      new Table({
        name: 'strategy_graphs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'agent_id',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'intent_text',
            type: 'text',
            isNullable: false,
            comment: '用户原始意图文本',
          },
          {
            name: 'strategy_type',
            type: 'varchar',
            length: '50',
            isNullable: false,
            comment: "策略类型: 'dca' | 'grid' | 'arbitrage' | 'rebalancing' | 'market_making'",
          },
          {
            name: 'status',
            type: 'varchar',
            length: '20',
            default: "'active'",
            comment: "状态: 'active' | 'paused' | 'completed' | 'cancelled'",
          },
          {
            name: 'config',
            type: 'jsonb',
            isNullable: false,
            comment: '策略配置（时间触发器、风险上下限、流动性路由等）',
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'NOW()',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'NOW()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'strategy_graphs',
      new TableIndex({
        name: 'IDX_strategy_graphs_user_id',
        columnNames: ['user_id'],
      }),
    );

    await queryRunner.createIndex(
      'strategy_graphs',
      new TableIndex({
        name: 'IDX_strategy_graphs_status',
        columnNames: ['status'],
      }),
    );

    // 2. 策略节点（Strategy Node）表
    await queryRunner.createTable(
      new Table({
        name: 'strategy_nodes',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'strategy_graph_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'node_type',
            type: 'varchar',
            length: '50',
            isNullable: false,
            comment: "节点类型: 'trigger' | 'monitor' | 'risk' | 'router' | 'executor'",
          },
          {
            name: 'node_config',
            type: 'jsonb',
            isNullable: false,
            comment: '节点配置',
          },
          {
            name: 'execution_order',
            type: 'integer',
            isNullable: false,
            comment: '执行顺序',
          },
          {
            name: 'status',
            type: 'varchar',
            length: '20',
            default: "'pending'",
            comment: "状态: 'pending' | 'running' | 'completed' | 'failed'",
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'NOW()',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'NOW()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'strategy_nodes',
      new TableIndex({
        name: 'IDX_strategy_nodes_graph_id',
        columnNames: ['strategy_graph_id'],
      }),
    );

    // 3. 市场监控器（Market Monitor）表
    await queryRunner.createTable(
      new Table({
        name: 'market_monitors',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'strategy_graph_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'token_pair',
            type: 'varchar',
            length: '100',
            isNullable: false,
            comment: '监控的交易对，如 BTC/USDC',
          },
          {
            name: 'chain',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'monitor_type',
            type: 'varchar',
            length: '50',
            isNullable: false,
            comment: "监控类型: 'price' | 'arbitrage' | 'liquidity' | 'volume'",
          },
          {
            name: 'threshold',
            type: 'jsonb',
            isNullable: false,
            comment: '触发阈值配置',
          },
          {
            name: 'last_price',
            type: 'decimal',
            precision: 18,
            scale: 6,
            isNullable: true,
          },
          {
            name: 'last_checked_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'NOW()',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'NOW()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'market_monitors',
      new TableIndex({
        name: 'IDX_market_monitors_token_pair',
        columnNames: ['token_pair', 'chain'],
      }),
    );

    // 4. 意图识别记录表
    await queryRunner.createTable(
      new Table({
        name: 'intent_records',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'agent_id',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'intent_text',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'recognized_intent',
            type: 'jsonb',
            isNullable: false,
            comment: '识别的意图和实体',
          },
          {
            name: 'confidence',
            type: 'decimal',
            precision: 5,
            scale: 2,
            isNullable: false,
            comment: '识别置信度 0-100',
          },
          {
            name: 'strategy_graph_id',
            type: 'uuid',
            isNullable: true,
            comment: '生成的策略图ID',
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'NOW()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'intent_records',
      new TableIndex({
        name: 'IDX_intent_records_user_id',
        columnNames: ['user_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('intent_records', true);
    await queryRunner.dropTable('market_monitors', true);
    await queryRunner.dropTable('strategy_nodes', true);
    await queryRunner.dropTable('strategy_graphs', true);
  }
}

