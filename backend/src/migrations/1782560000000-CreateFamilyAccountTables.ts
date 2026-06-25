import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFamilyAccountTables1782560000000 implements MigrationInterface {
  name = 'CreateFamilyAccountTables1782560000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "family_accounts" (
        "id" varchar(64) NOT NULL,
        "owner_user_id" uuid NOT NULL,
        "name" varchar(120) NOT NULL,
        "plan" varchar(24) NOT NULL,
        "created_at_ms" bigint NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_family_accounts_id" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_family_accounts_owner" ON "family_accounts" ("owner_user_id");`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "family_members" (
        "id" varchar(64) NOT NULL,
        "family_id" varchar(64) NOT NULL,
        "user_id" uuid NOT NULL,
        "role" varchar(16) NOT NULL,
        "display_name" varchar(120),
        "joined_at_ms" bigint NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_family_members_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_family_members_family_user" UNIQUE ("family_id", "user_id")
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_family_members_user" ON "family_members" ("user_id");`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "family_invitations" (
        "id" varchar(64) NOT NULL,
        "family_id" varchar(64) NOT NULL,
        "invited_by_user_id" uuid NOT NULL,
        "invitee_email" varchar(180),
        "invitee_user_id" uuid,
        "proposed_role" varchar(16) NOT NULL,
        "status" varchar(16) NOT NULL,
        "code" varchar(16) NOT NULL,
        "created_at_ms" bigint NOT NULL,
        "expires_at_ms" bigint NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_family_invitations_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_family_invitations_code" UNIQUE ("code")
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_family_invitations_family_status" ON "family_invitations" ("family_id", "status");`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "family_pets" (
        "id" varchar(64) NOT NULL,
        "family_id" varchar(64) NOT NULL,
        "name" varchar(120) NOT NULL,
        "emotion" varchar(16) NOT NULL,
        "intimacy_level" integer NOT NULL,
        "shared_among_members" jsonb NOT NULL,
        "created_at_ms" bigint NOT NULL,
        "updated_at_ms" bigint NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_family_pets_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_family_pets_family" UNIQUE ("family_id")
      );
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "household_agents" (
        "id" varchar(64) NOT NULL,
        "family_id" varchar(64) NOT NULL,
        "role" varchar(24) NOT NULL,
        "name" varchar(120) NOT NULL,
        "visible_to_roles" jsonb NOT NULL,
        "active" boolean NOT NULL DEFAULT true,
        "created_at_ms" bigint NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_household_agents_id" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_household_agents_family_active" ON "household_agents" ("family_id", "active");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "household_agents";');
    await queryRunner.query('DROP TABLE IF EXISTS "family_pets";');
    await queryRunner.query('DROP TABLE IF EXISTS "family_invitations";');
    await queryRunner.query('DROP TABLE IF EXISTS "family_members";');
    await queryRunner.query('DROP TABLE IF EXISTS "family_accounts";');
  }
}
