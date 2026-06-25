import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMerchantIdToCommissionSettlement1772000000002 implements MigrationInterface {
    name = 'AddMerchantIdToCommissionSettlement1772000000002'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Only add the missing column, ignore other changes that might be caused by sync issues
        // Check if column exists first to avoid errors if run multiple times
        const hasColumn = await queryRunner.hasColumn("commission_settlements_v4", "merchant_id");
        if (!hasColumn) {
            await queryRunner.query(`ALTER TABLE "commission_settlements_v4" ADD "merchant_id" character varying`);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "commission_settlements_v4" DROP COLUMN "merchant_id"`);
    }
}
