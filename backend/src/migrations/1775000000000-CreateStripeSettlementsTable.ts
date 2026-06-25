import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 创建 stripe_settlements 表
 * 
 * 解决问题：
 * 1. P0 持久化：将内存中的 pendingSettlements 迁移到数据库
 * 2. P1 幂等性：通过 paymentIntentId 唯一索引防止重复
 * 3. P1 审计存证：添加 auditProofHash 和 auditTxHash 字段
 * 4. Stripe Connect：支持原生分账
 */
export class CreateStripeSettlementsTable1775000000000 implements MigrationInterface {
  name = 'CreateStripeSettlementsTable1775000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 创建枚举类型
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "stripe_settlement_status_enum" AS ENUM(
          'pending', 'processing', 'settled', 'failed', 'disputed', 'refunded'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // 创建表
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "stripe_settlements" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "payment_intent_id" character varying NOT NULL,
        "payment_id" character varying,
        "order_id" character varying,
        "amount" decimal(15,2) NOT NULL,
        "currency" character varying(10) NOT NULL DEFAULT 'USD',
        "stripe_fee" decimal(15,2) NOT NULL,
        "net_amount" decimal(15,2) NOT NULL,
        "merchant_id" character varying,
        "stripe_connect_account_id" character varying,
        "agent_id" character varying,
        "skill_layer_type" character varying(20) NOT NULL DEFAULT 'LOGIC',
        "commission_rate" decimal(5,4) NOT NULL DEFAULT 0.05,
        "platform_commission" decimal(15,2) NOT NULL,
        "merchant_amount" decimal(15,2) NOT NULL,
        "agent_amount" decimal(15,2) NOT NULL DEFAULT 0,
        "status" "stripe_settlement_status_enum" NOT NULL DEFAULT 'pending',
        "settlement_batch_id" character varying,
        "stripe_transfer_id" character varying,
        "transferred_at" TIMESTAMP,
        "settled_at" TIMESTAMP,
        "audit_proof_hash" character varying(128),
        "audit_tx_hash" character varying(128),
        "failure_reason" text,
        "stripe_event_id" character varying,
        "metadata" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stripe_settlements" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_stripe_settlements_payment_intent_id" UNIQUE ("payment_intent_id")
      )
    `);

    // 创建索引
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stripe_settlements_payment_intent_id" 
      ON "stripe_settlements" ("payment_intent_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stripe_settlements_payment_id" 
      ON "stripe_settlements" ("payment_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stripe_settlements_order_id" 
      ON "stripe_settlements" ("order_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stripe_settlements_merchant_id" 
      ON "stripe_settlements" ("merchant_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stripe_settlements_agent_id" 
      ON "stripe_settlements" ("agent_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stripe_settlements_status" 
      ON "stripe_settlements" ("status")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stripe_settlements_batch_id" 
      ON "stripe_settlements" ("settlement_batch_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stripe_settlements_stripe_event_id" 
      ON "stripe_settlements" ("stripe_event_id")
    `);

    // 创建组合索引用于 T+3 结算查询
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_stripe_settlements_status_created_at" 
      ON "stripe_settlements" ("status", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "stripe_settlements"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "stripe_settlement_status_enum"`);
  }
}
