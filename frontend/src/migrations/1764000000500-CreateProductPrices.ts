import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateProductPrices1764000000500 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 检查表是否已存在
    const tableExists = await queryRunner.hasTable('product_prices');
    
    if (!tableExists) {
      await queryRunner.createTable(
        new Table({
          name: 'product_prices',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              generationStrategy: 'uuid',
              default: 'uuid_generate_v4()',
            },
            {
              name: 'productId',
              type: 'uuid',
              isNullable: false,
            },
            {
              name: 'basePrice',
              type: 'decimal',
              precision: 18,
              scale: 2,
              isNullable: false,
            },
            {
              name: 'baseCurrency',
              type: 'varchar',
              length: '3',
              isNullable: false,
            },
            {
              name: 'taxIncluded',
              type: 'boolean',
              default: true,
            },
            {
              name: 'createdAt',
              type: 'timestamp',
              default: 'now()',
            },
            {
              name: 'updatedAt',
              type: 'timestamp',
              default: 'now()',
            },
          ],
        }),
        true,
      );
    }

    // 获取表对象（用于检查索引和外键）
    const productPricesTable = await queryRunner.getTable('product_prices');
    
    // 创建唯一索引（检查是否已存在）
    const indexExists = productPricesTable?.indices.some(
      (idx) => idx.name === 'IDX_product_prices_product_id',
    );
    
    if (!indexExists) {
      await queryRunner.createIndex(
        'product_prices',
        new TableIndex({
          name: 'IDX_product_prices_product_id',
          columnNames: ['productId'],
          isUnique: true,
        }),
      );
    }

    // 创建外键（检查是否已存在，并且 products 表存在）
    const productsTableExists = await queryRunner.hasTable('products');
    
    if (productsTableExists) {
      const fkExists = productPricesTable?.foreignKeys.some(
        (fk) =>
          fk.columnNames.includes('productId') &&
          fk.referencedTableName === 'products' &&
          fk.referencedColumnNames.includes('id'),
      );
      
      if (!fkExists) {
        await queryRunner.createForeignKey(
          'product_prices',
          new TableForeignKey({
            columnNames: ['productId'],
            referencedTableName: 'products',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
        );
      }
    } else {
      console.warn('⚠️  products 表不存在，跳过外键创建。请确保 products 表在其他迁移中创建。');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('product_prices');
  }
}

