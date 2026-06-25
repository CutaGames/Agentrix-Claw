import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class AddPayIntentAndQuickPayGrant1763025405601 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // PayIntents表
    await queryRunner.createTable(
      new Table({
        name: 'pay_intents',
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
            name: 'type',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'varchar',
            default: "'created'",
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
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'orderId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'paymentId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'merchantId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'agentId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'paymentMethod',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'authorization',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'expiresAt',
            type: 'timestamp',
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
          {
            name: 'completedAt',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
    );

    // QuickPay Grants表
    await queryRunner.createTable(
      new Table({
        name: 'quick_pay_grants',
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
            name: 'status',
            type: 'varchar',
            default: "'active'",
          },
          {
            name: 'paymentMethod',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'permissions',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'expiresAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'usage',
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
          {
            name: 'revokedAt',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
    );

    // User Profiles表
    await queryRunner.createTable(
      new Table({
        name: 'user_profiles',
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
            isUnique: true,
            isNullable: false,
          },
          {
            name: 'preferences',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'behavior',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'recommendations',
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
    );

    // Merchant Tasks表
    await queryRunner.createTable(
      new Table({
        name: 'merchant_tasks',
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
            name: 'type',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'varchar',
            default: "'pending'",
          },
          {
            name: 'title',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'budget',
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
            name: 'requirements',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'progress',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'orderId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'agentId',
            type: 'uuid',
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
          {
            name: 'completedAt',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
    );

    // 创建外键
    await queryRunner.createForeignKey(
      'pay_intents',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'quick_pay_grants',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'user_profiles',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'merchant_tasks',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'merchant_tasks',
      new TableForeignKey({
        columnNames: ['merchantId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );

    // 创建索引
    await queryRunner.createIndex(
      'pay_intents',
      new TableIndex({
        name: 'IDX_pay_intents_userId',
        columnNames: ['userId'],
      }),
    );

    await queryRunner.createIndex(
      'pay_intents',
      new TableIndex({
        name: 'IDX_pay_intents_status',
        columnNames: ['status'],
      }),
    );

    await queryRunner.createIndex(
      'pay_intents',
      new TableIndex({
        name: 'IDX_pay_intents_expiresAt',
        columnNames: ['expiresAt'],
      }),
    );

    await queryRunner.createIndex(
      'quick_pay_grants',
      new TableIndex({
        name: 'IDX_quick_pay_grants_userId',
        columnNames: ['userId'],
      }),
    );

    await queryRunner.createIndex(
      'quick_pay_grants',
      new TableIndex({
        name: 'IDX_quick_pay_grants_status',
        columnNames: ['status'],
      }),
    );

    await queryRunner.createIndex(
      'user_profiles',
      new TableIndex({
        name: 'IDX_user_profiles_userId',
        columnNames: ['userId'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'merchant_tasks',
      new TableIndex({
        name: 'IDX_merchant_tasks_userId',
        columnNames: ['userId'],
      }),
    );

    await queryRunner.createIndex(
      'merchant_tasks',
      new TableIndex({
        name: 'IDX_merchant_tasks_merchantId',
        columnNames: ['merchantId'],
      }),
    );

    await queryRunner.createIndex(
      'merchant_tasks',
      new TableIndex({
        name: 'IDX_merchant_tasks_status',
        columnNames: ['status'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 删除索引
    await queryRunner.dropIndex('merchant_tasks', 'IDX_merchant_tasks_status');
    await queryRunner.dropIndex('merchant_tasks', 'IDX_merchant_tasks_merchantId');
    await queryRunner.dropIndex('merchant_tasks', 'IDX_merchant_tasks_userId');
    await queryRunner.dropIndex('user_profiles', 'IDX_user_profiles_userId');
    await queryRunner.dropIndex('quick_pay_grants', 'IDX_quick_pay_grants_status');
    await queryRunner.dropIndex('quick_pay_grants', 'IDX_quick_pay_grants_userId');
    await queryRunner.dropIndex('pay_intents', 'IDX_pay_intents_expiresAt');
    await queryRunner.dropIndex('pay_intents', 'IDX_pay_intents_status');
    await queryRunner.dropIndex('pay_intents', 'IDX_pay_intents_userId');

    // 删除外键
    const merchantTasksTable = await queryRunner.getTable('merchant_tasks');
    if (merchantTasksTable) {
      const foreignKeys = merchantTasksTable.foreignKeys || [];
      for (const fk of foreignKeys) {
        await queryRunner.dropForeignKey('merchant_tasks', fk);
      }
    }

    const userProfilesTable = await queryRunner.getTable('user_profiles');
    if (userProfilesTable) {
      const foreignKeys = userProfilesTable.foreignKeys || [];
      for (const fk of foreignKeys) {
        await queryRunner.dropForeignKey('user_profiles', fk);
      }
    }

    const quickPayGrantsTable = await queryRunner.getTable('quick_pay_grants');
    if (quickPayGrantsTable) {
      const foreignKeys = quickPayGrantsTable.foreignKeys || [];
      for (const fk of foreignKeys) {
        await queryRunner.dropForeignKey('quick_pay_grants', fk);
      }
    }

    const payIntentsTable = await queryRunner.getTable('pay_intents');
    if (payIntentsTable) {
      const foreignKeys = payIntentsTable.foreignKeys || [];
      for (const fk of foreignKeys) {
        await queryRunner.dropForeignKey('pay_intents', fk);
      }
    }

    // 删除表
    await queryRunner.dropTable('merchant_tasks');
    await queryRunner.dropTable('user_profiles');
    await queryRunner.dropTable('quick_pay_grants');
    await queryRunner.dropTable('pay_intents');
  }
}

