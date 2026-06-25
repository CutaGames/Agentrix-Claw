import { MigrationInterface, QueryRunner } from "typeorm";

export class FixMissingSchema1765538849745 implements MigrationInterface {
    name = 'FixMissingSchema1765538849745'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create merchant_profiles table
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "merchant_profiles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "businessName" character varying NOT NULL, "businessLicense" character varying, "businessDescription" text, "contactInfo" jsonb, "businessInfo" jsonb, "documents" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_8177c1c1fafa1d05177b9a45329" UNIQUE ("userId"), CONSTRAINT "REL_8177c1c1fafa1d05177b9a4532" UNIQUE ("userId"), CONSTRAINT "PK_ee17ef073cf4fe64ffb6292f88e" PRIMARY KEY ("id"))`);
        
        // Add FK to merchant_profiles (if users table exists and we have permission)
        try {
            await queryRunner.query(`ALTER TABLE "merchant_profiles" ADD CONSTRAINT "FK_8177c1c1fafa1d05177b9a45329" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        } catch (e) {
            console.log('Skipping FK creation for merchant_profiles:', e.message);
        }

        // Add columns to product_reviews
        await queryRunner.query(`ALTER TABLE "product_reviews" ADD COLUMN IF NOT EXISTS "productSnapshot" jsonb`);
        await queryRunner.query(`ALTER TABLE "product_reviews" ADD COLUMN IF NOT EXISTS "reviewComment" text`);
        await queryRunner.query(`ALTER TABLE "product_reviews" ADD COLUMN IF NOT EXISTS "rejectionReason" text`);
        await queryRunner.query(`ALTER TABLE "product_reviews" ADD COLUMN IF NOT EXISTS "revisionFields" jsonb`);
        await queryRunner.query(`ALTER TABLE "product_reviews" ADD COLUMN IF NOT EXISTS "autoReviewResult" jsonb`);

        // Update products_status_enum
        // await queryRunner.query(`ALTER TYPE "public"."products_status_enum" ADD VALUE IF NOT EXISTS 'pending_review'`);
        // await queryRunner.query(`ALTER TYPE "public"."products_status_enum" ADD VALUE IF NOT EXISTS 'rejected'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop table
        await queryRunner.query(`DROP TABLE IF EXISTS "merchant_profiles"`);
        
        // Drop columns
        await queryRunner.query(`ALTER TABLE "product_reviews" DROP COLUMN IF EXISTS "productSnapshot"`);
        await queryRunner.query(`ALTER TABLE "product_reviews" DROP COLUMN IF EXISTS "reviewComment"`);
        await queryRunner.query(`ALTER TABLE "product_reviews" DROP COLUMN IF EXISTS "rejectionReason"`);
        await queryRunner.query(`ALTER TABLE "product_reviews" DROP COLUMN IF EXISTS "revisionFields"`);
        await queryRunner.query(`ALTER TABLE "product_reviews" DROP COLUMN IF EXISTS "autoReviewResult"`);
    }
}
