import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class AddTokenAndNFT1764000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 创建 tokens 表
    await queryRunner.createTable(
      new Table({
        name: 'tokens',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'name',
            type: 'varchar',
          },
          {
            name: 'symbol',
            type: 'varchar',
          },
          {
            name: 'totalSupply',
            type: 'decimal',
            precision: 36,
            scale: 18,
          },
          {
            name: 'decimals',
            type: 'int',
            default: 18,
          },
          {
            name: 'chain',
            type: 'enum',
            enum: ['ethereum', 'solana', 'bsc', 'polygon', 'base'],
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['draft', 'deploying', 'deployed', 'failed'],
            default: "'draft'",
          },
          {
            name: 'contractAddress',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'transactionHash',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'productId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'distribution',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'lockup',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'presale',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'publicSale',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'stats',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
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

    // 创建 nft_collections 表
    await queryRunner.createTable(
      new Table({
        name: 'nft_collections',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'name',
            type: 'varchar',
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'chain',
            type: 'enum',
            enum: ['ethereum', 'solana', 'bsc', 'polygon', 'base'],
          },
          {
            name: 'standard',
            type: 'enum',
            enum: ['ERC-721', 'ERC-1155', 'SPL-NFT'],
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['draft', 'deploying', 'deployed', 'failed'],
            default: "'draft'",
          },
          {
            name: 'contractAddress',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'transactionHash',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'royalty',
            type: 'decimal',
            precision: 5,
            scale: 4,
            default: 0,
          },
          {
            name: 'royaltyRecipients',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'image',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'stats',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
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

    // 创建 nfts 表
    await queryRunner.createTable(
      new Table({
        name: 'nfts',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'collectionId',
            type: 'uuid',
          },
          {
            name: 'tokenId',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'contractAddress',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'name',
            type: 'varchar',
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'image',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'attributes',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['minting', 'minted', 'listed', 'sold', 'failed'],
            default: "'minting'",
          },
          {
            name: 'metadataURI',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'price',
            type: 'decimal',
            precision: 36,
            scale: 18,
            isNullable: true,
          },
          {
            name: 'currency',
            type: 'varchar',
            default: "'USDC'",
            isNullable: true,
          },
          {
            name: 'owner',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'creator',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'transactionHash',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'productId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'salesHistory',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
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

    // 创建索引
    await queryRunner.createIndex(
      'tokens',
      new TableIndex({
        name: 'IDX_tokens_userId_status',
        columnNames: ['userId', 'status'],
      }),
    );

    await queryRunner.createIndex(
      'tokens',
      new TableIndex({
        name: 'IDX_tokens_contractAddress_chain',
        columnNames: ['contractAddress', 'chain'],
      }),
    );

    await queryRunner.createIndex(
      'nft_collections',
      new TableIndex({
        name: 'IDX_nft_collections_userId_status',
        columnNames: ['userId', 'status'],
      }),
    );

    await queryRunner.createIndex(
      'nft_collections',
      new TableIndex({
        name: 'IDX_nft_collections_contractAddress_chain',
        columnNames: ['contractAddress', 'chain'],
      }),
    );

    await queryRunner.createIndex(
      'nfts',
      new TableIndex({
        name: 'IDX_nfts_collectionId_tokenId',
        columnNames: ['collectionId', 'tokenId'],
      }),
    );

    await queryRunner.createIndex(
      'nfts',
      new TableIndex({
        name: 'IDX_nfts_contractAddress_tokenId',
        columnNames: ['contractAddress', 'tokenId'],
      }),
    );

    await queryRunner.createIndex(
      'nfts',
      new TableIndex({
        name: 'IDX_nfts_owner_status',
        columnNames: ['owner', 'status'],
      }),
    );

    // 创建外键前，确保不存在旧约束（避免重复执行迁移时报错）
    // 使用 SQL 直接删除约束，更可靠
    await queryRunner.query(
      `ALTER TABLE "tokens" DROP CONSTRAINT IF EXISTS "FK_d417e5d35f2434afc4bd48cb4d2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "nft_collections" DROP CONSTRAINT IF EXISTS "FK_d4331ef415a7c8339484fefe8b1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "nfts" DROP CONSTRAINT IF EXISTS "FK_nfts_collectionId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "nfts" DROP CONSTRAINT IF EXISTS "FK_nfts_userId"`,
    );

    // 创建外键（检查是否已存在）
    const tokensTable = await queryRunner.getTable('tokens');
    const tokensFkExists = tokensTable?.foreignKeys.some(
      (fk) =>
        fk.columnNames.includes('userId') &&
        fk.referencedTableName === 'users' &&
        fk.referencedColumnNames.includes('id'),
    );
    
    if (!tokensFkExists) {
      await queryRunner.createForeignKey(
        'tokens',
        new TableForeignKey({
          columnNames: ['userId'],
          referencedColumnNames: ['id'],
          referencedTableName: 'users',
          onDelete: 'SET NULL',
        }),
      );
    }

    const nftCollectionsTable = await queryRunner.getTable('nft_collections');
    const nftCollectionsFkExists = nftCollectionsTable?.foreignKeys.some(
      (fk) =>
        fk.columnNames.includes('userId') &&
        fk.referencedTableName === 'users' &&
        fk.referencedColumnNames.includes('id'),
    );
    
    if (!nftCollectionsFkExists) {
      await queryRunner.createForeignKey(
        'nft_collections',
        new TableForeignKey({
          columnNames: ['userId'],
          referencedColumnNames: ['id'],
          referencedTableName: 'users',
          onDelete: 'SET NULL',
        }),
      );
    }

    // 检查外键是否已存在
    const nftsTable = await queryRunner.getTable('nfts');
    const collectionIdFkExists = nftsTable?.foreignKeys.some(
      (fk) =>
        fk.columnNames.includes('collectionId') &&
        fk.referencedTableName === 'nft_collections' &&
        fk.referencedColumnNames.includes('id'),
    );
    
    if (!collectionIdFkExists) {
      await queryRunner.createForeignKey(
        'nfts',
        new TableForeignKey({
          columnNames: ['collectionId'],
          referencedColumnNames: ['id'],
          referencedTableName: 'nft_collections',
          onDelete: 'CASCADE',
        }),
      );
    }

    // 检查 nfts.userId 外键是否已存在
    const nftsUserIdFkExists = nftsTable?.foreignKeys.some(
      (fk) =>
        fk.columnNames.includes('userId') &&
        fk.referencedTableName === 'users' &&
        fk.referencedColumnNames.includes('id'),
    );
    
    if (!nftsUserIdFkExists) {
      await queryRunner.createForeignKey(
        'nfts',
        new TableForeignKey({
          columnNames: ['userId'],
          referencedColumnNames: ['id'],
          referencedTableName: 'users',
          onDelete: 'SET NULL',
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 删除外键
    const nftsTable = await queryRunner.getTable('nfts');
    if (nftsTable) {
      const foreignKeys = nftsTable.foreignKeys;
      for (const fk of foreignKeys) {
        await queryRunner.dropForeignKey('nfts', fk);
      }
    }

    const nftCollectionsTable = await queryRunner.getTable('nft_collections');
    if (nftCollectionsTable) {
      const foreignKeys = nftCollectionsTable.foreignKeys;
      for (const fk of foreignKeys) {
        await queryRunner.dropForeignKey('nft_collections', fk);
      }
    }

    const tokensTable = await queryRunner.getTable('tokens');
    if (tokensTable) {
      const foreignKeys = tokensTable.foreignKeys;
      for (const fk of foreignKeys) {
        await queryRunner.dropForeignKey('tokens', fk);
      }
    }

    // 删除索引
    await queryRunner.dropIndex('nfts', 'IDX_nfts_owner_status');
    await queryRunner.dropIndex('nfts', 'IDX_nfts_contractAddress_tokenId');
    await queryRunner.dropIndex('nfts', 'IDX_nfts_collectionId_tokenId');
    await queryRunner.dropIndex('nft_collections', 'IDX_nft_collections_contractAddress_chain');
    await queryRunner.dropIndex('nft_collections', 'IDX_nft_collections_userId_status');
    await queryRunner.dropIndex('tokens', 'IDX_tokens_contractAddress_chain');
    await queryRunner.dropIndex('tokens', 'IDX_tokens_userId_status');

    // 删除表
    await queryRunner.dropTable('nfts');
    await queryRunner.dropTable('nft_collections');
    await queryRunner.dropTable('tokens');
  }
}

