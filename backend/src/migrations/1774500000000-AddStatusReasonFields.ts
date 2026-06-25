import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * 添加 statusReason 和 statusUpdatedAt 字段到账户实体
 */
export class AddStatusReasonFields1774500000000 implements MigrationInterface {
  name = 'AddStatusReasonFields1774500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 添加到 users 表
    const usersTable = await queryRunner.getTable('users');
    if (usersTable && !usersTable.findColumnByName('statusReason')) {
      await queryRunner.addColumn('users', new TableColumn({
        name: 'statusReason',
        type: 'varchar',
        length: '500',
        isNullable: true,
      }));
    }
    if (usersTable && !usersTable.findColumnByName('statusUpdatedAt')) {
      await queryRunner.addColumn('users', new TableColumn({
        name: 'statusUpdatedAt',
        type: 'timestamp',
        isNullable: true,
      }));
    }
    if (usersTable && !usersTable.findColumnByName('lastActiveAt')) {
      await queryRunner.addColumn('users', new TableColumn({
        name: 'lastActiveAt',
        type: 'timestamp',
        isNullable: true,
      }));
    }
    if (usersTable && !usersTable.findColumnByName('defaultAccountId')) {
      await queryRunner.addColumn('users', new TableColumn({
        name: 'defaultAccountId',
        type: 'uuid',
        isNullable: true,
      }));
    }

    // 添加到 accounts 表
    const accountsTable = await queryRunner.getTable('accounts');
    if (accountsTable && !accountsTable.findColumnByName('statusReason')) {
      await queryRunner.addColumn('accounts', new TableColumn({
        name: 'statusReason',
        type: 'varchar',
        length: '500',
        isNullable: true,
      }));
    }
    if (accountsTable && !accountsTable.findColumnByName('statusUpdatedAt')) {
      await queryRunner.addColumn('accounts', new TableColumn({
        name: 'statusUpdatedAt',
        type: 'timestamp',
        isNullable: true,
      }));
    }

    // 添加到 agent_accounts 表
    const agentAccountsTable = await queryRunner.getTable('agent_accounts');
    if (agentAccountsTable && !agentAccountsTable.findColumnByName('statusReason')) {
      await queryRunner.addColumn('agent_accounts', new TableColumn({
        name: 'statusReason',
        type: 'varchar',
        length: '500',
        isNullable: true,
      }));
    }
    if (agentAccountsTable && !agentAccountsTable.findColumnByName('statusUpdatedAt')) {
      await queryRunner.addColumn('agent_accounts', new TableColumn({
        name: 'statusUpdatedAt',
        type: 'timestamp',
        isNullable: true,
      }));
    }

    // 添加到 developer_accounts 表
    const developerAccountsTable = await queryRunner.getTable('developer_accounts');
    if (developerAccountsTable && !developerAccountsTable.findColumnByName('statusReason')) {
      await queryRunner.addColumn('developer_accounts', new TableColumn({
        name: 'statusReason',
        type: 'varchar',
        length: '500',
        isNullable: true,
      }));
    }
    if (developerAccountsTable && !developerAccountsTable.findColumnByName('statusUpdatedAt')) {
      await queryRunner.addColumn('developer_accounts', new TableColumn({
        name: 'statusUpdatedAt',
        type: 'timestamp',
        isNullable: true,
      }));
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 从 users 表删除
    const usersTable = await queryRunner.getTable('users');
    if (usersTable) {
      if (usersTable.findColumnByName('statusReason')) {
        await queryRunner.dropColumn('users', 'statusReason');
      }
      if (usersTable.findColumnByName('statusUpdatedAt')) {
        await queryRunner.dropColumn('users', 'statusUpdatedAt');
      }
      if (usersTable.findColumnByName('lastActiveAt')) {
        await queryRunner.dropColumn('users', 'lastActiveAt');
      }
      if (usersTable.findColumnByName('defaultAccountId')) {
        await queryRunner.dropColumn('users', 'defaultAccountId');
      }
    }

    // 从 accounts 表删除
    const accountsTable = await queryRunner.getTable('accounts');
    if (accountsTable) {
      if (accountsTable.findColumnByName('statusReason')) {
        await queryRunner.dropColumn('accounts', 'statusReason');
      }
      if (accountsTable.findColumnByName('statusUpdatedAt')) {
        await queryRunner.dropColumn('accounts', 'statusUpdatedAt');
      }
    }

    // 从 agent_accounts 表删除
    const agentAccountsTable = await queryRunner.getTable('agent_accounts');
    if (agentAccountsTable) {
      if (agentAccountsTable.findColumnByName('statusReason')) {
        await queryRunner.dropColumn('agent_accounts', 'statusReason');
      }
      if (agentAccountsTable.findColumnByName('statusUpdatedAt')) {
        await queryRunner.dropColumn('agent_accounts', 'statusUpdatedAt');
      }
    }

    // 从 developer_accounts 表删除
    const developerAccountsTable = await queryRunner.getTable('developer_accounts');
    if (developerAccountsTable) {
      if (developerAccountsTable.findColumnByName('statusReason')) {
        await queryRunner.dropColumn('developer_accounts', 'statusReason');
      }
      if (developerAccountsTable.findColumnByName('statusUpdatedAt')) {
        await queryRunner.dropColumn('developer_accounts', 'statusUpdatedAt');
      }
    }
  }
}
