import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateAdminTables1769000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. 创建 admin_roles 表（检查是否已存在）
    const adminRolesTableExists = await queryRunner.hasTable('admin_roles');
    if (!adminRolesTableExists) {
      await queryRunner.createTable(
      new Table({
        name: 'admin_roles',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'name',
            type: 'varchar',
            length: '100',
            isUnique: true,
            isNullable: false,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'type',
            type: 'enum',
            enum: ['super_admin', 'operations', 'support', 'finance', 'tech', 'read_only'],
            isNullable: false,
          },
          {
            name: 'permissions',
            type: 'text',
              isArray: true,
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
    }

    // 2. 创建 admin_users 表（检查是否已存在）
    const adminUsersTableExists = await queryRunner.hasTable('admin_users');
    if (!adminUsersTableExists) {
      await queryRunner.createTable(
      new Table({
        name: 'admin_users',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'username',
            type: 'varchar',
            length: '100',
            isUnique: true,
            isNullable: false,
          },
          {
            name: 'email',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'passwordHash',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'fullName',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['active', 'inactive', 'suspended'],
            default: "'active'",
            isNullable: false,
          },
          {
            name: 'avatarUrl',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'lastLoginAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'lastLoginIp',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'roleId',
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
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );
    }

    // 3. 创建 admin_logs 表（检查是否已存在）
    const adminLogsTableExists = await queryRunner.hasTable('admin_logs');
    if (!adminLogsTableExists) {
      await queryRunner.createTable(
      new Table({
        name: 'admin_logs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'adminUserId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'action',
            type: 'enum',
            enum: [
              'user_create',
              'user_update',
              'user_delete',
              'user_freeze',
              'user_unfreeze',
              'user_kyc_approve',
              'user_kyc_reject',
              'merchant_create',
              'merchant_update',
              'merchant_delete',
              'merchant_freeze',
              'merchant_unfreeze',
              'merchant_kyc_approve',
              'merchant_kyc_reject',
              'product_approve',
              'product_reject',
              'product_delete',
              'order_refund',
              'order_cancel',
              'settlement_process',
              'withdrawal_approve',
              'withdrawal_reject',
              'config_update',
              'role_update',
              'permission_update',
              'risk_rule_create',
              'risk_rule_update',
              'risk_rule_delete',
              'risk_order_block',
              'risk_order_release',
            ],
            isNullable: false,
          },
          {
            name: 'resourceType',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'resourceId',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'ipAddress',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'userAgent',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );
    }

    // 4. 创建 admin_configs 表（检查是否已存在）
    const adminConfigsTableExists = await queryRunner.hasTable('admin_configs');
    if (!adminConfigsTableExists) {
      await queryRunner.createTable(
      new Table({
        name: 'admin_configs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'key',
            type: 'varchar',
            length: '255',
            isUnique: true,
            isNullable: false,
          },
          {
            name: 'category',
            type: 'enum',
            enum: ['platform', 'payment', 'commission', 'marketing', 'risk', 'system'],
            isNullable: false,
          },
          {
            name: 'value',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'isPublic',
            type: 'boolean',
            default: true,
            isNullable: false,
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
    }

    // 5. 创建 support_tickets 表（检查是否已存在）
    const supportTicketsTableExists = await queryRunner.hasTable('support_tickets');
    if (!supportTicketsTableExists) {
      await queryRunner.createTable(
      new Table({
        name: 'support_tickets',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'ticketNumber',
            type: 'varchar',
            length: '100',
            isUnique: true,
            isNullable: false,
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'type',
            type: 'enum',
            enum: ['account', 'payment', 'order', 'refund', 'technical', 'other'],
            isNullable: false,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'in_progress', 'resolved', 'closed'],
            default: "'pending'",
            isNullable: false,
          },
          {
            name: 'priority',
            type: 'enum',
            enum: ['low', 'medium', 'high', 'urgent'],
            default: "'medium'",
            isNullable: false,
          },
          {
            name: 'subject',
            type: 'varchar',
            length: '500',
            isNullable: false,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'assignedToId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'attachments',
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
          {
            name: 'resolvedAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'closedAt',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
      true,
    );
    }

    // 6. 创建 support_ticket_replies 表（检查是否已存在）
    const supportTicketRepliesTableExists = await queryRunner.hasTable('support_ticket_replies');
    if (!supportTicketRepliesTableExists) {
      await queryRunner.createTable(
      new Table({
        name: 'support_ticket_replies',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'ticketId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'adminUserId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'content',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'attachments',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'isInternal',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );
    }

    // 创建外键约束（检查是否已存在）
    const adminUsersTable = await queryRunner.getTable('admin_users');
    if (adminUsersTable) {
      const roleIdFkExists = adminUsersTable.foreignKeys.some(
        (fk) =>
          fk.columnNames.includes('roleId') &&
          fk.referencedTableName === 'admin_roles' &&
          fk.referencedColumnNames.includes('id'),
      );
      if (!roleIdFkExists && adminUsersTable.findColumnByName('roleId')) {
        // 清理无效的 roleId 数据
        await queryRunner.query(`
          UPDATE admin_users 
          SET "roleId" = NULL 
          WHERE "roleId" IS NOT NULL 
          AND "roleId" NOT IN (SELECT id FROM admin_roles)
        `);
        
        await queryRunner.createForeignKey(
          'admin_users',
          new TableForeignKey({
            columnNames: ['roleId'],
            referencedColumnNames: ['id'],
            referencedTableName: 'admin_roles',
            onDelete: 'SET NULL',
          }),
        );
      }
    }

    const adminLogsTable = await queryRunner.getTable('admin_logs');
    if (adminLogsTable) {
      const adminUserIdFkExists = adminLogsTable.foreignKeys.some(
        (fk) =>
          fk.columnNames.includes('adminUserId') &&
          fk.referencedTableName === 'admin_users' &&
          fk.referencedColumnNames.includes('id'),
      );
      if (!adminUserIdFkExists && adminLogsTable.findColumnByName('adminUserId')) {
        // 清理无效的 adminUserId 数据
        await queryRunner.query(`
          UPDATE admin_logs 
          SET "adminUserId" = NULL 
          WHERE "adminUserId" IS NOT NULL 
          AND "adminUserId" NOT IN (SELECT id FROM admin_users)
        `);
        
        await queryRunner.createForeignKey(
          'admin_logs',
          new TableForeignKey({
            columnNames: ['adminUserId'],
            referencedColumnNames: ['id'],
            referencedTableName: 'admin_users',
            onDelete: 'SET NULL',
          }),
        );
      }
    }

    const supportTicketsTable = await queryRunner.getTable('support_tickets');
    if (supportTicketsTable) {
      const userIdFkExists = supportTicketsTable.foreignKeys.some(
        (fk) =>
          fk.columnNames.includes('userId') &&
          fk.referencedTableName === 'users' &&
          fk.referencedColumnNames.includes('id'),
      );
      if (!userIdFkExists && supportTicketsTable.findColumnByName('userId')) {
        // 清理无效的 userId 数据
        await queryRunner.query(`
          UPDATE support_tickets 
          SET "userId" = NULL 
          WHERE "userId" IS NOT NULL 
          AND "userId" NOT IN (SELECT id FROM users)
        `);
        
        await queryRunner.createForeignKey(
          'support_tickets',
          new TableForeignKey({
            columnNames: ['userId'],
            referencedColumnNames: ['id'],
            referencedTableName: 'users',
            onDelete: 'SET NULL',
          }),
        );
      }

      const assignedToIdFkExists = supportTicketsTable.foreignKeys.some(
        (fk) =>
          fk.columnNames.includes('assignedToId') &&
          fk.referencedTableName === 'admin_users' &&
          fk.referencedColumnNames.includes('id'),
      );
      if (!assignedToIdFkExists && supportTicketsTable.findColumnByName('assignedToId')) {
        // 清理无效的 assignedToId 数据
        await queryRunner.query(`
          UPDATE support_tickets 
          SET "assignedToId" = NULL 
          WHERE "assignedToId" IS NOT NULL 
          AND "assignedToId" NOT IN (SELECT id FROM admin_users)
        `);
        
        await queryRunner.createForeignKey(
          'support_tickets',
          new TableForeignKey({
            columnNames: ['assignedToId'],
            referencedColumnNames: ['id'],
            referencedTableName: 'admin_users',
            onDelete: 'SET NULL',
          }),
        );
      }
    }

    const supportTicketRepliesTable = await queryRunner.getTable('support_ticket_replies');
    if (supportTicketRepliesTable) {
      const ticketIdFkExists = supportTicketRepliesTable.foreignKeys.some(
        (fk) =>
          fk.columnNames.includes('ticketId') &&
          fk.referencedTableName === 'support_tickets' &&
          fk.referencedColumnNames.includes('id'),
      );
      if (!ticketIdFkExists && supportTicketRepliesTable.findColumnByName('ticketId')) {
        const ticketIdColumn = supportTicketRepliesTable.findColumnByName('ticketId');
        const supportTicketsTable = await queryRunner.getTable('support_tickets');
        const supportTicketsIdColumn = supportTicketsTable?.findColumnByName('id');
        
        // 如果类型不匹配，先转换列类型
        if (ticketIdColumn && supportTicketsIdColumn && ticketIdColumn.type !== supportTicketsIdColumn.type) {
          // 清理无效数据
          await queryRunner.query(`
            DELETE FROM support_ticket_replies 
            WHERE "ticketId" IS NOT NULL 
            AND "ticketId"::text NOT IN (SELECT id::text FROM support_tickets)
          `);
          
          // 转换列类型从 varchar 到 uuid
          if (ticketIdColumn.type === 'varchar' || ticketIdColumn.type === 'character varying') {
            await queryRunner.query(`
              ALTER TABLE support_ticket_replies 
              ALTER COLUMN "ticketId" TYPE uuid USING "ticketId"::uuid
            `);
          }
        } else {
          // 类型匹配，直接清理无效数据
          await queryRunner.query(`
            DELETE FROM support_ticket_replies 
            WHERE "ticketId" IS NOT NULL 
            AND "ticketId" NOT IN (SELECT id FROM support_tickets)
          `);
        }
        
        await queryRunner.createForeignKey(
          'support_ticket_replies',
          new TableForeignKey({
            columnNames: ['ticketId'],
            referencedColumnNames: ['id'],
            referencedTableName: 'support_tickets',
            onDelete: 'CASCADE',
          }),
        );
      }

      const userIdFkExists = supportTicketRepliesTable.foreignKeys.some(
        (fk) =>
          fk.columnNames.includes('userId') &&
          fk.referencedTableName === 'users' &&
          fk.referencedColumnNames.includes('id'),
      );
      if (!userIdFkExists && supportTicketRepliesTable.findColumnByName('userId')) {
        // 清理无效的 userId 数据
        await queryRunner.query(`
          UPDATE support_ticket_replies 
          SET "userId" = NULL 
          WHERE "userId" IS NOT NULL 
          AND "userId" NOT IN (SELECT id FROM users)
        `);
        
        await queryRunner.createForeignKey(
          'support_ticket_replies',
          new TableForeignKey({
            columnNames: ['userId'],
            referencedColumnNames: ['id'],
            referencedTableName: 'users',
            onDelete: 'SET NULL',
          }),
        );
      }

      const adminUserIdFkExists = supportTicketRepliesTable.foreignKeys.some(
        (fk) =>
          fk.columnNames.includes('adminUserId') &&
          fk.referencedTableName === 'admin_users' &&
          fk.referencedColumnNames.includes('id'),
      );
      if (!adminUserIdFkExists && supportTicketRepliesTable.findColumnByName('adminUserId')) {
        // 清理无效的 adminUserId 数据
        await queryRunner.query(`
          UPDATE support_ticket_replies 
          SET "adminUserId" = NULL 
          WHERE "adminUserId" IS NOT NULL 
          AND "adminUserId" NOT IN (SELECT id FROM admin_users)
        `);
        
        await queryRunner.createForeignKey(
          'support_ticket_replies',
          new TableForeignKey({
            columnNames: ['adminUserId'],
            referencedColumnNames: ['id'],
            referencedTableName: 'admin_users',
            onDelete: 'SET NULL',
          }),
        );
      }
    }

    // 创建索引（检查是否已存在）
    if (adminUsersTable) {
      const usernameIndexExists = adminUsersTable.indices.some(
        (idx) => idx.name === 'IDX_admin_users_username',
      );
      if (!usernameIndexExists && adminUsersTable.findColumnByName('username')) {
        await queryRunner.createIndex(
          'admin_users',
          new TableIndex({
            name: 'IDX_admin_users_username',
            columnNames: ['username'],
          }),
        );
      }

      const emailIndexExists = adminUsersTable.indices.some(
        (idx) => idx.name === 'IDX_admin_users_email',
      );
      if (!emailIndexExists && adminUsersTable.findColumnByName('email')) {
        await queryRunner.createIndex(
          'admin_users',
          new TableIndex({
            name: 'IDX_admin_users_email',
            columnNames: ['email'],
          }),
        );
      }
    }

    if (adminLogsTable) {
      const adminUserIdIndexExists = adminLogsTable.indices.some(
        (idx) => idx.name === 'IDX_admin_logs_adminUserId',
      );
      if (!adminUserIdIndexExists && adminLogsTable.findColumnByName('adminUserId')) {
        await queryRunner.createIndex(
          'admin_logs',
          new TableIndex({
            name: 'IDX_admin_logs_adminUserId',
            columnNames: ['adminUserId'],
          }),
        );
      }

      const resourceIndexExists = adminLogsTable.indices.some(
        (idx) => idx.name === 'IDX_admin_logs_resource',
      );
      if (!resourceIndexExists && adminLogsTable.findColumnByName('resourceType') && adminLogsTable.findColumnByName('resourceId')) {
        await queryRunner.createIndex(
          'admin_logs',
          new TableIndex({
            name: 'IDX_admin_logs_resource',
            columnNames: ['resourceType', 'resourceId'],
          }),
        );
      }
    }

    if (supportTicketsTable) {
      const userIdIndexExists = supportTicketsTable.indices.some(
        (idx) => idx.name === 'IDX_support_tickets_userId',
      );
      if (!userIdIndexExists && supportTicketsTable.findColumnByName('userId')) {
        await queryRunner.createIndex(
          'support_tickets',
          new TableIndex({
            name: 'IDX_support_tickets_userId',
            columnNames: ['userId'],
          }),
        );
      }

      const statusIndexExists = supportTicketsTable.indices.some(
        (idx) => idx.name === 'IDX_support_tickets_status',
      );
      if (!statusIndexExists && supportTicketsTable.findColumnByName('status')) {
        await queryRunner.createIndex(
          'support_tickets',
          new TableIndex({
            name: 'IDX_support_tickets_status',
            columnNames: ['status'],
          }),
        );
      }
    }

    if (supportTicketRepliesTable) {
      const ticketIdIndexExists = supportTicketRepliesTable.indices.some(
        (idx) => idx.name === 'IDX_support_ticket_replies_ticketId',
      );
      if (!ticketIdIndexExists && supportTicketRepliesTable.findColumnByName('ticketId')) {
        await queryRunner.createIndex(
          'support_ticket_replies',
          new TableIndex({
            name: 'IDX_support_ticket_replies_ticketId',
            columnNames: ['ticketId'],
          }),
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 删除外键
    const supportTicketRepliesTable = await queryRunner.getTable('support_ticket_replies');
    if (supportTicketRepliesTable) {
      const foreignKeys = supportTicketRepliesTable.foreignKeys;
      for (const fk of foreignKeys) {
        await queryRunner.dropForeignKey('support_ticket_replies', fk);
      }
    }

    const supportTicketsTable = await queryRunner.getTable('support_tickets');
    if (supportTicketsTable) {
      const foreignKeys = supportTicketsTable.foreignKeys;
      for (const fk of foreignKeys) {
        await queryRunner.dropForeignKey('support_tickets', fk);
      }
    }

    const adminLogsTable = await queryRunner.getTable('admin_logs');
    if (adminLogsTable) {
      const foreignKeys = adminLogsTable.foreignKeys;
      for (const fk of foreignKeys) {
        await queryRunner.dropForeignKey('admin_logs', fk);
      }
    }

    const adminUsersTable = await queryRunner.getTable('admin_users');
    if (adminUsersTable) {
      const foreignKeys = adminUsersTable.foreignKeys;
      for (const fk of foreignKeys) {
        await queryRunner.dropForeignKey('admin_users', fk);
      }
    }

    // 删除表
    await queryRunner.dropTable('support_ticket_replies', true);
    await queryRunner.dropTable('support_tickets', true);
    await queryRunner.dropTable('admin_configs', true);
    await queryRunner.dropTable('admin_logs', true);
    await queryRunner.dropTable('admin_users', true);
    await queryRunner.dropTable('admin_roles', true);
  }
}

