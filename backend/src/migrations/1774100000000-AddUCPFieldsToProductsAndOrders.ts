import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddUCPFieldsToProductsAndOrders1774100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add UCP fields to products table
    await queryRunner.addColumn(
      'products',
      new TableColumn({
        name: 'ucp_enabled',
        type: 'boolean',
        default: true,
      }),
    );

    await queryRunner.addColumn(
      'products',
      new TableColumn({
        name: 'ucp_checkout_endpoint',
        type: 'varchar',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'products',
      new TableColumn({
        name: 'x402_enabled',
        type: 'boolean',
        default: false,
      }),
    );

    await queryRunner.addColumn(
      'products',
      new TableColumn({
        name: 'x402_service_endpoint',
        type: 'varchar',
        isNullable: true,
      }),
    );

    // Add UCP fields to orders table
    await queryRunner.addColumn(
      'orders',
      new TableColumn({
        name: 'ucp_enabled',
        type: 'boolean',
        default: false,
      }),
    );

    await queryRunner.addColumn(
      'orders',
      new TableColumn({
        name: 'ucp_session_id',
        type: 'varchar',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'orders',
      new TableColumn({
        name: 'x402_enabled',
        type: 'boolean',
        default: false,
      }),
    );

    await queryRunner.addColumn(
      'orders',
      new TableColumn({
        name: 'x402_payment_id',
        type: 'varchar',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove columns from orders
    await queryRunner.dropColumn('orders', 'x402_payment_id');
    await queryRunner.dropColumn('orders', 'x402_enabled');
    await queryRunner.dropColumn('orders', 'ucp_session_id');
    await queryRunner.dropColumn('orders', 'ucp_enabled');

    // Remove columns from products
    await queryRunner.dropColumn('products', 'x402_service_endpoint');
    await queryRunner.dropColumn('products', 'x402_enabled');
    await queryRunner.dropColumn('products', 'ucp_checkout_endpoint');
    await queryRunner.dropColumn('products', 'ucp_enabled');
  }
}
