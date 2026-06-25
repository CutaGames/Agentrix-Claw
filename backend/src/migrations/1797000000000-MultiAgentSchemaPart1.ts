import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableIndex,
} from 'typeorm';

/**
 * Multi-Agent Collaboration v1 Wave 1 — schema part 1.
 *
 * Spec: `multi-agent-collaboration-2026-06`
 * See: design.md §2.2 新增 1, 2, 3, 5
 *
 * Adds:
 *   - agent_tasks.parent_task_id (UUID nullable, self-FK)
 *   - agent_tasks.target_kind (varchar 24)
 *   - agent_tasks.hired_from_user_id (varchar 64 nullable, v2 schema-only)
 *   - worktree_lanes (NEW table — replaces localStorage-only lane storage)
 *
 * All additive + nullable. Existing rows unaffected.
 *
 * v2 placeholder fields (R13.1, R13.2): `target_kind = 'marketplace-hire'`
 * and `hired_from_user_id` are schema-only in v1 — backend service rejects
 * marketplace-hire writes (Property 6, enforced by CI lint in W5).
 */
export class MultiAgentSchemaPart11797000000000 implements MigrationInterface {
  name = 'MultiAgentSchemaPart11797000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. agent_tasks: parent_task_id + target_kind + hired_from_user_id
    await queryRunner.addColumns('agent_tasks', [
      new TableColumn({
        name: 'parent_task_id',
        type: 'uuid',
        isNullable: true,
      }),
      new TableColumn({
        name: 'target_kind',
        type: 'varchar',
        length: '24',
        isNullable: false,
        default: "'leader-direct'",
      }),
      new TableColumn({
        name: 'hired_from_user_id',
        type: 'varchar',
        length: '64',
        isNullable: true,
      }),
    ]);

    await queryRunner.createIndex(
      'agent_tasks',
      new TableIndex({
        name: 'idx_agent_tasks_parent',
        columnNames: ['parent_task_id', 'created_at'],
      }),
    );
    await queryRunner.createIndex(
      'agent_tasks',
      new TableIndex({
        name: 'idx_agent_tasks_target_kind',
        columnNames: ['target_kind', 'status'],
      }),
    );

    // self-FK
    await queryRunner.query(`
      ALTER TABLE agent_tasks
      ADD CONSTRAINT fk_agent_tasks_parent_task
      FOREIGN KEY (parent_task_id) REFERENCES agent_tasks(id) ON DELETE SET NULL
    `);

    // 2. worktree_lanes table
    await queryRunner.createTable(
      new Table({
        name: 'worktree_lanes',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          { name: 'user_id', type: 'varchar', length: '64', isNullable: false },
          { name: 'workspace_dir', type: 'text', isNullable: false },
          { name: 'base_branch', type: 'varchar', length: '200', isNullable: false },
          { name: 'worktree_branch', type: 'varchar', length: '200', isNullable: false },
          { name: 'worktree_directory', type: 'varchar', length: '200', isNullable: false },
          { name: 'mission', type: 'text', isNullable: false, default: "''" },
          { name: 'focus_files', type: 'text', isNullable: false, default: "''" },
          {
            name: 'status',
            type: 'varchar',
            length: '16',
            isNullable: false,
            default: "'idle'",
          },
          // Optional binding to an agent (AgentAccount.id, varchar 64) and the
          // agent_tasks row that created the lane. Both nullable — human-
          // owned lanes have neither.
          { name: 'agent_id', type: 'varchar', length: '64', isNullable: true },
          { name: 'agent_task_id', type: 'uuid', isNullable: true },
          {
            name: 'created_at',
            type: 'timestamptz',
            isNullable: false,
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            isNullable: false,
            default: 'now()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'worktree_lanes',
      new TableIndex({
        name: 'idx_worktree_lanes_user_workspace',
        columnNames: ['user_id', 'workspace_dir'],
      }),
    );
    await queryRunner.createIndex(
      'worktree_lanes',
      new TableIndex({
        name: 'idx_worktree_lanes_agent',
        columnNames: ['agent_id'],
      }),
    );
    await queryRunner.createIndex(
      'worktree_lanes',
      new TableIndex({
        name: 'idx_worktree_lanes_task',
        columnNames: ['agent_task_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('worktree_lanes', true);
    await queryRunner.query(
      `ALTER TABLE agent_tasks DROP CONSTRAINT IF EXISTS fk_agent_tasks_parent_task`,
    );
    await queryRunner.dropIndex('agent_tasks', 'idx_agent_tasks_target_kind');
    await queryRunner.dropIndex('agent_tasks', 'idx_agent_tasks_parent');
    await queryRunner.dropColumns('agent_tasks', [
      'parent_task_id',
      'target_kind',
      'hired_from_user_id',
    ]);
  }
}
