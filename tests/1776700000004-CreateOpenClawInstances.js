"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateOpenClawInstances1776700000004 = void 0;
class CreateOpenClawInstances1776700000004 {
    async up(queryRunner) {
        // ENUM types (idempotent)
        await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "openclaw_instance_type_enum" AS ENUM('cloud', 'self_hosted', 'local');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);
        await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "openclaw_instance_status_enum" AS ENUM('active', 'paused', 'provisioning', 'error', 'unlinked');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);
        // Base table
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "openclaw_instances" (
        "id"               UUID          NOT NULL DEFAULT uuid_generate_v4(),
        "userId"           UUID          NOT NULL,
        "name"             VARCHAR(150)  NOT NULL,
        "instanceType"     "openclaw_instance_type_enum" NOT NULL DEFAULT 'self_hosted',
        "status"           "openclaw_instance_status_enum" NOT NULL DEFAULT 'active',
        "instanceUrl"      TEXT          NULL,
        "instanceToken"    TEXT          NULL,
        "cloudInstanceId"  VARCHAR(255)  NULL,
        "personality"      VARCHAR(100)  NULL,
        "isPrimary"        BOOLEAN       NOT NULL DEFAULT FALSE,
        "capabilities"     JSONB         NULL,
        "metadata"         JSONB         NULL,
        "createdAt"        TIMESTAMP     NOT NULL DEFAULT now(),
        "updatedAt"        TIMESTAMP     NOT NULL DEFAULT now(),
        CONSTRAINT "PK_openclaw_instances" PRIMARY KEY ("id")
      )
    `);
        // Indexes
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_openclaw_instances_userId"
        ON "openclaw_instances" ("userId")
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_openclaw_instances_userId"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "openclaw_instances" CASCADE`);
        await queryRunner.query(`DROP TYPE IF EXISTS "openclaw_instance_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "openclaw_instance_type_enum"`);
    }
}
exports.CreateOpenClawInstances1776700000004 = CreateOpenClawInstances1776700000004;
CreateOpenClawInstances1776700000004.prototype.name = 'CreateOpenClawInstances1776700000004';
