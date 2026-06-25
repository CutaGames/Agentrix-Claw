import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateOrders1764000000250 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 检查表是否已存在
    const tableExists = await queryRunner.hasTable('orders');
    
    if (!tableExists) {
      // 创建 OrderStatus 枚举类型
      await queryRunner.query(`
        DO $$ BEGIN
          CREATE TYPE "public"."orders_status_enum" AS ENUM('pending', 'paid', 'processing', 'pending_shipment', 'shipped', 'delivered', 'settled', 'frozen', 'refunded', 'cancelled', 'disputed', 'completed');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);

      // 创建 AssetType 枚举类型
      await queryRunner.query(`
        DO $$ BEGIN
          CREATE TYPE "public"."orders_assettype_enum" AS ENUM('physical', 'service', 'virtual', 'nft_rwa', 'dev_tool', 'aggregated_web2', 'aggregated_web3');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);

      // 创建 orders 表
      await queryRunner.createTable(
        new Table({
          name: 'orders',
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
              type: 'uuid',
              isNullable: false,
            },
            {
              name: 'merchantId',
              type: 'uuid',
              isNullable: false,
            },
            {
              name: 'productId',
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
              name: 'currency',
              type: 'varchar',
              length: '10',
              isNullable: false,
            },
            {
              name: 'status',
              type: 'enum',
              enum: ['pending', 'paid', 'processing', 'pending_shipment', 'shipped', 'delivered', 'settled', 'frozen', 'refunded', 'cancelled', 'disputed', 'completed'],
              enumName: 'orders_status_enum',
              default: "'pending'",
              isNullable: false,
            },
            {
              name: 'assetType',
              type: 'enum',
              enum: ['physical', 'service', 'virtual', 'nft_rwa', 'dev_tool', 'aggregated_web2', 'aggregated_web3'],
              enumName: 'orders_assettype_enum',
              default: "'physical'",
              isNullable: false,
            },
            {
              name: 'netRevenue',
              type: 'decimal',
              precision: 18,
              scale: 2,
              isNullable: true,
            },
            {
              name: 'platformTaxRate',
              type: 'decimal',
              precision: 5,
              scale: 4,
              isNullable: true,
            },
            {
              name: 'platformTax',
              type: 'decimal',
              precision: 18,
              scale: 2,
              isNullable: true,
            },
            {
              name: 'merchantNetAmount',
              type: 'decimal',
              precision: 18,
              scale: 2,
              isNullable: true,
            },
            {
              name: 'settlementTriggerTime',
              type: 'timestamptz',
              isNullable: true,
            },
            {
              name: 'settlementDueTime',
              type: 'timestamptz',
              isNullable: true,
            },
            {
              name: 'autoConfirmedAt',
              type: 'timestamptz',
              isNullable: true,
            },
            {
              name: 'isDisputed',
              type: 'boolean',
              default: false,
              isNullable: false,
            },
            {
              name: 'executorHasWallet',
              type: 'boolean',
              default: true,
              isNullable: false,
            },
            {
              name: 'paymentId',
              type: 'uuid',
              isNullable: true,
            },
            {
              name: 'agentId',
              type: 'uuid',
              isNullable: true,
            },
            {
              name: 'execAgentId',
              type: 'uuid',
              isNullable: true,
            },
            {
              name: 'refAgentId',
              type: 'uuid',
              isNullable: true,
            },
            {
              name: 'promoterId',
              type: 'uuid',
              isNullable: true,
            },
            {
              name: 'items',
              type: 'jsonb',
              isNullable: true,
            },
            {
              name: 'settlementTimeline',
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
            },
          ],
        }),
        true,
      );

      // 创建外键（检查依赖表是否存在）
      const usersTableExists = await queryRunner.hasTable('users');
      const productsTableExists = await queryRunner.hasTable('products');
      const paymentsTableExists = await queryRunner.hasTable('payments');

      if (usersTableExists) {
        // 创建 userId 外键
        await queryRunner.createForeignKey(
          'orders',
          new TableForeignKey({
            columnNames: ['userId'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
        );

        // 创建 merchantId 外键
        await queryRunner.createForeignKey(
          'orders',
          new TableForeignKey({
            columnNames: ['merchantId'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
        );
      } else {
        console.warn('⚠️  users 表不存在，跳过 orders 表的外键创建');
      }

      if (productsTableExists) {
        // 创建 productId 外键
        await queryRunner.createForeignKey(
          'orders',
          new TableForeignKey({
            columnNames: ['productId'],
            referencedTableName: 'products',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
        );
      } else {
        console.warn('⚠️  products 表不存在，跳过 orders 表的 productId 外键创建');
      }

      if (paymentsTableExists) {
        // 创建 paymentId 外键（可选，因为 paymentId 可以为 NULL）
        await queryRunner.createForeignKey(
          'orders',
          new TableForeignKey({
            columnNames: ['paymentId'],
            referencedTableName: 'payments',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          }),
        );
      }

      // 创建索引
      await queryRunner.createIndex(
        'orders',
        new TableIndex({
          name: 'IDX_orders_userId',
          columnNames: ['userId'],
        }),
      );

      await queryRunner.createIndex(
        'orders',
        new TableIndex({
          name: 'IDX_orders_merchantId',
          columnNames: ['merchantId'],
        }),
      );

      await queryRunner.createIndex(
        'orders',
        new TableIndex({
          name: 'IDX_orders_productId',
          columnNames: ['productId'],
        }),
      );

      await queryRunner.createIndex(
        'orders',
        new TableIndex({
          name: 'IDX_orders_status',
          columnNames: ['status'],
        }),
      );

      await queryRunner.createIndex(
        'orders',
        new TableIndex({
          name: 'IDX_orders_paymentId',
          columnNames: ['paymentId'],
        }),
      );

      await queryRunner.createIndex(
        'orders',
        new TableIndex({
          name: 'IDX_orders_createdAt',
          columnNames: ['createdAt'],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('orders');
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."orders_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."orders_assettype_enum"`);
  }
}

