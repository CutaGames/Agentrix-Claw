import { MigrationInterface, QueryRunner } from "typeorm";

export class AddModeToPayIntents1774600000000 implements MigrationInterface {
    name = 'AddModeToPayIntents1774600000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add mode column to pay_intents table
        await queryRunner.query(`
            ALTER TABLE "pay_intents" 
            ADD COLUMN IF NOT EXISTS "mode" character varying(20) DEFAULT 'production'
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "pay_intents" 
            DROP COLUMN "mode"
        `);
    }
}
