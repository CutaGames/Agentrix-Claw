import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CreateUserReferrals (Pet Earning Flywheel · 任务 6.1)
 *
 * C 端拉新关系表。additive、幂等（IF NOT EXISTS）。一个被邀人唯一归属一个邀请人。
 */
export class CreateUserReferrals1822000000000 implements MigrationInterface {
  name = 'CreateUserReferrals1822000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_referrals" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "inviter_user_id" uuid NOT NULL,
        "invitee_user_id" uuid NOT NULL,
        "short_code" varchar(32),
        "channel" varchar(32),
        "signup_rewarded" boolean NOT NULL DEFAULT false,
        "gmv_rewarded_axp" bigint NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_user_referrals" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_referrals_invitee"
        ON "user_referrals" ("invitee_user_id");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_user_referrals_inviter"
        ON "user_referrals" ("inviter_user_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_referrals";`);
  }
}
