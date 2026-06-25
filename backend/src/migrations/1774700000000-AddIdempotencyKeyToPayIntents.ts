import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIdempotencyKeyToPayIntents1774700000000 implements MigrationInterface {
    name = 'AddIdempotencyKeyToPayIntents1774700000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add idempotencyKey column to pay_intents table
        await queryRunner.query(`
            ALTER TABLE "pay_intents" 
            ADD COLUMN IF NOT EXISTS "idempotencyKey" character varying
        `);
        
        // Add unique constraint
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "IDX_pay_intents_idempotencyKey" 
            ON "pay_intents" ("idempotencyKey") 
            WHERE "idempotencyKey" IS NOT NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX IF EXISTS "IDX_pay_intents_idempotencyKey"
        `);
        await queryRunner.query(`
            ALTER TABLE "pay_intents" 
            DROP COLUMN "idempotencyKey"
        `);
    }
}
