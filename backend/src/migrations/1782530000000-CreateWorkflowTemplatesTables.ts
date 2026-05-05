import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWorkflowTemplatesTables1782530000000 implements MigrationInterface {
  name = 'CreateWorkflowTemplatesTables1782530000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workflow_templates" (
        "id" varchar(64) NOT NULL,
        "author_user_id" uuid NOT NULL,
        "name" varchar(120) NOT NULL,
        "description" text NOT NULL,
        "category" varchar(24) NOT NULL,
        "steps" jsonb NOT NULL,
        "required_skills" jsonb NOT NULL,
        "visibility" varchar(16) NOT NULL,
        "install_count" integer NOT NULL DEFAULT 0,
        "created_at_ms" bigint NOT NULL,
        "updated_at_ms" bigint NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workflow_templates_id" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_workflow_templates_author_visibility"
      ON "workflow_templates" ("author_user_id", "visibility");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_workflow_templates_visibility_category"
      ON "workflow_templates" ("visibility", "category");
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workflow_instances" (
        "id" varchar(64) NOT NULL,
        "template_id" varchar(64) NOT NULL,
        "user_id" uuid NOT NULL,
        "status" varchar(16) NOT NULL,
        "current_step" integer NOT NULL,
        "started_at_ms" bigint,
        "finished_at_ms" bigint,
        "results" jsonb NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_workflow_instances_id" PRIMARY KEY ("id")
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_workflow_instances_user_started"
      ON "workflow_instances" ("user_id", "started_at_ms");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_workflow_instances_template_status"
      ON "workflow_instances" ("template_id", "status");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "workflow_instances";');
    await queryRunner.query('DROP TABLE IF EXISTS "workflow_templates";');
  }
}
