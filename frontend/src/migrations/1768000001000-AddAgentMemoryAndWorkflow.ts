import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class AddAgentMemoryAndWorkflow1768000001000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Agent Memory 表（检查是否已存在）
    const agentMemoryTableExists = await queryRunner.hasTable('agent_memory');
    if (!agentMemoryTableExists) {
      await queryRunner.createTable(
        new Table({
          name: 'agent_memory',
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
              name: 'type',
              type: 'varchar',
              length: '50',
              isNullable: false,
            },
            {
              name: 'key',
              type: 'varchar',
              length: '255',
              isNullable: false,
            },
            {
              name: 'value',
              type: 'jsonb',
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
            },
          ],
        }),
        true,
      );
    }

    // Agent Memory 索引（检查是否已存在）
    const agentMemoryTable = await queryRunner.getTable('agent_memory');
    if (agentMemoryTable) {
      const sessionKeyIndexExists = agentMemoryTable.indices.some(
        (idx) => idx.name === 'IDX_agent_memory_session_key',
      );
      if (!sessionKeyIndexExists) {
        await queryRunner.createIndex(
          'agent_memory',
          new TableIndex({
            name: 'IDX_agent_memory_session_key',
            columnNames: ['sessionId', 'key'],
          }),
        );
      }

      const sessionTypeIndexExists = agentMemoryTable.indices.some(
        (idx) => idx.name === 'IDX_agent_memory_session_type',
      );
      if (!sessionTypeIndexExists) {
        await queryRunner.createIndex(
          'agent_memory',
          new TableIndex({
            name: 'IDX_agent_memory_session_type',
            columnNames: ['sessionId', 'type'],
          }),
        );
      }

      const sessionCreatedIndexExists = agentMemoryTable.indices.some(
        (idx) => idx.name === 'IDX_agent_memory_session_created',
      );
      if (!sessionCreatedIndexExists) {
        await queryRunner.createIndex(
          'agent_memory',
          new TableIndex({
            name: 'IDX_agent_memory_session_created',
            columnNames: ['sessionId', 'createdAt'],
          }),
        );
      }

      // Agent Memory 外键（检查是否已存在）
      const fkExists = agentMemoryTable.foreignKeys.some(
        (fk) =>
          fk.columnNames.includes('sessionId') &&
          fk.referencedTableName === 'agent_sessions' &&
          fk.referencedColumnNames.includes('id'),
      );
      if (!fkExists) {
        await queryRunner.createForeignKey(
          'agent_memory',
          new TableForeignKey({
            columnNames: ['sessionId'],
            referencedColumnNames: ['id'],
            referencedTableName: 'agent_sessions',
            onDelete: 'CASCADE',
          }),
        );
      }
    }

    // Agent Workflow 表（检查是否已存在）
    const agentWorkflowTableExists = await queryRunner.hasTable('agent_workflow');
    if (!agentWorkflowTableExists) {
      await queryRunner.createTable(
        new Table({
          name: 'agent_workflow',
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
              name: 'workflowId',
              type: 'varchar',
              length: '100',
              isNullable: false,
            },
            {
              name: 'currentStepIndex',
              type: 'int',
              default: 0,
            },
            {
              name: 'status',
              type: 'varchar',
              length: '50',
              default: "'active'",
            },
            {
              name: 'context',
              type: 'jsonb',
              default: "'{}'",
            },
            {
              name: 'error',
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

    // Agent Workflow 索引（检查是否已存在）
    const agentWorkflowTable = await queryRunner.getTable('agent_workflow');
    if (agentWorkflowTable) {
      const sessionStatusIndexExists = agentWorkflowTable.indices.some(
        (idx) => idx.name === 'IDX_agent_workflow_session_status',
      );
      if (!sessionStatusIndexExists) {
        await queryRunner.createIndex(
          'agent_workflow',
          new TableIndex({
            name: 'IDX_agent_workflow_session_status',
            columnNames: ['sessionId', 'status'],
          }),
        );
      }

      const sessionWorkflowIndexExists = agentWorkflowTable.indices.some(
        (idx) => idx.name === 'IDX_agent_workflow_session_workflow',
      );
      if (!sessionWorkflowIndexExists) {
        await queryRunner.createIndex(
          'agent_workflow',
          new TableIndex({
            name: 'IDX_agent_workflow_session_workflow',
            columnNames: ['sessionId', 'workflowId'],
          }),
        );
      }

      // Agent Workflow 外键（检查是否已存在）
      const fkExists = agentWorkflowTable.foreignKeys.some(
        (fk) =>
          fk.columnNames.includes('sessionId') &&
          fk.referencedTableName === 'agent_sessions' &&
          fk.referencedColumnNames.includes('id'),
      );
      if (!fkExists) {
        await queryRunner.createForeignKey(
          'agent_workflow',
          new TableForeignKey({
            columnNames: ['sessionId'],
            referencedColumnNames: ['id'],
            referencedTableName: 'agent_sessions',
            onDelete: 'CASCADE',
          }),
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 删除外键
    const agentWorkflowTable = await queryRunner.getTable('agent_workflow');
    if (agentWorkflowTable) {
      const foreignKey = agentWorkflowTable.foreignKeys.find(
        (fk) => fk.columnNames.indexOf('sessionId') !== -1,
      );
      if (foreignKey) {
        await queryRunner.dropForeignKey('agent_workflow', foreignKey);
      }
    }

    const agentMemoryTable = await queryRunner.getTable('agent_memory');
    if (agentMemoryTable) {
      const foreignKey = agentMemoryTable.foreignKeys.find(
        (fk) => fk.columnNames.indexOf('sessionId') !== -1,
      );
      if (foreignKey) {
        await queryRunner.dropForeignKey('agent_memory', foreignKey);
      }
    }

    // 删除表
    await queryRunner.dropTable('agent_workflow', true);
    await queryRunner.dropTable('agent_memory', true);
  }
}

