import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 2 W2 — DMCA report table (BE-T2.9 / BE-T3.4 / SC-T3.3).
 */
export class DmcaReportPhase2W21782720000000 implements MigrationInterface {
  name = 'DmcaReportPhase2W21782720000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "dmca_reports" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "claimant_user_id" uuid NOT NULL,
        "target_kind" varchar(32) NOT NULL,
        "target_id" uuid NOT NULL,
        "uploader_user_id" uuid,
        "right_type" varchar(32) NOT NULL DEFAULT 'copyright',
        "description" text NOT NULL,
        "evidence_urls" jsonb,
        "claimant_email" varchar(320) NOT NULL,
        "sworn_statement" boolean NOT NULL DEFAULT false,
        "status" varchar(16) NOT NULL DEFAULT 'pending',
        "reviewer_user_id" uuid,
        "review_notes" text,
        "resolved_at" timestamptz,
        "flagged_false" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_dmca_reports" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_dmca_target" ON "dmca_reports" ("target_kind", "target_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_dmca_claimant_time" ON "dmca_reports" ("claimant_user_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_dmca_status" ON "dmca_reports" ("status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_dmca_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_dmca_claimant_time"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_dmca_target"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "dmca_reports"`);
  }
}
