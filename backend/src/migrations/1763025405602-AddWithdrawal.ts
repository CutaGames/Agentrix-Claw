import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class AddWithdrawal1763025405602 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 创建 withdrawals_status_enum 枚举类型
    await queryRunner.query(`
      CREATE TYPE "withdrawals_status_enum" AS ENUM('pending', 'processing', 'completed', 'failed', 'cancelled')
    `);

    // 创建 withdrawals 表
    await queryRunner.createTable(
      new Table({
        name: 'withdrawals',
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
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'amount',
            type: 'decimal',
            precision: 15,
            scale: 2,
            isNullable: false,
          },
          {
            name: 'fromCurrency',
            type: 'varchar',
            length: '10',
            isNullable: false,
          },
          {
            name: 'toCurrency',
            type: 'varchar',
            length: '10',
            isNullable: false,
          },
          {
            name: 'exchangeRate',
            type: 'decimal',
            precision: 15,
            scale: 2,
            isNullable: false,
          },
          {
            name: 'finalAmount',
            type: 'decimal',
            precision: 15,
            scale: 2,
            isNullable: false,
          },
          {
            name: 'providerFee',
            type: 'decimal',
            precision: 15,
            scale: 2,
            isNullable: false,
          },
          {
            name: 'agentrixFee',
            type: 'decimal',
            precision: 15,
            scale: 2,
            isNullable: false,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
            default: "'pending'",
          },
          {
            name: 'providerId',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'providerTransactionId',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'transactionHash',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'bankAccount',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'failureReason',
            type: 'text',
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

    // 创建外键
    await queryRunner.createForeignKey(
      'withdrawals',
      new TableForeignKey({
        columnNames: ['merchantId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );

    // 创建索引
    await queryRunner.createIndex(
      'withdrawals',
      new TableIndex({
        name: 'IDX_withdrawals_merchantId',
        columnNames: ['merchantId'],
      }),
    );

    await queryRunner.createIndex(
      'withdrawals',
      new TableIndex({
        name: 'IDX_withdrawals_status',
        columnNames: ['status'],
      }),
    );

    await queryRunner.createIndex(
      'withdrawals',
      new TableIndex({
        name: 'IDX_withdrawals_createdAt',
        columnNames: ['createdAt'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 删除索引
    await queryRunner.dropIndex('withdrawals', 'IDX_withdrawals_createdAt');
    await queryRunner.dropIndex('withdrawals', 'IDX_withdrawals_status');
    await queryRunner.dropIndex('withdrawals', 'IDX_withdrawals_merchantId');

    // 删除外键
    const table = await queryRunner.getTable('withdrawals');
    const foreignKey = table.foreignKeys.find(
      (fk) => fk.columnNames.indexOf('merchantId') !== -1,
    );
    if (foreignKey) {
      await queryRunner.dropForeignKey('withdrawals', foreignKey);
    }

    // 删除表
    await queryRunner.dropTable('withdrawals');

    // 删除枚举类型
    await queryRunner.query(`DROP TYPE IF EXISTS "withdrawals_status_enum"`);
  }
}

