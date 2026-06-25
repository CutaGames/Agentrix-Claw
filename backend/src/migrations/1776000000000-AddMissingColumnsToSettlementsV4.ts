import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMissingColumnsToSettlementsV41776000000000 implements MigrationInterface {
    name = 'AddMissingColumnsToSettlementsV41776000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Ensure the commission_settlements_v4 table exists
        const tableExists = await queryRunner.query(`
            SELECT 1 FROM information_schema.tables 
            WHERE table_name = 'commission_settlements_v4'
        `);
        if (tableExists.length === 0) {
            console.log('[Migration] commission_settlements_v4 table does not exist, skipping');
            return;
        }

        // Helper: add column if not exists
        const addColumnIfNotExists = async (column: string, definition: string) => {
            const exists = await queryRunner.query(`
                SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'commission_settlements_v4' AND column_name = $1
            `, [column]);
            if (exists.length === 0) {
                await queryRunner.query(`ALTER TABLE "commission_settlements_v4" ADD COLUMN "${column}" ${definition}`);
                console.log(`[Migration] Added column ${column} to commission_settlements_v4`);
            }
        };

        // Create payee_type enum if needed
        await queryRunner.query(`
            DO $$ BEGIN
                CREATE TYPE "commission_settlements_v4_payee_type_enum" AS ENUM ('agent', 'merchant', 'agentrix');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);

        // Create status enum if needed
        await queryRunner.query(`
            DO $$ BEGIN
                CREATE TYPE "commission_settlements_v4_status_enum" AS ENUM ('pending', 'processing', 'completed', 'failed');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);

        // Add missing columns
        await addColumnIfNotExists('payee_id', 'character varying');
        await addColumnIfNotExists('payee_type', `"commission_settlements_v4_payee_type_enum"`);
        await addColumnIfNotExists('amount', 'numeric(15,6)');
        await addColumnIfNotExists('currency', `character varying(10) DEFAULT 'USDT'`);
        await addColumnIfNotExists('settlement_date', 'date');
        await addColumnIfNotExists('transaction_hash', 'character varying');

        // Make order_id nullable (V4 migration created it as NOT NULL, but entity says nullable)
        await queryRunner.query(`
            ALTER TABLE "commission_settlements_v4" ALTER COLUMN "order_id" DROP NOT NULL
        `).catch(() => { /* already nullable */ });

        // Convert status column from varchar to enum if needed
        const statusCol = await queryRunner.query(`
            SELECT data_type FROM information_schema.columns 
            WHERE table_name = 'commission_settlements_v4' AND column_name = 'status'
        `);
        if (statusCol.length > 0 && statusCol[0].data_type === 'character varying') {
            await queryRunner.query(`
                ALTER TABLE "commission_settlements_v4" 
                ALTER COLUMN "status" TYPE "commission_settlements_v4_status_enum" 
                USING status::"commission_settlements_v4_status_enum"
            `).catch((e) => {
                console.log(`[Migration] Could not convert status to enum: ${e.message}`);
            });
            await queryRunner.query(`
                ALTER TABLE "commission_settlements_v4" ALTER COLUMN "status" SET DEFAULT 'pending'
            `).catch(() => {});
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // No-op: columns are additive
    }
}
