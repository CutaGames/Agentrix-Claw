import { MigrationInterface, QueryRunner, Table, TableIndex, TableColumn, TableForeignKey } from 'typeorm';

/**
 * P1-P2 账户体系优化迁移
 * 1. 扩展 Authorization 实体（支持自动支付）
 * 2. 创建 Workspace 和 WorkspaceMember 表
 */
export class AccountSystemP1P2Optimization1774400000000 implements MigrationInterface {
  name = 'AccountSystemP1P2Optimization1774400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ============ 0. 创建 authorizations 表（如果不存在）============
    
    // 创建授权状态枚举
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE authorization_status_enum AS ENUM ('active', 'revoked', 'expired');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // 创建授权类型枚举
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE authorization_type_enum AS ENUM ('manual', 'auto_pay');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    const authTableExists = await queryRunner.hasTable('authorizations');
    if (!authTableExists) {
      await queryRunner.createTable(new Table({
        name: 'authorizations',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'user_id',
            type: 'uuid',
          },
          {
            name: 'agent_id',
            type: 'uuid',
          },
          {
            name: 'authorization_type',
            type: 'authorization_type_enum',
            default: "'manual'",
          },
          {
            name: 'is_auto_pay',
            type: 'boolean',
            default: false,
          },
          {
            name: 'single_tx_limit',
            type: 'decimal',
            precision: 15,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'daily_limit',
            type: 'decimal',
            precision: 15,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'monthly_limit',
            type: 'decimal',
            precision: 15,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'used_today',
            type: 'decimal',
            precision: 15,
            scale: 2,
            default: 0,
          },
          {
            name: 'used_this_month',
            type: 'decimal',
            precision: 15,
            scale: 2,
            default: 0,
          },
          {
            name: 'total_used',
            type: 'decimal',
            precision: 15,
            scale: 2,
            default: 0,
          },
          {
            name: 'last_daily_reset_date',
            type: 'date',
            isNullable: true,
          },
          {
            name: 'last_monthly_reset_date',
            type: 'date',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'authorization_status_enum',
            default: "'active'",
          },
          {
            name: 'description',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'expires_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
        indices: [
          {
            name: 'IDX_authorizations_user_agent',
            columnNames: ['user_id', 'agent_id'],
          },
          {
            name: 'IDX_authorizations_user_status',
            columnNames: ['user_id', 'status'],
          },
        ],
      }), true);

      // 添加外键
      await queryRunner.createForeignKey('authorizations', new TableForeignKey({
        name: 'FK_authorizations_user',
        columnNames: ['user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }));

      await queryRunner.createForeignKey('authorizations', new TableForeignKey({
        name: 'FK_authorizations_agent',
        columnNames: ['agent_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'accounts',
        onDelete: 'CASCADE',
      }));
    }

    // ============ 1. 扩展 authorizations 表 ============
    
    // 添加新字段到 authorizations 表（如果表已存在但字段不存在）
    const authTable = await queryRunner.getTable('authorizations');
    if (authTable) {
      // authorization_type
      if (!authTable.findColumnByName('authorization_type')) {
        await queryRunner.addColumn('authorizations', new TableColumn({
          name: 'authorization_type',
          type: 'authorization_type_enum',
          default: "'manual'",
        }));
      }

      // is_auto_pay
      if (!authTable.findColumnByName('is_auto_pay')) {
        await queryRunner.addColumn('authorizations', new TableColumn({
          name: 'is_auto_pay',
          type: 'boolean',
          default: false,
        }));
      }

      // used_today
      if (!authTable.findColumnByName('used_today')) {
        await queryRunner.addColumn('authorizations', new TableColumn({
          name: 'used_today',
          type: 'decimal',
          precision: 15,
          scale: 2,
          default: 0,
        }));
      }

      // used_this_month
      if (!authTable.findColumnByName('used_this_month')) {
        await queryRunner.addColumn('authorizations', new TableColumn({
          name: 'used_this_month',
          type: 'decimal',
          precision: 15,
          scale: 2,
          default: 0,
        }));
      }

      // total_used
      if (!authTable.findColumnByName('total_used')) {
        await queryRunner.addColumn('authorizations', new TableColumn({
          name: 'total_used',
          type: 'decimal',
          precision: 15,
          scale: 2,
          default: 0,
        }));
      }

      // last_daily_reset_date
      if (!authTable.findColumnByName('last_daily_reset_date')) {
        await queryRunner.addColumn('authorizations', new TableColumn({
          name: 'last_daily_reset_date',
          type: 'date',
          isNullable: true,
        }));
      }

      // last_monthly_reset_date
      if (!authTable.findColumnByName('last_monthly_reset_date')) {
        await queryRunner.addColumn('authorizations', new TableColumn({
          name: 'last_monthly_reset_date',
          type: 'date',
          isNullable: true,
        }));
      }

      // description
      if (!authTable.findColumnByName('description')) {
        await queryRunner.addColumn('authorizations', new TableColumn({
          name: 'description',
          type: 'varchar',
          length: '500',
          isNullable: true,
        }));
      }

      // metadata
      if (!authTable.findColumnByName('metadata')) {
        await queryRunner.addColumn('authorizations', new TableColumn({
          name: 'metadata',
          type: 'jsonb',
          isNullable: true,
        }));
      }

      // 添加索引
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "IDX_authorizations_user_agent" 
        ON "authorizations" ("user_id", "agent_id");
      `);
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS "IDX_authorizations_user_status" 
        ON "authorizations" ("user_id", "status");
      `);
    }

    // ============ 2. 创建工作空间相关枚举 ============
    
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE workspace_status_enum AS ENUM ('active', 'suspended', 'archived', 'deleted');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE workspace_type_enum AS ENUM ('personal', 'team', 'organization', 'enterprise');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE workspace_plan_enum AS ENUM ('free', 'pro', 'business', 'enterprise');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE workspace_member_role_enum AS ENUM ('owner', 'admin', 'member', 'viewer', 'guest');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // ============ 3. 创建 workspaces 表 ============
    
    const workspacesTableExists = await queryRunner.hasTable('workspaces');
    if (!workspacesTableExists) {
      await queryRunner.createTable(new Table({
        name: 'workspaces',
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
          },
          {
            name: 'slug',
            type: 'varchar',
            length: '50',
            isUnique: true,
          },
          {
            name: 'description',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'icon_url',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'owner_id',
            type: 'uuid',
          },
          {
            name: 'type',
            type: 'workspace_type_enum',
            default: "'personal'",
          },
          {
            name: 'plan',
            type: 'workspace_plan_enum',
            default: "'free'",
          },
          {
            name: 'status',
            type: 'workspace_status_enum',
            default: "'active'",
          },
          {
            name: 'max_members',
            type: 'int',
            default: 1,
          },
          {
            name: 'max_agents',
            type: 'int',
            default: 3,
          },
          {
            name: 'max_storage_mb',
            type: 'int',
            default: 100,
          },
          {
            name: 'used_storage_mb',
            type: 'decimal',
            precision: 10,
            scale: 2,
            default: 0,
          },
          {
            name: 'plan_expires_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'settings',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
        indices: [
          {
            name: 'IDX_workspaces_owner_id',
            columnNames: ['owner_id'],
          },
          {
            name: 'IDX_workspaces_status',
            columnNames: ['status'],
          },
          {
            name: 'IDX_workspaces_slug',
            columnNames: ['slug'],
            isUnique: true,
          },
        ],
      }), true);

      // 添加外键
      await queryRunner.createForeignKey('workspaces', new TableForeignKey({
        name: 'FK_workspaces_owner',
        columnNames: ['owner_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }));
    }

    // ============ 4. 创建 workspace_members 表 ============
    
    const membersTableExists = await queryRunner.hasTable('workspace_members');
    if (!membersTableExists) {
      await queryRunner.createTable(new Table({
        name: 'workspace_members',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'workspace_id',
            type: 'uuid',
          },
          {
            name: 'user_id',
            type: 'uuid',
          },
          {
            name: 'role',
            type: 'workspace_member_role_enum',
            default: "'member'",
          },
          {
            name: 'display_name',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'accepted',
            type: 'boolean',
            default: false,
          },
          {
            name: 'invited_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'accepted_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'invited_by',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'permissions',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'last_active_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'joined_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
        indices: [
          {
            name: 'IDX_workspace_members_workspace_user',
            columnNames: ['workspace_id', 'user_id'],
            isUnique: true,
          },
          {
            name: 'IDX_workspace_members_user_id',
            columnNames: ['user_id'],
          },
        ],
      }), true);

      // 添加外键
      await queryRunner.createForeignKey('workspace_members', new TableForeignKey({
        name: 'FK_workspace_members_workspace',
        columnNames: ['workspace_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'workspaces',
        onDelete: 'CASCADE',
      }));

      await queryRunner.createForeignKey('workspace_members', new TableForeignKey({
        name: 'FK_workspace_members_user',
        columnNames: ['user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }));
    }

    // ============ 5. 迁移 AutoPayGrant 数据到 Authorization ============
    
    // 检查 auto_pay_grants 表是否存在
    const autoPayGrantsExists = await queryRunner.hasTable('auto_pay_grants');
    if (autoPayGrantsExists) {
      // 迁移数据（使用类型转换处理agentId和status）
      await queryRunner.query(`
        INSERT INTO authorizations (
          id, user_id, agent_id, authorization_type, is_auto_pay,
          single_tx_limit, daily_limit, used_today, total_used,
          status, expires_at, created_at, updated_at
        )
        SELECT 
          id, "userId"::uuid, "agentId"::uuid, 'auto_pay'::authorization_type_enum, true,
          "singleLimit", "dailyLimit", "usedToday", "totalUsed",
          (CASE WHEN "isActive" THEN 'active' ELSE 'revoked' END)::authorization_status_enum,
          "expiresAt", "createdAt", "updatedAt"
        FROM auto_pay_grants
        ON CONFLICT (id) DO NOTHING;
      `);

      console.log('已迁移 AutoPayGrant 数据到 Authorization 表');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 删除 workspace_members 外键和表
    const membersTable = await queryRunner.getTable('workspace_members');
    if (membersTable) {
      const membersFks = membersTable.foreignKeys;
      for (const fk of membersFks) {
        await queryRunner.dropForeignKey('workspace_members', fk);
      }
      await queryRunner.dropTable('workspace_members');
    }

    // 删除 workspaces 外键和表
    const workspacesTable = await queryRunner.getTable('workspaces');
    if (workspacesTable) {
      const workspacesFks = workspacesTable.foreignKeys;
      for (const fk of workspacesFks) {
        await queryRunner.dropForeignKey('workspaces', fk);
      }
      await queryRunner.dropTable('workspaces');
    }

    // 删除 authorizations 新增的列
    const authTable = await queryRunner.getTable('authorizations');
    if (authTable) {
      const columnsToRemove = [
        'authorization_type', 'is_auto_pay', 'used_today', 'used_this_month',
        'total_used', 'last_daily_reset_date', 'last_monthly_reset_date',
        'description', 'metadata'
      ];
      for (const colName of columnsToRemove) {
        if (authTable.findColumnByName(colName)) {
          await queryRunner.dropColumn('authorizations', colName);
        }
      }
    }

    // 删除索引
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_authorizations_user_agent";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_authorizations_user_status";`);

    // 删除枚举类型
    await queryRunner.query(`DROP TYPE IF EXISTS workspace_member_role_enum;`);
    await queryRunner.query(`DROP TYPE IF EXISTS workspace_plan_enum;`);
    await queryRunner.query(`DROP TYPE IF EXISTS workspace_type_enum;`);
    await queryRunner.query(`DROP TYPE IF EXISTS workspace_status_enum;`);
    await queryRunner.query(`DROP TYPE IF EXISTS authorization_type_enum;`);
  }
}
