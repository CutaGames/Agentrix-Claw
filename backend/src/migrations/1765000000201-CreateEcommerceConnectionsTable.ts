import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateEcommerceConnectionsTable1765000000201 implements MigrationInterface {
  name = 'CreateEcommerceConnectionsTable1765000000201';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 创建电商平台连接表
    await queryRunner.createTable(
      new Table({
        name: 'ecommerce_connections',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'merchant_id',
            type: 'uuid',
          },
          {
            name: 'platform',
            type: 'enum',
            enum: ['shopify', 'woocommerce', 'etsy', 'amazon', 'ebay', 'custom'],
          },
          {
            name: 'store_name',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'store_url',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'credentials',
            type: 'jsonb',
          },
          {
            name: 'sync_config',
            type: 'jsonb',
            default: "'{}'",
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['connected', 'disconnected', 'syncing', 'error'],
            default: "'disconnected'",
          },
          {
            name: 'last_sync_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'sync_stats',
            type: 'jsonb',
            default: "'{}'",
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
        foreignKeys: [
          {
            columnNames: ['merchant_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );

    // 创建索引
    await queryRunner.createIndex(
      'ecommerce_connections',
      new TableIndex({
        name: 'IDX_ecommerce_connections_merchant_platform',
        columnNames: ['merchant_id', 'platform'],
      }),
    );

    // 创建商品同步映射表
    await queryRunner.createTable(
      new Table({
        name: 'product_sync_mappings',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'connection_id',
            type: 'uuid',
          },
          {
            name: 'product_id',
            type: 'uuid',
          },
          {
            name: 'external_product_id',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'platform',
            type: 'enum',
            enum: ['shopify', 'woocommerce', 'etsy', 'amazon', 'ebay', 'custom'],
          },
          {
            name: 'external_data',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'sync_direction',
            type: 'varchar',
            length: '20',
            default: "'import'",
          },
          {
            name: 'last_synced_at',
            type: 'timestamp',
          },
          {
            name: 'sync_version',
            type: 'int',
            default: 1,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
        foreignKeys: [
          {
            columnNames: ['connection_id'],
            referencedTableName: 'ecommerce_connections',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            columnNames: ['product_id'],
            referencedTableName: 'products',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );

    // 创建唯一索引
    await queryRunner.createIndex(
      'product_sync_mappings',
      new TableIndex({
        name: 'IDX_product_sync_mappings_connection_external_unique',
        columnNames: ['connection_id', 'external_product_id'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'product_sync_mappings',
      new TableIndex({
        name: 'IDX_product_sync_mappings_product_id',
        columnNames: ['product_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('product_sync_mappings');
    await queryRunner.dropTable('ecommerce_connections');
  }
}
