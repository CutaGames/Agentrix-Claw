import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AXP 幂等(soul-companion-onboarding Correctness Property 8 / R4.4 / R5.3)。
 *
 * 现象:`first_task` 的 AXP 发放经
 *   RealityLoopService.rewardFromReality(userId, amount, reason, idempotencyKey)
 *   → creditWallet(..., 'aeon_reality_reward', refId) → AxpService.earn({..., refId})
 * 但 earn() 此前对 `aeon_reality_reward` 不做 refId 去重(该 source 无日限,
 * 也无唯一约束),固定 idempotencyKey 重复触发会 **重复发放**。
 *
 * 修复:对 `aeon_reality_reward` 落「每 (user_id, source, ref_id) 至多一行」的
 * 部分唯一索引,配合 earn() 内的「发放前存在性检查 + 23505 兜底」实现 exactly-once。
 *
 * 作用域刻意收窄到 `source = 'aeon_reality_reward'`:其它 earn source 会合法地
 * 复用同一 refId 触发多次发放(coraising_owner/coraising_feed 每次投喂用
 * refId=invite.id、aeon_wage 每个周期用 refId=org.id、photo-mimic 结算时对同一
 * entry 再发一次 game_participate),全局唯一索引会误删这些合法发放。
 *
 * 列名遵循全局 SnakeNamingStrategy(user_id / source / ref_id)。
 * 建索引前先清理历史重复行(保留每个键最早的一行),否则唯一索引无法建立 ——
 * 这些重复行正是本次幂等修复要从此杜绝的「双发」记录。
 */
export class AxpLedgerRealityRewardIdempotency1801000000000 implements MigrationInterface {
  name = 'AxpLedgerRealityRewardIdempotency1801000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 0) 归档:把"将被删除的重复行"先整行存进备份表,便于事后追溯/必要时回灌
    //    (破坏性 DELETE 的稳妥兜底,用户已确认在生产执行)。备份表幂等创建。
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_axp_ledger_repair_backup" (
        LIKE "user_axp_ledger" INCLUDING ALL
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "user_axp_ledger_repair_backup"
        ADD COLUMN IF NOT EXISTS "archived_at" timestamptz NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS "archived_reason" text
    `);
    // 归档与下面 DELETE 完全相同的命中集合(同键中非最早的那些行)。
    // 用 WHERE EXISTS(而非 JOIN),保证每个"将删除"行只归档一次,避免自连接扇出。
    await queryRunner.query(`
      INSERT INTO "user_axp_ledger_repair_backup"
      SELECT a.*, now() AS "archived_at",
             'AxpLedgerRealityRewardIdempotency1801000000000' AS "archived_reason"
      FROM "user_axp_ledger" a
      WHERE a."source" = 'aeon_reality_reward'
        AND a."ref_id" IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM "user_axp_ledger" b
          WHERE b."source" = 'aeon_reality_reward'
            AND b."ref_id" IS NOT NULL
            AND b."user_id" = a."user_id"
            AND b."ref_id" = a."ref_id"
            AND (
              a."created_at" > b."created_at"
              OR (a."created_at" = b."created_at" AND a."id" > b."id")
            )
        )
    `);

    // 1) 清理历史重复:同 (user_id, 'aeon_reality_reward', ref_id) 仅保留最早一行。
    await queryRunner.query(`
      DELETE FROM "user_axp_ledger" a
      USING "user_axp_ledger" b
      WHERE a."source" = 'aeon_reality_reward'
        AND b."source" = 'aeon_reality_reward'
        AND a."ref_id" IS NOT NULL
        AND b."ref_id" IS NOT NULL
        AND a."user_id" = b."user_id"
        AND a."ref_id" = b."ref_id"
        AND (
          a."created_at" > b."created_at"
          OR (a."created_at" = b."created_at" AND a."id" > b."id")
        )
    `);

    // 2) 部分唯一索引:仅对 aeon_reality_reward 且 ref_id 非空的行强制 exactly-once。
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_axp_ledger_reality_reward_idem"
        ON "user_axp_ledger" ("user_id", "source", "ref_id")
        WHERE "ref_id" IS NOT NULL AND "source" = 'aeon_reality_reward'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_user_axp_ledger_reality_reward_idem"`);
  }
}
