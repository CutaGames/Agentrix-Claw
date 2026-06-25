import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDevicePushTokens1769000000500 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "device_push_tokens" (
        "id"            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        "userId"        uuid NOT NULL,
        "token"         varchar(500) NOT NULL,
        "platform"      varchar(20) NOT NULL,
        "deviceId"      varchar(100),
        "registeredAt"  timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_push_tokens_userId"
        ON "device_push_tokens" ("userId");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "device_push_tokens";`);
  }
}
