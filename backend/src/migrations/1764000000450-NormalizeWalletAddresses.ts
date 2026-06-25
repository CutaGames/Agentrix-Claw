import { MigrationInterface, QueryRunner } from 'typeorm';

export class NormalizeWalletAddresses1764000000450 implements MigrationInterface {
  name = 'NormalizeWalletAddresses1764000000450';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 删除重复地址（仅保留最早连接的记录）
    await queryRunner.query(`
      WITH ranked AS (
        SELECT
          id,
          "walletAddress",
          LOWER("walletAddress") AS lower_address,
          ROW_NUMBER() OVER (
            PARTITION BY LOWER("walletAddress")
            ORDER BY "connectedAt"
          ) AS rn
        FROM wallet_connections
      )
      DELETE FROM wallet_connections wc
      USING ranked r
      WHERE wc.id = r.id
        AND r.rn > 1;
    `);

    // 统一转为小写
    await queryRunner.query(`
      UPDATE wallet_connections
      SET "walletAddress" = LOWER("walletAddress");
    `);
  }

  public async down(): Promise<void> {
    // 无需回滚
  }
}


