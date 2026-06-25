import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAutoEarnEventsTable1782510000000 implements MigrationInterface {
  name = 'CreateAutoEarnEventsTable1782510000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "auto_earn_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "external_id" varchar(64) NOT NULL,
        "user_id" uuid NOT NULL,
        "source" varchar(32) NOT NULL,
        "amount_cents" integer NOT NULL,
        "ref_id" varchar(128),
        "note" text,
        "event_ts_ms" bigint NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_auto_earn_events_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_auto_earn_events_external_id" UNIQUE ("external_id")
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_auto_earn_events_user_ts"
      ON "auto_earn_events" ("user_id", "event_ts_ms");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_auto_earn_events_user_source_ts"
      ON "auto_earn_events" ("user_id", "source", "event_ts_ms");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "auto_earn_events";');
  }
}
