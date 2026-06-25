import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AddLsmMarketScores
 *
 * 为 `lsm_markets` 增加 home_score / away_score（additive，幂等），
 * 用于盘口列表对 live/已结束比赛展示比分（数据来自 KMarket 内部端点）。
 * 仅新增可空列，不改既有数据。
 */
export class AddLsmMarketScores1820000000000 implements MigrationInterface {
  name = 'AddLsmMarketScores1820000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "lsm_markets"
        ADD COLUMN IF NOT EXISTS "home_score" int,
        ADD COLUMN IF NOT EXISTS "away_score" int;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "lsm_markets"
        DROP COLUMN IF EXISTS "home_score",
        DROP COLUMN IF EXISTS "away_score";
    `);
  }
}
