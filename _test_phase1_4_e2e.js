/**
 * Phase 1-4 端到端测试 - Agent 账户完整生命周期
 * 
 * 覆盖范围:
 * Phase 1: 创建、查询、更新、API Key、生命周期
 * Phase 2: 信用评分、预算控制、支出限额
 * Phase 3: 团队 Agent、A2A 任务
 * Phase 4: 链上注册、余额查询、能力档案、MPC 钱包
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');

const BASE_URL = 'http://localhost:3000/api';
let TOKEN = '';
let testAgentId = '';
let testAgentUniqueId = '';

// ========== Helpers ==========

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path.startsWith('http') ? path : `${BASE_URL}${path}`);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(TOKEN ? { 'Authorization': `Bearer ${TOKEN}` } : {}),
      },
    };

    const req = (url.protocol === 'https:' ? https : http).request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function getToken() {
  const jwt = require('jsonwebtoken');
  const { Client } = require('pg');
  const client = new Client({
    host: 'localhost', port: 5432, user: 'agentrix', password: 'agentrix_secure_2024', database: 'paymind'
  });
  await client.connect();
  const res = await client.query("SELECT id, email FROM users WHERE email IS NOT NULL LIMIT 1");
  await client.end();
  if (res.rows.length === 0) throw new Error('No user found');
  const user = res.rows[0];
  TOKEN = jwt.sign({ sub: user.id, email: user.email }, 'agentrix-singapore-prod-jwt-secret-2026', { expiresIn: '1h' });
  console.log(`  Token for user ${user.email} (${user.id.slice(0,8)}...)`);
  return user.id;
}

// ========== Test Runner ==========

let passed = 0;
let failed = 0;
let total = 0;

function assert(condition, message) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.log(`  ❌ ${message}`);
  }
}

// ========== Phase 1: 基础 CRUD + 身份管理 ==========

async function testPhase1() {
  console.log('\n📋 Phase 1: 基础 CRUD + 身份管理');
  console.log('─'.repeat(50));

  // 1.1 创建 Agent
  console.log('\n  [1.1] 创建 Agent 账户');
  const createRes = await makeRequest('POST', '/agent-accounts', {
    name: 'E2E Phase4 测试 Agent',
    description: '端到端测试用 Agent - Phase 1-4 完整测试',
    agentType: 'personal',
    spendingLimits: { singleTxLimit: 100, dailyLimit: 500, monthlyLimit: 2000, currency: 'USDC' },
  });
  assert(createRes.status === 201, `创建 Agent: ${createRes.status} === 201`);
  assert(createRes.data?.data?.agentUniqueId?.startsWith('AGT-'), `Agent ID 前缀: ${createRes.data?.data?.agentUniqueId}`);
  assert(createRes.data?.data?.status === 'active', `状态 active: ${createRes.data?.data?.status}`);
  assert(Number(createRes.data?.data?.creditScore) === 500, `初始信用评分 500: ${createRes.data?.data?.creditScore}`);

  testAgentId = createRes.data?.data?.id;
  testAgentUniqueId = createRes.data?.data?.agentUniqueId;

  // 1.2 查询 Agent 列表
  console.log('\n  [1.2] 查询 Agent 列表');
  const listRes = await makeRequest('GET', '/agent-accounts');
  assert(listRes.status === 200, `列表查询: ${listRes.status} === 200`);
  assert(listRes.data?.data?.length > 0, `列表非空: ${listRes.data?.data?.length} 个`);

  // 1.3 查询 Agent 详情
  console.log('\n  [1.3] 查询 Agent 详情');
  const detailRes = await makeRequest('GET', `/agent-accounts/${testAgentId}`);
  assert(detailRes.status === 200, `详情查询: ${detailRes.status} === 200`);
  assert(detailRes.data?.data?.name === 'E2E Phase4 测试 Agent', `名称正确: ${detailRes.data?.data?.name}`);

  // 1.4 更新 Agent
  console.log('\n  [1.4] 更新 Agent');
  const updateRes = await makeRequest('PUT', `/agent-accounts/${testAgentId}`, {
    name: 'E2E Phase4 Agent (Updated)',
    description: '更新后的描述',
  });
  assert(updateRes.status === 200, `更新成功: ${updateRes.status} === 200`);
  assert(updateRes.data?.data?.name === 'E2E Phase4 Agent (Updated)', `名称已更新`);

  // 1.5 生成 API Key
  console.log('\n  [1.5] 生成 API Key');
  const apiKeyRes = await makeRequest('POST', `/agent-accounts/${testAgentId}/api-key`);
  assert(apiKeyRes.status === 200, `API Key 生成: ${apiKeyRes.status} === 200`);
  assert(apiKeyRes.data?.data?.apiKey?.startsWith('ak_'), `API Key 前缀: ${apiKeyRes.data?.data?.apiKey?.slice(0, 5)}`);

  // 1.6 查询唯一ID
  console.log('\n  [1.6] 查询唯一 ID');
  const uniqueRes = await makeRequest('GET', `/agent-accounts/unique/${testAgentUniqueId}`);
  assert(uniqueRes.status === 200, `唯一 ID 查询: ${uniqueRes.status} === 200`);
}

// ========== Phase 2: 经济能力 ==========

async function testPhase2() {
  console.log('\n📋 Phase 2: 经济能力');
  console.log('─'.repeat(50));

  // 2.1 信用评分更新
  console.log('\n  [2.1] 信用评分更新');
  const scoreRes = await makeRequest('POST', `/agent-accounts/${testAgentId}/credit-score`, {
    delta: 100, reason: 'E2E测试加分'
  });
  assert(scoreRes.status === 200, `加分成功: ${scoreRes.status} === 200`);
  assert(scoreRes.data?.data?.creditScore === 600, `评分变为 600: ${scoreRes.data?.data?.creditScore}`);

  const scoreRes2 = await makeRequest('POST', `/agent-accounts/${testAgentId}/credit-score`, {
    delta: -50, reason: 'E2E测试扣分'
  });
  assert(scoreRes2.data?.data?.creditScore === 550, `评分变为 550: ${scoreRes2.data?.data?.creditScore}`);

  // 2.2 支出限额检查
  console.log('\n  [2.2] 支出限额检查');
  const checkOk = await makeRequest('GET', `/agent-accounts/${testAgentId}/check-spending?amount=50`);
  assert(checkOk.status === 200, `限额检查 50: ${checkOk.status} === 200`);
  assert(checkOk.data?.data?.allowed === true, `50 USDC 允许: ${checkOk.data?.data?.allowed}`);

  const checkFail = await makeRequest('GET', `/agent-accounts/${testAgentId}/check-spending?amount=150`);
  assert(checkFail.data?.data?.allowed === false, `150 USDC 拒绝: ${checkFail.data?.data?.allowed}`);

  // 2.3 获取资金账户
  console.log('\n  [2.3] 获取资金账户');
  const accountsRes = await makeRequest('GET', `/agent-accounts/${testAgentId}/accounts`);
  assert(accountsRes.status === 200, `资金账户查询: ${accountsRes.status} === 200`);
  assert(accountsRes.data?.data?.length > 0, `有资金账户: ${accountsRes.data?.data?.length} 个`);
}

// ========== Phase 3: 生命周期管理 ==========

async function testPhase3() {
  console.log('\n📋 Phase 3: 生命周期管理');
  console.log('─'.repeat(50));

  // 3.1 暂停
  console.log('\n  [3.1] 暂停 Agent');
  const suspendRes = await makeRequest('POST', `/agent-accounts/${testAgentId}/suspend`, { reason: 'E2E测试暂停' });
  assert(suspendRes.status === 200, `暂停成功: ${suspendRes.status} === 200`);
  assert(suspendRes.data?.data?.status === 'suspended', `状态变为 suspended`);

  // 3.2 恢复
  console.log('\n  [3.2] 恢复 Agent');
  const resumeRes = await makeRequest('POST', `/agent-accounts/${testAgentId}/resume`);
  assert(resumeRes.status === 200, `恢复成功: ${resumeRes.status} === 200`);
  assert(resumeRes.data?.data?.status === 'active', `状态变为 active`);

  // 3.3 通知系统
  console.log('\n  [3.3] 通知系统');
  const notiRes = await makeRequest('GET', '/notifications?limit=5');
  assert(notiRes.status === 200, `通知查询: ${notiRes.status} === 200`);

  // 3.4 增长看板
  console.log('\n  [3.4] 增长看板');
  const dashRes = await makeRequest('GET', '/analytics/growth');
  assert(dashRes.status === 200, `增长快照: ${dashRes.status} === 200`);

  // 3.5 A2A
  console.log('\n  [3.5] A2A 任务');
  // Note: double prefix bug — @Controller('api/a2a') + global prefix = /api/api/a2a
  const a2aRes = await makeRequest('GET', '/api/a2a/tasks');
  assert(a2aRes.status === 200, `A2A 任务列表: ${a2aRes.status} === 200`);
}

// ========== Phase 4: 链上化 ==========

async function testPhase4() {
  console.log('\n📋 Phase 4: 链上化 (ERC-8004 + EAS)');
  console.log('─'.repeat(50));

  // 4.1 链上注册
  console.log('\n  [4.1] 链上注册 (Gas 平台代付)');
  const registerRes = await makeRequest('POST', `/agent-accounts/${testAgentId}/onchain-register`, {
    chain: 'bsc-testnet'
  });
  assert(registerRes.status === 200, `链上注册请求: ${registerRes.status} === 200`);
  assert(registerRes.data?.data?.chain === 'bsc-testnet', `链: ${registerRes.data?.data?.chain}`);
  assert(registerRes.data?.data?.gasSponsored === true, `Gas 平台代付: ${registerRes.data?.data?.gasSponsored}`);

  // 4.2 查询链上状态
  console.log('\n  [4.2] 查询链上状态');
  const statusRes = await makeRequest('GET', `/agent-accounts/${testAgentId}/onchain-status`);
  assert(statusRes.status === 200, `链上状态查询: ${statusRes.status} === 200`);
  assert(statusRes.data?.data?.gasSponsored === true, `确认 Gas 免费: ${statusRes.data?.data?.gasSponsored}`);
  assert(statusRes.data?.data?.registrationFee === '0', `注册费 0: ${statusRes.data?.data?.registrationFee}`);

  // 4.3 幂等性 - 重复注册应被拒绝
  console.log('\n  [4.3] 幂等性 - 重复注册');
  const dupRes = await makeRequest('POST', `/agent-accounts/${testAgentId}/onchain-register`, {
    chain: 'bsc-testnet'
  });
  assert(dupRes.status === 409, `重复注册被拒: ${dupRes.status} === 409`);

  // 4.4 余额查询
  console.log('\n  [4.4] 余额查询（统一视图）');
  const balanceRes = await makeRequest('GET', `/agent-accounts/${testAgentId}/balance`);
  assert(balanceRes.status === 200, `余额查询: ${balanceRes.status} === 200`);
  assert(balanceRes.data?.data?.platformBalance !== undefined, `平台余额存在`);
  assert(balanceRes.data?.data?.gasAvailable !== undefined, `Gas 状态存在`);

  // 4.5 能力档案
  console.log('\n  [4.5] 能力档案查询');
  const capsRes = await makeRequest('GET', `/agent-accounts/${testAgentId}/capabilities`);
  assert(capsRes.status === 200, `能力档案: ${capsRes.status} === 200`);
  assert(capsRes.data?.data?.identity?.registered !== undefined, `身份注册状态存在`);
  assert(capsRes.data?.data?.creditLevel !== undefined, `信用等级存在: ${capsRes.data?.data?.creditLevel}`);
  assert(capsRes.data?.data?.gasSponsored === true, `Gas 代付确认: ${capsRes.data?.data?.gasSponsored}`);

  // 4.6 非 active Agent 不能注册
  console.log('\n  [4.6] 非活跃 Agent 注册限制');
  // 先创建一个新agent用于测试
  const newAgentRes = await makeRequest('POST', '/agent-accounts', {
    name: 'E2E Suspended Agent',
    spendingLimits: { singleTxLimit: 50, dailyLimit: 200, monthlyLimit: 1000, currency: 'USDC' },
  });
  const suspendAgentId = newAgentRes.data?.data?.id;
  await makeRequest('POST', `/agent-accounts/${suspendAgentId}/suspend`, { reason: '测试' });
  const failRegRes = await makeRequest('POST', `/agent-accounts/${suspendAgentId}/onchain-register`, { chain: 'bsc-testnet' });
  assert(failRegRes.status === 400, `暂停 Agent 注册被拒: ${failRegRes.status} === 400`);

  // 清理
  await makeRequest('POST', `/agent-accounts/${suspendAgentId}/resume`);
  await makeRequest('POST', `/agent-accounts/${suspendAgentId}/revoke`, { reason: 'E2E cleanup' });
}

// ========== Phase 4 补充: Agent 详情验证链上字段 ==========

async function testPhase4PostRegister() {
  console.log('\n📋 Phase 4 补充: 注册后 Agent 详情验证');
  console.log('─'.repeat(50));

  const detailRes = await makeRequest('GET', `/agent-accounts/${testAgentId}`);
  assert(detailRes.status === 200, `详情查询: ${detailRes.status} === 200`);
  assert(detailRes.data?.data?.registrationChain === 'bsc-testnet', `注册链: ${detailRes.data?.data?.registrationChain}`);
  assert(detailRes.data?.data?.onchainRegistrationTxHash != null, `有注册哈希`);

  // 检查 MPC 钱包或 session 字段
  const hasOnchainId = detailRes.data?.data?.erc8004SessionId || detailRes.data?.data?.easAttestationUid;
  assert(hasOnchainId != null, `有链上身份ID`);
}

// ========== 已有 Agent 检测 ==========

async function testExistingAgents() {
  console.log('\n📋 已有 Agent 统计');
  console.log('─'.repeat(50));

  const listRes = await makeRequest('GET', '/agent-accounts');
  const allAgents = listRes.data?.data || [];
  assert(allAgents.length >= 1, `总 Agent 数 ≥ 1: ${allAgents.length}`);

  const activeCount = allAgents.filter(a => a.status === 'active').length;
  console.log(`  ℹ️  活跃 Agent: ${activeCount} / ${allAgents.length}`);
}

// ========== Cleanup ==========

async function cleanup() {
  console.log('\n🧹 清理测试数据');
  console.log('─'.repeat(50));

  if (testAgentId) {
    const revokeRes = await makeRequest('POST', `/agent-accounts/${testAgentId}/revoke`, { reason: 'E2E test cleanup' });
    assert(revokeRes.status === 200, `测试 Agent 撤销: ${revokeRes.status} === 200`);
  }
}

// ========== Main ==========

async function main() {
  console.log('═'.repeat(60));
  console.log(' Agentrix Agent Account E2E Tests — Phase 1-4');
  console.log(' Chain: BSC Testnet | Gas: Platform Sponsored');
  console.log('═'.repeat(60));

  try {
    console.log('\n🔐 获取认证 Token');
    await getToken();

    await testPhase1();
    await testPhase2();
    await testPhase3();
    await testPhase4();
    await testPhase4PostRegister();
    await testExistingAgents();
    await cleanup();

  } catch (err) {
    console.error('\n💥 测试运行异常:', err.message);
    failed++;
  }

  console.log('\n' + '═'.repeat(60));
  console.log(` 结果: ${passed}/${total} 通过, ${failed} 失败`);
  console.log('═'.repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

main();
