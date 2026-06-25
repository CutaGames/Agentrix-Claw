import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateFoundationModels1738000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. 交易路由配置表
    await queryRunner.createTable(
      new Table({
        name: 'transaction_routes',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'source_chain',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'target_chain',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'payment_method',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'fee_structure',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'risk_level',
            type: 'varchar',
            length: '20',
            isNullable: false,
          },
          {
            name: 'success_rate',
            type: 'decimal',
            precision: 5,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'avg_execution_time',
            type: 'integer',
            isNullable: true,
            comment: '平均执行时间（毫秒）',
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'NOW()',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'NOW()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'transaction_routes',
      new TableIndex({
        name: 'IDX_transaction_routes_source_target',
        columnNames: ['source_chain', 'target_chain'],
      }),
    );

    // 2. 风险评分记录表
    // 注意：如果表已存在（由其他迁移创建），则跳过创建
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
              default: 'gen_random_uuid()',
            },
            {
              name: 'transaction_id',
              type: 'uuid',
              isNullable: true,
            },
            {
              name: 'user_id',
              type: 'uuid',
              isNullable: true,
            },
            {
              name: 'agent_id',
              type: 'varchar',
              length: '255',
              isNullable: true,
            },
            {
              name: 'risk_score',
              type: 'decimal',
              precision: 5,
              scale: 2,
              isNullable: false,
              comment: '风险评分 0-100',
            },
            {
              name: 'risk_level',
              type: 'varchar',
              length: '20',
              isNullable: false,
              comment: "风险等级: 'low' | 'medium' | 'high' | 'critical'",
            },
            {
              name: 'risk_factors',
              type: 'jsonb',
              isNullable: false,
            },
            {
              name: 'recommendation',
              type: 'text',
              isNullable: true,
            },
            {
              name: 'created_at',
              type: 'timestamp',
              default: 'NOW()',
            },
          ],
        }),
        true,
      );

      await queryRunner.createIndex(
        'risk_assessments',
        new TableIndex({
          name: 'IDX_risk_assessments_transaction_id',
          columnNames: ['transaction_id'],
        }),
      );

      await queryRunner.createIndex(
        'risk_assessments',
        new TableIndex({
          name: 'IDX_risk_assessments_user_id',
          columnNames: ['user_id'],
        }),
      );
    } else {
      // 表已存在，检查并创建缺失的索引（如果列存在）
      const table = await queryRunner.getTable('risk_assessments');
      const hasTransactionId = table?.findColumnByName('transaction_id');
      const hasUserId = table?.findColumnByName('user_id');
      
      if (hasTransactionId) {
        const indexExists = table?.indices.some(idx => idx.name === 'IDX_risk_assessments_transaction_id');
        if (!indexExists) {
          await queryRunner.createIndex(
            'risk_assessments',
            new TableIndex({
              name: 'IDX_risk_assessments_transaction_id',
              columnNames: ['transaction_id'],
            }),
          );
        }
      }
      
      if (hasUserId) {
        const indexExists = table?.indices.some(idx => idx.name === 'IDX_risk_assessments_user_id');
        if (!indexExists) {
          await queryRunner.createIndex(
            'risk_assessments',
            new TableIndex({
              name: 'IDX_risk_assessments_user_id',
              columnNames: ['user_id'],
            }),
          );
        }
      }
    }

    // 3. 手续费估算记录表
    await queryRunner.createTable(
      new Table({
        name: 'fee_estimates',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'route_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'amount',
            type: 'decimal',
            precision: 18,
            scale: 6,
            isNullable: false,
          },
          {
            name: 'currency',
            type: 'varchar',
            length: '10',
            isNullable: false,
          },
          {
            name: 'estimated_fee',
            type: 'decimal',
            precision: 18,
            scale: 6,
            isNullable: false,
          },
          {
            name: 'fee_breakdown',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'NOW()',
          },
        ],
      }),
      true,
    );

    // 4. 资产聚合表
    // 注意：如果表已存在（由其他迁移创建），则跳过创建
    const assetAggregationsTableExists = await queryRunner.hasTable('asset_aggregations');
    
    if (!assetAggregationsTableExists) {
      await queryRunner.createTable(
        new Table({
          name: 'asset_aggregations',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              default: 'gen_random_uuid()',
            },
            {
              name: 'user_id',
              type: 'uuid',
              isNullable: false,
            },
            {
              name: 'chain',
              type: 'varchar',
              length: '50',
              isNullable: false,
            },
            {
              name: 'token_address',
              type: 'varchar',
              length: '255',
              isNullable: false,
            },
            {
              name: 'token_symbol',
              type: 'varchar',
              length: '50',
              isNullable: false,
            },
            {
              name: 'balance',
              type: 'decimal',
              precision: 18,
              scale: 6,
              isNullable: false,
            },
            {
              name: 'usd_value',
              type: 'decimal',
              precision: 18,
              scale: 2,
              isNullable: true,
            },
            {
              name: 'last_synced_at',
              type: 'timestamp',
              isNullable: true,
            },
            {
              name: 'created_at',
              type: 'timestamp',
              default: 'NOW()',
            },
            {
              name: 'updated_at',
              type: 'timestamp',
              default: 'NOW()',
            },
          ],
        }),
        true,
      );

      await queryRunner.createIndex(
        'asset_aggregations',
        new TableIndex({
          name: 'IDX_asset_aggregations_user_id',
          columnNames: ['user_id'],
        }),
      );

      await queryRunner.createIndex(
        'asset_aggregations',
        new TableIndex({
          name: 'IDX_asset_aggregations_chain_token',
          columnNames: ['chain', 'token_address'],
        }),
      );
    } else {
      // 表已存在，检查并创建缺失的索引（如果列存在）
      const table = await queryRunner.getTable('asset_aggregations');
      const hasUserId = table?.findColumnByName('user_id');
      const hasChain = table?.findColumnByName('chain');
      const hasTokenAddress = table?.findColumnByName('token_address');
      
      if (hasUserId) {
        const indexExists = table?.indices.some(idx => idx.name === 'IDX_asset_aggregations_user_id');
        if (!indexExists) {
          await queryRunner.createIndex(
            'asset_aggregations',
            new TableIndex({
              name: 'IDX_asset_aggregations_user_id',
              columnNames: ['user_id'],
            }),
          );
        }
      }
      
      if (hasChain && hasTokenAddress) {
        const indexExists = table?.indices.some(idx => idx.name === 'IDX_asset_aggregations_chain_token');
        if (!indexExists) {
          await queryRunner.createIndex(
            'asset_aggregations',
            new TableIndex({
              name: 'IDX_asset_aggregations_chain_token',
              columnNames: ['chain', 'token_address'],
            }),
          );
        }
      }
    }

    // 5. 交易分类表
    // 注意：如果表已存在（由其他迁移创建），则跳过创建
    const transactionClassificationsTableExists = await queryRunner.hasTable('transaction_classifications');
    
    if (!transactionClassificationsTableExists) {
      await queryRunner.createTable(
      new Table({
        name: 'transaction_classifications',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'transaction_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'category',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'subcategory',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'tags',
            type: 'text',
            isArray: true,
            isNullable: true,
          },
          {
            name: 'confidence',
            type: 'decimal',
            precision: 5,
            scale: 2,
            isNullable: false,
            comment: '分类置信度 0-100',
          },
          {
            name: 'classified_at',
            type: 'timestamp',
            default: 'NOW()',
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'NOW()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'transaction_classifications',
      new TableIndex({
        name: 'IDX_transaction_classifications_transaction_id',
        columnNames: ['transaction_id'],
      }),
    );
    } else {
      // 表已存在，检查并创建缺失的索引（如果列存在）
      const table = await queryRunner.getTable('transaction_classifications');
      const hasTransactionId = table?.findColumnByName('transaction_id');
      
      if (hasTransactionId) {
        const indexExists = table?.indices.some(idx => idx.name === 'IDX_transaction_classifications_transaction_id');
        if (!indexExists) {
          await queryRunner.createIndex(
            'transaction_classifications',
            new TableIndex({
              name: 'IDX_transaction_classifications_transaction_id',
              columnNames: ['transaction_id'],
            }),
          );
        }
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('transaction_classifications', true);
    await queryRunner.dropTable('asset_aggregations', true);
    await queryRunner.dropTable('fee_estimates', true);
    await queryRunner.dropTable('risk_assessments', true);
    await queryRunner.dropTable('transaction_routes', true);
  }
}

