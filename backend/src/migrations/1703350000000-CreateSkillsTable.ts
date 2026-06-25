import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateSkillsTable1703350000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'skills',
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
            name: 'description',
            type: 'varchar',
            length: '500',
          },
          {
            name: 'version',
            type: 'varchar',
            length: '20',
            default: "'1.0.0'",
          },
          {
            name: 'category',
            type: 'enum',
            enum: ['payment', 'commerce', 'data', 'utility', 'integration', 'custom'],
            default: "'custom'",
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['draft', 'published', 'deprecated'],
            default: "'draft'",
          },
          {
            name: 'inputSchema',
            type: 'jsonb',
          },
          {
            name: 'outputSchema',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'executor',
            type: 'jsonb',
          },
          {
            name: 'platformSchemas',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'pricing',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'tags',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'authorId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'callCount',
            type: 'int',
            default: 0,
          },
          {
            name: 'rating',
            type: 'decimal',
            precision: 3,
            scale: 2,
            default: 0,
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

    // 创建索引
    await queryRunner.createIndex(
      'skills',
      new TableIndex({
        name: 'IDX_SKILLS_STATUS',
        columnNames: ['status'],
      }),
    );

    await queryRunner.createIndex(
      'skills',
      new TableIndex({
        name: 'IDX_SKILLS_CATEGORY',
        columnNames: ['category'],
      }),
    );

    await queryRunner.createIndex(
      'skills',
      new TableIndex({
        name: 'IDX_SKILLS_AUTHOR',
        columnNames: ['authorId'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('skills');
  }
}
