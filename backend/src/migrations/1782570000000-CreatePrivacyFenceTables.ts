import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePrivacyFenceTables1782570000000 implements MigrationInterface {
  name = 'CreatePrivacyFenceTables1782570000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "privacy_fence_items" (
        "id" varchar(64) NOT NULL,
        "user_id" uuid NOT NULL,
        "category" varchar(24) NOT NULL,
        "text" text NOT NULL,
        "visible_to_roles" jsonb NOT NULL,
        "family_partition" varchar(64),
        "ts_ms" bigint NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_privacy_fence_items_id" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_privacy_fence_items_user_category" ON "privacy_fence_items" ("user_id", "category");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_privacy_fence_items_family_partition" ON "privacy_fence_items" ("family_partition");`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "privacy_fence_grants" (
        "id" varchar(64) NOT NULL,
        "item_id" varchar(64) NOT NULL,
        "grantee_user_id" uuid NOT NULL,
        "granted_by_user_id" uuid NOT NULL,
        "expires_at_ms" bigint NOT NULL,
        "granted_at_ms" bigint NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_privacy_fence_grants_id" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_privacy_fence_grants_item_grantee" ON "privacy_fence_grants" ("item_id", "grantee_user_id");`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "privacy_fence_audit_logs" (
        "id" varchar(64) NOT NULL,
        "ts_ms" bigint NOT NULL,
        "actor" varchar(64) NOT NULL,
        "action" varchar(16) NOT NULL,
        "item_id" varchar(64),
        "target" varchar(64),
        "category" varchar(24),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_privacy_fence_audit_logs_id" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_privacy_fence_audit_ts" ON "privacy_fence_audit_logs" ("ts_ms");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_privacy_fence_audit_actor" ON "privacy_fence_audit_logs" ("actor");`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "co_sign_requests" (
        "id" varchar(64) NOT NULL,
        "initiator_user_id" uuid NOT NULL,
        "action_kind" varchar(16) NOT NULL,
        "resource" varchar(255) NOT NULL,
        "amount_cents" integer NOT NULL,
        "required_signatures" integer NOT NULL,
        "required_surfaces" jsonb NOT NULL,
        "signatures" jsonb NOT NULL,
        "status" varchar(16) NOT NULL,
        "created_at_ms" bigint NOT NULL,
        "expires_at_ms" bigint NOT NULL,
        "finalized_at_ms" bigint,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_co_sign_requests_id" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_co_sign_requests_initiator_status" ON "co_sign_requests" ("initiator_user_id", "status");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_co_sign_requests_expires" ON "co_sign_requests" ("expires_at_ms");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "co_sign_requests";');
    await queryRunner.query('DROP TABLE IF EXISTS "privacy_fence_audit_logs";');
    await queryRunner.query('DROP TABLE IF EXISTS "privacy_fence_grants";');
    await queryRunner.query('DROP TABLE IF EXISTS "privacy_fence_items";');
  }
}
