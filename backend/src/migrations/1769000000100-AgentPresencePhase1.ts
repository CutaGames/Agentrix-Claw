import { MigrationInterface, QueryRunner } from 'typeorm';

export class AgentPresencePhase11769000000100 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── R1: Upgrade user_agents with Agent Presence fields ──────────────────

    // Add ARCHIVED to status enum if not exists
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE "user_agents_status_enum" ADD VALUE IF NOT EXISTS 'archived';
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // Create delegation_level enum
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "user_agents_delegation_level_enum" AS ENUM ('observer', 'assistant', 'representative', 'autonomous');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // Add new columns to user_agents
    await queryRunner.query(`
      ALTER TABLE "user_agents"
        ADD COLUMN IF NOT EXISTS "personality" TEXT,
        ADD COLUMN IF NOT EXISTS "systemPrompt" TEXT,
        ADD COLUMN IF NOT EXISTS "avatarUrl" VARCHAR(500),
        ADD COLUMN IF NOT EXISTS "defaultModel" VARCHAR(100),
        ADD COLUMN IF NOT EXISTS "capabilities" JSONB,
        ADD COLUMN IF NOT EXISTS "channelBindings" JSONB DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS "memoryConfig" JSONB,
        ADD COLUMN IF NOT EXISTS "delegationLevel" "user_agents_delegation_level_enum" DEFAULT 'assistant';
    `);

    // ── R2: Create conversation_events unified message table ────────────────

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "conversation_events" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" UUID NOT NULL,
        "agentId" UUID NOT NULL,
        "sessionId" UUID,

        -- channel
        "channel" VARCHAR(30) NOT NULL,
        "channelMessageId" VARCHAR(255),

        -- content
        "direction" VARCHAR(10) NOT NULL,
        "role" VARCHAR(20) NOT NULL,
        "contentType" VARCHAR(20) DEFAULT 'text',
        "content" TEXT NOT NULL,

        -- external sender (social messages)
        "externalSenderId" VARCHAR(255),
        "externalSenderName" VARCHAR(255),

        -- metadata
        "metadata" JSONB,
        "rawPayload" JSONB,

        -- delivery
        "deliveryStatus" VARCHAR(20) DEFAULT 'delivered',

        -- approval
        "approvalStatus" VARCHAR(20),
        "approvalDraft" TEXT,
        "approvedAt" TIMESTAMPTZ,

        "createdAt" TIMESTAMPTZ DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_conv_events_agent"
        ON "conversation_events" ("userId", "agentId", "createdAt" DESC);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_conv_events_session"
        ON "conversation_events" ("sessionId", "createdAt");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_conv_events_channel"
        ON "conversation_events" ("channel", "createdAt" DESC);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_conv_events_user_created"
        ON "conversation_events" ("userId", "createdAt" DESC);
    `);

    // ── R3: Upgrade agent_memory with agentId + scope ───────────────────────

    // Create scope enum
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_memory_scope_enum" AS ENUM ('session', 'agent', 'user', 'shared');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "agent_memory"
        ADD COLUMN IF NOT EXISTS "agentId" UUID,
        ADD COLUMN IF NOT EXISTS "scope" "agent_memory_scope_enum" DEFAULT 'session';
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_agent_memory_agent"
        ON "agent_memory" ("agentId", "type", "createdAt" DESC);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_agent_memory_scope"
        ON "agent_memory" ("agentId", "scope");
    `);

    // ── R3 (cont): Agent share policies table ───────────────────────────────

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_share_policies" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" UUID NOT NULL,
        "sourceAgentId" UUID NOT NULL,
        "targetAgentId" UUID NOT NULL,
        "shareType" VARCHAR(30) NOT NULL,
        "shareMode" VARCHAR(20) NOT NULL,
        "createdAt" TIMESTAMPTZ DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE("userId", "sourceAgentId", "targetAgentId", "shareType")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_share_policies_user"
        ON "agent_share_policies" ("userId");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_share_policies_source"
        ON "agent_share_policies" ("sourceAgentId");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop share policies
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_share_policies";`);

    // Remove agent_memory additions
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_agent_memory_scope";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_agent_memory_agent";`);
    await queryRunner.query(`ALTER TABLE "agent_memory" DROP COLUMN IF EXISTS "scope";`);
    await queryRunner.query(`ALTER TABLE "agent_memory" DROP COLUMN IF EXISTS "agentId";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "agent_memory_scope_enum";`);

    // Drop conversation_events
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_conv_events_user_created";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_conv_events_channel";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_conv_events_session";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_conv_events_agent";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "conversation_events";`);

    // Remove user_agents additions
    await queryRunner.query(`
      ALTER TABLE "user_agents"
        DROP COLUMN IF EXISTS "personality",
        DROP COLUMN IF EXISTS "systemPrompt",
        DROP COLUMN IF EXISTS "avatarUrl",
        DROP COLUMN IF EXISTS "defaultModel",
        DROP COLUMN IF EXISTS "capabilities",
        DROP COLUMN IF EXISTS "channelBindings",
        DROP COLUMN IF EXISTS "memoryConfig",
        DROP COLUMN IF EXISTS "delegationLevel";
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS "user_agents_delegation_level_enum";`);
  }
}
