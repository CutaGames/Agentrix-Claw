import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConvertPayIntentEnumsToVarchar1776700000003 implements MigrationInterface {
  name = 'ConvertPayIntentEnumsToVarchar1776700000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if status column is still a PostgreSQL enum type and convert to varchar
    // This is needed for local dev environments where original migrations created enum types.
    // Production already has varchar columns so this is a no-op there.
    await queryRunner.query(`
      DO $$
      BEGIN
        -- Convert status column from enum to varchar if needed
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'pay_intents'
            AND column_name = 'status'
            AND udt_name = 'pay_intents_status_enum'
        ) THEN
          ALTER TABLE pay_intents ALTER COLUMN status TYPE varchar(50) USING status::text;
        END IF;

        -- Convert type column from enum to varchar if needed
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'pay_intents'
            AND column_name = 'type'
            AND udt_name = 'pay_intents_type_enum'
        ) THEN
          ALTER TABLE pay_intents ALTER COLUMN type TYPE varchar(50) USING type::text;
        END IF;

        -- Ensure 'succeeded' value exists in the enum if it's still an enum (fallback)
        IF EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'pay_intents_status_enum'
        ) AND NOT EXISTS (
          SELECT 1 FROM pg_enum
          WHERE enumlabel = 'succeeded'
            AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'pay_intents_status_enum')
        ) THEN
          -- Try to add the value (may fail without superuser, so we catch the error above)
          RAISE NOTICE 'pay_intents_status_enum still exists; please run: ALTER TYPE pay_intents_status_enum ADD VALUE ''succeeded'';';
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Cannot revert varchar back to specific enum type reliably
  }
}
