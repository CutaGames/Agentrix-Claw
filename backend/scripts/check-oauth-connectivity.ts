import axios from 'axios';

async function checkConnectivity() {
  console.log('🔍 开始检查 OAuth 提供商连接性...');

  const targets = [
    { name: 'Google OAuth', url: 'https://accounts.google.com/.well-known/openid-configuration' },
    { name: 'Twitter API', url: 'https://api.twitter.com/oauth/request_token' },
  ];

  for (const target of targets) {
    try {
      console.log(`🌐 正在尝试连接 ${target.name} (${target.url})...`);
      const start = Date.now();
      const res = await axios.get(target.url, { timeout: 5000 });
      const duration = Date.now() - start;
      console.log(`✅ ${target.name} 连接成功! (状态码: ${res.status}, 耗时: ${duration}ms)`);
    } catch (error: any) {
      console.error(`❌ ${target.name} 连接失败: ${error.message}`);
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        console.warn(`   提示: 这通常是由于网络受限或缺少代理设置导致的。`);
      }
    }
  }

  console.log('\n💡 提示:');
  console.log('1. 如果您在受限网络环境下，请确保已在 WSL 中设置 HTTP_PROXY / HTTPS_PROXY。');
  console.log('2. 检查您的 API Key 是否正确。');
  console.log('3. 确保系统时间同步正确。');
}

checkConnectivity();
