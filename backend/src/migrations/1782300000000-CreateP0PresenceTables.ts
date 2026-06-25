import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P0-W1 跨端契约表（顿领 §3.4 主宠 + §5.2 审批）
 *
 * 表:
 *   living_pets         1 user = 1 主宠（10 表情状态机 + 亲密度）
 *   approval_requests   L0/L1/L2/L3 审批中央表
 */
export class CreateP0PresenceTables1782300000000 implements MigrationInterface {
  name = 'CreateP0PresenceTables1782300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── living_pets ─────────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "living_pets_emotion_enum" AS ENUM (
          'happy','focused','concerned','tired','excited','calm',
          'love','sad','angry','sleepy'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "living_pets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "name" varchar(64) NOT NULL DEFAULT 'Aira',
        "species" varchar(32) NOT NULL DEFAULT 'aira',
        "personality" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "emotion" "living_pets_emotion_enum" NOT NULL DEFAULT 'calm',
        "emotion_intensity" smallint NOT NULL DEFAULT 0,
        "emotion_since" bigint NOT NULL DEFAULT 0,
        "emotion_decay_at" bigint NOT NULL DEFAULT 0,
        "intimacy_level" smallint NOT NULL DEFAULT 0,
        "intimacy_xp" integer NOT NULL DEFAULT 0,
        "recent_memory_snippets" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "primary_agent_id" uuid,
        "engine_switching" boolean NOT NULL DEFAULT false,
        "last_interaction_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_living_pets_id" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_living_pets_user_id" ON "living_pets" ("user_id");
    `);

    // ── approval_requests ───────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "approval_requests_status_enum" AS ENUM (
          'pending','approved','denied','timeout','cancelled'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "approval_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "action_kind" varchar(20) NOT NULL,
        "resource" varchar(64) NOT NULL,
        "amount_cents" integer,
        "chain" varchar(20),
        "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "risk_level" smallint NOT NULL,
        "initiator_surface" varchar(16) NOT NULL,
        "required_surfaces" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "status" "approval_requests_status_enum" NOT NULL DEFAULT 'pending',
        "expires_at" bigint NOT NULL DEFAULT 0,
        "approvals" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_approval_requests_id" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_approval_requests_user_status"
        ON "approval_requests" ("user_id", "status");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_approval_requests_risk_status"
        ON "approval_requests" ("risk_level", "status");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "approval_requests"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "approval_requests_status_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "living_pets"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "living_pets_emotion_enum"`);
  }
}
