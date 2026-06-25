import { MigrationInterface, QueryRunner, Table, TableIndex, TableUnique } from 'typeorm';

export class CreateUserProviderConfigs1779100000000 implements MigrationInterface {
  name = 'CreateUserProviderConfigs1779100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'user_provider_configs',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'user_id', type: 'uuid', isNullable: false },
          { name: 'provider_id', type: 'varchar', length: '50', isNullable: false },
          { name: 'encrypted_api_key', type: 'text', isNullable: false },
          { name: 'encrypted_secret_key', type: 'text', isNullable: true },
          { name: 'base_url', type: 'varchar', length: '500', isNullable: true },
          { name: 'region', type: 'varchar', length: '30', isNullable: true },
          { name: 'selected_model', type: 'varchar', length: '100', isNullable: false },
          { name: 'is_active', type: 'boolean', default: true },
          { name: 'last_tested_at', type: 'timestamp', isNullable: true },
          { name: 'last_test_result', type: 'varchar', length: '20', isNullable: true },
          { name: 'metadata', type: 'jsonb', isNullable: true },
          { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updated_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
        foreignKeys: [
          { columnNames: ['user_id'], referencedTableName: 'users', referencedColumnNames: ['id'], onDelete: 'CASCADE' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex('user_provider_configs', new TableIndex({ columnNames: ['user_id'] }));
    await queryRunner.createUniqueConstraint('user_provider_configs', new TableUnique({ columnNames: ['user_id', 'provider_id'] }));

    // Add preferred_model / preferred_provider to agent_accounts
    const agentTable = await queryRunner.getTable('agent_accounts');
    if (agentTable) {
      if (!agentTable.findColumnByName('preferred_model')) {
        await queryRunner.query(`ALTER TABLE agent_accounts ADD COLUMN preferred_model varchar(100) NULL`);
      }
      if (!agentTable.findColumnByName('preferred_provider')) {
        await queryRunner.query(`ALTER TABLE agent_accounts ADD COLUMN preferred_provider varchar(50) NULL`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const agentTable = await queryRunner.getTable('agent_accounts');
    if (agentTable?.findColumnByName('preferred_model')) {
      await queryRunner.query(`ALTER TABLE agent_accounts DROP COLUMN preferred_model`);
    }
    if (agentTable?.findColumnByName('preferred_provider')) {
      await queryRunner.query(`ALTER TABLE agent_accounts DROP COLUMN preferred_provider`);
    }
    await queryRunner.dropTable('user_provider_configs', true);
  }
}
