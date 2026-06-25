/**
 * Agent Account E2E Test Suite
 * Tests the complete agent account lifecycle on production.
 * Run on server: node _test_agent_account_e2e.js
 */
const jwt = require('jsonwebtoken');
const fs = require('fs');
const http = require('http');

const API_BASE = 'http://localhost:3000/api';
let TOKEN = '';
let USER_ID = '';
let TEST_AGENT_ID = '';

// ─── Helpers ─────────────────────────────────────────
function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${API_BASE}${path}`);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
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

let passed = 0;
let failed = 0;
const results = [];

function assert(testName, condition, detail) {
  if (condition) {
    passed++;
    results.push(`  ✅ ${testName}`);
  } else {
    failed++;
    results.push(`  ❌ ${testName} — ${detail || 'assertion failed'}`);
  }
}

// ─── Setup ───────────────────────────────────────────
async function setup() {
  const env = fs.readFileSync('/home/ubuntu/Agentrix/backend/.env', 'utf8');
  const secret = env.match(/JWT_SECRET=(.+)/)?.[1]?.trim();
  if (!secret) throw new Error('JWT_SECRET not found in .env');

  const { Client } = require('pg');
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'agentrix',
    password: 'agentrix_secure_2024',
    database: 'paymind',
  });
  await client.connect();

  // Use admin user
  const res = await client.query("SELECT id, email FROM users WHERE email = 'zhouyachi2023@gmail.com' LIMIT 1");
  if (res.rows.length === 0) throw new Error('Admin user not found');
  USER_ID = res.rows[0].id;
  TOKEN = jwt.sign({ sub: USER_ID, email: res.rows[0].email }, secret, { expiresIn: '1h' });
  console.log(`🔑 Token generated for ${res.rows[0].email} (${USER_ID})\n`);
  await client.end();
}

// ─── Tests ───────────────────────────────────────────

async function testCreateAgent() {
  console.log('── Test: Create Agent Account ──');
  const r = await api('POST', '/agent-accounts', {
    name: 'E2E Test Agent',
    description: 'Created by E2E test suite',
    agentType: 'personal',
    spendingLimits: {
      singleTxLimit: 50,
      dailyLimit: 200,
      monthlyLimit: 1000,
      currency: 'USD',
    },
  });

  assert('Create returns 201', r.status === 201, `status=${r.status}`);
  assert('Response has success=true', r.data?.success === true, JSON.stringify(r.data).slice(0, 100));
  assert('Agent has AGT- unique ID', r.data?.data?.agentUniqueId?.startsWith('AGT-'), r.data?.data?.agentUniqueId);
  assert('Agent status is active', r.data?.data?.status === 'active', r.data?.data?.status);
  assert('Spending limits set', r.data?.data?.spendingLimits?.dailyLimit === 200, JSON.stringify(r.data?.data?.spendingLimits));
  assert('Credit score = 500', r.data?.data?.creditScore == 500, `score=${r.data?.data?.creditScore}`);

  if (r.data?.data?.id) {
    TEST_AGENT_ID = r.data.data.id;
    console.log(`   Created agent: ${TEST_AGENT_ID}\n`);
  }
}

async function testListAgents() {
  console.log('── Test: List My Agents ──');
  const r = await api('GET', '/agent-accounts');

  assert('List returns 200', r.status === 200, `status=${r.status}`);
  assert('Response has data array', Array.isArray(r.data?.data), typeof r.data?.data);
  assert('Pagination info present', r.data?.pagination?.total >= 1, JSON.stringify(r.data?.pagination));
  
  const testAgent = r.data?.data?.find(a => a.id === TEST_AGENT_ID);
  assert('Test agent in list', !!testAgent, 'not found');
}

async function testGetAgent() {
  console.log('── Test: Get Agent Detail ──');
  const r = await api('GET', `/agent-accounts/${TEST_AGENT_ID}`);

  assert('Detail returns 200', r.status === 200, `status=${r.status}`);
  assert('Agent name matches', r.data?.data?.name === 'E2E Test Agent', r.data?.data?.name);
  assert('Owner ID matches', r.data?.data?.ownerId === USER_ID, r.data?.data?.ownerId);
}

async function testUpdateAgent() {
  console.log('── Test: Update Agent ──');
  const r = await api('PUT', `/agent-accounts/${TEST_AGENT_ID}`, {
    name: 'E2E Test Agent (Updated)',
    description: 'Updated by E2E test',
    preferredModel: 'claude-sonnet-4-20250514',
    spendingLimits: {
      singleTxLimit: 100,
      dailyLimit: 500,
      monthlyLimit: 2000,
      currency: 'USD',
    },
  });

  assert('Update returns 200', r.status === 200, `status=${r.status}`);
  assert('Name updated', r.data?.data?.name === 'E2E Test Agent (Updated)', r.data?.data?.name);
  assert('Limits updated', r.data?.data?.spendingLimits?.dailyLimit === 500, JSON.stringify(r.data?.data?.spendingLimits));
}

async function testGenerateApiKey() {
  console.log('── Test: Generate API Key ──');
  const r = await api('POST', `/agent-accounts/${TEST_AGENT_ID}/api-key`);

  assert('API Key returns 200', r.status === 200, `status=${r.status}`);
  assert('Key starts with ak_', r.data?.data?.apiKey?.startsWith('ak_'), r.data?.data?.apiKey?.slice(0, 10));
  assert('Prefix provided', !!r.data?.data?.prefix, r.data?.data?.prefix);
}

async function testCheckSpending() {
  console.log('── Test: Check Spending Limits ──');
  
  // Within limits
  const r1 = await api('GET', `/agent-accounts/${TEST_AGENT_ID}/check-spending?amount=50`);
  assert('50 USD allowed', r1.data?.data?.allowed === true, JSON.stringify(r1.data?.data));
  
  // Over single tx limit
  const r2 = await api('GET', `/agent-accounts/${TEST_AGENT_ID}/check-spending?amount=150`);
  assert('150 USD rejected (single tx)', r2.data?.data?.allowed === false, JSON.stringify(r2.data?.data));
}

async function testCreditScore() {
  console.log('── Test: Credit Score ──');
  
  // Increase
  const r1 = await api('POST', `/agent-accounts/${TEST_AGENT_ID}/credit-score`, {
    delta: 100,
    reason: 'E2E test: task completed',
  });
  assert('Score increased to 600', r1.data?.data?.creditScore == 600, `score=${r1.data?.data?.creditScore}`);
  
  // Decrease
  const r2 = await api('POST', `/agent-accounts/${TEST_AGENT_ID}/credit-score`, {
    delta: -50,
    reason: 'E2E test: task failed',
  });
  assert('Score decreased to 550', r2.data?.data?.creditScore == 550, `score=${r2.data?.data?.creditScore}`);
}

async function testLifecycle() {
  console.log('── Test: Lifecycle (suspend/resume/revoke) ──');
  
  // Suspend
  const r1 = await api('POST', `/agent-accounts/${TEST_AGENT_ID}/suspend`, { reason: 'E2E test' });
  assert('Suspend returns 200', r1.status === 200, `status=${r1.status}`);
  assert('Status = suspended', r1.data?.data?.status === 'suspended', r1.data?.data?.status);
  
  // Resume
  const r2 = await api('POST', `/agent-accounts/${TEST_AGENT_ID}/resume`);
  assert('Resume returns 200', r2.status === 200, `status=${r2.status}`);
  assert('Status = active', r2.data?.data?.status === 'active', r2.data?.data?.status);
  
  // Revoke
  const r3 = await api('POST', `/agent-accounts/${TEST_AGENT_ID}/revoke`, { reason: 'E2E test cleanup' });
  assert('Revoke returns 200', r3.status === 200, `status=${r3.status}`);
  assert('Status = revoked', r3.data?.data?.status === 'revoked', r3.data?.data?.status);
}

async function testNotificationEndpoints() {
  console.log('── Test: Notification Approve/Reject ──');
  
  // List notifications
  const r1 = await api('GET', '/notifications?limit=20');
  assert('Notifications list returns 200', r1.status === 200, `status=${r1.status}`);
  assert('Notifications is array', Array.isArray(r1.data?.data || r1.data), 'not array');

  // Approve non-existent — should get 404
  const r2 = await api('POST', '/notifications/00000000-0000-0000-0000-000000000000/approve');
  assert('Approve non-existent returns 404', r2.status === 404, `status=${r2.status}`);
  
  // Reject non-existent — should get 404
  const r3 = await api('POST', '/notifications/00000000-0000-0000-0000-000000000000/reject');
  assert('Reject non-existent returns 404', r3.status === 404, `status=${r3.status}`);
}

async function testGrowthDashboard() {
  console.log('── Test: Growth Dashboard ──');
  
  const r = await api('GET', '/analytics/growth?days=7');
  assert('Growth returns 200', r.status === 200, `status=${r.status}`);
  assert('Has snapshot', !!r.data?.snapshot, 'missing snapshot');
  assert('Has totalUsers', r.data?.snapshot?.totalUsers >= 0, `totalUsers=${r.data?.snapshot?.totalUsers}`);
  assert('Has trends', !!r.data?.trends, 'missing trends');
}

async function testA2AEndpoints() {
  console.log('── Test: A2A Endpoints ──');
  
  // The A2A controller uses @Controller('api/a2a') + global prefix 'api' = /api/api/a2a
  // Try both paths
  let r = await api('GET', '/api/a2a/tasks');
  if (r.status !== 200) {
    r = await api('GET', '/a2a/tasks');
  }
  assert('A2A tasks returns 200', r.status === 200, `status=${r.status}`);
}

async function testExistingAgentAccounts() {
  console.log('── Test: Existing Agent Accounts (11 team agents) ──');
  
  const r = await api('GET', '/agent-accounts');
  assert('List returns data', Array.isArray(r.data?.data), typeof r.data?.data);
  
  const agents = r.data?.data || [];
  // Team agents may use various ID formats — check by count
  assert('Multiple agent accounts exist', agents.length >= 5, `found ${agents.length}`);
  
  if (agents.length > 0) {
    console.log(`   Found ${agents.length} total agents`);
    for (const a of agents.slice(0, 5)) {
      console.log(`     ${a.name}: ${a.status} | credit=${a.creditScore} | id=${a.agentUniqueId?.slice(0,20)}`);
    }
  }
}

// ─── Main ────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════');
  console.log(' Agentrix Agent Account E2E Test Suite');
  console.log('═══════════════════════════════════════\n');

  await setup();

  // Core CRUD
  await testCreateAgent();
  await testListAgents();
  await testGetAgent();
  await testUpdateAgent();
  await testGenerateApiKey();

  // Business Logic
  await testCheckSpending();
  await testCreditScore();
  await testLifecycle();

  // Related Modules
  await testNotificationEndpoints();
  await testGrowthDashboard();
  await testA2AEndpoints();
  await testExistingAgentAccounts();

  // Report
  console.log('\n═══════════════════════════════════════');
  console.log(' Results');
  console.log('═══════════════════════════════════════');
  for (const r of results) console.log(r);
  console.log(`\n  Total: ${passed + failed} | ✅ Passed: ${passed} | ❌ Failed: ${failed}`);
  console.log('═══════════════════════════════════════\n');
  
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('E2E test suite failed:', err.message);
  process.exit(1);
});
