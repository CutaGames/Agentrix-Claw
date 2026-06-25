import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddAgentAccountPermissions1779000000000 implements MigrationInterface {
  name = 'AddAgentAccountPermissions1779000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const agentAccountsTable = await queryRunner.getTable('agent_accounts');
    if (agentAccountsTable && !agentAccountsTable.findColumnByName('permissions')) {
      await queryRunner.addColumn(
        'agent_accounts',
        new TableColumn({
          name: 'permissions',
          type: 'jsonb',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const agentAccountsTable = await queryRunner.getTable('agent_accounts');
    if (agentAccountsTable && agentAccountsTable.findColumnByName('permissions')) {
      await queryRunner.dropColumn('agent_accounts', 'permissions');
    }
  }
}