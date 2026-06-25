import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds social relay fields to openclaw_instances:
 *  - telegramChatId: bound Telegram chat ID
 *  - relayToken: unique token the local agent uses to authenticate to the relay WS
 *  - relayConnected: whether local agent is currently connected
 *  - subscriptionId: Stripe subscription ID (for cloud paid tier)
 *  - subscriptionStatus: active | trialing | past_due | canceled
 *  - localOs: win | mac | linux (for local agent package download hint)
 */
export class AddSocialRelayToOpenClaw1776800000001 implements MigrationInterface {
  name = 'AddSocialRelayToOpenClaw1776800000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "openclaw_instances"
        ADD COLUMN IF NOT EXISTS "telegramChatId"   BIGINT        NULL,
        ADD COLUMN IF NOT EXISTS "relayToken"       VARCHAR(128)  NULL UNIQUE,
        ADD COLUMN IF NOT EXISTS "relayConnected"   BOOLEAN       NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS "subscriptionId"   VARCHAR(255)  NULL,
        ADD COLUMN IF NOT EXISTS "subscriptionStatus" VARCHAR(64) NULL,
        ADD COLUMN IF NOT EXISTS "localOs"          VARCHAR(16)   NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_openclaw_relay_token"
        ON "openclaw_instances" ("relayToken")
        WHERE "relayToken" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_openclaw_relay_token"`);
    await queryRunner.query(`
      ALTER TABLE "openclaw_instances"
        DROP COLUMN IF EXISTS "telegramChatId",
        DROP COLUMN IF EXISTS "relayToken",
        DROP COLUMN IF EXISTS "relayConnected",
        DROP COLUMN IF EXISTS "subscriptionId",
        DROP COLUMN IF EXISTS "subscriptionStatus",
        DROP COLUMN IF EXISTS "localOs"
    `);
  }
}
