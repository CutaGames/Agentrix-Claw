import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMpcWalletWorkspaceUser1769000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DO $$ BEGIN
      ALTER TABLE "mpc_wallets" ADD COLUMN IF NOT EXISTS "workspaceId" uuid;
    EXCEPTION WHEN undefined_table THEN NULL; END $$;`);

    await queryRunner.query(`DO $$ BEGIN
      ALTER TABLE "mpc_wallets" ADD COLUMN IF NOT EXISTS "userId" uuid;
    EXCEPTION WHEN undefined_table THEN NULL; END $$;`);

    await queryRunner.query(`DO $$ BEGIN
      CREATE INDEX IF NOT EXISTS "IDX_mpc_wallets_workspaceId" ON "mpc_wallets" ("workspaceId");
    EXCEPTION WHEN undefined_table THEN NULL; END $$;`);

    await queryRunner.query(`DO $$ BEGIN
      CREATE INDEX IF NOT EXISTS "IDX_mpc_wallets_userId" ON "mpc_wallets" ("userId");
    EXCEPTION WHEN undefined_table THEN NULL; END $$;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DO $$ BEGIN
      DROP INDEX IF EXISTS "IDX_mpc_wallets_workspaceId";
    EXCEPTION WHEN undefined_table THEN NULL; END $$;`);

    await queryRunner.query(`DO $$ BEGIN
      DROP INDEX IF EXISTS "IDX_mpc_wallets_userId";
    EXCEPTION WHEN undefined_table THEN NULL; END $$;`);

    await queryRunner.query(`DO $$ BEGIN
      ALTER TABLE "mpc_wallets" DROP COLUMN IF EXISTS "workspaceId";
    EXCEPTION WHEN undefined_table THEN NULL; END $$;`);

    await queryRunner.query(`DO $$ BEGIN
      ALTER TABLE "mpc_wallets" DROP COLUMN IF EXISTS "userId";
    EXCEPTION WHEN undefined_table THEN NULL; END $$;`);
  }
}
