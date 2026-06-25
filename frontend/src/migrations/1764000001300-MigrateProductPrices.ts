import { MigrationInterface, QueryRunner } from 'typeorm';

export class MigrateProductPrices1764000001300 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 检查 products 表中的列是否存在
    const productsTable = await queryRunner.getTable('products');
    const hasPriceColumn = productsTable?.findColumnByName('price');
    const hasCurrencyColumn = productsTable?.findColumnByName('currency');
    const hasCreatedAtColumn = productsTable?.findColumnByName('createdAt');
    const hasUpdatedAtColumn = productsTable?.findColumnByName('updatedAt');

    // 构建 SELECT 语句，根据列是否存在动态调整
    let priceExpression = '0';
    if (hasPriceColumn) {
      priceExpression = 'COALESCE(price, 0)';
    }

    let currencyExpression = "'USD'";
    if (hasCurrencyColumn) {
      currencyExpression = "COALESCE(currency, 'USD')";
    }

    let createdAtExpression = 'NOW()';
    if (hasCreatedAtColumn) {
      createdAtExpression = '"createdAt"';
    }

    let updatedAtExpression = 'NOW()';
    if (hasUpdatedAtColumn) {
      updatedAtExpression = '"updatedAt"';
    }

    // 将现有产品价格迁移到product_prices表
    await queryRunner.query(`
      INSERT INTO product_prices ("productId", "basePrice", "baseCurrency", "taxIncluded", "createdAt", "updatedAt")
      SELECT 
        id as "productId",
        ${priceExpression} as "basePrice",
        ${currencyExpression} as "baseCurrency",
        true as "taxIncluded",
        ${createdAtExpression} as "createdAt",
        ${updatedAtExpression} as "updatedAt"
      FROM products
      WHERE id NOT IN (SELECT "productId" FROM product_prices)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 回滚：删除迁移的数据
    await queryRunner.query(`
      DELETE FROM product_prices
      WHERE "createdAt" >= (SELECT MIN("createdAt") FROM product_prices)
    `);
  }
}

