import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableUnique } from 'typeorm';

export class CreateUserInstalledSkillsTable1765600000000 implements MigrationInterface {
  name = 'CreateUserInstalledSkillsTable1765600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'user_installed_skills',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'userId',
            type: 'uuid',
          },
          {
            name: 'skillId',
            type: 'uuid',
          },
          {
            name: 'isEnabled',
            type: 'boolean',
            default: true,
          },
          {
            name: 'config',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'installedAt',
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

    // Add unique constraint
    await queryRunner.createUniqueConstraint(
      'user_installed_skills',
      new TableUnique({
        name: 'UQ_user_skill',
        columnNames: ['userId', 'skillId'],
      }),
    );

    // Add foreign keys
    await queryRunner.createForeignKey(
      'user_installed_skills',
      new TableForeignKey({
        name: 'FK_user_installed_skills_user',
        columnNames: ['userId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'user_installed_skills',
      new TableForeignKey({
        name: 'FK_user_installed_skills_skill',
        columnNames: ['skillId'],
        referencedTableName: 'skills',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey('user_installed_skills', 'FK_user_installed_skills_skill');
    await queryRunner.dropForeignKey('user_installed_skills', 'FK_user_installed_skills_user');
    await queryRunner.dropUniqueConstraint('user_installed_skills', 'UQ_user_skill');
    await queryRunner.dropTable('user_installed_skills');
  }
}
