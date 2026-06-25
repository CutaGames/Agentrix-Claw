/**
 * Agent Team Studio E2E Tests
 * 
 * Tests:
 * 1. 模板列表获取
 * 2. 模板详情获取
 * 3. 一键创建团队 (agentrix-11)
 * 4. 查看我的团队
 * 5. 重复创建检查 (幂等)
 * 6. 精简模板创建 (starter-4)
 * 7. 解散团队
 * 8. 解散后可重新创建
 */

const http = require('http');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const BASE_URL = 'http://localhost:3000/api';
let TOKEN = '';

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}${path}`);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(TOKEN ? { 'Authorization': `Bearer ${TOKEN}` } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

let passed = 0, failed = 0, total = 0;
function assert(condition, message) {
  total++;
  if (condition) { passed++; console.log(`  ✅ ${message}`); }
  else { failed++; console.log(`  ❌ ${message}`); }
}

async function getToken() {
  const client = new Client({
    host: 'localhost', port: 5432, user: 'agentrix', password: 'agentrix_secure_2024', database: 'paymind'
  });
  await client.connect();
  const res = await client.query("SELECT id, email FROM users WHERE email IS NOT NULL LIMIT 1");
  await client.end();
  const user = res.rows[0];
  TOKEN = jwt.sign({ sub: user.id, email: user.email }, 'agentrix-singapore-prod-jwt-secret-2026', { expiresIn: '1h' });
  console.log(`  Token for ${user.email} (${user.id.slice(0,8)}...)\n`);
  return user.id;
}

let templateId11 = '';
let templateIdStarter = '';

async function testTemplates() {
  console.log('📋 模板管理');
  console.log('─'.repeat(50));

  // 1. 列表
  const listRes = await makeRequest('GET', '/agent-teams/templates');
  assert(listRes.status === 200, `模板列表: ${listRes.status} === 200`);
  assert(listRes.data?.data?.length >= 2, `至少 2 个模板: ${listRes.data?.data?.length}`);

  const templates = listRes.data?.data || [];
  const tpl11 = templates.find(t => t.slug === 'agentrix-11');
  const tplStarter = templates.find(t => t.slug === 'starter-4');

  assert(tpl11 != null, `找到 agentrix-11 模板`);
  assert(tplStarter != null, `找到 starter-4 模板`);
  assert(tpl11?.teamSize === 11, `agentrix-11 有 11 个角色: ${tpl11?.teamSize}`);
  assert(tplStarter?.teamSize === 4, `starter-4 有 4 个角色: ${tplStarter?.teamSize}`);
  assert(tpl11?.visibility === 'official', `agentrix-11 是官方模板`);

  templateId11 = tpl11?.id;
  templateIdStarter = tplStarter?.id;

  // 2. 详情
  console.log('\n  [详情]');
  const detailRes = await makeRequest('GET', '/agent-teams/templates/agentrix-11');
  assert(detailRes.status === 200, `模板详情: ${detailRes.status} === 200`);
  assert(detailRes.data?.data?.roles?.length === 11, `详情含 11 个角色`);

  // 验证角色完整性
  const codenames = detailRes.data?.data?.roles?.map(r => r.codename) || [];
  const expected = ['ceo', 'dev', 'qa-ops', 'growth', 'ops', 'media', 'ecosystem', 'community', 'brand', 'hunter', 'treasury'];
  for (const cn of expected) {
    assert(codenames.includes(cn), `角色 ${cn} 存在`);
  }
}

async function testProvision() {
  console.log('\n📋 团队创建');
  console.log('─'.repeat(50));

  // 3. 一键创建 11-Agent 团队
  console.log('\n  [创建 11-Agent 团队]');
  const createRes = await makeRequest('POST', '/agent-teams/provision', {
    templateId: templateId11,
    teamNamePrefix: 'E2E Test',
  });
  assert(createRes.status === 201, `创建成功: ${createRes.status} === 201`);
  assert(createRes.data?.data?.teamSize === 11, `团队大小 11: ${createRes.data?.data?.teamSize}`);
  assert(createRes.data?.data?.agents?.length === 11, `返回 11 个 Agent`);

  // 验证每个 Agent
  const agents = createRes.data?.data?.agents || [];
  for (const a of agents) {
    assert(a.agentUniqueId?.startsWith('AGT-'), `${a.codename} 有 AGT- ID`);
    assert(a.name?.includes('E2E Test'), `${a.codename} 名称含前缀`);
    assert(a.status === 'active', `${a.codename} 状态 active`);
  }

  // 4. 查看我的团队
  console.log('\n  [查看我的团队]');
  const myTeamsRes = await makeRequest('GET', '/agent-teams/my-teams');
  assert(myTeamsRes.status === 200, `我的团队: ${myTeamsRes.status} === 200`);
  assert(myTeamsRes.data?.data?.length >= 1, `至少 1 个团队`);

  const team = myTeamsRes.data?.data?.find(t => t.templateSlug === 'agentrix-11');
  assert(team != null, `找到 agentrix-11 团队`);
  assert(team?.agents?.length === 11, `团队有 11 个 Agent`);

  // 5. 重复创建检查
  console.log('\n  [幂等性]');
  const dupRes = await makeRequest('POST', '/agent-teams/provision', {
    templateId: templateId11,
    teamNamePrefix: 'Dup Test',
  });
  assert(dupRes.status === 400, `重复创建被拒: ${dupRes.status} === 400`);
}

async function testStarterTeam() {
  console.log('\n📋 精简团队');
  console.log('─'.repeat(50));

  const createRes = await makeRequest('POST', '/agent-teams/provision', {
    templateId: templateIdStarter,
    teamNamePrefix: 'Starter Test',
  });
  assert(createRes.status === 201, `Starter 创建: ${createRes.status} === 201`);
  assert(createRes.data?.data?.teamSize === 4, `团队大小 4: ${createRes.data?.data?.teamSize}`);

  const agents = createRes.data?.data?.agents || [];
  const codenames = agents.map(a => a.codename);
  assert(codenames.includes('ceo'), `有 CEO`);
  assert(codenames.includes('dev'), `有 Dev`);
}

async function testDisband() {
  console.log('\n📋 团队解散与重建');
  console.log('─'.repeat(50));

  // 解散 11-Agent 团队
  const disbandRes = await makeRequest('DELETE', '/agent-teams/my-teams/agentrix-11');
  assert(disbandRes.status === 200, `解散成功: ${disbandRes.status} === 200`);
  assert(disbandRes.data?.data?.disbanded === 11, `解散 11 个 Agent: ${disbandRes.data?.data?.disbanded}`);

  // 解散 Starter 团队
  const disbandRes2 = await makeRequest('DELETE', '/agent-teams/my-teams/starter-4');
  assert(disbandRes2.status === 200, `Starter 解散: ${disbandRes2.status} === 200`);

  // 解散后可重建
  console.log('\n  [重建]');
  const recreateRes = await makeRequest('POST', '/agent-teams/provision', {
    templateId: templateId11,
    teamNamePrefix: 'Rebuilt',
  });
  assert(recreateRes.status === 201, `重建成功: ${recreateRes.status} === 201`);
  assert(recreateRes.data?.data?.teamSize === 11, `重建 11 个 Agent`);

  // 最终清理
  const cleanupRes = await makeRequest('DELETE', '/agent-teams/my-teams/agentrix-11');
  assert(cleanupRes.status === 200, `最终清理: ${cleanupRes.status} === 200`);
}

async function main() {
  console.log('═'.repeat(60));
  console.log(' Agent Team Studio E2E Tests');
  console.log('═'.repeat(60));

  try {
    console.log('\n🔐 获取认证 Token');
    await getToken();

    await testTemplates();
    await testProvision();
    await testStarterTeam();
    await testDisband();

  } catch (err) {
    console.error('\n💥 异常:', err.message);
    failed++;
  }

  console.log('\n' + '═'.repeat(60));
  console.log(` 结果: ${passed}/${total} 通过, ${failed} 失败`);
  console.log('═'.repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

main();
