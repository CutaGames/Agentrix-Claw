import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class AddMarketplaceAssets1764000000100 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'marketplace_assets',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'type', type: "varchar(20)" },
          { name: 'name', type: 'varchar' },
          { name: 'symbol', type: 'varchar', isNullable: true },
          { name: 'chain', type: 'varchar', isNullable: true },
          { name: 'address', type: 'varchar', isNullable: true },
          { name: 'pair', type: 'varchar', isNullable: true },
          { name: 'source', type: 'varchar', isNullable: true },
          { name: 'externalId', type: 'varchar', isNullable: true },
          { name: 'imageUrl', type: 'varchar', isNullable: true },
          { name: 'priceUsd', type: 'numeric(24,8)', isNullable: true },
          { name: 'liquidityUsd', type: 'numeric(24,4)', isNullable: true },
          { name: 'volume24hUsd', type: 'numeric(24,4)', isNullable: true },
          { name: 'change24hPercent', type: 'numeric(10,4)', isNullable: true },
          { name: 'status', type: 'varchar(20)', default: "'active'" },
          { name: 'featured', type: 'boolean', default: false },
          { name: 'metadata', type: 'jsonb', isNullable: true },
          { name: 'lastIngestedAt', type: 'timestamp', isNullable: true },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndices('marketplace_assets', [
      new TableIndex({
        name: 'IDX_marketplace_assets_type_chain_symbol',
        columnNames: ['type', 'chain', 'symbol'],
      }),
      new TableIndex({
        name: 'IDX_marketplace_assets_type_chain_address',
        columnNames: ['type', 'chain', 'address'],
      }),
    ]);

    await queryRunner.createTable(
      new Table({
        name: 'asset_sources',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'code', type: 'varchar', isUnique: true },
          { name: 'name', type: 'varchar' },
          { name: 'url', type: 'varchar', isNullable: true },
          { name: 'status', type: 'varchar(20)', default: "'active'" },
          { name: 'metadata', type: 'jsonb', isNullable: true },
          { name: 'lastRunAt', type: 'timestamp', isNullable: true },
          { name: 'lastSuccessAt', type: 'timestamp', isNullable: true },
          { name: 'lastError', type: 'text', isNullable: true },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('asset_sources');
    await queryRunner.dropTable('marketplace_assets');
  }
}

