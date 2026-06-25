import { MigrationInterface, QueryRunner, Table, TableIndex, TableColumn } from 'typeorm';

export class CreateP1P2Tables1738000003000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. 策略配置表
    await queryRunner.createTable(
      new Table({
        name: 'strategy_configs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'userId',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'agentId',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'type',
            type: 'enum',
            enum: ['arbitrage', 'launchpad', 'dca', 'grid', 'copy_trading'],
            isNullable: false,
          },
          {
            name: 'enabled',
            type: 'boolean',
            default: false,
          },
          {
            name: 'config',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'strategy_configs',
      new TableIndex({
        name: 'IDX_strategy_configs_userId_type',
        columnNames: ['userId', 'type'],
      }),
    );

    await queryRunner.createIndex(
      'strategy_configs',
      new TableIndex({
        name: 'IDX_strategy_configs_agentId_enabled',
        columnNames: ['agentId', 'enabled'],
      }),
    );

    // 2. 营销活动表
    await queryRunner.createTable(
      new Table({
        name: 'marketing_campaigns',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'merchantId',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'type',
            type: 'enum',
            enum: ['abandoned_cart', 'new_customer', 'repeat_customer', 'low_stock', 'price_drop'],
            isNullable: false,
          },
          {
            name: 'targetUsers',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'message',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'couponId',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'scheduledAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'sentAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'sent', 'failed'],
            default: "'pending'",
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'marketing_campaigns',
      new TableIndex({
        name: 'IDX_marketing_campaigns_merchantId_status',
        columnNames: ['merchantId', 'status'],
      }),
    );

    await queryRunner.createIndex(
      'marketing_campaigns',
      new TableIndex({
        name: 'IDX_marketing_campaigns_type_status',
        columnNames: ['type', 'status'],
      }),
    );

    // 3. Agent统计表
    await queryRunner.createTable(
      new Table({
        name: 'agent_stats',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'agentId',
            type: 'varchar',
            isUnique: true,
            isNullable: false,
          },
          {
            name: 'totalCalls',
            type: 'int',
            default: 0,
          },
          {
            name: 'totalRevenue',
            type: 'decimal',
            precision: 15,
            scale: 2,
            default: 0,
          },
          {
            name: 'totalUsers',
            type: 'int',
            default: 0,
          },
          {
            name: 'avgRating',
            type: 'decimal',
            precision: 3,
            scale: 2,
            default: 0,
          },
          {
            name: 'lastActiveAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'agent_stats',
      new TableIndex({
        name: 'IDX_agent_stats_agentId',
        columnNames: ['agentId'],
      }),
    );

    // 4. 对话历史表
    await queryRunner.createTable(
      new Table({
        name: 'conversation_histories',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'merchantId',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'customerId',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'message',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'response',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'context',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'conversation_histories',
      new TableIndex({
        name: 'IDX_conversation_histories_merchantId_customerId',
        columnNames: ['merchantId', 'customerId'],
      }),
    );

    await queryRunner.createIndex(
      'conversation_histories',
      new TableIndex({
        name: 'IDX_conversation_histories_merchantId_createdAt',
        columnNames: ['merchantId', 'createdAt'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('conversation_histories', true);
    await queryRunner.dropTable('agent_stats', true);
    await queryRunner.dropTable('marketing_campaigns', true);
    await queryRunner.dropTable('strategy_configs', true);
  }
}

