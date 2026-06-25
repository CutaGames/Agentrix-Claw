import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEscrowsTable1776600000000 implements MigrationInterface {
  name = 'CreateEscrowsTable1776600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum type for escrow status
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."escrows_status_enum" AS ENUM(
          'pending', 'funded', 'confirmed', 'disputed', 'released', 'refunded'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$
    `);

    // Create escrows table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "escrows" (
        "id"               uuid                                    NOT NULL DEFAULT uuid_generate_v4(),
        "payment_id"       character varying,
        "merchant_id"      character varying                       NOT NULL,
        "user_id"          character varying                       NOT NULL,
        "amount"           numeric(18,2)                           NOT NULL,
        "currency"         character varying(10)                   NOT NULL DEFAULT 'USD',
        "commission_rate"  numeric(5,4),
        "auto_release_days" integer                                NOT NULL DEFAULT 7,
        "description"      character varying,
        "order_type"       character varying,
        "settlement_type"  character varying,
        "commission"       jsonb,
        "status"           "public"."escrows_status_enum"          NOT NULL DEFAULT 'pending',
        "transaction_hash" character varying,
        "contract_address" character varying,
        "confirmed_at"     TIMESTAMP WITH TIME ZONE,
        "released_at"      TIMESTAMP WITH TIME ZONE,
        "dispute_reason"   character varying,
        "release_details"  jsonb,
        "metadata"         jsonb,
        "created_at"       TIMESTAMP                               NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMP                               NOT NULL DEFAULT now(),
        CONSTRAINT "PK_escrows" PRIMARY KEY ("id")
      )
    `);

    // Create indexes
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_escrows_status_created_at" ON "escrows" ("status", "created_at")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_escrows_user_id" ON "escrows" ("user_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_escrows_merchant_id" ON "escrows" ("merchant_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_escrows_payment_id" ON "escrows" ("payment_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_escrows_payment_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_escrows_merchant_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_escrows_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_escrows_status_created_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "escrows"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."escrows_status_enum"`);
  }
}
