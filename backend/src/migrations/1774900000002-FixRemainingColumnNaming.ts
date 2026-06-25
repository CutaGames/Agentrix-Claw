import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixRemainingColumnNaming1774900000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log('🔧 Starting remaining column naming fix migration...');

    // 修复 orders 表的剩余 camelCase 列
    const ordersCamelCaseColumns = [
      { old: 'paymentId', new: 'payment_id' },
      { old: 'agentId', new: 'agent_id' },
      { old: 'execAgentId', new: 'exec_agent_id' },
      { old: 'refAgentId', new: 'ref_agent_id' },
      { old: 'promoterId', new: 'promoter_id' },
      { old: 'isDisputed', new: 'is_disputed' },
      { old: 'executorHasWallet', new: 'executor_has_wallet' },
      { old: 'settlementTimeline', new: 'settlement_timeline' },
      { old: 'ucpEnabled', new: 'ucp_enabled' },
      { old: 'ucpSessionId', new: 'ucp_session_id' },
      { old: 'x402Enabled', new: 'x402_enabled' },
      { old: 'x402PaymentId', new: 'x402_payment_id' },
    ];

    for (const col of ordersCamelCaseColumns) {
      const ordersColumns = await queryRunner.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders'
      `);
      const columnNames = ordersColumns.map((c: any) => c.column_name);

      if (columnNames.includes(col.old) && !columnNames.includes(col.new)) {
        await queryRunner.query(`
          ALTER TABLE "orders" RENAME COLUMN "${col.old}" TO "${col.new}"
        `);
        console.log(`  ✅ orders: ${col.old} -> ${col.new}`);
      } else if (columnNames.includes(col.new)) {
        console.log(`  ✅ orders: Column ${col.new} already exists`);
      }
    }

    // 修复 products 表的剩余 camelCase 列
    const productsCamelCaseColumns = [
      { old: 'productType', new: 'product_type' },
      { old: 'fixedCommissionRate', new: 'fixed_commission_rate' },
      { old: 'allowCommissionAdjustment', new: 'allow_commission_adjustment' },
      { old: 'minCommissionRate', new: 'min_commission_rate' },
      { old: 'maxCommissionRate', new: 'max_commission_rate' },
      { old: 'reviewedBy', new: 'reviewed_by' },
      { old: 'reviewedAt', new: 'reviewed_at' },
      { old: 'commissionRate', new: 'commission_rate' },
    ];

    for (const col of productsCamelCaseColumns) {
      const productsColumns = await queryRunner.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products'
      `);
      const columnNames = productsColumns.map((c: any) => c.column_name);

      if (columnNames.includes(col.old) && !columnNames.includes(col.new)) {
        await queryRunner.query(`
          ALTER TABLE "products" RENAME COLUMN "${col.old}" TO "${col.new}"
        `);
        console.log(`  ✅ products: ${col.old} -> ${col.new}`);
      } else if (columnNames.includes(col.new)) {
        console.log(`  ✅ products: Column ${col.new} already exists`);
      }
    }

    // 修复 skills 表的剩余 camelCase 列
    const skillsCamelCaseColumns = [
      { old: 'inputSchema', new: 'input_schema' },
      { old: 'outputSchema', new: 'output_schema' },
      { old: 'platformSchemas', new: 'platform_schemas' },
      { old: 'authorId', new: 'author_id' },
      { old: 'callCount', new: 'call_count' },
      { old: 'ratingCount', new: 'rating_count' },
      { old: 'displayName', new: 'display_name' },
      { old: 'resourceType', new: 'resource_type' },
      { old: 'originalPlatform', new: 'original_platform' },
      { old: 'humanAccessible', new: 'human_accessible' },
      { old: 'compatibleAgents', new: 'compatible_agents' },
      { old: 'authorInfo', new: 'author_info' },
      { old: 'productId', new: 'product_id' },
      { old: 'externalSkillId', new: 'external_skill_id' },
      { old: 'pluginId', new: 'plugin_id' },
    ];

    for (const col of skillsCamelCaseColumns) {
      const skillsColumns = await queryRunner.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'skills'
      `);
      const columnNames = skillsColumns.map((c: any) => c.column_name);

      if (columnNames.includes(col.old) && !columnNames.includes(col.new)) {
        await queryRunner.query(`
          ALTER TABLE "skills" RENAME COLUMN "${col.old}" TO "${col.new}"
        `);
        console.log(`  ✅ skills: ${col.old} -> ${col.new}`);
      } else if (columnNames.includes(col.new)) {
        console.log(`  ✅ skills: Column ${col.new} already exists`);
      }
    }

    // 修复 user_agents 表
    const userAgentsCamelCaseColumns = [
      { old: 'templateId', new: 'template_id' },
    ];

    for (const col of userAgentsCamelCaseColumns) {
      const userAgentsColumns = await queryRunner.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'user_agents'
      `);
      const columnNames = userAgentsColumns.map((c: any) => c.column_name);

      if (columnNames.includes(col.old) && !columnNames.includes(col.new)) {
        await queryRunner.query(`
          ALTER TABLE "user_agents" RENAME COLUMN "${col.old}" TO "${col.new}"
        `);
        console.log(`  ✅ user_agents: ${col.old} -> ${col.new}`);
      } else if (columnNames.includes(col.new)) {
        console.log(`  ✅ user_agents: Column ${col.new} already exists`);
      }
    }

    console.log('✅ Remaining column naming issues fixed');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 这个迁移不需要回滚，因为它只是重命名列以匹配 TypeORM 的命名策略
    console.log('Skipping down migration - column renames are permanent');
  }
}
