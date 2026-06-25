import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 修复 agent_sessions 表中 userId 为 NULL 的问题
 * 在将 userId 设置为 NOT NULL 之前，先处理现有的 NULL 值
 */
export class FixAgentSessionsUserId1764000003000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. 检查是否有 userId 为 NULL 的记录
    const nullUserIdCount = await queryRunner.query(
      `SELECT COUNT(*) as count FROM agent_sessions WHERE "userId" IS NULL`,
    );

    const count = parseInt(nullUserIdCount[0]?.count || '0', 10);

    if (count > 0) {
      console.log(`Found ${count} records with NULL userId. Handling them...`);

      // 方案1: 删除所有 userId 为 NULL 的记录（如果这些是无效数据）
      // 如果这些记录很重要，可以使用方案2：给它们分配一个默认的 userId
      
      // 方案1: 删除 NULL userId 的记录
      await queryRunner.query(
        `DELETE FROM agent_sessions WHERE "userId" IS NULL`,
      );

      console.log(`Deleted ${count} records with NULL userId`);
    }

    // 2. 现在可以安全地将 userId 设置为 NOT NULL
    // 注意：如果表已经存在外键约束，需要先删除它
    const table = await queryRunner.getTable('agent_sessions');
    const userIdColumn = table?.findColumnByName('userId');

    if (userIdColumn && userIdColumn.isNullable) {
      // 检查是否有外键约束
      const foreignKeys = table?.foreignKeys.filter(
        (fk) => fk.columnNames.includes('userId'),
      );

      // 如果有外键，先删除它
      for (const fk of foreignKeys || []) {
        await queryRunner.query(
          `ALTER TABLE agent_sessions DROP CONSTRAINT IF EXISTS "${fk.name}"`,
        );
      }

      // 将 userId 设置为 NOT NULL
      await queryRunner.query(
        `ALTER TABLE agent_sessions ALTER COLUMN "userId" SET NOT NULL`,
      );

      // 重新创建外键约束（如果需要）
      if (foreignKeys && foreignKeys.length > 0) {
        for (const fk of foreignKeys) {
          const referencedTable = fk.referencedTableName;
          const referencedColumn = fk.referencedColumnNames[0];
          await queryRunner.query(
            `ALTER TABLE agent_sessions 
             ADD CONSTRAINT "${fk.name}" 
             FOREIGN KEY ("userId") 
             REFERENCES ${referencedTable}("${referencedColumn}") 
             ON DELETE ${fk.onDelete || 'NO ACTION'} 
             ON UPDATE ${fk.onUpdate || 'NO ACTION'}`,
          );
        }
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 回滚：将 userId 改回可为空
    await queryRunner.query(
      `ALTER TABLE agent_sessions ALTER COLUMN "userId" DROP NOT NULL`,
    );
  }
}

