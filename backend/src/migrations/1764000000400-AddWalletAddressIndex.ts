import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class AddWalletAddressIndex1764000000400 implements MigrationInterface {
  name = 'AddWalletAddressIndex1764000000400';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 检查索引是否已存在
    const table = await queryRunner.getTable('wallet_connections');
    const indexExists = table?.indices.some(
      (idx) => idx.name === 'IDX_wallet_connections_address',
    );

    if (!indexExists) {
      await queryRunner.createIndex(
        'wallet_connections',
        new TableIndex({
          name: 'IDX_wallet_connections_address',
          columnNames: ['walletAddress'],
          isUnique: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_wallet_connections_address"`);
  }
}


