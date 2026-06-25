import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateTaxRates1764000000800 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 检查表是否已存在
    const tableExists = await queryRunner.hasTable('tax_rates');
    if (!tableExists) {
      await queryRunner.createTable(
        new Table({
          name: 'tax_rates',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              generationStrategy: 'uuid',
              default: 'uuid_generate_v4()',
            },
            {
              name: 'countryCode',
              type: 'varchar',
              length: '2',
              isNullable: false,
            },
            {
              name: 'regionCode',
              type: 'varchar',
              length: '10',
              isNullable: true,
            },
            {
              name: 'taxType',
              type: 'varchar',
              length: '20',
              isNullable: false,
            },
            {
              name: 'rate',
              type: 'decimal',
              precision: 5,
              scale: 4,
              isNullable: false,
            },
            {
              name: 'effectiveDate',
              type: 'date',
              isNullable: false,
            },
            {
              name: 'endDate',
              type: 'date',
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
    const taxRatesTable = await queryRunner.getTable('tax_rates');
    if (taxRatesTable) {
      // 创建唯一索引（检查是否已存在）
      const uniqueIndexExists = taxRatesTable.indices.some(
        (idx) => idx.name === 'IDX_tax_rates_unique',
      );
      if (!uniqueIndexExists) {
        await queryRunner.createIndex(
          'tax_rates',
          new TableIndex({
            name: 'IDX_tax_rates_unique',
            columnNames: ['countryCode', 'regionCode', 'taxType', 'effectiveDate'],
            isUnique: true,
          }),
        );
      }

      // 创建索引（检查是否已存在）
      const countryIndexExists = taxRatesTable.indices.some(
        (idx) => idx.name === 'IDX_tax_rates_country',
      );
      if (!countryIndexExists) {
        await queryRunner.createIndex(
          'tax_rates',
          new TableIndex({
            name: 'IDX_tax_rates_country',
            columnNames: ['countryCode'],
          }),
        );
      }

      const regionIndexExists = taxRatesTable.indices.some(
        (idx) => idx.name === 'IDX_tax_rates_region',
      );
      if (!regionIndexExists) {
        await queryRunner.createIndex(
          'tax_rates',
          new TableIndex({
            name: 'IDX_tax_rates_region',
            columnNames: ['regionCode'],
          }),
        );
      }

      const typeIndexExists = taxRatesTable.indices.some(
        (idx) => idx.name === 'IDX_tax_rates_type',
      );
      if (!typeIndexExists) {
        await queryRunner.createIndex(
          'tax_rates',
          new TableIndex({
            name: 'IDX_tax_rates_type',
            columnNames: ['taxType'],
          }),
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('tax_rates');
  }
}

