import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateAdminTables1769000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. 创建 admin_roles 表（检查是否已存在）
    const adminRolesTableExists = await queryRunner.hasTable('admin_roles');
    if (!adminRolesTableExists) {
      // 创建 admin_roles_type_enum 枚举类型
      await queryRunner.query(`
        DO $$ BEGIN
          CREATE TYPE "public"."admin_roles_type_enum" AS ENUM('super_admin', 'operations', 'support', 'finance', 'tech', 'read_only');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);

      // 创建 admin_roles_status_enum 枚举类型（如果 admin_users 需要）
      await queryRunner.query(`
        DO $$ BEGIN
          CREATE TYPE "public"."admin_users_status_enum" AS ENUM('active', 'inactive', 'suspended');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);

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
              enumName: 'admin_roles_type_enum',
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
              enumName: 'admin_users_status_enum',
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
              name: 'adminId',
              type: 'uuid',
              isNullable: false,
            },
            {
              name: 'action',
              type: 'varchar',
              length: '255',
              isNullable: false,
            },
            {
              name: 'entityType',
              type: 'varchar',
              length: '100',
              isNullable: true,
            },
            {
              name: 'entityId',
              type: 'uuid',
              isNullable: true,
            },
            {
              name: 'details',
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
              name: 'createdAt',
              type: 'timestamp',
              default: 'CURRENT_TIMESTAMP',
            },
          ],
        }),
        true,
      );
    }

    // 创建外键和索引
    const adminUsersTable = await queryRunner.getTable('admin_users');
    const adminRolesTable = await queryRunner.getTable('admin_roles');
    
    if (adminUsersTable && adminRolesTable) {
      // 创建 admin_users 的 roleId 外键
      const roleIdFkExists = adminUsersTable.foreignKeys.some(
        (fk) =>
          fk.columnNames.includes('roleId') &&
          fk.referencedTableName === 'admin_roles' &&
          fk.referencedColumnNames.includes('id'),
      );
      if (!roleIdFkExists && adminUsersTable.findColumnByName('roleId')) {
        await queryRunner.createForeignKey(
          'admin_users',
          new TableForeignKey({
            columnNames: ['roleId'],
            referencedTableName: 'admin_roles',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          }),
        );
      }

      // 创建索引
      const usernameIndexExists = adminUsersTable.indices.some(
        (idx) => idx.name === 'IDX_admin_users_username',
      );
      if (!usernameIndexExists && adminUsersTable.findColumnByName('username')) {
        await queryRunner.createIndex(
          'admin_users',
          new TableIndex({
            name: 'IDX_admin_users_username',
            columnNames: ['username'],
            isUnique: true,
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

    // 创建 admin_logs 索引
    const adminLogsTable = await queryRunner.getTable('admin_logs');
    if (adminLogsTable) {
      const adminIdIndexExists = adminLogsTable.indices.some(
        (idx) => idx.name === 'IDX_admin_logs_adminId',
      );
      if (!adminIdIndexExists && adminLogsTable.findColumnByName('adminId')) {
        await queryRunner.createIndex(
          'admin_logs',
          new TableIndex({
            name: 'IDX_admin_logs_adminId',
            columnNames: ['adminId'],
          }),
        );
      }

      const entityIndexExists = adminLogsTable.indices.some(
        (idx) => idx.name === 'IDX_admin_logs_entityType_entityId',
      );
      if (!entityIndexExists && adminLogsTable.findColumnByName('entityType') && adminLogsTable.findColumnByName('entityId')) {
        await queryRunner.createIndex(
          'admin_logs',
          new TableIndex({
            name: 'IDX_admin_logs_entityType_entityId',
            columnNames: ['entityType', 'entityId'],
          }),
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('admin_logs', true);
    await queryRunner.dropTable('admin_users', true);
    await queryRunner.dropTable('admin_roles', true);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."admin_users_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."admin_roles_type_enum"`);
  }
}

