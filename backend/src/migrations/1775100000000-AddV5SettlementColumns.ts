import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 添加 V5.0 分账模型的新字段
 * 
 * V5.0 五方分账模型：
 * 1. Stripe 通道费: 2.9% + $0.30
 * 2. 平台管理费 (Base Fee): 0.5-2% (根据商品类型)
 * 3. 激励池 (Pool Fee): 2.5-8% (根据商品类型)
 * 
 * 激励池分配：
 * - 执行 Agent: 70%
 * - 推荐 Agent: 30%
 * 
 * 平台管理费分配：
 * - 推广 Agent: 20%
 * - 平台净收益: 80%
 */
export class AddV5SettlementColumns1775100000000 implements MigrationInterface {
  name = 'AddV5SettlementColumns1775100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 添加 V5.0 Agent 字段
    await queryRunner.query(`
      ALTER TABLE "stripe_settlements"
      ADD COLUMN IF NOT EXISTS "product_type" character varying(50) DEFAULT 'PHYSICAL',
      ADD COLUMN IF NOT EXISTS "execution_agent_id" character varying,
      ADD COLUMN IF NOT EXISTS "execution_agent_connect_id" character varying,
      ADD COLUMN IF NOT EXISTS "execution_agent_amount" decimal(15,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "execution_agent_transfer_id" character varying,
      ADD COLUMN IF NOT EXISTS "recommendation_agent_id" character varying,
      ADD COLUMN IF NOT EXISTS "recommendation_agent_connect_id" character varying,
      ADD COLUMN IF NOT EXISTS "recommendation_agent_amount" decimal(15,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "recommendation_agent_transfer_id" character varying,
      ADD COLUMN IF NOT EXISTS "referral_agent_id" character varying,
      ADD COLUMN IF NOT EXISTS "referral_agent_connect_id" character varying,
      ADD COLUMN IF NOT EXISTS "referral_agent_amount" decimal(15,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "referral_agent_transfer_id" character varying,
      ADD COLUMN IF NOT EXISTS "base_fee" decimal(15,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "pool_fee" decimal(15,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "platform_net_amount" decimal(15,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "merchant_transfer_id" character varying
    `);

    // 创建新的索引
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stripe_settlements_execution_agent_id" 
      ON "stripe_settlements" ("execution_agent_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stripe_settlements_recommendation_agent_id" 
      ON "stripe_settlements" ("recommendation_agent_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stripe_settlements_referral_agent_id" 
      ON "stripe_settlements" ("referral_agent_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stripe_settlements_product_type" 
      ON "stripe_settlements" ("product_type")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 删除索引
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_stripe_settlements_product_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_stripe_settlements_referral_agent_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_stripe_settlements_recommendation_agent_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_stripe_settlements_execution_agent_id"`);

    // 删除字段
    await queryRunner.query(`
      ALTER TABLE "stripe_settlements"
      DROP COLUMN IF EXISTS "merchant_transfer_id",
      DROP COLUMN IF EXISTS "platform_net_amount",
      DROP COLUMN IF EXISTS "pool_fee",
      DROP COLUMN IF EXISTS "base_fee",
      DROP COLUMN IF EXISTS "referral_agent_transfer_id",
      DROP COLUMN IF EXISTS "referral_agent_amount",
      DROP COLUMN IF EXISTS "referral_agent_connect_id",
      DROP COLUMN IF EXISTS "referral_agent_id",
      DROP COLUMN IF EXISTS "recommendation_agent_transfer_id",
      DROP COLUMN IF EXISTS "recommendation_agent_amount",
      DROP COLUMN IF EXISTS "recommendation_agent_connect_id",
      DROP COLUMN IF EXISTS "recommendation_agent_id",
      DROP COLUMN IF EXISTS "execution_agent_transfer_id",
      DROP COLUMN IF EXISTS "execution_agent_amount",
      DROP COLUMN IF EXISTS "execution_agent_connect_id",
      DROP COLUMN IF EXISTS "execution_agent_id",
      DROP COLUMN IF EXISTS "product_type"
    `);
  }
}
