import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class AddSocialAccounts1764000000300 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 检查表是否已存在，避免重复执行
    const hasTable = await queryRunner.hasTable('social_accounts');
    if (hasTable) {
      return;
    }

    // 检查类型是否已存在，避免重复创建
    const typeExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'social_accounts_type_enum'
      )
    `);
    if (!typeExists[0]?.exists) {
      await queryRunner.query(
        `CREATE TYPE "social_accounts_type_enum" AS ENUM ('google', 'apple', 'x', 'telegram', 'discord')`,
      );
    }

    await queryRunner.createTable(
      new Table({
        name: 'social_accounts',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'userId', type: 'uuid' },
          {
            name: 'type',
            type: '"social_accounts_type_enum"',
          },
          { name: 'socialId', type: 'varchar', length: '255' },
          { name: 'email', type: 'varchar', length: '255', isNullable: true },
          { name: 'username', type: 'varchar', length: '255', isNullable: true },
          { name: 'displayName', type: 'varchar', length: '255', isNullable: true },
          { name: 'avatarUrl', type: 'varchar', length: '500', isNullable: true },
          { name: 'metadata', type: 'jsonb', isNullable: true },
          {
            name: 'connectedAt',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'lastUsedAt',
            type: 'timestamp',
            default: 'now()',
          },
        ],
        foreignKeys: [
          {
            columnNames: ['userId'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndices('social_accounts', [
      new TableIndex({
        name: 'IDX_social_accounts_user_type',
        columnNames: ['userId', 'type'],
        isUnique: true,
      }),
      new TableIndex({
        name: 'IDX_social_accounts_social_type',
        columnNames: ['socialId', 'type'],
        isUnique: true,
      }),
      new TableIndex({
        name: 'IDX_social_accounts_user',
        columnNames: ['userId'],
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('social_accounts', 'IDX_social_accounts_user');
    await queryRunner.dropIndex('social_accounts', 'IDX_social_accounts_social_type');
    await queryRunner.dropIndex('social_accounts', 'IDX_social_accounts_user_type');
    await queryRunner.dropTable('social_accounts');
    await queryRunner.query(`DROP TYPE "social_accounts_type_enum"`);
  }
}


