import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDevicePresence1769000000400 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "desktop_device_presence" (
        "id"          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        "userId"      uuid NOT NULL,
        "deviceId"    varchar(100) NOT NULL,
        "platform"    varchar(50) NOT NULL,
        "appVersion"  varchar(30),
        "context"     jsonb,
        "lastSeenAt"  timestamptz NOT NULL DEFAULT now(),
        "updatedAt"   timestamptz NOT NULL DEFAULT now(),
        "createdAt"   timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_device_presence_userId"
        ON "desktop_device_presence" ("userId");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_device_presence_deviceId"
        ON "desktop_device_presence" ("deviceId");
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_device_presence_user_device"
        ON "desktop_device_presence" ("userId", "deviceId");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "desktop_device_presence";`);
  }
}
