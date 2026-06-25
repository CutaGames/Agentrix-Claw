import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 5 BE-10.2 / BE-10.3 — ClawCore device registry + OTA packages.
 */
export class ClawCoreDevicesAndOtaPhase5W101782760000000 implements MigrationInterface {
  name = 'ClawCoreDevicesAndOtaPhase5W101782760000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "clawcore_devices" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "device_id" varchar(64) NOT NULL,
        "label" varchar(80),
        "device_class" varchar(32) NOT NULL DEFAULT 'other',
        "vendor" varchar(64),
        "firmware_version" varchar(32),
        "dst_hash" varchar(64) NOT NULL,
        "last_nonce" bigint NOT NULL DEFAULT 0,
        "online" boolean NOT NULL DEFAULT false,
        "last_seen_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_clawcore_devices" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_clawcore_devices_user" ON "clawcore_devices" ("user_id")`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_clawcore_devices_device_id" ON "clawcore_devices" ("device_id")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "clawcore_ota_packages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "device_class" varchar(32) NOT NULL,
        "version" varchar(32) NOT NULL,
        "channel" varchar(16) NOT NULL DEFAULT 'stable',
        "size_bytes" bigint NOT NULL,
        "sha256" varchar(64) NOT NULL,
        "storage_path" varchar(512) NOT NULL,
        "notes" text,
        "mandatory" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_clawcore_ota_packages" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_clawcore_ota_class_channel" ON "clawcore_ota_packages" ("device_class", "channel")`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_clawcore_ota_class_version" ON "clawcore_ota_packages" ("device_class", "version")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "clawcore_ota_packages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "clawcore_devices"`);
  }
}
