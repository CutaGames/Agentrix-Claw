import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateAutoEarnTables1738000001000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 创建 auto_earn_tasks 表
    await queryRunner.createTable(
      new Table({
        name: 'auto_earn_tasks',
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
            length: '255',
          },
          {
            name: 'agentId',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'type',
            type: 'enum',
            enum: ['airdrop', 'task', 'strategy', 'referral'],
          },
          {
            name: 'title',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['available', 'running', 'completed', 'failed', 'paused'],
            default: "'available'",
          },
          {
            name: 'rewardAmount',
            type: 'decimal',
            precision: 15,
            scale: 2,
            default: 0,
          },
          {
            name: 'rewardCurrency',
            type: 'varchar',
            length: '10',
            default: "'USDC'",
          },
          {
            name: 'rewardType',
            type: 'varchar',
            length: '20',
            default: "'token'",
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'requirements',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'completedAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'executionResult',
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

    // 创建索引
    await queryRunner.createIndex(
      'auto_earn_tasks',
      new TableIndex({
        name: 'IDX_auto_earn_tasks_userId_status',
        columnNames: ['userId', 'status'],
      }),
    );

    await queryRunner.createIndex(
      'auto_earn_tasks',
      new TableIndex({
        name: 'IDX_auto_earn_tasks_agentId_status',
        columnNames: ['agentId', 'status'],
      }),
    );

    // 创建 airdrops 表
    await queryRunner.createTable(
      new Table({
        name: 'airdrops',
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
            length: '255',
          },
          {
            name: 'agentId',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'projectName',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'chain',
            type: 'varchar',
            length: '50',
          },
          {
            name: 'tokenAddress',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'tokenSymbol',
            type: 'varchar',
            length: '20',
            isNullable: true,
          },
          {
            name: 'estimatedAmount',
            type: 'decimal',
            precision: 15,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'currency',
            type: 'varchar',
            length: '10',
            default: "'USDC'",
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['monitoring', 'eligible', 'claimed', 'expired', 'failed'],
            default: "'monitoring'",
          },
          {
            name: 'requirements',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'claimUrl',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'claimTransactionHash',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'claimedAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'expiresAt',
            type: 'timestamp',
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

    // 创建索引
    await queryRunner.createIndex(
      'airdrops',
      new TableIndex({
        name: 'IDX_airdrops_userId_status',
        columnNames: ['userId', 'status'],
      }),
    );

    await queryRunner.createIndex(
      'airdrops',
      new TableIndex({
        name: 'IDX_airdrops_chain_status',
        columnNames: ['chain', 'status'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('airdrops', true);
    await queryRunner.dropTable('auto_earn_tasks', true);
  }
}

