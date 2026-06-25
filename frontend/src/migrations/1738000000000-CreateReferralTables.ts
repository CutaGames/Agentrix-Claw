import { MigrationInterface, QueryRunner, Table, TableIndex, TableColumn } from 'typeorm';

export class CreateReferralTables1738000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 创建 merchant_referrals 表
    await queryRunner.createTable(
      new Table({
        name: 'merchant_referrals',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'agentId',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'merchantId',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'merchantName',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'merchantEmail',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'approved', 'rejected', 'active'],
            default: "'pending'",
          },
          {
            name: 'oneTimeReward',
            type: 'decimal',
            precision: 15,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'oneTimeRewardPaidAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'commissionRate',
            type: 'decimal',
            precision: 5,
            scale: 4,
            default: 0.005,
          },
          {
            name: 'totalCommissionEarned',
            type: 'decimal',
            precision: 15,
            scale: 2,
            default: 0,
          },
          {
            name: 'totalMerchantGMV',
            type: 'decimal',
            precision: 15,
            scale: 2,
            default: 0,
          },
          {
            name: 'metadata',
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
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // 创建索引
    await queryRunner.createIndex(
      'merchant_referrals',
      new TableIndex({
        name: 'IDX_merchant_referrals_agentId',
        columnNames: ['agentId'],
      }),
    );

    await queryRunner.createIndex(
      'merchant_referrals',
      new TableIndex({
        name: 'IDX_merchant_referrals_merchantId',
        columnNames: ['merchantId'],
      }),
    );

    await queryRunner.createIndex(
      'merchant_referrals',
      new TableIndex({
        name: 'IDX_merchant_referrals_agent_merchant',
        columnNames: ['agentId', 'merchantId'],
        isUnique: true,
      }),
    );

    // 创建 referral_commissions 表
    await queryRunner.createTable(
      new Table({
        name: 'referral_commissions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'referralId',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'agentId',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'merchantId',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'paymentId',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'paymentAmount',
            type: 'decimal',
            precision: 15,
            scale: 2,
          },
          {
            name: 'currency',
            type: 'varchar',
            length: '10',
          },
          {
            name: 'commissionRate',
            type: 'decimal',
            precision: 5,
            scale: 4,
          },
          {
            name: 'commissionAmount',
            type: 'decimal',
            precision: 15,
            scale: 2,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'settled', 'cancelled'],
            default: "'pending'",
          },
          {
            name: 'settledAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'settlementPeriod',
            type: 'varchar',
            length: '20',
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
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // 创建索引
    await queryRunner.createIndex(
      'referral_commissions',
      new TableIndex({
        name: 'IDX_referral_commissions_referralId',
        columnNames: ['referralId'],
      }),
    );

    await queryRunner.createIndex(
      'referral_commissions',
      new TableIndex({
        name: 'IDX_referral_commissions_agentId',
        columnNames: ['agentId'],
      }),
    );

    await queryRunner.createIndex(
      'referral_commissions',
      new TableIndex({
        name: 'IDX_referral_commissions_paymentId',
        columnNames: ['paymentId'],
      }),
    );

    await queryRunner.createIndex(
      'referral_commissions',
      new TableIndex({
        name: 'IDX_referral_commissions_referral_payment',
        columnNames: ['referralId', 'paymentId'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'referral_commissions',
      new TableIndex({
        name: 'IDX_referral_commissions_agent_status',
        columnNames: ['agentId', 'status'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('referral_commissions', true);
    await queryRunner.dropTable('merchant_referrals', true);
  }
}

