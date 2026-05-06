import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 4 W8 — passkey credentials (WebAuthn).
 */
export class PasskeyCredentialsPhase4W81782750000000 implements MigrationInterface {
  name = 'PasskeyCredentialsPhase4W81782750000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "passkey_credentials" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "credential_id" varchar(512) NOT NULL,
        "public_key" text NOT NULL,
        "sign_count" bigint NOT NULL DEFAULT 0,
        "label" varchar(80),
        "transports" varchar(120),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_passkey_credentials" PRIMARY KEY ("id")
      )
    `);
    await q.query(`CREATE INDEX IF NOT EXISTS "idx_passkey_user" ON "passkey_credentials" ("user_id")`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_passkey_credential_id" ON "passkey_credentials" ("credential_id")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "passkey_credentials"`);
  }
}
