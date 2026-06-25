import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddFinancialSettlementFields1767000005000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TYPE \"public\".\"orders_status_enum\" ADD VALUE IF NOT EXISTS 'processing'",
    );
    await queryRunner.query(
      "ALTER TYPE \"public\".\"orders_status_enum\" ADD VALUE IF NOT EXISTS 'delivered'",
    );
    await queryRunner.query(
      "ALTER TYPE \"public\".\"orders_status_enum\" ADD VALUE IF NOT EXISTS 'settled'",
    );
    await queryRunner.query(
      "ALTER TYPE \"public\".\"orders_status_enum\" ADD VALUE IF NOT EXISTS 'frozen'",
    );

    // 检查类型是否存在
    const ordersAssetTypeExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'orders_asset_type_enum'
      )
    `);
    if (!ordersAssetTypeExists[0]?.exists) {
      await queryRunner.query(
        "CREATE TYPE \"orders_asset_type_enum\" AS ENUM('physical','service','virtual','nft_rwa','dev_tool','aggregated_web2','aggregated_web3')",
      );
    }

    // 获取表对象
    const ordersTable = await queryRunner.getTable('orders');
    const commissionsTable = await queryRunner.getTable('commissions');

    // 添加 orders 表的列（检查是否已存在）
    if (!ordersTable?.findColumnByName('asset_type')) {
      await queryRunner.addColumn(
        'orders',
        new TableColumn({
          name: 'asset_type',
          type: '"orders_asset_type_enum"',
          isNullable: false,
          default: `'physical'`,
        }),
      );
    }
    if (!ordersTable?.findColumnByName('net_revenue')) {
      await queryRunner.addColumn(
        'orders',
        new TableColumn({
          name: 'net_revenue',
          type: 'numeric',
          precision: 18,
          scale: 2,
          isNullable: true,
        }),
      );
    }
    if (!ordersTable?.findColumnByName('platform_tax_rate')) {
      await queryRunner.addColumn(
        'orders',
        new TableColumn({
          name: 'platform_tax_rate',
          type: 'numeric',
          precision: 5,
          scale: 4,
          isNullable: true,
        }),
      );
    }
    if (!ordersTable?.findColumnByName('platform_tax')) {
      await queryRunner.addColumn(
        'orders',
        new TableColumn({
          name: 'platform_tax',
          type: 'numeric',
          precision: 18,
          scale: 2,
          isNullable: true,
        }),
      );
    }
    if (!ordersTable?.findColumnByName('merchant_net_amount')) {
      await queryRunner.addColumn(
        'orders',
        new TableColumn({
          name: 'merchant_net_amount',
          type: 'numeric',
          precision: 18,
          scale: 2,
          isNullable: true,
        }),
      );
    }
    if (!ordersTable?.findColumnByName('settlement_trigger_time')) {
      await queryRunner.addColumn(
        'orders',
        new TableColumn({
          name: 'settlement_trigger_time',
          type: 'timestamptz',
          isNullable: true,
        }),
      );
    }
    if (!ordersTable?.findColumnByName('settlement_due_time')) {
      await queryRunner.addColumn(
        'orders',
        new TableColumn({
          name: 'settlement_due_time',
          type: 'timestamptz',
          isNullable: true,
        }),
      );
    }
    if (!ordersTable?.findColumnByName('auto_confirmed_at')) {
      await queryRunner.addColumn(
        'orders',
        new TableColumn({
          name: 'auto_confirmed_at',
          type: 'timestamptz',
          isNullable: true,
        }),
      );
    }
    if (!ordersTable?.findColumnByName('is_disputed')) {
      await queryRunner.addColumn(
        'orders',
        new TableColumn({
          name: 'is_disputed',
          type: 'boolean',
          isNullable: false,
          default: false,
        }),
      );
    }
    if (!ordersTable?.findColumnByName('executor_has_wallet')) {
      await queryRunner.addColumn(
        'orders',
        new TableColumn({
          name: 'executor_has_wallet',
          type: 'boolean',
          isNullable: false,
          default: true,
        }),
      );
    }
    if (!ordersTable?.findColumnByName('exec_agent_id')) {
      await queryRunner.addColumn(
        'orders',
        new TableColumn({
          name: 'exec_agent_id',
          type: 'uuid',
          isNullable: true,
        }),
      );
    }
    if (!ordersTable?.findColumnByName('ref_agent_id')) {
      await queryRunner.addColumn(
        'orders',
        new TableColumn({
          name: 'ref_agent_id',
          type: 'uuid',
          isNullable: true,
        }),
      );
    }
    if (!ordersTable?.findColumnByName('promoter_id')) {
      await queryRunner.addColumn(
        'orders',
        new TableColumn({
          name: 'promoter_id',
          type: 'uuid',
          isNullable: true,
        }),
      );
    }
    if (!ordersTable?.findColumnByName('settlement_timeline')) {
      await queryRunner.addColumn(
        'orders',
        new TableColumn({
          name: 'settlement_timeline',
          type: 'jsonb',
          isNullable: true,
        }),
      );
    }

    // 检查 commissions 表的类型是否存在
    const commissionsAssetTypeExists = await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'commissions_asset_type_enum'
      )
    `);
    if (!commissionsAssetTypeExists[0]?.exists) {
      await queryRunner.query(
        "CREATE TYPE \"commissions_asset_type_enum\" AS ENUM('physical','service','virtual','nft_rwa','dev_tool','aggregated_web2','aggregated_web3')",
      );
    }

    // 添加 commissions 表的列（检查是否已存在）
    if (!commissionsTable?.findColumnByName('order_id')) {
      await queryRunner.addColumn(
        'commissions',
        new TableColumn({
          name: 'order_id',
          type: 'uuid',
          isNullable: true,
        }),
      );
    }
    if (!commissionsTable?.findColumnByName('asset_type')) {
      await queryRunner.addColumn(
        'commissions',
        new TableColumn({
          name: 'asset_type',
          type: '"commissions_asset_type_enum"',
          isNullable: true,
        }),
      );
    }
    if (!commissionsTable?.findColumnByName('settlement_available_at')) {
      await queryRunner.addColumn(
        'commissions',
        new TableColumn({
          name: 'settlement_available_at',
          type: 'timestamptz',
          isNullable: true,
        }),
      );
    }
    if (!commissionsTable?.findColumnByName('breakdown')) {
      await queryRunner.addColumn(
        'commissions',
        new TableColumn({
          name: 'breakdown',
          type: 'jsonb',
          isNullable: true,
        }),
      );
    }
    await queryRunner.query(
      "ALTER TABLE \"commissions\" ALTER COLUMN \"status\" SET DEFAULT 'locked'",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE \"commissions\" ALTER COLUMN \"status\" SET DEFAULT 'pending'",
    );
    await queryRunner.dropColumn('commissions', 'breakdown');
    await queryRunner.dropColumn('commissions', 'settlement_available_at');
    await queryRunner.dropColumn('commissions', 'asset_type');
    await queryRunner.query('DROP TYPE IF EXISTS "commissions_asset_type_enum"');
    await queryRunner.dropColumn('commissions', 'order_id');

    await queryRunner.dropColumn('orders', 'settlement_timeline');
    await queryRunner.dropColumn('orders', 'promoter_id');
    await queryRunner.dropColumn('orders', 'ref_agent_id');
    await queryRunner.dropColumn('orders', 'exec_agent_id');
    await queryRunner.dropColumn('orders', 'executor_has_wallet');
    await queryRunner.dropColumn('orders', 'is_disputed');
    await queryRunner.dropColumn('orders', 'auto_confirmed_at');
    await queryRunner.dropColumn('orders', 'settlement_due_time');
    await queryRunner.dropColumn('orders', 'settlement_trigger_time');
    await queryRunner.dropColumn('orders', 'merchant_net_amount');
    await queryRunner.dropColumn('orders', 'platform_tax');
    await queryRunner.dropColumn('orders', 'platform_tax_rate');
    await queryRunner.dropColumn('orders', 'net_revenue');
    await queryRunner.dropColumn('orders', 'asset_type');
    await queryRunner.query('DROP TYPE IF EXISTS "orders_asset_type_enum"');
  }
}

