import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pet Phase 6 — S2 主动陪伴
 *
 * 表:
 *   pet_proactive_events  Cron 评估产出的事件审计 + 状态机
 *   pet_proactive_prefs   每个用户的主动陪伴偏好（频次 / 静默时段 / 白名单）
 */
export class PetProactiveS21784500000000 implements MigrationInterface {
  name = 'PetProactiveS21784500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pet_proactive_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "kind" varchar(64) NOT NULL,
        "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "intimacy_required" smallint NOT NULL DEFAULT 0,
        "status" varchar(16) NOT NULL DEFAULT 'sent',
        "suppressed_reason" varchar(64),
        "ack_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pet_proactive_events_id" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_pet_proactive_events_user_created"
        ON "pet_proactive_events" ("user_id","created_at");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_pet_proactive_events_user_kind_created"
        ON "pet_proactive_events" ("user_id","kind","created_at");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pet_proactive_prefs" (
        "user_id" uuid NOT NULL,
        "max_per4h" smallint NOT NULL DEFAULT 1,
        "quiet_hours_start" smallint NOT NULL DEFAULT 23,
        "quiet_hours_end" smallint NOT NULL DEFAULT 8,
        "enabled_kinds" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "mute_until" bigint NOT NULL DEFAULT 0,
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pet_proactive_prefs_user_id" PRIMARY KEY ("user_id")
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "pet_proactive_prefs";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pet_proactive_events_user_kind_created";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pet_proactive_events_user_created";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pet_proactive_events";`);
  }
}
