import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateCommissionSettlementTables1772000000000 implements MigrationInterface {
    name = 'CreateCommissionSettlementTables1772000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create commission_settlements table
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "commission_settlements" (
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
                CONSTRAINT "PK_commission_settlements" PRIMARY KEY ("id")
            )
        `);

        // Create commission_allocations table
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "commission_allocations" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "settlement_id" uuid,
                "agent_wallet" character varying(42) NOT NULL,
                "role" character varying(20) NOT NULL,
                "amount" numeric(20,6) NOT NULL,
                "status" character varying(20) NOT NULL,
                CONSTRAINT "PK_commission_allocations" PRIMARY KEY ("id")
            )
        `);

        // Add foreign key
        // Check if constraint exists before adding
        const constraintExists = await queryRunner.query(`
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'FK_commission_allocations_settlement'
        `);
        
        if (constraintExists.length === 0) {
            await queryRunner.query(`
                ALTER TABLE "commission_allocations" 
                ADD CONSTRAINT "FK_commission_allocations_settlement" 
                FOREIGN KEY ("settlement_id") REFERENCES "commission_settlements"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
            `);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "commission_allocations" DROP CONSTRAINT "FK_commission_allocations_settlement"`);
        await queryRunner.query(`DROP TABLE "commission_allocations"`);
        await queryRunner.query(`DROP TABLE "commission_settlements"`);
    }
}
