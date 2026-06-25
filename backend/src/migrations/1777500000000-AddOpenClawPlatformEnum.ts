import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add 'openclaw' value to skill_original_platform_enum so we can store
 * ClawHub-imported skills with originalPlatform = 'openclaw'.
 */
export class AddOpenClawPlatformEnum1777500000000 implements MigrationInterface {
  name = 'AddOpenClawPlatformEnum1777500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add the new enum value (idempotent — IF NOT EXISTS)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum
          WHERE enumlabel = 'openclaw'
            AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'skills_originalplatform_enum')
        ) THEN
          ALTER TYPE "skills_originalplatform_enum" ADD VALUE 'openclaw';
        END IF;
      EXCEPTION WHEN undefined_object THEN
        -- enum type might have a different name depending on TypeORM naming
        NULL;
      END $$;
    `);

    // Also try the snake_case variant TypeORM sometimes generates
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum
          WHERE enumlabel = 'openclaw'
            AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'skills_original_platform_enum')
        ) THEN
          ALTER TYPE "skills_original_platform_enum" ADD VALUE 'openclaw';
        END IF;
      EXCEPTION WHEN undefined_object THEN
        NULL;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values directly.
    // The 'openclaw' value will remain but is harmless if unused.
    this.name; // no-op
  }
}
