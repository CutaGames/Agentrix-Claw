// 检查 wallet_connections 表结构的脚本
const { Client } = require('pg');

async function checkTable() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'agentrix',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  });

  try {
    await client.connect();
    console.log('✅ 数据库连接成功\n');

    // 检查表结构
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'wallet_connections'
      ORDER BY ordinal_position;
    `);

    if (result.rows.length === 0) {
      console.log('❌ wallet_connections 表不存在！');
      console.log('需要运行迁移创建表。');
      return;
    }

    console.log('📋 wallet_connections 表结构：\n');
    console.log('列名\t\t\t类型\t\t\t可空');
    console.log('─'.repeat(70));
    
    let hasUserId = false;
    let hasUserIdCamelCase = false;
    
    result.rows.forEach(row => {
      console.log(`${row.column_name.padEnd(20)}\t${row.data_type.padEnd(20)}\t${row.is_nullable}`);
      if (row.column_name === 'user_id') hasUserId = true;
      if (row.column_name === 'userId') hasUserIdCamelCase = true;
    });

    console.log('\n' + '─'.repeat(70));
    console.log('\n🔍 诊断结果：');
    
    if (hasUserId && !hasUserIdCamelCase) {
      console.log('❌ 发现问题：表中使用的是 user_id（下划线），但代码期望 userId（驼峰）');
      console.log('\n💡 解决方案：');
      console.log('   1. 运行数据库迁移重命名列');
      console.log('   2. 或者修改查询代码使用 relations 而不是 leftJoin');
    } else if (hasUserIdCamelCase && !hasUserId) {
      console.log('✅ 表结构正确：使用 userId（驼峰命名）');
      console.log('⚠️  但查询仍然失败，问题可能在查询构建器的使用方式');
    } else if (hasUserId && hasUserIdCamelCase) {
      console.log('⚠️  警告：同时存在 user_id 和 userId 两列！');
    } else {
      console.log('❌ 没有找到 userId 或 user_id 列！');
    }

  } catch (error) {
    console.error('❌ 错误：', error.message);
  } finally {
    await client.end();
  }
}

checkTable();
