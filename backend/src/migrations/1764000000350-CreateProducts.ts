import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateProducts1764000000350 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 检查表是否已存在
    const tableExists = await queryRunner.hasTable('products');
    
    if (!tableExists) {
      // 创建 products_status_enum 枚举类型
      await queryRunner.query(`
        DO $$ BEGIN
          CREATE TYPE "public"."products_status_enum" AS ENUM('active', 'inactive', 'out_of_stock');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);

      // 创建 products 表
      await queryRunner.createTable(
        new Table({
          name: 'products',
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
              name: 'name',
              type: 'varchar',
              isNullable: false,
            },
            {
              name: 'description',
              type: 'text',
              isNullable: true,
            },
            {
              name: 'price',
              type: 'decimal',
              precision: 15,
              scale: 2,
              isNullable: false,
            },
            {
              name: 'stock',
              type: 'integer',
              default: 0,
            },
            {
              name: 'category',
              type: 'varchar',
              isNullable: false,
            },
            {
              name: 'commissionRate',
              type: 'decimal',
              precision: 5,
              scale: 2,
              isNullable: true,
            },
            {
              name: 'productType',
              type: 'varchar',
              length: '50',
              default: "'physical'",
              isNullable: false,
            },
            {
              name: 'fixedCommissionRate',
              type: 'decimal',
              precision: 5,
              scale: 4,
              isNullable: true,
            },
            {
              name: 'allowCommissionAdjustment',
              type: 'boolean',
              default: false,
              isNullable: false,
            },
            {
              name: 'minCommissionRate',
              type: 'decimal',
              precision: 5,
              scale: 4,
              isNullable: true,
            },
            {
              name: 'maxCommissionRate',
              type: 'decimal',
              precision: 5,
              scale: 4,
              isNullable: true,
            },
            {
              name: 'status',
              type: 'enum',
              enum: ['active', 'inactive', 'out_of_stock'],
              enumName: 'products_status_enum',
              default: "'active'",
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

      // 创建外键（如果 users 表存在）
      const usersTableExists = await queryRunner.hasTable('users');
      if (usersTableExists) {
        await queryRunner.createForeignKey(
          'products',
          new TableForeignKey({
            columnNames: ['merchantId'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
        );
      }

      // 创建索引
      await queryRunner.createIndex(
        'products',
        new TableIndex({
          name: 'IDX_products_merchantId',
          columnNames: ['merchantId'],
        }),
      );

      await queryRunner.createIndex(
        'products',
        new TableIndex({
          name: 'IDX_products_status',
          columnNames: ['status'],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('products');
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."products_status_enum"`);
  }
}

