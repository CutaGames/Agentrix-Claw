import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDesktopPairSessions1780100000000 implements MigrationInterface {
  name = 'CreateDesktopPairSessions1780100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "desktop_pair_sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "session_id" character varying(120) NOT NULL,
        "token" text,
        "resolved_at" TIMESTAMP WITH TIME ZONE,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_desktop_pair_sessions_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_desktop_pair_sessions_session_id" UNIQUE ("session_id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_desktop_pair_sessions_expires_at"
      ON "desktop_pair_sessions" ("expires_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_desktop_pair_sessions_expires_at"');
    await queryRunner.query('DROP TABLE IF EXISTS "desktop_pair_sessions"');
  }
}