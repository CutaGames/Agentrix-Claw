import { MigrationInterface, QueryRunner } from "typeorm";

export class MigrateCommissionSettlementsV4177200000001 implements MigrationInterface {
    name = 'MigrateCommissionSettlementsV4177200000001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Since we cannot rename the old table due to permissions, we will use a new table name.
        
        // 1. Create new table commission_settlements_v4
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "commission_settlements_v4" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "order_id" character varying NOT NULL,
                "total_amount" numeric(20,6) NOT NULL,
                "merchant_amount" numeric(20,6) NOT NULL,
                "platform_fee" numeric(20,6) NOT NULL,
                "channel_fee" numeric(20,6) NOT NULL,
                "status" character varying(20) NOT NULL,
                "trigger_type" character varying(20),
                "unlock_at" TIMESTAMP,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_commission_settlements_v4" PRIMARY KEY ("id")
            )
        `);
        
        // 2. Create allocations table commission_allocations_v4
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "commission_allocations_v4" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "settlement_id" uuid,
                "agent_wallet" character varying(42) NOT NULL,
                "role" character varying(20) NOT NULL,
                "amount" numeric(20,6) NOT NULL,
                "status" character varying(20) NOT NULL,
                CONSTRAINT "PK_commission_allocations_v4" PRIMARY KEY ("id")
            )
        `);
        
        // 3. Add FK if missing
         const constraintExists = await queryRunner.query(`
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'FK_commission_allocations_v4_settlement'
        `);
        
        if (constraintExists.length === 0) {
            await queryRunner.query(`
                ALTER TABLE "commission_allocations_v4" 
                ADD CONSTRAINT "FK_commission_allocations_v4_settlement" 
                FOREIGN KEY ("settlement_id") REFERENCES "commission_settlements_v4"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
            `);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // No down implementation for now
    }
}
