import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateCouponTables1738000002000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 创建 coupons 表
    await queryRunner.createTable(
      new Table({
        name: 'coupons',
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
            name: 'code',
            type: 'varchar',
            length: '50',
          },
          {
            name: 'name',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'type',
            type: 'enum',
            enum: ['percentage', 'fixed', 'free_shipping'],
            default: "'percentage'",
          },
          {
            name: 'value',
            type: 'decimal',
            precision: 10,
            scale: 2,
          },
          {
            name: 'minPurchaseAmount',
            type: 'decimal',
            precision: 10,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'maxDiscountAmount',
            type: 'decimal',
            precision: 10,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'validFrom',
            type: 'date',
            isNullable: true,
          },
          {
            name: 'validUntil',
            type: 'date',
            isNullable: true,
          },
          {
            name: 'usageLimit',
            type: 'int',
            default: 0,
          },
          {
            name: 'usedCount',
            type: 'int',
            default: 0,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['active', 'inactive', 'expired'],
            default: "'active'",
          },
          {
            name: 'applicableProducts',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'applicableCategories',
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
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // 创建索引
    await queryRunner.createIndex(
      'coupons',
      new TableIndex({
        name: 'IDX_coupons_merchantId_code',
        columnNames: ['merchantId', 'code'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'coupons',
      new TableIndex({
        name: 'IDX_coupons_merchantId',
        columnNames: ['merchantId'],
      }),
    );

    await queryRunner.createIndex(
      'coupons',
      new TableIndex({
        name: 'IDX_coupons_code',
        columnNames: ['code'],
      }),
    );

    // 创建 coupon_usages 表
    await queryRunner.createTable(
      new Table({
        name: 'coupon_usages',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'couponId',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'orderId',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'userId',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'discountAmount',
            type: 'decimal',
            precision: 10,
            scale: 2,
          },
          {
            name: 'originalAmount',
            type: 'decimal',
            precision: 10,
            scale: 2,
          },
          {
            name: 'finalAmount',
            type: 'decimal',
            precision: 10,
            scale: 2,
          },
          {
            name: 'usedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // 创建索引
    await queryRunner.createIndex(
      'coupon_usages',
      new TableIndex({
        name: 'IDX_coupon_usages_couponId_orderId',
        columnNames: ['couponId', 'orderId'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'coupon_usages',
      new TableIndex({
        name: 'IDX_coupon_usages_couponId',
        columnNames: ['couponId'],
      }),
    );

    await queryRunner.createIndex(
      'coupon_usages',
      new TableIndex({
        name: 'IDX_coupon_usages_orderId',
        columnNames: ['orderId'],
      }),
    );

    await queryRunner.createIndex(
      'coupon_usages',
      new TableIndex({
        name: 'IDX_coupon_usages_userId',
        columnNames: ['userId'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('coupon_usages', true);
    await queryRunner.dropTable('coupons', true);
  }
}

