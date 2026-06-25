import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds 'drama' (interactive short-drama) to the creations type enum.
 *
 * The `creations.type` column is a Postgres ENUM `creations_type_enum`
 * originally ('game','shop','livestream','stage','place'). Interactive
 * drama is a first-class creation type now, so extend the enum.
 *
 * `ADD VALUE IF NOT EXISTS` is idempotent and supported in PG 12+ inside a
 * transaction (we only ADD the value here; we never USE it in this same
 * migration, which is the only ADD VALUE-in-tx restriction). Same pattern as
 * FixPaymindToAgentrix (ADD VALUE 'agentrix').
 */
export class AddDramaCreationType1812000000000 implements MigrationInterface {
  name = 'AddDramaCreationType1812000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Guard: only attempt if the enum type exists (older/synthetic schemas may
    // use varchar — in which case nothing to do).
    const typeExists = await queryRunner.query(
      `SELECT 1 FROM pg_type WHERE typname = 'creations_type_enum'`,
    );
    if (typeExists?.length) {
      await queryRunner.query(
        `ALTER TYPE "creations_type_enum" ADD VALUE IF NOT EXISTS 'drama'`,
      );
    }
  }

  public async down(): Promise<void> {
    // Postgres does not support removing a value from an enum without a full
    // type rebuild; intentionally a no-op (additive, non-destructive).
  }
}
