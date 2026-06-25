import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateAssetAggregations1764000000900 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 检查表是否已存在
    const tableExists = await queryRunner.hasTable('asset_aggregations');
    if (!tableExists) {
      await queryRunner.createTable(
        new Table({
          name: 'asset_aggregations',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              generationStrategy: 'uuid',
              default: 'uuid_generate_v4()',
            },
            {
              name: 'assetId',
              type: 'varchar',
              length: '255',
              isNullable: false,
            },
            {
              name: 'assetType',
              type: 'varchar',
              length: '50',
              isNullable: false,
            },
            {
              name: 'sourcePlatform',
              type: 'varchar',
              length: '100',
              isNullable: false,
            },
            {
              name: 'sourceType',
              type: 'varchar',
              length: '50',
              isNullable: false,
            },
            {
              name: 'chain',
              type: 'varchar',
              length: '50',
              isNullable: false,
            },
            {
              name: 'contractAddress',
              type: 'varchar',
              length: '255',
              isNullable: true,
            },
            {
              name: 'tokenId',
              type: 'varchar',
              length: '255',
              isNullable: true,
            },
            {
              name: 'metadata',
              type: 'jsonb',
              isNullable: true,
            },
            {
              name: 'price',
              type: 'decimal',
              precision: 18,
              scale: 2,
              isNullable: true,
            },
            {
              name: 'currency',
              type: 'varchar',
              length: '3',
              isNullable: true,
            },
            {
              name: 'commissionRate',
              type: 'decimal',
              precision: 5,
              scale: 4,
              isNullable: true,
            },
            {
              name: 'incomeMode',
              type: 'varchar',
              length: '50',
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
    }

    // 获取表对象（用于检查索引）
    const assetAggregationsTable = await queryRunner.getTable('asset_aggregations');
    if (assetAggregationsTable) {
      // 检查必要的列是否存在
      const hasAssetId = assetAggregationsTable.findColumnByName('assetId');
      const hasSourcePlatform = assetAggregationsTable.findColumnByName('sourcePlatform');
      const hasChain = assetAggregationsTable.findColumnByName('chain');
      
      if (!hasAssetId || !hasSourcePlatform || !hasChain) {
        console.warn('⚠️  asset_aggregations 表缺少必要的列，跳过索引创建');
        return;
      }
      
      // 创建唯一索引（检查是否已存在）
      const uniqueIndexExists = assetAggregationsTable.indices.some(
        (idx) => idx.name === 'IDX_asset_aggregations_unique',
      );
      if (!uniqueIndexExists) {
        await queryRunner.createIndex(
          'asset_aggregations',
          new TableIndex({
            name: 'IDX_asset_aggregations_unique',
            columnNames: ['assetId', 'sourcePlatform', 'chain'],
            isUnique: true,
          }),
        );
      }

      // 创建索引（检查是否已存在，并检查列是否存在）
      const assetIdIndexExists = assetAggregationsTable.indices.some(
        (idx) => idx.name === 'IDX_asset_aggregations_asset_id',
      );
      if (!assetIdIndexExists && hasAssetId) {
        await queryRunner.createIndex(
          'asset_aggregations',
          new TableIndex({
            name: 'IDX_asset_aggregations_asset_id',
            columnNames: ['assetId'],
          }),
        );
      }

      const hasAssetType = assetAggregationsTable.findColumnByName('assetType');
      const typeIndexExists = assetAggregationsTable.indices.some(
        (idx) => idx.name === 'IDX_asset_aggregations_type',
      );
      if (!typeIndexExists && hasAssetType) {
        await queryRunner.createIndex(
          'asset_aggregations',
          new TableIndex({
            name: 'IDX_asset_aggregations_type',
            columnNames: ['assetType'],
          }),
        );
      }

      const sourceIndexExists = assetAggregationsTable.indices.some(
        (idx) => idx.name === 'IDX_asset_aggregations_source',
      );
      if (!sourceIndexExists && hasSourcePlatform) {
        await queryRunner.createIndex(
          'asset_aggregations',
          new TableIndex({
            name: 'IDX_asset_aggregations_source',
            columnNames: ['sourcePlatform'],
          }),
        );
      }

      const hasSourceType = assetAggregationsTable.findColumnByName('sourceType');
      const sourceTypeIndexExists = assetAggregationsTable.indices.some(
        (idx) => idx.name === 'IDX_asset_aggregations_source_type',
      );
      if (!sourceTypeIndexExists && hasSourceType) {
        await queryRunner.createIndex(
          'asset_aggregations',
          new TableIndex({
            name: 'IDX_asset_aggregations_source_type',
            columnNames: ['sourceType'],
          }),
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('asset_aggregations');
  }
}

