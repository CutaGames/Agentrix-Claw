import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class AddAgentTemplatesAndUserAgents1764000000200 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const agentTemplatesExists = await queryRunner.hasTable('agent_templates');
    const userAgentsExists = await queryRunner.hasTable('user_agents');
    if (agentTemplatesExists || userAgentsExists) {
      // 已创建过，直接跳过
      return;
    }

    await queryRunner.query(
      `CREATE TYPE "agent_templates_visibility_enum" AS ENUM ('private', 'public')`,
    );
    await queryRunner.query(
      `CREATE TYPE "user_agents_status_enum" AS ENUM ('draft', 'active', 'paused')`,
    );

    await queryRunner.createTable(
      new Table({
        name: 'agent_templates',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'name', type: 'varchar', length: '150' },
          { name: 'description', type: 'text', isNullable: true },
          { name: 'category', type: 'varchar', length: '50' },
          { name: 'persona', type: 'varchar', length: '50', isNullable: true },
          { name: 'tags', type: 'text', isArray: true, default: "'{}'" },
          { name: 'config', type: 'jsonb', isNullable: true },
          { name: 'prompts', type: 'jsonb', isNullable: true },
          {
            name: 'visibility',
            type: '"agent_templates_visibility_enum"',
            default: `'private'`,
          },
          { name: 'createdBy', type: 'uuid', isNullable: true },
          { name: 'isFeatured', type: 'boolean', default: false },
          { name: 'usageCount', type: 'integer', default: 0 },
          { name: 'coverImage', type: 'varchar', length: '150', isNullable: true },
          { name: 'metadata', type: 'jsonb', isNullable: true },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndices('agent_templates', [
      new TableIndex({
        name: 'IDX_agent_templates_category_visibility',
        columnNames: ['category', 'visibility'],
      }),
      new TableIndex({
        name: 'IDX_agent_templates_created_by',
        columnNames: ['createdBy'],
      }),
    ]);

    await queryRunner.createTable(
      new Table({
        name: 'user_agents',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'userId', type: 'uuid' },
          { name: 'templateId', type: 'uuid', isNullable: true },
          { name: 'name', type: 'varchar', length: '150' },
          { name: 'description', type: 'text', isNullable: true },
          {
            name: 'status',
            type: '"user_agents_status_enum"',
            default: `'draft'`,
          },
          { name: 'isPublished', type: 'boolean', default: false },
          { name: 'slug', type: 'varchar', length: '150', isNullable: true },
          { name: 'settings', type: 'jsonb', isNullable: true },
          { name: 'metadata', type: 'jsonb', isNullable: true },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndices('user_agents', [
      new TableIndex({
        name: 'IDX_user_agents_user',
        columnNames: ['userId'],
      }),
      new TableIndex({
        name: 'IDX_user_agents_template',
        columnNames: ['templateId'],
      }),
      new TableIndex({
        name: 'IDX_user_agents_slug',
        columnNames: ['slug'],
        isUnique: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('user_agents', 'IDX_user_agents_slug');
    await queryRunner.dropIndex('user_agents', 'IDX_user_agents_template');
    await queryRunner.dropIndex('user_agents', 'IDX_user_agents_user');
    await queryRunner.dropTable('user_agents');

    await queryRunner.dropIndex('agent_templates', 'IDX_agent_templates_created_by');
    await queryRunner.dropIndex('agent_templates', 'IDX_agent_templates_category_visibility');
    await queryRunner.dropTable('agent_templates');

    await queryRunner.query(`DROP TYPE "user_agents_status_enum"`);
    await queryRunner.query(`DROP TYPE "agent_templates_visibility_enum"`);
  }
}

