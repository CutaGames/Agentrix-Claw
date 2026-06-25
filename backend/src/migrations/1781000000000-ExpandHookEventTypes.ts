import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P0.5: Expand HookEventType enum from 9 → 21 types
 * Aligns with OpenClaw upstream plugin hook lifecycle.
 */
export class ExpandHookEventTypes1781000000000 implements MigrationInterface {
  name = 'ExpandHookEventTypes1781000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const [enumExists] = await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1
        FROM pg_type t
        INNER JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'hook_configs_eventtype_enum'
          AND n.nspname = current_schema()
      ) AS "exists"
    `);

    if (!enumExists?.exists) {
      return;
    }

    // PostgreSQL allows adding new values to an existing enum
    const newValues = [
      'before_model_resolve',
      'before_prompt_build',
      'before_compaction',
      'after_compaction',
      'before_install',
      'after_install',
      'tool_result_persist',
      'gateway_start',
      'gateway_stop',
      'message_received',
      'message_sending',
      'message_sent',
    ];

    for (const val of newValues) {
      await queryRunner.query(
        `ALTER TYPE "hook_configs_eventtype_enum" ADD VALUE IF NOT EXISTS '${val}'`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values directly.
    // A full migration would recreate the type, but for safety we leave it.
    // The extra enum values are harmless if the code doesn't use them.
  }
}
