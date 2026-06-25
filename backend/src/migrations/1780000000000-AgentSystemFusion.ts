import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agent 三系统融合 — 阶段一
 *
 * 1. openclaw_instances 新增 agent_account_id FK + 从 UserAgent 迁入的字段
 * 2. 迁移 metadata.agentAccountId 软链接到正式 FK 列
 */
export class AgentSystemFusion1780000000000 implements MigrationInterface {
  name = 'AgentSystemFusion1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. 新增 agent_account_id FK 列
    await queryRunner.query(`
      ALTER TABLE openclaw_instances
        ADD COLUMN IF NOT EXISTS agent_account_id UUID
          REFERENCES agent_accounts(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_openclaw_instances_agent_account_id
        ON openclaw_instances(agent_account_id)
    `);

    // 2. 从 UserAgent 迁入的字段
    await queryRunner.query(`
      ALTER TABLE openclaw_instances
        ADD COLUMN IF NOT EXISTS system_prompt TEXT,
        ADD COLUMN IF NOT EXISTS channel_bindings JSONB DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS delegation_level VARCHAR(20) DEFAULT 'assistant',
        ADD COLUMN IF NOT EXISTS memory_config JSONB,
        ADD COLUMN IF NOT EXISTS slug VARCHAR(150),
        ADD COLUMN IF NOT EXISTS default_model VARCHAR(100)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_openclaw_instances_slug
        ON openclaw_instances(slug)
    `);

    // 3. 迁移 metadata.agentAccountId 软链接到正式 FK 列
    await queryRunner.query(`
      UPDATE openclaw_instances
      SET agent_account_id = (metadata->>'agentAccountId')::uuid
      WHERE agent_account_id IS NULL
        AND metadata->>'agentAccountId' IS NOT NULL
        AND (metadata->>'agentAccountId')::uuid IN (SELECT id FROM agent_accounts)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 将正式 FK 写回 metadata 以便回滚
    await queryRunner.query(`
      UPDATE openclaw_instances
      SET metadata = jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{agentAccountId}',
        to_jsonb(agent_account_id::text)
      )
      WHERE agent_account_id IS NOT NULL
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS idx_openclaw_instances_slug`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_openclaw_instances_agent_account_id`);
    await queryRunner.query(`
      ALTER TABLE openclaw_instances
        DROP COLUMN IF EXISTS default_model,
        DROP COLUMN IF EXISTS slug,
        DROP COLUMN IF EXISTS memory_config,
        DROP COLUMN IF EXISTS delegation_level,
        DROP COLUMN IF EXISTS channel_bindings,
        DROP COLUMN IF EXISTS system_prompt,
        DROP COLUMN IF EXISTS agent_account_id
    `);
  }
}
