import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class AddAgentSessionAndAuditLog1763025405600 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Agent Sessions表
    await queryRunner.createTable(
      new Table({
        name: 'agent_sessions',
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
            name: 'title',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'context',
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
            name: 'lastMessageAt',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
    );

    // Agent Messages表
    await queryRunner.createTable(
      new Table({
        name: 'agent_messages',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'sessionId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'role',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'type',
            type: 'varchar',
            default: "'text'",
          },
          {
            name: 'content',
            type: 'text',
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
            name: 'sequenceNumber',
            type: 'integer',
            isNullable: true,
          },
        ],
      }),
    );

    // Audit Logs表
    await queryRunner.createTable(
      new Table({
        name: 'audit_logs',
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
            isNullable: true,
          },
          {
            name: 'action',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'varchar',
            default: "'success'",
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'requestData',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'responseData',
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
            name: 'duration',
            type: 'integer',
            isNullable: true,
          },
        ],
      }),
    );

    // 创建外键
    await queryRunner.createForeignKey(
      'agent_sessions',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'agent_messages',
      new TableForeignKey({
        columnNames: ['sessionId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'agent_sessions',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'agent_messages',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'SET NULL',
      }),
    );

    await queryRunner.createForeignKey(
      'audit_logs',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'SET NULL',
      }),
    );

    // 创建索引
    await queryRunner.createIndex(
      'agent_sessions',
      new TableIndex({
        name: 'IDX_agent_sessions_userId',
        columnNames: ['userId'],
      }),
    );

    await queryRunner.createIndex(
      'agent_sessions',
      new TableIndex({
        name: 'IDX_agent_sessions_status',
        columnNames: ['status'],
      }),
    );

    await queryRunner.createIndex(
      'agent_messages',
      new TableIndex({
        name: 'IDX_agent_messages_sessionId',
        columnNames: ['sessionId'],
      }),
    );

    await queryRunner.createIndex(
      'agent_messages',
      new TableIndex({
        name: 'IDX_agent_messages_sequenceNumber',
        columnNames: ['sessionId', 'sequenceNumber'],
      }),
    );

    await queryRunner.createIndex(
      'audit_logs',
      new TableIndex({
        name: 'IDX_audit_logs_userId',
        columnNames: ['userId'],
      }),
    );

    await queryRunner.createIndex(
      'audit_logs',
      new TableIndex({
        name: 'IDX_audit_logs_action',
        columnNames: ['action'],
      }),
    );

    await queryRunner.createIndex(
      'audit_logs',
      new TableIndex({
        name: 'IDX_audit_logs_createdAt',
        columnNames: ['createdAt'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 删除索引
    await queryRunner.dropIndex('audit_logs', 'IDX_audit_logs_createdAt');
    await queryRunner.dropIndex('audit_logs', 'IDX_audit_logs_action');
    await queryRunner.dropIndex('audit_logs', 'IDX_audit_logs_userId');
    await queryRunner.dropIndex('agent_messages', 'IDX_agent_messages_sequenceNumber');
    await queryRunner.dropIndex('agent_messages', 'IDX_agent_messages_sessionId');
    await queryRunner.dropIndex('agent_sessions', 'IDX_agent_sessions_status');
    await queryRunner.dropIndex('agent_sessions', 'IDX_agent_sessions_userId');

    // 删除外键
    const auditLogsTable = await queryRunner.getTable('audit_logs');
    const auditLogsForeignKey = auditLogsTable?.foreignKeys.find(
      (fk) => fk.columnNames.indexOf('userId') !== -1,
    );
    if (auditLogsForeignKey) {
      await queryRunner.dropForeignKey('audit_logs', auditLogsForeignKey);
    }

    const agentMessagesTable = await queryRunner.getTable('agent_messages');
    const agentMessagesForeignKeys = agentMessagesTable?.foreignKeys || [];
    for (const fk of agentMessagesForeignKeys) {
      await queryRunner.dropForeignKey('agent_messages', fk);
    }

    const agentSessionsTable = await queryRunner.getTable('agent_sessions');
    const agentSessionsForeignKey = agentSessionsTable?.foreignKeys.find(
      (fk) => fk.columnNames.indexOf('userId') !== -1,
    );
    if (agentSessionsForeignKey) {
      await queryRunner.dropForeignKey('agent_sessions', agentSessionsForeignKey);
    }

    // 删除表
    await queryRunner.dropTable('audit_logs');
    await queryRunner.dropTable('agent_messages');
    await queryRunner.dropTable('agent_sessions');
  }
}

