import { AppDataSource } from '../config/data-source';

/**
 * 只运行V3.0新迁移脚本
 * 跳过已存在的表
 */
async function runV3MigrationsOnly() {
  try {
    await AppDataSource.initialize();

    console.log('检查V3.0新表状态...\n');

    // V3.0新迁移列表
    const v3Migrations = [
      {
        timestamp: 1763025405600,
        name: 'AddAgentSessionAndAuditLog1763025405600',
        tables: ['agent_sessions', 'agent_messages', 'audit_logs'],
      },
      {
        timestamp: 1763025405601,
        name: 'AddPayIntentAndQuickPayGrant1763025405601',
        tables: ['pay_intents', 'quick_pay_grants', 'user_profiles', 'merchant_tasks'],
      },
    ];

    // 检查每个迁移
    for (const migration of v3Migrations) {
      console.log(`检查迁移: ${migration.name}`);
      
      // 检查迁移是否已执行
      const executed = await AppDataSource.query(`
        SELECT * FROM migrations WHERE name = $1
      `, [migration.name]);

      if (executed.length > 0) {
        console.log(`  ✅ 迁移已执行\n`);
        continue;
      }

      // 检查表是否已存在
      let allTablesExist = true;
      for (const table of migration.tables) {
        const exists = await AppDataSource.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          )
        `, [table]);
        
        if (!exists[0].exists) {
          allTablesExist = false;
          console.log(`  ❌ 表 ${table} 不存在`);
        } else {
          console.log(`  ✅ 表 ${table} 已存在`);
        }
      }

      if (allTablesExist) {
        // 如果表已存在，只插入迁移记录
        console.log(`  📝 插入迁移记录...`);
        await AppDataSource.query(`
          INSERT INTO migrations (timestamp, name) 
          VALUES ($1, $2)
        `, [migration.timestamp, migration.name]);
        console.log(`  ✅ 迁移记录已插入\n`);
      } else {
        // 如果表不存在，需要运行迁移
        console.log(`  ⚠️  表不存在，需要运行迁移\n`);
      }
    }

    console.log('✅ V3.0迁移检查完成');
    console.log('\n现在可以运行完整迁移:');
    console.log('npm run migration:run');

    await AppDataSource.destroy();
  } catch (error) {
    console.error('检查失败:', error);
    process.exit(1);
  }
}

runV3MigrationsOnly();

