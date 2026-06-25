import { MigrationInterface, QueryRunner } from "typeorm";

export class AddReviewFieldsToProduct1765500646878 implements MigrationInterface {
    name = 'AddReviewFieldsToProduct1765500646878'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Check if columns exist before adding to avoid errors if partial migration happened
        // Note: getTable might be heavy, so we just use IF NOT EXISTS logic in SQL or just try-catch if needed.
        // But standard SQL ALTER TABLE ADD COLUMN IF NOT EXISTS is supported in Postgres 9.6+
        
        await queryRunner.query(`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "reviewedBy" character varying`);
        await queryRunner.query(`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "reviewNote" text`);
        await queryRunner.query(`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "syncSource" character varying`);
        await queryRunner.query(`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "externalId" character varying`);
        await queryRunner.query(`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "lastSyncAt" TIMESTAMP`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "lastSyncAt"`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "externalId"`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "syncSource"`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "reviewNote"`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "reviewedAt"`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "reviewedBy"`);
    }
}
