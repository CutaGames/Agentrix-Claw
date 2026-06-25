import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixDesktopDevicePresenceNaming1779300000000 implements MigrationInterface {
  name = 'FixDesktopDevicePresenceNaming1779300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'desktop_device_presence'
      )
    `);

    if (!tableExists[0]?.exists) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "desktop_device_presence" (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "user_id" UUID NOT NULL,
          "device_id" VARCHAR(100) NOT NULL,
          "platform" VARCHAR(50) NOT NULL,
          "app_version" VARCHAR(30),
          "context" JSONB,
          "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
    }

    await this.renameColumnIfNeeded(queryRunner, 'desktop_device_presence', 'userId', 'user_id');
    await this.renameColumnIfNeeded(queryRunner, 'desktop_device_presence', 'deviceId', 'device_id');
    await this.renameColumnIfNeeded(queryRunner, 'desktop_device_presence', 'appVersion', 'app_version');
    await this.renameColumnIfNeeded(queryRunner, 'desktop_device_presence', 'lastSeenAt', 'last_seen_at');
    await this.renameColumnIfNeeded(queryRunner, 'desktop_device_presence', 'updatedAt', 'updated_at');
    await this.renameColumnIfNeeded(queryRunner, 'desktop_device_presence', 'createdAt', 'created_at');

    await queryRunner.query(`
      ALTER TABLE "desktop_device_presence"
        ADD COLUMN IF NOT EXISTS "user_id" UUID,
        ADD COLUMN IF NOT EXISTS "device_id" VARCHAR(100),
        ADD COLUMN IF NOT EXISTS "platform" VARCHAR(50),
        ADD COLUMN IF NOT EXISTS "app_version" VARCHAR(30),
        ADD COLUMN IF NOT EXISTS "context" JSONB,
        ADD COLUMN IF NOT EXISTS "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW();
    `);

    await queryRunner.query(`
      ALTER TABLE "desktop_device_presence"
        ALTER COLUMN "user_id" SET NOT NULL,
        ALTER COLUMN "device_id" SET NOT NULL,
        ALTER COLUMN "platform" SET NOT NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_desktop_device_presence_user_id"
        ON "desktop_device_presence" ("user_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_desktop_device_presence_device_id"
        ON "desktop_device_presence" ("device_id");
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_desktop_device_presence_user_device"
        ON "desktop_device_presence" ("user_id", "device_id");
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Keep the normalized schema.
  }

  private async renameColumnIfNeeded(
    queryRunner: QueryRunner,
    tableName: string,
    from: string,
    to: string,
  ): Promise<void> {
    const columns = await queryRunner.query(
      `
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
      `,
      [tableName],
    );

    const columnNames = columns.map((column: { column_name: string }) => column.column_name);
    if (columnNames.includes(from) && !columnNames.includes(to)) {
      await queryRunner.query(`ALTER TABLE "${tableName}" RENAME COLUMN "${from}" TO "${to}"`);
    }
  }
}