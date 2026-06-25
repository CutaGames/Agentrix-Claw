import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

/**
 * 创建 API Keys 表
 * 用于存储用户/商户的 API Key（平台级 Key 通过环境变量配置）
 */
export class CreateApiKeysTable1765000000100 implements MigrationInterface {
  name = 'CreateApiKeysTable1765000000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 检查表是否已存在
    const tableExists = await queryRunner.hasTable('api_keys');
    if (tableExists) {
      console.log('Table api_keys already exists, skipping creation');
      return;
    }

    // 创建 api_keys 表
    await queryRunner.createTable(
      new Table({
        name: 'api_keys',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'key_hash',
            type: 'varchar',
            length: '64',
            isNullable: false,
            comment: 'SHA-256 hash of the API key',
          },
          {
            name: 'key_prefix',
            type: 'varchar',
            length: '20',
            isNullable: false,
            comment: 'Key prefix for identification (e.g., agx_xxx...)',
          },
          {
            name: 'name',
            type: 'varchar',
            length: '100',
            isNullable: false,
            comment: 'User-defined name for the API key',
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['active', 'revoked', 'expired'],
            default: "'active'",
          },
          {
            name: 'expires_at',
            type: 'timestamp',
            isNullable: true,
            comment: 'Expiration time (null = never expires)',
          },
          {
            name: 'last_used_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'usage_count',
            type: 'integer',
            default: 0,
          },
          {
            name: 'scopes',
            type: 'jsonb',
            default: "'[\"read\", \"search\", \"order\", \"payment\"]'",
            comment: 'Allowed API scopes',
          },
          {
            name: 'rate_limit',
            type: 'integer',
            default: 60,
            comment: 'Rate limit per minute',
          },
          {
            name: 'allowed_origins',
            type: 'jsonb',
            isNullable: true,
            comment: 'Allowed origins for CORS',
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
            comment: 'Additional metadata',
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
      }),
      true,
    );

    // 创建索引
    await queryRunner.createIndex(
      'api_keys',
      new TableIndex({
        name: 'IDX_api_keys_key_hash',
        columnNames: ['key_hash'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'api_keys',
      new TableIndex({
        name: 'IDX_api_keys_user_id',
        columnNames: ['user_id'],
      }),
    );

    await queryRunner.createIndex(
      'api_keys',
      new TableIndex({
        name: 'IDX_api_keys_status',
        columnNames: ['status'],
      }),
    );

    // 创建外键（如果 users 表存在）
    const usersTableExists = await queryRunner.hasTable('users');
    if (usersTableExists) {
      await queryRunner.createForeignKey(
        'api_keys',
        new TableForeignKey({
          name: 'FK_api_keys_user',
          columnNames: ['user_id'],
          referencedTableName: 'users',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      );
    }

    console.log('✅ Created api_keys table with indexes');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 删除外键
    const table = await queryRunner.getTable('api_keys');
    if (table) {
      const foreignKey = table.foreignKeys.find(fk => fk.name === 'FK_api_keys_user');
      if (foreignKey) {
        await queryRunner.dropForeignKey('api_keys', foreignKey);
      }
    }

    // 删除表
    await queryRunner.dropTable('api_keys', true);
    console.log('✅ Dropped api_keys table');
  }
}
