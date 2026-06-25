import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AddAxpFlywheelIdemIndexes (Pet Earning Flywheel · 任务 1.1 / 1.2)
 *
 * 为 AXP 软账本补两个 partial UNIQUE INDEX，作为幂等并发安全网（与 service 层
 * 事务内预检配合，Postgres 23505 → no-op）。additive、幂等（IF NOT EXISTS），
 * 不改既有数据，作用域严格限定到指定 source，不影响其他合法复用 refId 的 source。
 *
 * - uq_user_axp_ledger_referral_idem：拉新双边奖励/GMV 返佣 earn 精确一次
 *   （source ∈ referral_signup/referral_gmv_pct，需求 4）。
 * - uq_user_axp_ledger_spend_idem：收益兑付 spend 精确一次
 *   （source ∈ 兑付类，direction='spend'，需求 5）。
 */
export class AddAxpFlywheelIdemIndexes1821000000000 implements MigrationInterface {
  name = 'AddAxpFlywheelIdemIndexes1821000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_axp_ledger_referral_idem"
        ON "user_axp_ledger" ("user_id", "source", "ref_id")
        WHERE "ref_id" IS NOT NULL
          AND "source" IN ('referral_signup', 'referral_gmv_pct');
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_axp_ledger_spend_idem"
        ON "user_axp_ledger" ("user_id", "source", "ref_id")
        WHERE "direction" = 'spend'
          AND "ref_id" IS NOT NULL
          AND "source" IN ('sub_discount', 'skill_discount', 'skin_discount', 'redeem_skin');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_user_axp_ledger_spend_idem";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_user_axp_ledger_referral_idem";`);
  }
}
