import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateProductReviewsTable1765000000200 implements MigrationInterface {
  name = 'CreateProductReviewsTable1765000000200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 创建商品审核表
    await queryRunner.createTable(
      new Table({
        name: 'product_reviews',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'product_id',
            type: 'uuid',
          },
          {
            name: 'merchant_id',
            type: 'uuid',
          },
          {
            name: 'type',
            type: 'enum',
            enum: ['new_product', 'product_update', 'resubmission'],
            default: "'new_product'",
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'approved', 'rejected', 'needs_revision'],
            default: "'pending'",
          },
          {
            name: 'product_snapshot',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'reviewer_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'review_comment',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'rejection_reason',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'revision_fields',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'auto_review_result',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'submitted_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'reviewed_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
        foreignKeys: [
          {
            columnNames: ['product_id'],
            referencedTableName: 'products',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            columnNames: ['merchant_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            columnNames: ['reviewer_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          },
        ],
      }),
      true,
    );

    // 创建索引
    await queryRunner.createIndex(
      'product_reviews',
      new TableIndex({
        name: 'IDX_product_reviews_product_status',
        columnNames: ['product_id', 'status'],
      }),
    );

    await queryRunner.createIndex(
      'product_reviews',
      new TableIndex({
        name: 'IDX_product_reviews_merchant_status',
        columnNames: ['merchant_id', 'status'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('product_reviews');
  }
}
