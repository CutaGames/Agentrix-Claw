import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class AddP0FeatureTables1766000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. 创建 budgets 表（预算管理）（检查是否已存在）
    const budgetsTableExists = await queryRunner.hasTable('budgets');
    if (!budgetsTableExists) {
      await queryRunner.createTable(
      new Table({
        name: 'budgets',
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
          },
          {
            name: 'category',
            type: 'varchar',
            length: '100',
            isNullable: true,
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
            name: 'period',
            type: 'enum',
            enum: ['daily', 'weekly', 'monthly', 'yearly'],
          },
          {
            name: 'startDate',
            type: 'date',
          },
          {
            name: 'endDate',
            type: 'date',
          },
          {
            name: 'spent',
            type: 'decimal',
            precision: 18,
            scale: 2,
            default: 0,
          },
          {
            name: 'remaining',
            type: 'decimal',
            precision: 18,
            scale: 2,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['active', 'exceeded', 'completed'],
            default: "'active'",
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

    // 创建 budgets 索引和外键（检查是否已存在）
    const budgetsTable = await queryRunner.getTable('budgets');
    if (budgetsTable) {
      const userIdIndexExists = budgetsTable.indices.some(
        (idx) => idx.name === 'IDX_budgets_userId',
      );
      if (!userIdIndexExists) {
        await queryRunner.createIndex(
          'budgets',
          new TableIndex({
            name: 'IDX_budgets_userId',
            columnNames: ['userId'],
          }),
        );
      }

      const statusIndexExists = budgetsTable.indices.some(
        (idx) => idx.name === 'IDX_budgets_status',
      );
      if (!statusIndexExists) {
        await queryRunner.createIndex(
          'budgets',
          new TableIndex({
            name: 'IDX_budgets_status',
            columnNames: ['status'],
          }),
        );
      }

      // 创建外键（检查是否已存在）
      const budgetsFkExists = budgetsTable.foreignKeys.some(
        (fk) =>
          fk.columnNames.includes('userId') &&
          fk.referencedTableName === 'users' &&
          fk.referencedColumnNames.includes('id'),
      );
      if (!budgetsFkExists && budgetsTable.findColumnByName('userId')) {
        // 先清理无效的 userId 数据（删除或设置为 NULL）
        await queryRunner.query(`
          DELETE FROM budgets 
          WHERE "userId" IS NOT NULL 
          AND "userId" NOT IN (SELECT id FROM users)
        `);
        
        await queryRunner.createForeignKey(
          'budgets',
          new TableForeignKey({
            columnNames: ['userId'],
            referencedColumnNames: ['id'],
            referencedTableName: 'users',
            onDelete: 'CASCADE',
          }),
        );
      }
    }

    // 2. 创建 subscriptions 表（订阅识别）（检查是否已存在）
    const subscriptionsTableExists = await queryRunner.hasTable('subscriptions');
    if (!subscriptionsTableExists) {
      await queryRunner.createTable(
      new Table({
        name: 'subscriptions',
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
          },
          {
            name: 'merchantId',
            type: 'uuid',
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
            name: 'interval',
            type: 'enum',
            enum: ['daily', 'weekly', 'monthly', 'yearly'],
          },
          {
            name: 'nextBillingDate',
            type: 'date',
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['active', 'paused', 'cancelled'],
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

    // 创建 subscriptions 索引和外键（检查是否已存在）
    const subscriptionsTable = await queryRunner.getTable('subscriptions');
    if (subscriptionsTable) {
      const userIdIndexExists = subscriptionsTable.indices.some(
        (idx) => idx.name === 'IDX_subscriptions_userId',
      );
      if (!userIdIndexExists) {
        await queryRunner.createIndex(
          'subscriptions',
          new TableIndex({
            name: 'IDX_subscriptions_userId',
            columnNames: ['userId'],
          }),
        );
      }

      const merchantIdIndexExists = subscriptionsTable.indices.some(
        (idx) => idx.name === 'IDX_subscriptions_merchantId',
      );
      if (!merchantIdIndexExists) {
        await queryRunner.createIndex(
          'subscriptions',
          new TableIndex({
            name: 'IDX_subscriptions_merchantId',
            columnNames: ['merchantId'],
          }),
        );
      }

      const statusIndexExists = subscriptionsTable.indices.some(
        (idx) => idx.name === 'IDX_subscriptions_status',
      );
      if (!statusIndexExists) {
        await queryRunner.createIndex(
          'subscriptions',
          new TableIndex({
            name: 'IDX_subscriptions_status',
            columnNames: ['status'],
          }),
        );
      }

      // 创建外键（检查是否已存在）
      const subscriptionsFkExists = subscriptionsTable.foreignKeys.some(
        (fk) =>
          fk.columnNames.includes('userId') &&
          fk.referencedTableName === 'users' &&
          fk.referencedColumnNames.includes('id'),
      );
      if (!subscriptionsFkExists && subscriptionsTable.findColumnByName('userId')) {
        // 先清理无效的 userId 数据
        await queryRunner.query(`
          DELETE FROM subscriptions 
          WHERE "userId" IS NOT NULL 
          AND "userId" NOT IN (SELECT id FROM users)
        `);
        
        await queryRunner.createForeignKey(
          'subscriptions',
          new TableForeignKey({
            columnNames: ['userId'],
            referencedColumnNames: ['id'],
            referencedTableName: 'users',
            onDelete: 'CASCADE',
          }),
        );
      }
    }

    // 3. 创建 fulfillment_records 表（发货记录）（检查是否已存在）
    const fulfillmentRecordsTableExists = await queryRunner.hasTable('fulfillment_records');
    if (!fulfillmentRecordsTableExists) {
      await queryRunner.createTable(
      new Table({
        name: 'fulfillment_records',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'orderId',
            type: 'uuid',
          },
          {
            name: 'paymentId',
            type: 'uuid',
          },
          {
            name: 'merchantId',
            type: 'uuid',
          },
          {
            name: 'type',
            type: 'enum',
            enum: ['physical', 'virtual', 'service'],
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'fulfilled', 'shipped', 'delivered'],
            default: "'pending'",
          },
          {
            name: 'trackingNumber',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'fulfilledAt',
            type: 'timestamp',
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

    // 创建 fulfillment_records 索引（检查是否已存在）
    const fulfillmentRecordsTable = await queryRunner.getTable('fulfillment_records');
    if (fulfillmentRecordsTable) {
      const orderIdIndexExists = fulfillmentRecordsTable.indices.some(
        (idx) => idx.name === 'IDX_fulfillment_records_orderId',
      );
      if (!orderIdIndexExists && fulfillmentRecordsTable.findColumnByName('orderId')) {
        await queryRunner.createIndex(
          'fulfillment_records',
          new TableIndex({
            name: 'IDX_fulfillment_records_orderId',
            columnNames: ['orderId'],
          }),
        );
      }

      const paymentIdIndexExists = fulfillmentRecordsTable.indices.some(
        (idx) => idx.name === 'IDX_fulfillment_records_paymentId',
      );
      if (!paymentIdIndexExists && fulfillmentRecordsTable.findColumnByName('paymentId')) {
        await queryRunner.createIndex(
          'fulfillment_records',
          new TableIndex({
            name: 'IDX_fulfillment_records_paymentId',
            columnNames: ['paymentId'],
          }),
        );
      }

      const merchantIdIndexExists = fulfillmentRecordsTable.indices.some(
        (idx) => idx.name === 'IDX_fulfillment_records_merchantId',
      );
      if (!merchantIdIndexExists && fulfillmentRecordsTable.findColumnByName('merchantId')) {
        await queryRunner.createIndex(
          'fulfillment_records',
          new TableIndex({
            name: 'IDX_fulfillment_records_merchantId',
            columnNames: ['merchantId'],
          }),
        );
      }
    }

    // 4. 创建 redemption_records 表（核销记录）（检查是否已存在）
    const redemptionRecordsTableExists = await queryRunner.hasTable('redemption_records');
    if (!redemptionRecordsTableExists) {
      await queryRunner.createTable(
      new Table({
        name: 'redemption_records',
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
          },
          {
            name: 'orderId',
            type: 'uuid',
          },
          {
            name: 'merchantId',
            type: 'uuid',
          },
          {
            name: 'type',
            type: 'enum',
            enum: ['membership', 'recharge', 'service'],
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'redeemed', 'failed'],
            default: "'pending'",
          },
          {
            name: 'redeemedAt',
            type: 'timestamp',
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

    // 创建 redemption_records 索引（检查是否已存在）
    const redemptionRecordsTable = await queryRunner.getTable('redemption_records');
    if (redemptionRecordsTable) {
      const paymentIdIndexExists = redemptionRecordsTable.indices.some(
        (idx) => idx.name === 'IDX_redemption_records_paymentId',
      );
      if (!paymentIdIndexExists && redemptionRecordsTable.findColumnByName('paymentId')) {
        await queryRunner.createIndex(
          'redemption_records',
          new TableIndex({
            name: 'IDX_redemption_records_paymentId',
            columnNames: ['paymentId'],
          }),
        );
      }

      const merchantIdIndexExists = redemptionRecordsTable.indices.some(
        (idx) => idx.name === 'IDX_redemption_records_merchantId',
      );
      if (!merchantIdIndexExists && redemptionRecordsTable.findColumnByName('merchantId')) {
        await queryRunner.createIndex(
          'redemption_records',
          new TableIndex({
            name: 'IDX_redemption_records_merchantId',
            columnNames: ['merchantId'],
          }),
        );
      }
    }

    // 5. 创建 transaction_classifications 表（交易分类）（检查是否已存在）
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
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'paymentId',
            type: 'uuid',
          },
          {
            name: 'category',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'subcategory',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'confidence',
            type: 'decimal',
            precision: 5,
            scale: 2,
          },
          {
            name: 'method',
            type: 'enum',
            enum: ['rule', 'ml', 'manual'],
            default: "'rule'",
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

    // 创建 transaction_classifications 索引（检查是否已存在，并检查列是否存在）
    const transactionClassificationsTable = await queryRunner.getTable('transaction_classifications');
    if (transactionClassificationsTable) {
      const hasPaymentId = transactionClassificationsTable.findColumnByName('paymentId');
      if (hasPaymentId) {
        const paymentIdIndexExists = transactionClassificationsTable.indices.some(
          (idx) => idx.name === 'IDX_transaction_classifications_paymentId',
        );
        if (!paymentIdIndexExists) {
          await queryRunner.createIndex(
            'transaction_classifications',
            new TableIndex({
              name: 'IDX_transaction_classifications_paymentId',
              columnNames: ['paymentId'],
            }),
          );
        }
      }

      const hasCategory = transactionClassificationsTable.findColumnByName('category');
      if (hasCategory) {
        const categoryIndexExists = transactionClassificationsTable.indices.some(
          (idx) => idx.name === 'IDX_transaction_classifications_category',
        );
        if (!categoryIndexExists) {
          await queryRunner.createIndex(
            'transaction_classifications',
            new TableIndex({
              name: 'IDX_transaction_classifications_category',
              columnNames: ['category'],
            }),
          );
        }
      }
    }

    // 6. 创建 referral_links 表（推广链接）（检查是否已存在）
    const referralLinksTableExists = await queryRunner.hasTable('referral_links');
    if (!referralLinksTableExists) {
      await queryRunner.createTable(
      new Table({
        name: 'referral_links',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '100',
            isPrimary: true,
          },
          {
            name: 'agentId',
            type: 'uuid',
          },
          {
            name: 'merchantId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'link',
            type: 'varchar',
            length: '500',
          },
          {
            name: 'shortLink',
            type: 'varchar',
            length: '200',
            isNullable: true,
          },
          {
            name: 'clicks',
            type: 'integer',
            default: 0,
          },
          {
            name: 'conversions',
            type: 'integer',
            default: 0,
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

    // 创建 referral_links 索引（检查是否已存在）
    const referralLinksTable = await queryRunner.getTable('referral_links');
    if (referralLinksTable) {
      const agentIdIndexExists = referralLinksTable.indices.some(
        (idx) => idx.name === 'IDX_referral_links_agentId',
      );
      if (!agentIdIndexExists && referralLinksTable.findColumnByName('agentId')) {
        await queryRunner.createIndex(
          'referral_links',
          new TableIndex({
            name: 'IDX_referral_links_agentId',
            columnNames: ['agentId'],
          }),
        );
      }
    }

    // 7. 创建 webhook_configs 表（Webhook配置）（检查是否已存在）
    const webhookConfigsTableExists = await queryRunner.hasTable('webhook_configs');
    if (!webhookConfigsTableExists) {
      await queryRunner.createTable(
      new Table({
        name: 'webhook_configs',
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
          },
          {
            name: 'url',
            type: 'varchar',
            length: '500',
          },
          {
            name: 'events',
            type: 'jsonb',
          },
          {
            name: 'secret',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'retryCount',
            type: 'integer',
            default: 3,
          },
          {
            name: 'timeout',
            type: 'integer',
            default: 5000,
          },
          {
            name: 'enabled',
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

    // 创建 webhook_configs 索引（检查是否已存在）
    const webhookConfigsTable = await queryRunner.getTable('webhook_configs');
    if (webhookConfigsTable) {
      const merchantIdIndexExists = webhookConfigsTable.indices.some(
        (idx) => idx.name === 'IDX_webhook_configs_merchantId',
      );
      if (!merchantIdIndexExists && webhookConfigsTable.findColumnByName('merchantId')) {
        await queryRunner.createIndex(
          'webhook_configs',
          new TableIndex({
            name: 'IDX_webhook_configs_merchantId',
            columnNames: ['merchantId'],
          }),
        );
      }
    }

    // 8. 创建 reconciliation_records 表（对账记录）（检查是否已存在）
    const reconciliationRecordsTableExists = await queryRunner.hasTable('reconciliation_records');
    if (!reconciliationRecordsTableExists) {
      await queryRunner.createTable(
      new Table({
        name: 'reconciliation_records',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '100',
            isPrimary: true,
          },
          {
            name: 'merchantId',
            type: 'uuid',
          },
          {
            name: 'date',
            type: 'date',
          },
          {
            name: 'type',
            type: 'enum',
            enum: ['T+0', 'T+1', 'T+7'],
          },
          {
            name: 'totalAmount',
            type: 'decimal',
            precision: 18,
            scale: 2,
          },
          {
            name: 'totalCount',
            type: 'integer',
          },
          {
            name: 'matchedCount',
            type: 'integer',
          },
          {
            name: 'unmatchedCount',
            type: 'integer',
          },
          {
            name: 'differences',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'completed', 'failed'],
            default: "'pending'",
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

    // 创建 reconciliation_records 索引（检查是否已存在）
    const reconciliationRecordsTable = await queryRunner.getTable('reconciliation_records');
    if (reconciliationRecordsTable) {
      const merchantIdIndexExists = reconciliationRecordsTable.indices.some(
        (idx) => idx.name === 'IDX_reconciliation_records_merchantId',
      );
      if (!merchantIdIndexExists && reconciliationRecordsTable.findColumnByName('merchantId')) {
        await queryRunner.createIndex(
          'reconciliation_records',
          new TableIndex({
            name: 'IDX_reconciliation_records_merchantId',
            columnNames: ['merchantId'],
          }),
        );
      }

      const dateIndexExists = reconciliationRecordsTable.indices.some(
        (idx) => idx.name === 'IDX_reconciliation_records_date',
      );
      if (!dateIndexExists && reconciliationRecordsTable.findColumnByName('date')) {
        await queryRunner.createIndex(
          'reconciliation_records',
          new TableIndex({
            name: 'IDX_reconciliation_records_date',
            columnNames: ['date'],
          }),
        );
      }
    }

    // 9. 创建 settlement_records 表（结算记录）（检查是否已存在）
    const settlementRecordsTableExists = await queryRunner.hasTable('settlement_records');
    if (!settlementRecordsTableExists) {
      await queryRunner.createTable(
      new Table({
        name: 'settlement_records',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '100',
            isPrimary: true,
          },
          {
            name: 'merchantId',
            type: 'uuid',
          },
          {
            name: 'period',
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
            name: 'status',
            type: 'enum',
            enum: ['pending', 'processing', 'completed', 'failed'],
            default: "'pending'",
          },
          {
            name: 'settledAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'transactionHash',
            type: 'varchar',
            length: '100',
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

    // 创建 settlement_records 索引（检查是否已存在）
    const settlementRecordsTable = await queryRunner.getTable('settlement_records');
    if (settlementRecordsTable) {
      const merchantIdIndexExists = settlementRecordsTable.indices.some(
        (idx) => idx.name === 'IDX_settlement_records_merchantId',
      );
      if (!merchantIdIndexExists && settlementRecordsTable.findColumnByName('merchantId')) {
        await queryRunner.createIndex(
          'settlement_records',
          new TableIndex({
            name: 'IDX_settlement_records_merchantId',
            columnNames: ['merchantId'],
          }),
        );
      }

      const statusIndexExists = settlementRecordsTable.indices.some(
        (idx) => idx.name === 'IDX_settlement_records_status',
      );
      if (!statusIndexExists && settlementRecordsTable.findColumnByName('status')) {
        await queryRunner.createIndex(
          'settlement_records',
          new TableIndex({
            name: 'IDX_settlement_records_status',
            columnNames: ['status'],
          }),
        );
      }
    }

    // 创建 fulfillment_records 外键（检查是否已存在）
    const fulfillmentRecordsTableForFk = await queryRunner.getTable('fulfillment_records');
    if (fulfillmentRecordsTableForFk) {
      const orderIdFkExists = fulfillmentRecordsTableForFk.foreignKeys.some(
        (fk) =>
          fk.columnNames.includes('orderId') &&
          fk.referencedTableName === 'orders' &&
          fk.referencedColumnNames.includes('id'),
      );
      if (!orderIdFkExists && fulfillmentRecordsTableForFk.findColumnByName('orderId')) {
        // 检查 orders 表是否存在
        const ordersTableExists = await queryRunner.hasTable('orders');
        
        if (ordersTableExists) {
          // orders 表存在，清理无效的 orderId 数据
          await queryRunner.query(`
            UPDATE fulfillment_records 
            SET "orderId" = NULL 
            WHERE "orderId" IS NOT NULL 
            AND "orderId" NOT IN (SELECT id FROM orders)
          `);
          
          // 创建外键
          await queryRunner.createForeignKey(
            'fulfillment_records',
            new TableForeignKey({
              columnNames: ['orderId'],
              referencedColumnNames: ['id'],
              referencedTableName: 'orders',
              onDelete: 'SET NULL',
            }),
          );
        } else {
          // orders 表不存在，直接清理所有非 NULL 的 orderId（不检查引用完整性）
          console.warn('⚠️  orders 表不存在，清理所有 fulfillment_records 中的 orderId');
          await queryRunner.query(`
            UPDATE fulfillment_records 
            SET "orderId" = NULL 
            WHERE "orderId" IS NOT NULL
          `);
          // 不创建外键，因为 orders 表不存在
        }
      }

      const paymentIdFkExists = fulfillmentRecordsTableForFk.foreignKeys.some(
        (fk) =>
          fk.columnNames.includes('paymentId') &&
          fk.referencedTableName === 'payments' &&
          fk.referencedColumnNames.includes('id'),
      );
      if (!paymentIdFkExists && fulfillmentRecordsTableForFk.findColumnByName('paymentId')) {
        // 检查 payments 表是否存在
        const paymentsTableExists = await queryRunner.hasTable('payments');
        
        if (paymentsTableExists) {
          // payments 表存在，清理无效的 paymentId 数据
          await queryRunner.query(`
            UPDATE fulfillment_records 
            SET "paymentId" = NULL 
            WHERE "paymentId" IS NOT NULL 
            AND "paymentId" NOT IN (SELECT id FROM payments)
          `);
          
          // 创建外键
          await queryRunner.createForeignKey(
            'fulfillment_records',
            new TableForeignKey({
              columnNames: ['paymentId'],
              referencedColumnNames: ['id'],
              referencedTableName: 'payments',
              onDelete: 'SET NULL',
            }),
          );
        } else {
          // payments 表不存在，直接清理所有非 NULL 的 paymentId（不检查引用完整性）
          console.warn('⚠️  payments 表不存在，清理所有 fulfillment_records 中的 paymentId');
          await queryRunner.query(`
            UPDATE fulfillment_records 
            SET "paymentId" = NULL 
            WHERE "paymentId" IS NOT NULL
          `);
          // 不创建外键，因为 payments 表不存在
        }
      }
    }

    const transactionClassificationsTableForFk = await queryRunner.getTable('transaction_classifications');
    if (transactionClassificationsTableForFk) {
      const paymentIdFkExists = transactionClassificationsTableForFk.foreignKeys.some(
        (fk) =>
          fk.columnNames.includes('paymentId') &&
          fk.referencedTableName === 'payments' &&
          fk.referencedColumnNames.includes('id'),
      );
      if (!paymentIdFkExists && transactionClassificationsTableForFk.findColumnByName('paymentId')) {
        // 清理无效的 paymentId 数据
        await queryRunner.query(`
          DELETE FROM transaction_classifications 
          WHERE "paymentId" IS NOT NULL 
          AND "paymentId" NOT IN (SELECT id FROM payments)
        `);
        
        await queryRunner.createForeignKey(
          'transaction_classifications',
          new TableForeignKey({
            columnNames: ['paymentId'],
            referencedColumnNames: ['id'],
            referencedTableName: 'payments',
            onDelete: 'CASCADE',
          }),
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 删除外键
    const tables = [
      'budgets',
      'subscriptions',
      'fulfillment_records',
      'redemption_records',
      'transaction_classifications',
      'referral_links',
      'webhook_configs',
      'reconciliation_records',
      'settlement_records',
    ];

    for (const tableName of tables) {
      const table = await queryRunner.getTable(tableName);
      if (table) {
        const foreignKeys = table.foreignKeys;
        for (const fk of foreignKeys) {
          await queryRunner.dropForeignKey(tableName, fk);
        }
      }
    }

    // 删除表
    await queryRunner.dropTable('settlement_records');
    await queryRunner.dropTable('reconciliation_records');
    await queryRunner.dropTable('webhook_configs');
    await queryRunner.dropTable('referral_links');
    await queryRunner.dropTable('transaction_classifications');
    await queryRunner.dropTable('redemption_records');
    await queryRunner.dropTable('fulfillment_records');
    await queryRunner.dropTable('subscriptions');
    await queryRunner.dropTable('budgets');
  }
}

