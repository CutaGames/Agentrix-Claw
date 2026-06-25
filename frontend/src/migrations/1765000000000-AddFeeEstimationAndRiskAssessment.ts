import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class AddFeeEstimationAndRiskAssessment1765000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 创建 fee_estimations 表（检查是否已存在）
    const feeEstimationsTableExists = await queryRunner.hasTable('fee_estimations');
    if (!feeEstimationsTableExists) {
      await queryRunner.createTable(
        new Table({
          name: 'fee_estimations',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              generationStrategy: 'uuid',
              default: 'uuid_generate_v4()',
            },
            {
              name: 'payment_method',
              type: 'varchar',
              length: '50',
            },
            {
              name: 'amount',
              type: 'decimal',
              precision: 18,
              scale: 2,
            },
            {
              name: 'currency',
              type: 'varchar',
              length: '3',
            },
            {
              name: 'estimated_fee',
              type: 'decimal',
              precision: 18,
              scale: 2,
            },
            {
              name: 'fee_breakdown',
              type: 'jsonb',
              isNullable: true,
            },
            {
              name: 'total_cost',
              type: 'decimal',
              precision: 18,
              scale: 2,
            },
            {
              name: 'fee_rate',
              type: 'decimal',
              precision: 5,
              scale: 2,
            },
            {
              name: 'estimated_time',
              type: 'integer',
              isNullable: true,
            },
            {
              name: 'created_at',
              type: 'timestamp',
              default: 'now()',
            },
          ],
        }),
        true,
      );
    }

    // 创建 fee_estimations 索引（检查是否已存在）
    const feeEstimationsTable = await queryRunner.getTable('fee_estimations');
    if (feeEstimationsTable) {
      const paymentMethodIndexExists = feeEstimationsTable.indices.some(
        (idx) => idx.name === 'IDX_fee_estimations_payment_method',
      );
      if (!paymentMethodIndexExists) {
        await queryRunner.createIndex(
          'fee_estimations',
          new TableIndex({
            name: 'IDX_fee_estimations_payment_method',
            columnNames: ['payment_method'],
          }),
        );
      }

      const createdAtIndexExists = feeEstimationsTable.indices.some(
        (idx) => idx.name === 'IDX_fee_estimations_created_at',
      );
      if (!createdAtIndexExists) {
        await queryRunner.createIndex(
          'fee_estimations',
          new TableIndex({
            name: 'IDX_fee_estimations_created_at',
            columnNames: ['created_at'],
          }),
        );
      }
    }

    // 创建 risk_assessments 表（检查是否已存在）
    const riskAssessmentsTableExists = await queryRunner.hasTable('risk_assessments');
    if (!riskAssessmentsTableExists) {
      await queryRunner.createTable(
        new Table({
          name: 'risk_assessments',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              generationStrategy: 'uuid',
              default: 'uuid_generate_v4()',
            },
            {
              name: 'paymentId',
              type: 'uuid',
              isNullable: true,
            },
            {
              name: 'userId',
              type: 'uuid',
              isNullable: true,
            },
            {
              name: 'riskScore',
              type: 'decimal',
              precision: 5,
              scale: 2,
            },
            {
              name: 'riskLevel',
              type: 'enum',
              enum: ['low', 'medium', 'high'],
            },
            {
              name: 'decision',
              type: 'enum',
              enum: ['approve', 'review', 'reject'],
            },
            {
              name: 'riskFactors',
              type: 'jsonb',
              isNullable: true,
            },
            {
              name: 'recommendation',
              type: 'text',
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
              default: 'now()',
            },
          ],
        }),
        true,
      );
    }

    // 创建 risk_assessments 索引（检查是否已存在，并检查列是否存在）
    const riskAssessmentsTable = await queryRunner.getTable('risk_assessments');
    if (riskAssessmentsTable) {
      // 检查 paymentId 列是否存在
      const hasPaymentIdColumn = riskAssessmentsTable.findColumnByName('paymentId');
      if (hasPaymentIdColumn) {
        const paymentIdIndexExists = riskAssessmentsTable.indices.some(
          (idx) => idx.name === 'IDX_risk_assessments_paymentId',
        );
        if (!paymentIdIndexExists) {
          await queryRunner.createIndex(
            'risk_assessments',
            new TableIndex({
              name: 'IDX_risk_assessments_paymentId',
              columnNames: ['paymentId'],
            }),
          );
        }
      } else {
        console.warn('⚠️  risk_assessments 表缺少 paymentId 列，跳过 paymentId 索引创建');
      }

      // 检查 userId 列是否存在
      const hasUserIdColumn = riskAssessmentsTable.findColumnByName('userId');
      if (hasUserIdColumn) {
        const userIdIndexExists = riskAssessmentsTable.indices.some(
          (idx) => idx.name === 'IDX_risk_assessments_userId',
        );
        if (!userIdIndexExists) {
          await queryRunner.createIndex(
            'risk_assessments',
            new TableIndex({
              name: 'IDX_risk_assessments_userId',
              columnNames: ['userId'],
            }),
          );
        }
      } else {
        console.warn('⚠️  risk_assessments 表缺少 userId 列，跳过 userId 索引创建');
      }

      // 检查 createdAt 列是否存在
      const hasCreatedAtColumn = riskAssessmentsTable.findColumnByName('createdAt');
      if (hasCreatedAtColumn) {
        const createdAtIndexExists = riskAssessmentsTable.indices.some(
          (idx) => idx.name === 'IDX_risk_assessments_createdAt',
        );
        if (!createdAtIndexExists) {
          await queryRunner.createIndex(
            'risk_assessments',
            new TableIndex({
              name: 'IDX_risk_assessments_createdAt',
              columnNames: ['createdAt'],
            }),
          );
        }
      }

      // 检查 riskLevel 列是否存在
      const hasRiskLevelColumn = riskAssessmentsTable.findColumnByName('riskLevel');
      if (hasRiskLevelColumn) {
        const riskLevelIndexExists = riskAssessmentsTable.indices.some(
          (idx) => idx.name === 'IDX_risk_assessments_riskLevel',
        );
        if (!riskLevelIndexExists) {
          await queryRunner.createIndex(
            'risk_assessments',
            new TableIndex({
              name: 'IDX_risk_assessments_riskLevel',
              columnNames: ['riskLevel'],
            }),
          );
        }
      }

      // 创建外键（检查是否已存在，并检查列和表是否存在）
      // 重用之前检查的列（避免重复声明）
      const hasPaymentIdColumnForFk = riskAssessmentsTable.findColumnByName('paymentId');
      const paymentsTableExists = await queryRunner.hasTable('payments');
      
      if (hasPaymentIdColumnForFk && paymentsTableExists) {
        const paymentIdFkExists = riskAssessmentsTable.foreignKeys.some(
          (fk) =>
            fk.columnNames.includes('paymentId') &&
            fk.referencedTableName === 'payments' &&
            fk.referencedColumnNames.includes('id'),
        );
        if (!paymentIdFkExists) {
          await queryRunner.createForeignKey(
            'risk_assessments',
            new TableForeignKey({
              columnNames: ['paymentId'],
              referencedColumnNames: ['id'],
              referencedTableName: 'payments',
              onDelete: 'SET NULL',
            }),
          );
        }
      } else {
        if (!hasPaymentIdColumnForFk) {
          console.warn('⚠️  risk_assessments 表缺少 paymentId 列，跳过外键创建');
        }
        if (!paymentsTableExists) {
          console.warn('⚠️  payments 表不存在，跳过 paymentId 外键创建');
        }
      }

      // 重用之前检查的列（避免重复声明）
      const hasUserIdColumnForFk = riskAssessmentsTable.findColumnByName('userId');
      const usersTableExists = await queryRunner.hasTable('users');
      
      if (hasUserIdColumnForFk && usersTableExists) {
        const userIdFkExists = riskAssessmentsTable.foreignKeys.some(
          (fk) =>
            fk.columnNames.includes('userId') &&
            fk.referencedTableName === 'users' &&
            fk.referencedColumnNames.includes('id'),
        );
        if (!userIdFkExists) {
          await queryRunner.createForeignKey(
            'risk_assessments',
            new TableForeignKey({
              columnNames: ['userId'],
              referencedColumnNames: ['id'],
              referencedTableName: 'users',
              onDelete: 'SET NULL',
            }),
          );
        }
      } else {
        if (!hasUserIdColumnForFk) {
          console.warn('⚠️  risk_assessments 表缺少 userId 列，跳过外键创建');
        }
        if (!usersTableExists) {
          console.warn('⚠️  users 表不存在，跳过 userId 外键创建');
        }
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 删除外键
    const riskAssessmentsTable = await queryRunner.getTable('risk_assessments');
    if (riskAssessmentsTable) {
      const foreignKeys = riskAssessmentsTable.foreignKeys;
      for (const fk of foreignKeys) {
        await queryRunner.dropForeignKey('risk_assessments', fk);
      }
    }

    // 删除表
    await queryRunner.dropTable('risk_assessments');
    await queryRunner.dropTable('fee_estimations');
  }
}

