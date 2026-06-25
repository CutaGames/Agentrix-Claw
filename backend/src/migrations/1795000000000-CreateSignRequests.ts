/**
 * P-9 Companion Redesign Task 0.6: sign_requests table for
 * Trust3_Signing_Sheet flow + Cross_Device_Token signing.
 *
 * - Snake-case columns (TypeORM SnakeNamingStrategy is global; entity uses
 *   camelCase property names). Column names are auto-derived; this migration
 *   uses explicit snake_case to match what the strategy produces.
 * - Idempotency: index on idempotency_key for short-circuit dedup.
 * - Cron sweeper queries `expires_at < now AND status='pending'` → indexed.
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSignRequests1795000000000 implements MigrationInterface {
  name = 'CreateSignRequests1795000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "sign_requests_reason_enum" AS ENUM (
          'wallet-transfer',
          'marketplace-purchase',
          'skill-install',
          'remote-control',
          'approval',
          'agentic-commerce-overlimit'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "sign_requests_status_enum" AS ENUM (
          'pending', 'completed', 'cancelled', 'expired'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "sign_requests" (
        "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" UUID NOT NULL,
        "reason" "sign_requests_reason_enum" NOT NULL,
        "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "status" "sign_requests_status_enum" NOT NULL DEFAULT 'pending',
        "signature" TEXT,
        "idempotency_key" TEXT,
        "origin_device_id" TEXT,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "completed_at" TIMESTAMP,
        "expires_at" TIMESTAMP NOT NULL,
        CONSTRAINT "PK_sign_requests" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_sign_requests_user_status"
        ON "sign_requests" ("user_id", "status")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_sign_requests_idempotency"
        ON "sign_requests" ("idempotency_key")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_sign_requests_user_id"
        ON "sign_requests" ("user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_sign_requests_expires_pending"
        ON "sign_requests" ("expires_at") WHERE "status" = 'pending'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sign_requests_expires_pending"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sign_requests_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sign_requests_idempotency"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sign_requests_user_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sign_requests"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "sign_requests_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "sign_requests_reason_enum"`);
  }
}
