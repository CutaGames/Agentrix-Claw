import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixMpcWalletColumnNames1769000000003 implements MigrationInterface {
  name = 'FixMpcWalletColumnNames1769000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'mpc_wallets'
      )
    `);

    if (!tableExists[0]?.exists) {
      return;
    }

    const existingColumns = await queryRunner.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'mpc_wallets'
    `);

    const columnNames = existingColumns.map((c: any) => c.column_name);

    const renameIfNeeded = async (from: string, to: string) => {
      const hasFrom = columnNames.includes(from);
      const hasTo = columnNames.includes(to);
      if (hasFrom && !hasTo) {
        await queryRunner.query(`ALTER TABLE "mpc_wallets" RENAME COLUMN "${from}" TO "${to}"`);
      }
    };

    await renameIfNeeded('merchantId', 'merchant_id');
    await renameIfNeeded('walletAddress', 'wallet_address');
    await renameIfNeeded('encryptedShardB', 'encrypted_shard_b');
    await renameIfNeeded('isActive', 'is_active');
    await renameIfNeeded('autoSplitAuthorized', 'auto_split_authorized');
    await renameIfNeeded('autoSplitMaxAmount', 'auto_split_max_amount');
    await renameIfNeeded('autoSplitExpiresAt', 'auto_split_expires_at');
    await renameIfNeeded('createdAt', 'created_at');
    await renameIfNeeded('updatedAt', 'updated_at');

    if (!columnNames.includes('merchant_id')) {
      await queryRunner.query(`ALTER TABLE "mpc_wallets" ADD COLUMN IF NOT EXISTS "merchant_id" varchar(255)`);
      await queryRunner.query(`UPDATE "mpc_wallets" SET "merchant_id" = "merchantId" WHERE "merchant_id" IS NULL AND "merchantId" IS NOT NULL`);
    }

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_mpc_wallets_merchant_id" ON "mpc_wallets" ("merchant_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_mpc_wallets_wallet_address" ON "mpc_wallets" ("wallet_address")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_mpc_wallets_merchant_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_mpc_wallets_wallet_address"`);
  }
}
