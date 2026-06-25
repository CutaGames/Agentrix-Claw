import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AlterProducts1764000001000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 获取表对象（用于检查列是否存在）
    const productsTable = await queryRunner.getTable('products');

    // 添加产品类型字段（检查是否已存在）
    const productTypeColumn = productsTable?.findColumnByName('productType');
    if (!productTypeColumn) {
      await queryRunner.addColumn(
        'products',
        new TableColumn({
          name: 'productType',
          type: 'varchar',
          length: '50',
          default: "'physical'",
          isNullable: false,
        }),
      );
    }

    // 添加固定佣金比例字段（检查是否已存在）
    const commissionRateColumn = productsTable?.findColumnByName('commissionRate');
    if (!commissionRateColumn) {
      await queryRunner.addColumn(
        'products',
        new TableColumn({
          name: 'commissionRate',
          type: 'decimal',
          precision: 5,
          scale: 4,
          isNullable: true,
        }),
      );
    }

    // 添加是否允许调整佣金字段（检查是否已存在）
    const allowCommissionAdjustmentColumn = productsTable?.findColumnByName('allowCommissionAdjustment');
    if (!allowCommissionAdjustmentColumn) {
      await queryRunner.addColumn(
        'products',
        new TableColumn({
          name: 'allowCommissionAdjustment',
          type: 'boolean',
          default: false,
          isNullable: false,
        }),
      );
    }

    // 添加最低佣金比例字段（检查是否已存在）
    const minCommissionRateColumn = productsTable?.findColumnByName('minCommissionRate');
    if (!minCommissionRateColumn) {
      await queryRunner.addColumn(
        'products',
        new TableColumn({
          name: 'minCommissionRate',
          type: 'decimal',
          precision: 5,
          scale: 4,
          isNullable: true,
        }),
      );
    }

    // 添加最高佣金比例字段（检查是否已存在）
    const maxCommissionRateColumn = productsTable?.findColumnByName('maxCommissionRate');
    if (!maxCommissionRateColumn) {
      await queryRunner.addColumn(
        'products',
        new TableColumn({
          name: 'maxCommissionRate',
          type: 'decimal',
          precision: 5,
          scale: 4,
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('products', 'productType');
    await queryRunner.dropColumn('products', 'commissionRate');
    await queryRunner.dropColumn('products', 'allowCommissionAdjustment');
    await queryRunner.dropColumn('products', 'minCommissionRate');
    await queryRunner.dropColumn('products', 'maxCommissionRate');
  }
}

