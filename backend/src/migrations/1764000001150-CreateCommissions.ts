import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateCommissions1764000001150 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 检查表是否已存在
    const tableExists = await queryRunner.hasTable('commissions');
    
    if (!tableExists) {
      // 创建 payeeType 枚举类型
      await queryRunner.query(`
        DO $$ BEGIN
          CREATE TYPE "public"."commissions_payeetype_enum" AS ENUM('agent', 'merchant', 'agentrix');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);

      // 创建 assetType 枚举类型（如果不存在）
      await queryRunner.query(`
        DO $$ BEGIN
          CREATE TYPE "public"."orders_assettype_enum" AS ENUM('physical', 'service', 'virtual', 'nft_rwa', 'dev_tool', 'aggregated_web2', 'aggregated_web3');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);

      // 创建 commissions 表
      await queryRunner.createTable(
        new Table({
          name: 'commissions',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              generationStrategy: 'uuid',
              default: 'uuid_generate_v4()',
            },
            {
              name: 'orderId',
              type: 'uuid',
              isNullable: true,
            },
            {
              name: 'paymentId',
              type: 'uuid',
              isNullable: false,
            },
            {
              name: 'payeeId',
              type: 'uuid',
              isNullable: false,
            },
            {
              name: 'payeeType',
              type: 'enum',
              enum: ['agent', 'merchant', 'agentrix'],
              enumName: 'commissions_payeetype_enum',
              isNullable: false,
            },
            {
              name: 'agentType',
              type: 'varchar',
              length: '50',
              isNullable: true,
            },
            {
              name: 'amount',
              type: 'decimal',
              precision: 15,
              scale: 2,
              isNullable: false,
            },
            {
              name: 'currency',
              type: 'varchar',
              length: '10',
              isNullable: false,
            },
            {
              name: 'commissionBase',
              type: 'decimal',
              precision: 18,
              scale: 2,
              isNullable: true,
            },
            {
              name: 'channelFee',
              type: 'decimal',
              precision: 18,
              scale: 2,
              isNullable: true,
            },
            {
              name: 'sessionId',
              type: 'uuid',
              isNullable: true,
            },
            {
              name: 'assetType',
              type: 'enum',
              enum: ['physical', 'service', 'virtual', 'nft_rwa', 'dev_tool', 'aggregated_web2', 'aggregated_web3'],
              enumName: 'orders_assettype_enum',
              isNullable: true,
            },
            {
              name: 'settlementAvailableAt',
              type: 'timestamptz',
              isNullable: true,
            },
            {
              name: 'status',
              type: 'varchar',
              default: "'locked'",
              isNullable: false,
            },
            {
              name: 'breakdown',
              type: 'jsonb',
              isNullable: true,
            },
            {
              name: 'createdAt',
              type: 'timestamp',
              default: 'CURRENT_TIMESTAMP',
            },
            {
              name: 'updatedAt',
              type: 'timestamp',
              default: 'CURRENT_TIMESTAMP',
            },
          ],
        }),
        true,
      );

      // 创建索引
      await queryRunner.createIndex(
        'commissions',
        new TableIndex({
          name: 'IDX_commissions_paymentId',
          columnNames: ['paymentId'],
        }),
      );

      await queryRunner.createIndex(
        'commissions',
        new TableIndex({
          name: 'IDX_commissions_payeeId',
          columnNames: ['payeeId'],
        }),
      );

      await queryRunner.createIndex(
        'commissions',
        new TableIndex({
          name: 'IDX_commissions_payeeType',
          columnNames: ['payeeType'],
        }),
      );

      await queryRunner.createIndex(
        'commissions',
        new TableIndex({
          name: 'IDX_commissions_status',
          columnNames: ['status'],
        }),
      );

      await queryRunner.createIndex(
        'commissions',
        new TableIndex({
          name: 'IDX_commissions_orderId',
          columnNames: ['orderId'],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('commissions');
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."commissions_payeetype_enum"`);
  }
}

