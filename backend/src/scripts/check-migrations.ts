import { AppDataSource } from '../config/data-source';

/**
 * 检查迁移状态脚本
 * 用于诊断迁移问题
 */
async function checkMigrations() {
  try {
    await AppDataSource.initialize();

    // 检查migrations表
    const migrations = await AppDataSource.query(`
      SELECT * FROM migrations ORDER BY id DESC
    `);

    console.log('已执行的迁移:');
    console.table(migrations);

    // 检查V3.0新表是否存在
    const v3Tables = [
      'agent_sessions',
      'agent_messages',
      'audit_logs',
      'user_profiles',
      'merchant_tasks',
      'pay_intents',
      'quick_pay_grants',
    ];

    console.log('\n检查V3.0新表:');
    for (const table of v3Tables) {
      const result = await AppDataSource.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        )
      `, [table]);
      
      const exists = result[0].exists;
      console.log(`  ${table}: ${exists ? '✅ 存在' : '❌ 不存在'}`);
    }

    await AppDataSource.destroy();
  } catch (error) {
    console.error('检查失败:', error);
    process.exit(1);
  }
}

checkMigrations();

