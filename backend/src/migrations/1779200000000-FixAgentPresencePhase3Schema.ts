import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixAgentPresencePhase3Schema1779200000000 implements MigrationInterface {
  name = 'FixAgentPresencePhase3Schema1779200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "user_agents_delegation_level_enum" AS ENUM ('observer', 'assistant', 'representative', 'autonomous');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "agent_memory_scope_enum" AS ENUM ('session', 'agent', 'user', 'shared');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "session_handoffs_status_enum" AS ENUM ('initiated', 'accepted', 'rejected', 'expired', 'completed');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "desktop_tasks_status_enum" AS ENUM ('idle', 'executing', 'need-approve', 'completed', 'failed');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await this.ensureUserAgentsColumns(queryRunner);
    await this.ensureConversationEventsTable(queryRunner);
    await this.ensureAgentMemoryColumns(queryRunner);
    await this.ensureAgentSharePoliciesTable(queryRunner);
    await this.ensureSessionHandoffsTable(queryRunner);
    await this.ensureDevicePresenceTable(queryRunner);
    await this.ensureDesktopSyncTables(queryRunner);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // This migration normalizes production schemas and backfills missing tables.
    // Reverting it would risk data loss, so down is intentionally a no-op.
  }

  private async ensureUserAgentsColumns(queryRunner: QueryRunner): Promise<void> {
    await this.renameColumnIfNeeded(queryRunner, 'user_agents', 'systemPrompt', 'system_prompt');
    await this.renameColumnIfNeeded(queryRunner, 'user_agents', 'avatarUrl', 'avatar_url');
    await this.renameColumnIfNeeded(queryRunner, 'user_agents', 'defaultModel', 'default_model');
    await this.renameColumnIfNeeded(queryRunner, 'user_agents', 'channelBindings', 'channel_bindings');
    await this.renameColumnIfNeeded(queryRunner, 'user_agents', 'memoryConfig', 'memory_config');
    await this.renameColumnIfNeeded(queryRunner, 'user_agents', 'delegationLevel', 'delegation_level');

    await queryRunner.query(`
      ALTER TABLE "user_agents"
        ADD COLUMN IF NOT EXISTS "personality" TEXT,
        ADD COLUMN IF NOT EXISTS "system_prompt" TEXT,
        ADD COLUMN IF NOT EXISTS "avatar_url" VARCHAR(500),
        ADD COLUMN IF NOT EXISTS "default_model" VARCHAR(100),
        ADD COLUMN IF NOT EXISTS "capabilities" JSONB,
        ADD COLUMN IF NOT EXISTS "channel_bindings" JSONB NOT NULL DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS "memory_config" JSONB,
        ADD COLUMN IF NOT EXISTS "delegation_level" "user_agents_delegation_level_enum" DEFAULT 'assistant';
    `);
  }

  private async ensureConversationEventsTable(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "conversation_events" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL,
        "agent_id" UUID NOT NULL,
        "session_id" UUID,
        "channel" VARCHAR(30) NOT NULL,
        "channel_message_id" VARCHAR(255),
        "direction" VARCHAR(10) NOT NULL,
        "role" VARCHAR(20) NOT NULL,
        "content_type" VARCHAR(20) DEFAULT 'text',
        "content" TEXT NOT NULL,
        "external_sender_id" VARCHAR(255),
        "external_sender_name" VARCHAR(255),
        "metadata" JSONB,
        "raw_payload" JSONB,
        "delivery_status" VARCHAR(20) DEFAULT 'delivered',
        "approval_status" VARCHAR(20),
        "approval_draft" TEXT,
        "approved_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await this.renameColumnIfNeeded(queryRunner, 'conversation_events', 'userId', 'user_id');
    await this.renameColumnIfNeeded(queryRunner, 'conversation_events', 'agentId', 'agent_id');
    await this.renameColumnIfNeeded(queryRunner, 'conversation_events', 'sessionId', 'session_id');
    await this.renameColumnIfNeeded(queryRunner, 'conversation_events', 'channelMessageId', 'channel_message_id');
    await this.renameColumnIfNeeded(queryRunner, 'conversation_events', 'contentType', 'content_type');
    await this.renameColumnIfNeeded(queryRunner, 'conversation_events', 'externalSenderId', 'external_sender_id');
    await this.renameColumnIfNeeded(queryRunner, 'conversation_events', 'externalSenderName', 'external_sender_name');
    await this.renameColumnIfNeeded(queryRunner, 'conversation_events', 'rawPayload', 'raw_payload');
    await this.renameColumnIfNeeded(queryRunner, 'conversation_events', 'deliveryStatus', 'delivery_status');
    await this.renameColumnIfNeeded(queryRunner, 'conversation_events', 'approvalStatus', 'approval_status');
    await this.renameColumnIfNeeded(queryRunner, 'conversation_events', 'approvalDraft', 'approval_draft');
    await this.renameColumnIfNeeded(queryRunner, 'conversation_events', 'approvedAt', 'approved_at');
    await this.renameColumnIfNeeded(queryRunner, 'conversation_events', 'createdAt', 'created_at');
    await this.renameColumnIfNeeded(queryRunner, 'conversation_events', 'updatedAt', 'updated_at');

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_conv_events_agent"
        ON "conversation_events" ("user_id", "agent_id", "created_at" DESC);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_conv_events_session"
        ON "conversation_events" ("session_id", "created_at");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_conv_events_channel"
        ON "conversation_events" ("channel", "created_at" DESC);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_conv_events_user_created"
        ON "conversation_events" ("user_id", "created_at" DESC);
    `);
  }

  private async ensureAgentMemoryColumns(queryRunner: QueryRunner): Promise<void> {
    await this.renameColumnIfNeeded(queryRunner, 'agent_memory', 'agentId', 'agent_id');
    await this.renameColumnIfNeeded(queryRunner, 'agent_memory', 'sessionId', 'session_id');
    await this.renameColumnIfNeeded(queryRunner, 'agent_memory', 'createdAt', 'created_at');
    await this.renameColumnIfNeeded(queryRunner, 'agent_memory', 'updatedAt', 'updated_at');

    await queryRunner.query(`
      ALTER TABLE "agent_memory"
        ADD COLUMN IF NOT EXISTS "agent_id" UUID,
        ADD COLUMN IF NOT EXISTS "scope" "agent_memory_scope_enum" DEFAULT 'session';
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_agent_memory_agent"
        ON "agent_memory" ("agent_id", "type", "created_at" DESC);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_agent_memory_scope"
        ON "agent_memory" ("agent_id", "scope");
    `);
  }

  private async ensureAgentSharePoliciesTable(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agent_share_policies" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL,
        "source_agent_id" UUID NOT NULL,
        "target_agent_id" UUID NOT NULL,
        "share_type" VARCHAR(30) NOT NULL,
        "share_mode" VARCHAR(20) NOT NULL,
        "created_at" TIMESTAMPTZ DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT "UQ_agent_share_policies_unique" UNIQUE ("user_id", "source_agent_id", "target_agent_id", "share_type")
      );
    `);

    await this.renameColumnIfNeeded(queryRunner, 'agent_share_policies', 'userId', 'user_id');
    await this.renameColumnIfNeeded(queryRunner, 'agent_share_policies', 'sourceAgentId', 'source_agent_id');
    await this.renameColumnIfNeeded(queryRunner, 'agent_share_policies', 'targetAgentId', 'target_agent_id');
    await this.renameColumnIfNeeded(queryRunner, 'agent_share_policies', 'shareType', 'share_type');
    await this.renameColumnIfNeeded(queryRunner, 'agent_share_policies', 'shareMode', 'share_mode');
    await this.renameColumnIfNeeded(queryRunner, 'agent_share_policies', 'createdAt', 'created_at');
    await this.renameColumnIfNeeded(queryRunner, 'agent_share_policies', 'updatedAt', 'updated_at');

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_share_policies_user"
        ON "agent_share_policies" ("user_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_share_policies_source"
        ON "agent_share_policies" ("source_agent_id");
    `);
  }

  private async ensureSessionHandoffsTable(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "session_handoffs" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL,
        "agent_id" UUID NOT NULL,
        "session_id" UUID,
        "source_device_id" VARCHAR(100) NOT NULL,
        "source_device_type" VARCHAR(30),
        "target_device_id" VARCHAR(100),
        "target_device_type" VARCHAR(30),
        "status" "session_handoffs_status_enum" DEFAULT 'initiated',
        "context_snapshot" JSONB,
        "accepted_at" TIMESTAMPTZ,
        "expires_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await this.renameColumnIfNeeded(queryRunner, 'session_handoffs', 'userId', 'user_id');
    await this.renameColumnIfNeeded(queryRunner, 'session_handoffs', 'agentId', 'agent_id');
    await this.renameColumnIfNeeded(queryRunner, 'session_handoffs', 'sessionId', 'session_id');
    await this.renameColumnIfNeeded(queryRunner, 'session_handoffs', 'sourceDeviceId', 'source_device_id');
    await this.renameColumnIfNeeded(queryRunner, 'session_handoffs', 'sourceDeviceType', 'source_device_type');
    await this.renameColumnIfNeeded(queryRunner, 'session_handoffs', 'targetDeviceId', 'target_device_id');
    await this.renameColumnIfNeeded(queryRunner, 'session_handoffs', 'targetDeviceType', 'target_device_type');
    await this.renameColumnIfNeeded(queryRunner, 'session_handoffs', 'contextSnapshot', 'context_snapshot');
    await this.renameColumnIfNeeded(queryRunner, 'session_handoffs', 'acceptedAt', 'accepted_at');
    await this.renameColumnIfNeeded(queryRunner, 'session_handoffs', 'expiresAt', 'expires_at');
    await this.renameColumnIfNeeded(queryRunner, 'session_handoffs', 'createdAt', 'created_at');
    await this.renameColumnIfNeeded(queryRunner, 'session_handoffs', 'updatedAt', 'updated_at');

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_session_handoffs_user_status"
        ON "session_handoffs" ("user_id", "status");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_session_handoffs_target"
        ON "session_handoffs" ("target_device_id", "status");
    `);
  }

  private async ensureDevicePresenceTable(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "device_presence" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL,
        "device_id" VARCHAR(100) NOT NULL,
        "device_type" VARCHAR(30) NOT NULL,
        "device_name" VARCHAR(200),
        "platform" VARCHAR(50),
        "app_version" VARCHAR(30),
        "last_seen_at" TIMESTAMPTZ DEFAULT NOW(),
        "is_online" BOOLEAN DEFAULT false,
        "capabilities" JSONB DEFAULT '[]',
        "metadata" JSONB,
        "created_at" TIMESTAMPTZ DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT "UQ_device_presence_user_device" UNIQUE ("user_id", "device_id")
      );
    `);

    await this.renameColumnIfNeeded(queryRunner, 'device_presence', 'userId', 'user_id');
    await this.renameColumnIfNeeded(queryRunner, 'device_presence', 'deviceId', 'device_id');
    await this.renameColumnIfNeeded(queryRunner, 'device_presence', 'deviceType', 'device_type');
    await this.renameColumnIfNeeded(queryRunner, 'device_presence', 'deviceName', 'device_name');
    await this.renameColumnIfNeeded(queryRunner, 'device_presence', 'appVersion', 'app_version');
    await this.renameColumnIfNeeded(queryRunner, 'device_presence', 'lastSeenAt', 'last_seen_at');
    await this.renameColumnIfNeeded(queryRunner, 'device_presence', 'isOnline', 'is_online');
    await this.renameColumnIfNeeded(queryRunner, 'device_presence', 'createdAt', 'created_at');
    await this.renameColumnIfNeeded(queryRunner, 'device_presence', 'updatedAt', 'updated_at');

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_device_presence_user"
        ON "device_presence" ("user_id", "is_online");
    `);
  }

  private async ensureDesktopSyncTables(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "desktop_sessions" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL,
        "session_id" VARCHAR(100) NOT NULL,
        "title" VARCHAR(200) NOT NULL DEFAULT 'New Chat',
        "message_count" INTEGER NOT NULL DEFAULT 0,
        "device_id" VARCHAR(100) NOT NULL,
        "device_type" VARCHAR(20) NOT NULL DEFAULT 'desktop',
        "messages" JSONB NOT NULL DEFAULT '[]',
        "updated_at" TIMESTAMPTZ DEFAULT NOW(),
        "created_at" TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_desktop_sessions_user_id"
        ON "desktop_sessions" ("user_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_desktop_sessions_session_id"
        ON "desktop_sessions" ("session_id");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "desktop_tasks" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL,
        "task_id" VARCHAR(100) NOT NULL,
        "device_id" VARCHAR(100) NOT NULL,
        "session_id" VARCHAR(100),
        "title" VARCHAR(300) NOT NULL,
        "summary" TEXT,
        "status" "desktop_tasks_status_enum" NOT NULL DEFAULT 'idle',
        "started_at" BIGINT,
        "finished_at" BIGINT,
        "timeline" JSONB NOT NULL DEFAULT '[]',
        "context" JSONB,
        "updated_at" TIMESTAMPTZ DEFAULT NOW(),
        "created_at" TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_desktop_tasks_user_id"
        ON "desktop_tasks" ("user_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_desktop_tasks_task_id"
        ON "desktop_tasks" ("task_id");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "desktop_approvals" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL,
        "device_id" VARCHAR(100) NOT NULL,
        "task_id" VARCHAR(100) NOT NULL,
        "timeline_entry_id" VARCHAR(100),
        "title" VARCHAR(300) NOT NULL,
        "description" TEXT NOT NULL,
        "risk_level" VARCHAR(10) NOT NULL DEFAULT 'L1',
        "session_key" VARCHAR(200),
        "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
        "responded_at" TIMESTAMPTZ,
        "response_device_id" VARCHAR(100),
        "remember_for_session" BOOLEAN NOT NULL DEFAULT false,
        "context" JSONB,
        "metadata" JSONB,
        "created_at" TIMESTAMPTZ DEFAULT NOW(),
        "updated_at_col" TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_desktop_approvals_user_id"
        ON "desktop_approvals" ("user_id");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "desktop_commands" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID NOT NULL,
        "title" VARCHAR(300) NOT NULL,
        "kind" VARCHAR(50) NOT NULL,
        "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
        "target_device_id" VARCHAR(100),
        "requester_device_id" VARCHAR(100),
        "session_id" VARCHAR(100),
        "payload" JSONB,
        "claimed_at" TIMESTAMPTZ,
        "claimed_by_device_id" VARCHAR(100),
        "completed_at" TIMESTAMPTZ,
        "result" JSONB,
        "error" TEXT,
        "created_at" TIMESTAMPTZ DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_desktop_commands_user_id"
        ON "desktop_commands" ("user_id");
    `);
  }

  private async renameColumnIfNeeded(
    queryRunner: QueryRunner,
    tableName: string,
    oldColumn: string,
    newColumn: string,
  ): Promise<void> {
    if (!(await this.hasColumn(queryRunner, tableName, oldColumn))) {
      return;
    }
    if (await this.hasColumn(queryRunner, tableName, newColumn)) {
      return;
    }
    await queryRunner.query(`ALTER TABLE "${tableName}" RENAME COLUMN "${oldColumn}" TO "${newColumn}";`);
  }

  private async hasColumn(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
  ): Promise<boolean> {
    const result = await queryRunner.query(
      `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = $1
          AND column_name = $2
        LIMIT 1
      `,
      [tableName, columnName],
    );

    return result.length > 0;
  }
}