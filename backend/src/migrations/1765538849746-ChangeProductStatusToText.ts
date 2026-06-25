import { MigrationInterface, QueryRunner } from "typeorm";

export class ChangeProductStatusToText1765538849746 implements MigrationInterface {
    name = 'ChangeProductStatusToText1765538849746'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Change status column to varchar, dropping the enum constraint
        await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "status" TYPE character varying`);
        await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "status" SET DEFAULT 'active'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert back to enum
        // await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "status" TYPE "products_status_enum" USING "status"::"products_status_enum"`);
    }
}
