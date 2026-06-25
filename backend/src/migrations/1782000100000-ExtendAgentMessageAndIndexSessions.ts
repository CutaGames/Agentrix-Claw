import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 1.3:
 *   - Adds `stop_reason` and `tool_calls` columns to `agent_messages` so we
 *     can persist assistant turn completion state + structured tool calls
 *     without re-packing them into the oversized metadata jsonb blob.
 *   - Adds a GIN index on `agent_sessions.metadata` (specifically the
 *     `instanceId` field) so the admin dashboard can list sessions by
 *     OpenClaw instance without a full table scan.
 */
export class ExtendAgentMessageAndIndexSessions1782000100000
  implements MigrationInterface
{
  name = 'ExtendAgentMessageAndIndexSessions1782000100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // agent_messages.stop_reason
    await queryRunner.query(`
      ALTER TABLE "agent_messages"
      ADD COLUMN IF NOT EXISTS "stop_reason" varchar(32)
    `);

    // agent_messages.tool_calls
    await queryRunner.query(`
      ALTER TABLE "agent_messages"
      ADD COLUMN IF NOT EXISTS "tool_calls" jsonb
    `);

    // GIN index on agent_sessions.metadata for fast instanceId lookups.
    // Uses jsonb_path_ops for smaller/faster index when we only query containment.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_agent_sessions_metadata_gin"
      ON "agent_sessions"
      USING GIN ("metadata" jsonb_path_ops)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_agent_sessions_metadata_gin"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_messages" DROP COLUMN IF EXISTS "tool_calls"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_messages" DROP COLUMN IF EXISTS "stop_reason"`,
    );
  }
}
