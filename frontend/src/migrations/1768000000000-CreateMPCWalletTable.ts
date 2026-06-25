import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateMPCWalletTable1768000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'mpc_wallets',
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
            length: '255',
          },
          {
            name: 'walletAddress',
            type: 'varchar',
            length: '255',
            isUnique: true,
          },
          {
            name: 'chain',
            type: 'varchar',
            length: '50',
            default: "'BSC'",
          },
          {
            name: 'currency',
            type: 'varchar',
            length: '50',
            default: "'USDC'",
          },
          {
            name: 'encryptedShardB',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
          },
          {
            name: 'autoSplitAuthorized',
            type: 'boolean',
            default: false,
          },
          {
            name: 'autoSplitMaxAmount',
            type: 'bigint',
            isNullable: true,
          },
          {
            name: 'autoSplitExpiresAt',
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
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // 创建索引
    await queryRunner.createIndex(
      'mpc_wallets',
      new TableIndex({
        name: 'IDX_mpc_wallets_merchantId',
        columnNames: ['merchantId'],
      }),
    );

    await queryRunner.createIndex(
      'mpc_wallets',
      new TableIndex({
        name: 'IDX_mpc_wallets_walletAddress',
        columnNames: ['walletAddress'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('mpc_wallets');
  }
}

