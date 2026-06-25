import { MigrationInterface, QueryRunner } from 'typeorm';

export class SessionHandoff1769000000200 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create handoff status enum
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "session_handoffs_status_enum" AS ENUM ('initiated', 'accepted', 'rejected', 'expired', 'completed');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // Create session_handoffs table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "session_handoffs" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" UUID NOT NULL,
        "agentId" UUID NOT NULL,
        "sessionId" UUID,
        "sourceDeviceId" VARCHAR(100) NOT NULL,
        "sourceDeviceType" VARCHAR(30),
        "targetDeviceId" VARCHAR(100),
        "targetDeviceType" VARCHAR(30),
        "status" "session_handoffs_status_enum" DEFAULT 'initiated',
        "contextSnapshot" JSONB,
        "acceptedAt" TIMESTAMPTZ,
        "expiresAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_session_handoffs_user_status"
        ON "session_handoffs" ("userId", "status");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_session_handoffs_target"
        ON "session_handoffs" ("targetDeviceId", "status");
    `);

    // Create device_presence table for persistent device registry
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "device_presence" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" UUID NOT NULL,
        "deviceId" VARCHAR(100) NOT NULL,
        "deviceType" VARCHAR(30) NOT NULL,
        "deviceName" VARCHAR(200),
        "platform" VARCHAR(50),
        "appVersion" VARCHAR(30),
        "lastSeenAt" TIMESTAMPTZ DEFAULT NOW(),
        "isOnline" BOOLEAN DEFAULT false,
        "capabilities" JSONB DEFAULT '[]',
        "metadata" JSONB,
        "createdAt" TIMESTAMPTZ DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE("userId", "deviceId")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_device_presence_user"
        ON "device_presence" ("userId", "isOnline");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "device_presence";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_session_handoffs_target";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_session_handoffs_user_status";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "session_handoffs";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "session_handoffs_status_enum";`);
  }
}
