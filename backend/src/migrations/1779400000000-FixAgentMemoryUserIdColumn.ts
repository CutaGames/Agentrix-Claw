import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixAgentMemoryUserIdColumn1779400000000 implements MigrationInterface {
  name = 'FixAgentMemoryUserIdColumn1779400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('agent_memory');
    if (!hasTable) {
      return;
    }

    await this.renameColumnIfNeeded(queryRunner, 'agent_memory', 'userId', 'user_id');

    await queryRunner.query(`
      ALTER TABLE "agent_memory"
        ADD COLUMN IF NOT EXISTS "user_id" UUID;
    `);

    await queryRunner.query(`
      UPDATE "agent_memory" am
      SET "user_id" = s."user_id"
      FROM "agent_sessions" s
      WHERE am."user_id" IS NULL
        AND am."session_id" IS NOT NULL
        AND s."id" = am."session_id"
        AND s."user_id" IS NOT NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_agent_memory_user_scope"
        ON "agent_memory" ("user_id", "scope");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_agent_memory_user_agent_type"
        ON "agent_memory" ("user_id", "agent_id", "type");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_agent_memory_user_agent_type";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_agent_memory_user_scope";`);
  }

  private async renameColumnIfNeeded(
    queryRunner: QueryRunner,
    tableName: string,
    oldName: string,
    newName: string,
  ): Promise<void> {
    const table = await queryRunner.getTable(tableName);
    if (!table) {
      return;
    }

    const oldColumn = table.findColumnByName(oldName);
    const newColumn = table.findColumnByName(newName);
    if (oldColumn && !newColumn) {
      await queryRunner.renameColumn(tableName, oldName, newName);
    }
  }
}