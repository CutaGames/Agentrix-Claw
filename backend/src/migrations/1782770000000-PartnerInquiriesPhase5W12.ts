import { MigrationInterface, QueryRunner } from 'typeorm';

/** Phase 5 WB-12.1 — partner_inquiries table for the /hardware partner form. */
export class PartnerInquiriesPhase5W121782770000000 implements MigrationInterface {
  name = 'PartnerInquiriesPhase5W121782770000000';
  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS "partner_inquiries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(80) NOT NULL,
        "email" varchar(120) NOT NULL,
        "company" varchar(120) NOT NULL,
        "expected_volume" varchar(120),
        "status" varchar(32) NOT NULL DEFAULT 'new',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_partner_inquiries" PRIMARY KEY ("id")
      )
    `);
    await qr.query(`CREATE INDEX IF NOT EXISTS "idx_partner_inquiries_created_at" ON "partner_inquiries" ("created_at")`);
  }
  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS "partner_inquiries"`);
  }
}
