import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVitalsEventsTable1782500000000 implements MigrationInterface {
  name = 'CreateVitalsEventsTable1782500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "vitals_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "metric" varchar(32) NOT NULL,
        "value" double precision NOT NULL,
        "source_device_id" varchar(100),
        "source_surface" varchar(20),
        "event_ts_ms" bigint NOT NULL,
        "reaction" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_vitals_events_id" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_vitals_events_user_ts"
      ON "vitals_events" ("user_id", "event_ts_ms");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_vitals_events_user_metric_ts"
      ON "vitals_events" ("user_id", "metric", "event_ts_ms");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "vitals_events";');
  }
}
