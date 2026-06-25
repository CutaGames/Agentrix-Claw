import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AddDeliverableHumanReviewColumns
 *
 * 为 `agent_ops_deliverable` 增加「人工抽检」与「分享信号」列(additive),
 * 支撑 crypto-native-agent-ops 任务 15「可靠性度量埋点」(需求 18.2 / 18.4):
 *   - human_review_state / human_reviewed_by / human_reviewed_at / human_review_notes
 *     —— 人工抽检入口写入,供「质量合格率 = 人工抽检合格 / 已交付」统计;与自动
 *     校验器口径 `qualified` 分离,不互相覆盖。
 *   - shared_at —— 冷启动漏斗末段「付费/分享」之分享侧信号。
 *
 * 仅新增列,幂等(IF NOT EXISTS),不改既有数据。
 */
export class AddDeliverableHumanReviewColumns1818000000000
  implements MigrationInterface
{
  name = 'AddDeliverableHumanReviewColumns1818000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "agent_ops_deliverable"
        ADD COLUMN IF NOT EXISTS "human_review_state" varchar(16),
        ADD COLUMN IF NOT EXISTS "human_reviewed_by" uuid,
        ADD COLUMN IF NOT EXISTS "human_reviewed_at" timestamptz,
        ADD COLUMN IF NOT EXISTS "human_review_notes" text,
        ADD COLUMN IF NOT EXISTS "shared_at" timestamptz;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "agent_ops_deliverable"
        DROP COLUMN IF EXISTS "human_review_state",
        DROP COLUMN IF EXISTS "human_reviewed_by",
        DROP COLUMN IF EXISTS "human_reviewed_at",
        DROP COLUMN IF EXISTS "human_review_notes",
        DROP COLUMN IF EXISTS "shared_at";
    `);
  }
}
