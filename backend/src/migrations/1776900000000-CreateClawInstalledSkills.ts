import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateClawInstalledSkills1776900000000 implements MigrationInterface {
  name = 'CreateClawInstalledSkills1776900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "claw_installed_skills" (
        "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
        "instanceId" UUID NOT NULL,
        "installedByUserId" UUID NULL,
        "skillId" UUID NOT NULL,
        "isEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
        "config" JSONB NULL,
        "installedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_claw_installed_skills" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_claw_installed_skills_instance_skill" UNIQUE ("instanceId", "skillId")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_claw_installed_skills_instanceId"
        ON "claw_installed_skills" ("instanceId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_claw_installed_skills_skillId"
        ON "claw_installed_skills" ("skillId")
    `);

    await queryRunner.query(`
      ALTER TABLE "claw_installed_skills"
      ADD CONSTRAINT "FK_claw_installed_skills_instance"
      FOREIGN KEY ("instanceId") REFERENCES "openclaw_instances"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "claw_installed_skills"
      ADD CONSTRAINT "FK_claw_installed_skills_user"
      FOREIGN KEY ("installedByUserId") REFERENCES "users"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "claw_installed_skills"
      ADD CONSTRAINT "FK_claw_installed_skills_skill"
      FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "claw_installed_skills" DROP CONSTRAINT IF EXISTS "FK_claw_installed_skills_skill"`);
    await queryRunner.query(`ALTER TABLE "claw_installed_skills" DROP CONSTRAINT IF EXISTS "FK_claw_installed_skills_user"`);
    await queryRunner.query(`ALTER TABLE "claw_installed_skills" DROP CONSTRAINT IF EXISTS "FK_claw_installed_skills_instance"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_claw_installed_skills_skillId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_claw_installed_skills_instanceId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "claw_installed_skills"`);
  }
}