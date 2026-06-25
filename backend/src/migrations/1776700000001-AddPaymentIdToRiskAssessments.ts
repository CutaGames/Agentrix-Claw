import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add missing payment_id column to risk_assessments table.
 * The RiskAssessment entity has a paymentId ManyToOne relation,
 * but the original table creation only included transaction_id.
 */
export class AddPaymentIdToRiskAssessments1776700000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add payment_id column if missing
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'risk_assessments' AND column_name = 'payment_id'
        ) THEN
          ALTER TABLE "risk_assessments" ADD COLUMN "payment_id" uuid;
        END IF;
      END $$;
    `);

    // Create index
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_risk_assessments_payment_id"
      ON "risk_assessments" ("payment_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_risk_assessments_payment_id";`);
    await queryRunner.query(`ALTER TABLE "risk_assessments" DROP COLUMN IF EXISTS "payment_id";`);
  }
}
