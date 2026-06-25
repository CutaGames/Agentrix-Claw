import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFundPathsTable1734451200000 implements MigrationInterface {
    name = 'CreateFundPathsTable1734451200000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create fund_path_type enum
        await queryRunner.query(`
            DO $$ BEGIN
                CREATE TYPE "fund_path_type_enum" AS ENUM (
                    'merchant_net',
                    'platform_fee',
                    'channel_fee',
                    'promoter_share',
                    'executor_share',
                    'referrer_share',
                    'platform_fund',
                    'tax',
                    'gas_fee'
                );
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);

        // Create fund_paths table
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "fund_paths" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "payment_id" character varying NOT NULL,
                "order_id" character varying,
                "transaction_hash" character varying,
                "path_type" "fund_path_type_enum" NOT NULL,
                "from_address" character varying,
                "from_label" character varying,
                "to_address" character varying,
                "to_label" character varying,
                "amount" numeric(20,6) NOT NULL,
                "currency" character varying(10) NOT NULL,
                "rate" numeric(10,6),
                "description" text,
                "is_x402" boolean NOT NULL DEFAULT false,
                "metadata" jsonb,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_fund_paths" PRIMARY KEY ("id")
            )
        `);

        // Create indexes
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_fund_paths_payment_id" ON "fund_paths" ("payment_id")
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_fund_paths_transaction_hash" ON "fund_paths" ("transaction_hash")
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_fund_paths_created_at" ON "fund_paths" ("created_at")
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_fund_paths_path_type" ON "fund_paths" ("path_type")
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_fund_paths_is_x402" ON "fund_paths" ("is_x402")
        `);

        // Alter commission_settlements table to add new columns if not exist
        await queryRunner.query(`
            DO $$ BEGIN
                ALTER TABLE "commission_settlements" ADD COLUMN IF NOT EXISTS "order_id" character varying;
                ALTER TABLE "commission_settlements" ADD COLUMN IF NOT EXISTS "total_amount" numeric(20,6);
                ALTER TABLE "commission_settlements" ADD COLUMN IF NOT EXISTS "merchant_amount" numeric(20,6);
                ALTER TABLE "commission_settlements" ADD COLUMN IF NOT EXISTS "platform_fee" numeric(20,6);
                ALTER TABLE "commission_settlements" ADD COLUMN IF NOT EXISTS "channel_fee" numeric(20,6);
                ALTER TABLE "commission_settlements" ALTER COLUMN "payee_id" DROP NOT NULL;
                ALTER TABLE "commission_settlements" ALTER COLUMN "payee_type" DROP NOT NULL;
                ALTER TABLE "commission_settlements" ALTER COLUMN "settlement_date" DROP NOT NULL;
            EXCEPTION
                WHEN others THEN null;
            END $$;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fund_paths_is_x402"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fund_paths_path_type"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fund_paths_created_at"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fund_paths_transaction_hash"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fund_paths_payment_id"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "fund_paths"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "fund_path_type_enum"`);
    }
}
