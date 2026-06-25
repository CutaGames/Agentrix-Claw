import { MigrationInterface, QueryRunner, Table, TableIndex, TableColumn } from 'typeorm';

/**
 * 账户体系优化迁移
 * 
 * 1. 创建 agent_accounts 表 - AI Agent 独立账户
 * 2. 创建 accounts 表 - 统一资金账户
 * 3. 创建 kyc_records 表 - KYC 认证记录
 * 4. 更新 users 表 - 添加状态管理字段
 */
export class AccountSystemOptimization1774200000000 implements MigrationInterface {
  name = 'AccountSystemOptimization1774200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ========== 1. 创建枚举类型 ==========
    
    // Agent 状态枚举
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE agent_account_status_enum AS ENUM ('draft', 'active', 'suspended', 'revoked');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Agent 风险等级枚举
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE agent_risk_level_enum AS ENUM ('low', 'medium', 'high', 'critical');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Agent 类型枚举
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE agent_type_enum AS ENUM ('personal', 'merchant', 'platform', 'third_party');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // 账户所有者类型枚举
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE account_owner_type_enum AS ENUM ('user', 'agent', 'merchant', 'platform');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // 账户钱包类型枚举
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE account_wallet_type_enum AS ENUM ('custodial', 'non_custodial', 'virtual');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // 账户状态枚举
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE account_status_enum AS ENUM ('active', 'frozen', 'closed');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // 账户链类型枚举
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE account_chain_type_enum AS ENUM ('evm', 'solana', 'bitcoin', 'multi');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // 用户状态枚举
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE user_status_enum AS ENUM ('active', 'pending', 'suspended', 'frozen', 'closed', 'banned');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // KYC 状态枚举
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE kyc_record_status_enum AS ENUM ('not_started', 'pending', 'in_review', 'approved', 'rejected', 'expired', 'resubmit');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // KYC 等级枚举
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE kyc_record_level_enum AS ENUM ('basic', 'standard', 'advanced', 'enterprise');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // 证件类型枚举
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE document_type_enum AS ENUM ('id_card', 'passport', 'driver_license', 'business_license', 'bank_statement', 'utility_bill', 'other');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // ========== 2. 创建 agent_accounts 表 ==========
    await queryRunner.createTable(
      new Table({
        name: 'agent_accounts',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'agent_unique_id', type: 'varchar', length: '50', isUnique: true },
          { name: 'name', type: 'varchar', length: '150' },
          { name: 'description', type: 'text', isNullable: true },
          { name: 'avatar_url', type: 'varchar', length: '500', isNullable: true },
          { name: 'owner_id', type: 'uuid', isNullable: true },
          { name: 'parent_agent_id', type: 'uuid', isNullable: true },
          { name: 'agent_type', type: 'agent_type_enum', default: `'personal'` },
          { name: 'public_key', type: 'varchar', length: '255', isNullable: true },
          { name: 'api_secret_hash', type: 'varchar', isNullable: true },
          { name: 'api_key_prefix', type: 'varchar', length: '20', isNullable: true },
          { name: 'default_account_id', type: 'uuid', isNullable: true },
          { name: 'mpc_wallet_id', type: 'uuid', isNullable: true },
          { name: 'external_wallet_address', type: 'varchar', length: '100', isNullable: true },
          { name: 'credit_score', type: 'decimal', precision: 7, scale: 2, default: 500 },
          { name: 'risk_level', type: 'agent_risk_level_enum', default: `'medium'` },
          { name: 'credit_score_updated_at', type: 'timestamp', isNullable: true },
          { name: 'capabilities', type: 'jsonb', isNullable: true },
          { name: 'spending_limits', type: 'jsonb', isNullable: true },
          { name: 'used_today_amount', type: 'decimal', precision: 18, scale: 2, default: 0 },
          { name: 'used_month_amount', type: 'decimal', precision: 18, scale: 2, default: 0 },
          { name: 'limit_reset_date', type: 'date', isNullable: true },
          { name: 'eas_attestation_uid', type: 'varchar', length: '100', isNullable: true },
          { name: 'onchain_registration_tx_hash', type: 'varchar', length: '100', isNullable: true },
          { name: 'registration_chain', type: 'varchar', length: '20', isNullable: true },
          { name: 'status', type: 'agent_account_status_enum', default: `'draft'` },
          { name: 'status_reason', type: 'varchar', length: '500', isNullable: true },
          { name: 'activated_at', type: 'timestamp', isNullable: true },
          { name: 'last_active_at', type: 'timestamp', isNullable: true },
          { name: 'total_transactions', type: 'int', default: 0 },
          { name: 'total_transaction_amount', type: 'decimal', precision: 18, scale: 2, default: 0 },
          { name: 'successful_transactions', type: 'int', default: 0 },
          { name: 'failed_transactions', type: 'int', default: 0 },
          { name: 'callbacks', type: 'jsonb', isNullable: true },
          { name: 'metadata', type: 'jsonb', isNullable: true },
          { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updated_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );

    // Agent 账户索引
    await queryRunner.createIndex('agent_accounts', new TableIndex({ name: 'IDX_agent_accounts_unique_id', columnNames: ['agent_unique_id'] }));
    await queryRunner.createIndex('agent_accounts', new TableIndex({ name: 'IDX_agent_accounts_owner_id', columnNames: ['owner_id'] }));
    await queryRunner.createIndex('agent_accounts', new TableIndex({ name: 'IDX_agent_accounts_status', columnNames: ['status'] }));
    await queryRunner.createIndex('agent_accounts', new TableIndex({ name: 'IDX_agent_accounts_type', columnNames: ['agent_type'] }));

    // ========== 3. 创建 accounts 表 ==========
    await queryRunner.createTable(
      new Table({
        name: 'accounts',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'account_id', type: 'varchar', length: '50', isUnique: true },
          { name: 'name', type: 'varchar', length: '100', isNullable: true },
          { name: 'owner_id', type: 'varchar' },
          { name: 'owner_type', type: 'account_owner_type_enum' },
          { name: 'user_id', type: 'uuid', isNullable: true },
          { name: 'wallet_type', type: 'account_wallet_type_enum' },
          { name: 'chain_type', type: 'account_chain_type_enum', default: `'evm'` },
          { name: 'chain_id', type: 'varchar', isNullable: true },
          { name: 'wallet_address', type: 'varchar', length: '100', isNullable: true },
          { name: 'mpc_wallet_id', type: 'uuid', isNullable: true },
          { name: 'currency', type: 'varchar', length: '10', default: `'USDC'` },
          { name: 'available_balance', type: 'decimal', precision: 18, scale: 6, default: 0 },
          { name: 'frozen_balance', type: 'decimal', precision: 18, scale: 6, default: 0 },
          { name: 'pending_balance', type: 'decimal', precision: 18, scale: 6, default: 0 },
          { name: 'balance_updated_at', type: 'timestamp', isNullable: true },
          { name: 'multi_currency_balances', type: 'jsonb', isNullable: true },
          { name: 'is_default', type: 'boolean', default: false },
          { name: 'status', type: 'account_status_enum', default: `'active'` },
          { name: 'status_reason', type: 'varchar', length: '500', isNullable: true },
          { name: 'single_tx_limit', type: 'decimal', precision: 18, scale: 2, isNullable: true },
          { name: 'daily_limit', type: 'decimal', precision: 18, scale: 2, isNullable: true },
          { name: 'monthly_limit', type: 'decimal', precision: 18, scale: 2, isNullable: true },
          { name: 'total_deposit', type: 'decimal', precision: 18, scale: 2, default: 0 },
          { name: 'total_withdraw', type: 'decimal', precision: 18, scale: 2, default: 0 },
          { name: 'transaction_count', type: 'int', default: 0 },
          { name: 'metadata', type: 'jsonb', isNullable: true },
          { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updated_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );

    // 账户表索引
    await queryRunner.createIndex('accounts', new TableIndex({ name: 'IDX_accounts_owner', columnNames: ['owner_id', 'owner_type'] }));
    await queryRunner.createIndex('accounts', new TableIndex({ name: 'IDX_accounts_wallet_address', columnNames: ['wallet_address'] }));
    await queryRunner.createIndex('accounts', new TableIndex({ name: 'IDX_accounts_status', columnNames: ['status'] }));
    await queryRunner.createIndex('accounts', new TableIndex({ name: 'IDX_accounts_is_default', columnNames: ['is_default'] }));

    // ========== 4. 创建 kyc_records 表 ==========
    await queryRunner.createTable(
      new Table({
        name: 'kyc_records',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'user_id', type: 'uuid' },
          { name: 'level', type: 'kyc_record_level_enum' },
          { name: 'status', type: 'kyc_record_status_enum', default: `'not_started'` },
          { name: 'full_name', type: 'varchar', length: '100', isNullable: true },
          { name: 'document_type', type: 'document_type_enum', isNullable: true },
          { name: 'document_number', type: 'varchar', length: '100', isNullable: true },
          { name: 'date_of_birth', type: 'date', isNullable: true },
          { name: 'nationality', type: 'varchar', length: '50', isNullable: true },
          { name: 'address', type: 'text', isNullable: true },
          { name: 'country_code', type: 'varchar', length: '10', isNullable: true },
          { name: 'documents', type: 'jsonb', isNullable: true },
          { name: 'selfie_url', type: 'varchar', length: '500', isNullable: true },
          { name: 'company_name', type: 'varchar', length: '200', isNullable: true },
          { name: 'company_registration_number', type: 'varchar', length: '100', isNullable: true },
          { name: 'company_type', type: 'varchar', length: '50', isNullable: true },
          { name: 'company_info', type: 'jsonb', isNullable: true },
          { name: 'reviewed_by', type: 'uuid', isNullable: true },
          { name: 'reviewed_at', type: 'timestamp', isNullable: true },
          { name: 'rejection_reason', type: 'text', isNullable: true },
          { name: 'review_notes', type: 'text', isNullable: true },
          { name: 'review_history', type: 'jsonb', isNullable: true },
          { name: 'approved_at', type: 'timestamp', isNullable: true },
          { name: 'expires_at', type: 'timestamp', isNullable: true },
          { name: 'last_reminder_at', type: 'timestamp', isNullable: true },
          { name: 'provider_name', type: 'varchar', length: '50', isNullable: true },
          { name: 'provider_verification_id', type: 'varchar', length: '100', isNullable: true },
          { name: 'provider_response', type: 'jsonb', isNullable: true },
          { name: 'aml_risk_score', type: 'decimal', precision: 5, scale: 2, isNullable: true },
          { name: 'sanction_check_result', type: 'jsonb', isNullable: true },
          { name: 'metadata', type: 'jsonb', isNullable: true },
          { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updated_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );

    // KYC 记录索引
    await queryRunner.createIndex('kyc_records', new TableIndex({ name: 'IDX_kyc_records_user_id', columnNames: ['user_id'] }));
    await queryRunner.createIndex('kyc_records', new TableIndex({ name: 'IDX_kyc_records_status', columnNames: ['status'] }));
    await queryRunner.createIndex('kyc_records', new TableIndex({ name: 'IDX_kyc_records_level', columnNames: ['level'] }));
    await queryRunner.createIndex('kyc_records', new TableIndex({ name: 'IDX_kyc_records_expires_at', columnNames: ['expires_at'] }));

    // ========== 5. 更新 users 表 ==========
    // 添加状态字段
    await queryRunner.addColumn('users', new TableColumn({
      name: 'status',
      type: 'user_status_enum',
      default: `'active'`,
    }));

    await queryRunner.addColumn('users', new TableColumn({
      name: 'status_reason',
      type: 'varchar',
      length: '500',
      isNullable: true,
    }));

    await queryRunner.addColumn('users', new TableColumn({
      name: 'status_updated_at',
      type: 'timestamp',
      isNullable: true,
    }));

    await queryRunner.addColumn('users', new TableColumn({
      name: 'last_active_at',
      type: 'timestamp',
      isNullable: true,
    }));

    await queryRunner.addColumn('users', new TableColumn({
      name: 'default_account_id',
      type: 'uuid',
      isNullable: true,
    }));

    // 用户状态索引
    await queryRunner.createIndex('users', new TableIndex({ name: 'IDX_users_status', columnNames: ['status'] }));
    await queryRunner.createIndex('users', new TableIndex({ name: 'IDX_users_email', columnNames: ['email'] }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 删除用户表索引和列
    await queryRunner.dropIndex('users', 'IDX_users_status');
    await queryRunner.dropIndex('users', 'IDX_users_email');
    await queryRunner.dropColumn('users', 'default_account_id');
    await queryRunner.dropColumn('users', 'last_active_at');
    await queryRunner.dropColumn('users', 'status_updated_at');
    await queryRunner.dropColumn('users', 'status_reason');
    await queryRunner.dropColumn('users', 'status');

    // 删除 kyc_records 表
    await queryRunner.dropTable('kyc_records');

    // 删除 accounts 表
    await queryRunner.dropTable('accounts');

    // 删除 agent_accounts 表
    await queryRunner.dropTable('agent_accounts');

    // 删除枚举类型
    await queryRunner.query(`DROP TYPE IF EXISTS document_type_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS kyc_record_level_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS kyc_record_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS user_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS account_chain_type_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS account_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS account_wallet_type_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS account_owner_type_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS agent_type_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS agent_risk_level_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS agent_account_status_enum`);
  }
}
