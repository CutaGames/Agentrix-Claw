import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 5.a: add a GIN index on `agent_messages.metadata` so queries that
 * filter by metadata fields (source, instanceId, model, plan, toolCalls, etc.)
 * don't scan the entire message table once volume grows.
 *
 * Uses jsonb_path_ops for smaller/faster index when we only query containment.
 * Runs CONCURRENTLY so large existing message tables don't block writes during
 * the initial build.
 *
 * NOTE: `CREATE INDEX CONCURRENTLY` cannot run inside a transaction, so this
 * migration explicitly commits + reopens the TypeORM transaction.
 */
export class AddAgentMessageMetadataGinIndex1782000200000
  implements MigrationInterface
{
  name = 'AddAgentMessageMetadataGinIndex1782000200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // CONCURRENTLY cannot be wrapped in a transaction — commit first.
    await queryRunner.commitTransaction();
    try {
      await queryRunner.query(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_agent_messages_metadata_gin"
        ON "agent_messages"
        USING GIN ("metadata" jsonb_path_ops)
      `);
    } finally {
      // Reopen a transaction so TypeORM's migration framework can commit the
      // migration row normally.
      await queryRunner.startTransaction();
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.commitTransaction();
    try {
      await queryRunner.query(
        `DROP INDEX CONCURRENTLY IF EXISTS "idx_agent_messages_metadata_gin"`,
      );
    } finally {
      await queryRunner.startTransaction();
    }
  }
}
