import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

/**
 * Agent授权系统数据库迁移
 * 创建Agent授权、策略权限、执行历史表
 * 注意：这是独立模块，不影响现有支付功能
 */
export class CreateAgentAuthorizationTables1738000002000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Agent授权表
    await queryRunner.createTable(
      new Table({
        name: 'agent_authorizations',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'agent_id',
            type: 'varchar',
            length: '255',
            isNullable: false,
            comment: 'Agent ID',
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: false,
            comment: '用户ID',
          },
          {
            name: 'wallet_address',
            type: 'varchar',
            length: '255',
            isNullable: false,
            comment: '钱包地址',
          },
          {
            name: 'authorization_type',
            type: 'varchar',
            length: '50',
            isNullable: false,
            comment: '授权类型：erc8004 | mpc | api_key',
          },
          {
            name: 'session_id',
            type: 'varchar',
            length: '255',
            isNullable: true,
            comment: 'ERC8004 Session ID（如果使用ERC8004）',
          },
          {
            name: 'mpc_wallet_id',
            type: 'uuid',
            isNullable: true,
            comment: 'MPC钱包ID（如果使用MPC）',
          },
          {
            name: 'single_limit',
            type: 'decimal',
            precision: 18,
            scale: 6,
            isNullable: true,
            comment: '单笔限额',
          },
          {
            name: 'daily_limit',
            type: 'decimal',
            precision: 18,
            scale: 6,
            isNullable: true,
            comment: '每日限额',
          },
          {
            name: 'total_limit',
            type: 'decimal',
            precision: 18,
            scale: 6,
            isNullable: true,
            comment: '总限额',
          },
          {
            name: 'used_today',
            type: 'decimal',
            precision: 18,
            scale: 6,
            default: 0,
            comment: '今日已用',
          },
          {
            name: 'used_total',
            type: 'decimal',
            precision: 18,
            scale: 6,
            default: 0,
            comment: '总已用',
          },
          {
            name: 'expiry',
            type: 'timestamp',
            isNullable: true,
            comment: '过期时间',
          },
          {
            name: 'last_reset_date',
            type: 'date',
            isNullable: true,
            comment: '上次重置日期（用于每日限额重置）',
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
            comment: '是否激活',
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'NOW()',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'NOW()',
          },
        ],
      }),
      true,
    );

    // 创建索引
    await queryRunner.createIndex(
      'agent_authorizations',
      new TableIndex({
        name: 'idx_agent_authorizations_agent_id',
        columnNames: ['agent_id'],
      }),
    );

    await queryRunner.createIndex(
      'agent_authorizations',
      new TableIndex({
        name: 'idx_agent_authorizations_user_id',
        columnNames: ['user_id'],
      }),
    );

    await queryRunner.createIndex(
      'agent_authorizations',
      new TableIndex({
        name: 'idx_agent_authorizations_wallet_address',
        columnNames: ['wallet_address'],
      }),
    );

    // 2. Agent策略权限表
    await queryRunner.createTable(
      new Table({
        name: 'agent_strategy_permissions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'agent_authorization_id',
            type: 'uuid',
            isNullable: false,
            comment: 'Agent授权ID',
          },
          {
            name: 'strategy_type',
            type: 'varchar',
            length: '50',
            isNullable: false,
            comment: '策略类型：dca | grid | arbitrage | market_making | rebalancing',
          },
          {
            name: 'allowed',
            type: 'boolean',
            default: true,
            comment: '是否允许',
          },
          {
            name: 'max_amount',
            type: 'decimal',
            precision: 18,
            scale: 6,
            isNullable: true,
            comment: '该策略的最大金额',
          },
          {
            name: 'max_frequency',
            type: 'integer',
            isNullable: true,
            comment: '最大执行频率（每小时/每天）',
          },
          {
            name: 'frequency_period',
            type: 'varchar',
            length: '20',
            default: "'hour'",
            comment: '频率周期：hour | day',
          },
          {
            name: 'allowed_tokens',
            type: 'text',
            isArray: true,
            isNullable: true,
            comment: '允许的代币列表',
          },
          {
            name: 'allowed_dexs',
            type: 'text',
            isArray: true,
            isNullable: true,
            comment: '允许的DEX列表',
          },
          {
            name: 'allowed_cexs',
            type: 'text',
            isArray: true,
            isNullable: true,
            comment: '允许的CEX列表',
          },
          {
            name: 'risk_limits',
            type: 'jsonb',
            isNullable: true,
            comment: '风险限制配置',
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'NOW()',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'NOW()',
          },
        ],
      }),
      true,
    );

    // 创建外键
    await queryRunner.createForeignKey(
      'agent_strategy_permissions',
      new TableForeignKey({
        columnNames: ['agent_authorization_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'agent_authorizations',
        onDelete: 'CASCADE',
      }),
    );

    // 创建索引
    await queryRunner.createIndex(
      'agent_strategy_permissions',
      new TableIndex({
        name: 'idx_agent_strategy_permissions_authorization_id',
        columnNames: ['agent_authorization_id'],
      }),
    );

    await queryRunner.createIndex(
      'agent_strategy_permissions',
      new TableIndex({
        name: 'idx_agent_strategy_permissions_strategy_type',
        columnNames: ['strategy_type'],
      }),
    );

    // 3. Agent执行历史表
    await queryRunner.createTable(
      new Table({
        name: 'agent_execution_history',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'agent_id',
            type: 'varchar',
            length: '255',
            isNullable: false,
            comment: 'Agent ID',
          },
          {
            name: 'authorization_id',
            type: 'uuid',
            isNullable: false,
            comment: '授权ID',
          },
          {
            name: 'strategy_type',
            type: 'varchar',
            length: '50',
            isNullable: true,
            comment: '策略类型',
          },
          {
            name: 'execution_type',
            type: 'varchar',
            length: '50',
            isNullable: false,
            comment: '执行类型：payment | trading | market_making | arbitrage',
          },
          {
            name: 'amount',
            type: 'decimal',
            precision: 18,
            scale: 6,
            isNullable: true,
            comment: '执行金额',
          },
          {
            name: 'token_address',
            type: 'varchar',
            length: '255',
            isNullable: true,
            comment: '代币地址',
          },
          {
            name: 'dex_name',
            type: 'varchar',
            length: '50',
            isNullable: true,
            comment: 'DEX名称',
          },
          {
            name: 'cex_name',
            type: 'varchar',
            length: '50',
            isNullable: true,
            comment: 'CEX名称',
          },
          {
            name: 'status',
            type: 'varchar',
            length: '50',
            isNullable: false,
            default: "'pending'",
            comment: '状态：success | failed | rejected | pending',
          },
          {
            name: 'error_message',
            type: 'text',
            isNullable: true,
            comment: '错误信息',
          },
          {
            name: 'transaction_hash',
            type: 'varchar',
            length: '255',
            isNullable: true,
            comment: '交易哈希',
          },
          {
            name: 'executed_at',
            type: 'timestamp',
            default: 'NOW()',
            comment: '执行时间',
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
            comment: '元数据',
          },
        ],
      }),
      true,
    );

    // 创建索引
    await queryRunner.createIndex(
      'agent_execution_history',
      new TableIndex({
        name: 'idx_agent_execution_history_agent_id',
        columnNames: ['agent_id'],
      }),
    );

    await queryRunner.createIndex(
      'agent_execution_history',
      new TableIndex({
        name: 'idx_agent_execution_history_authorization_id',
        columnNames: ['authorization_id'],
      }),
    );

    await queryRunner.createIndex(
      'agent_execution_history',
      new TableIndex({
        name: 'idx_agent_execution_history_executed_at',
        columnNames: ['executed_at'],
      }),
    );

    await queryRunner.createIndex(
      'agent_execution_history',
      new TableIndex({
        name: 'idx_agent_execution_history_status',
        columnNames: ['status'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 删除表（按相反顺序）
    await queryRunner.dropTable('agent_execution_history', true);
    await queryRunner.dropTable('agent_strategy_permissions', true);
    await queryRunner.dropTable('agent_authorizations', true);
  }
}

