import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMpcWalletWorkspaceUserSnake1769000000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DO $$ BEGIN
      ALTER TABLE "mpc_wallets" ADD COLUMN IF NOT EXISTS "workspace_id" uuid;
    EXCEPTION WHEN undefined_table THEN NULL; END $$;`);

    await queryRunner.query(`DO $$ BEGIN
      ALTER TABLE "mpc_wallets" ADD COLUMN IF NOT EXISTS "user_id" uuid;
    EXCEPTION WHEN undefined_table THEN NULL; END $$;`);

    await queryRunner.query(`DO $$ BEGIN
      UPDATE "mpc_wallets" SET "workspace_id" = COALESCE("workspace_id", "workspaceId")
      WHERE "workspace_id" IS NULL AND "workspaceId" IS NOT NULL;
    EXCEPTION WHEN undefined_column THEN NULL; END $$;`);

    await queryRunner.query(`DO $$ BEGIN
      UPDATE "mpc_wallets" SET "user_id" = COALESCE("user_id", "userId")
      WHERE "user_id" IS NULL AND "userId" IS NOT NULL;
    EXCEPTION WHEN undefined_column THEN NULL; END $$;`);

    await queryRunner.query(`DO $$ BEGIN
      CREATE INDEX IF NOT EXISTS "IDX_mpc_wallets_workspace_id" ON "mpc_wallets" ("workspace_id");
    EXCEPTION WHEN undefined_table THEN NULL; END $$;`);

    await queryRunner.query(`DO $$ BEGIN
      CREATE INDEX IF NOT EXISTS "IDX_mpc_wallets_user_id" ON "mpc_wallets" ("user_id");
    EXCEPTION WHEN undefined_table THEN NULL; END $$;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DO $$ BEGIN
      DROP INDEX IF EXISTS "IDX_mpc_wallets_workspace_id";
    EXCEPTION WHEN undefined_table THEN NULL; END $$;`);

    await queryRunner.query(`DO $$ BEGIN
      DROP INDEX IF EXISTS "IDX_mpc_wallets_user_id";
    EXCEPTION WHEN undefined_table THEN NULL; END $$;`);

    await queryRunner.query(`DO $$ BEGIN
      ALTER TABLE "mpc_wallets" DROP COLUMN IF EXISTS "workspace_id";
    EXCEPTION WHEN undefined_table THEN NULL; END $$;`);

    await queryRunner.query(`DO $$ BEGIN
      ALTER TABLE "mpc_wallets" DROP COLUMN IF EXISTS "user_id";
    EXCEPTION WHEN undefined_table THEN NULL; END $$;`);
  }
}
