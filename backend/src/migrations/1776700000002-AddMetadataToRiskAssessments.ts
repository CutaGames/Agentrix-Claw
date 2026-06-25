import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add missing metadata column to risk_assessments table.
 * The RiskAssessment entity defines a jsonb metadata field
 * but the original table creation did not include it.
 */
export class AddMetadataToRiskAssessments1776700000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'risk_assessments' AND column_name = 'metadata'
        ) THEN
          ALTER TABLE "risk_assessments" ADD COLUMN "metadata" jsonb;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "risk_assessments" DROP COLUMN IF EXISTS "metadata";`);
  }
}
