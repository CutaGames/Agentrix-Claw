import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDeveloperRoleToEnum1774000000000 implements MigrationInterface {
    name = 'AddDeveloperRoleToEnum1774000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add 'developer' to users_roles_enum if it doesn't exist
        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_enum 
                    WHERE enumlabel = 'developer' 
                    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'users_roles_enum')
                ) THEN
                    ALTER TYPE users_roles_enum ADD VALUE 'developer';
                END IF;
            END
            $$;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Note: PostgreSQL does not support removing enum values directly
        // You would need to recreate the enum type to remove a value
        // For now, we'll leave this empty as removing enum values is complex
    }
}
