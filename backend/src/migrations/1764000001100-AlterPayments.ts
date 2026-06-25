import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class AlterPayments1764000001100 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 获取表对象（用于检查列和索引是否存在）
    const paymentsTable = await queryRunner.getTable('payments');

    // 添加国家代码字段（检查是否已存在）
    if (!paymentsTable?.findColumnByName('countryCode')) {
      await queryRunner.addColumn(
        'payments',
        new TableColumn({
          name: 'countryCode',
          type: 'varchar',
          length: '2',
          isNullable: true,
        }),
      );
    }

    // 添加税费金额字段（检查是否已存在）
    if (!paymentsTable?.findColumnByName('taxAmount')) {
      await queryRunner.addColumn(
        'payments',
        new TableColumn({
          name: 'taxAmount',
          type: 'decimal',
          precision: 18,
          scale: 2,
          isNullable: true,
        }),
      );
    }

    // 添加税费率字段（检查是否已存在）
    if (!paymentsTable?.findColumnByName('taxRate')) {
      await queryRunner.addColumn(
        'payments',
        new TableColumn({
          name: 'taxRate',
          type: 'decimal',
          precision: 5,
          scale: 4,
          isNullable: true,
        }),
      );
    }

    // 添加通道费用字段（检查是否已存在）
    if (!paymentsTable?.findColumnByName('channelFee')) {
      await queryRunner.addColumn(
        'payments',
        new TableColumn({
          name: 'channelFee',
          type: 'decimal',
          precision: 18,
          scale: 2,
          isNullable: true,
        }),
      );
    }

    // 添加佣金比例字段（检查是否已存在）
    if (!paymentsTable?.findColumnByName('commissionRate')) {
      await queryRunner.addColumn(
        'payments',
        new TableColumn({
          name: 'commissionRate',
          type: 'decimal',
          precision: 5,
          scale: 4,
          isNullable: true,
        }),
      );
    }

    // 添加Session ID字段（检查是否已存在）
    if (!paymentsTable?.findColumnByName('sessionId')) {
      await queryRunner.addColumn(
        'payments',
        new TableColumn({
          name: 'sessionId',
          type: 'uuid',
          isNullable: true,
        }),
      );
    }

    // 创建Session ID索引（检查是否已存在）
    const sessionIdIndexExists = paymentsTable?.indices.some(
      (idx) => idx.name === 'IDX_payments_session_id',
    );
    if (!sessionIdIndexExists) {
      await queryRunner.createIndex(
        'payments',
        new TableIndex({
          name: 'IDX_payments_session_id',
          columnNames: ['sessionId'],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('payments', 'IDX_payments_session_id');
    await queryRunner.dropColumn('payments', 'countryCode');
    await queryRunner.dropColumn('payments', 'taxAmount');
    await queryRunner.dropColumn('payments', 'taxRate');
    await queryRunner.dropColumn('payments', 'channelFee');
    await queryRunner.dropColumn('payments', 'commissionRate');
    await queryRunner.dropColumn('payments', 'sessionId');
  }
}

