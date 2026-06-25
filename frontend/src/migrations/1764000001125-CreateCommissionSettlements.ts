import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateCommissionSettlements1764000001125 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 检查表是否已存在
    const tableExists = await queryRunner.hasTable('commission_settlements');
    
    if (!tableExists) {
      // 创建 payeeType 枚举类型（如果不存在）
      await queryRunner.query(`
        DO $$ BEGIN
          CREATE TYPE "public"."commissions_payeetype_enum" AS ENUM('agent', 'merchant', 'agentrix');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);

      // 创建 SettlementStatus 枚举类型
      await queryRunner.query(`
        DO $$ BEGIN
          CREATE TYPE "public"."commission_settlements_status_enum" AS ENUM('pending', 'processing', 'completed', 'failed');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);

      // 创建 commission_settlements 表
      await queryRunner.createTable(
        new Table({
          name: 'commission_settlements',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              generationStrategy: 'uuid',
              default: 'uuid_generate_v4()',
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
              name: 'settlementDate',
              type: 'date',
              isNullable: false,
            },
            {
              name: 'status',
              type: 'enum',
              enum: ['pending', 'processing', 'completed', 'failed'],
              enumName: 'commission_settlements_status_enum',
              default: "'pending'",
              isNullable: false,
            },
            {
              name: 'transactionHash',
              type: 'varchar',
              isNullable: true,
            },
            {
              name: 'createdAt',
              type: 'timestamp',
              default: 'CURRENT_TIMESTAMP',
            },
          ],
        }),
        true,
      );

      // 创建索引
      await queryRunner.createIndex(
        'commission_settlements',
        new TableIndex({
          name: 'IDX_commission_settlements_payeeId',
          columnNames: ['payeeId'],
        }),
      );

      await queryRunner.createIndex(
        'commission_settlements',
        new TableIndex({
          name: 'IDX_commission_settlements_payeeType',
          columnNames: ['payeeType'],
        }),
      );

      await queryRunner.createIndex(
        'commission_settlements',
        new TableIndex({
          name: 'IDX_commission_settlements_status',
          columnNames: ['status'],
        }),
      );

      await queryRunner.createIndex(
        'commission_settlements',
        new TableIndex({
          name: 'IDX_commission_settlements_settlementDate',
          columnNames: ['settlementDate'],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('commission_settlements');
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."commission_settlements_status_enum"`);
  }
}

