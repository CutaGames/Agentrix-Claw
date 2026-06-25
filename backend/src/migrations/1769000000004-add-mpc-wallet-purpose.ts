import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMpcWalletPurpose1769000000004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if purpose column exists
    const table = await queryRunner.getTable('mpc_wallets');
    const purposeColumn = table?.findColumnByName('purpose');

    if (!purposeColumn) {
      await queryRunner.query(`
        ALTER TABLE "mpc_wallets" 
        ADD COLUMN "purpose" character varying NOT NULL DEFAULT 'execution'
      `);
      
      await queryRunner.query(`
        ALTER TABLE "mpc_wallets"
        ADD CONSTRAINT "CHK_mpc_wallets_purpose" 
        CHECK ("purpose" IN ('execution', 'settlement', 'dev', 'test'))
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "mpc_wallets" DROP CONSTRAINT IF EXISTS "CHK_mpc_wallets_purpose"
    `);
    await queryRunner.query(`
      ALTER TABLE "mpc_wallets" DROP COLUMN IF EXISTS "purpose"
    `);
  }
}
