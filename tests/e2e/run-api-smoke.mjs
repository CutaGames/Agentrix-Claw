/**
 * Backend API Smoke Tests — Standalone Runner
 * 
 * Runs without Playwright dependency, using native fetch.
 * Tests all critical API endpoints against the live backend.
 * 
 * Run: node tests/e2e/run-api-smoke.mjs
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const API = 'https://api.agentrix.top/api';
const TOKEN = process.env.AGENTRIX_E2E_TOKEN || '';
const REPORT_DIR = join(process.cwd(), 'tests', 'reports', `api-smoke-${new Date().toISOString().slice(0, 10)}`);
mkdirSync(REPORT_DIR, { recursive: true });

const results = [];

function headers() {
  return {
    'Content-Type': 'application/json',
    ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
  };
}

function log(section, name, passed, detail = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  const entry = { section, name, passed, detail, timestamp: new Date().toISOString() };
  results.push(entry);
  console.log(`${status} | [${section}] ${name}${detail ? ' — ' + detail : ''}`);
}

async function apiTest(method, path, options = {}) {
  const url = `${API}${path}`;
  const fetchOpts = {
    method,
    headers: headers(),
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  };
  try {
    const res = await fetch(url, fetchOpts);
    const data = await res.json().catch(() => null);
    return { status: res.status, data, ok: true };
  } catch (e) {
    return { status: 0, data: null, ok: false, error: e.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Agentrix V4 Backend API Smoke Tests');
  console.log(`  Target: ${API}`);
  console.log(`  Token: ${TOKEN ? 'provided' : 'NOT provided (some tests will get 401)'}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // §1. Health & Auth
  {
    const res = await apiTest('GET', '/health');
    log('Health', 'Server health check', res.status < 500, `Status: ${res.status}`);
  }
  {
    const res = await apiTest('GET', '/v1/auth/verify');
    log('Auth', 'Auth verify endpoint exists', [200, 401].includes(res.status), `Status: ${res.status}`);
  }

  // §2. Pet Endpoints
  {
    const res = await apiTest('GET', '/v1/pet/skins');
    log('Pet', 'GET /v1/pet/skins (wardrobe)', [200, 401].includes(res.status), `Status: ${res.status}`);
  }
  {
    const res = await apiTest('GET', '/v1/pet-generation/tasks');
    log('Pet', 'GET /v1/pet-generation/tasks', [200, 401].includes(res.status), `Status: ${res.status}`);
  }
  {
    const res = await apiTest('GET', '/v1/pet/souls');
    log('Pet', 'GET /v1/pet/souls', [200, 401].includes(res.status), `Status: ${res.status}`);
  }

  // §3. AXP Endpoints
  {
    const res = await apiTest('GET', '/v1/axp/balance');
    log('AXP', 'GET /v1/axp/balance', [200, 401].includes(res.status), `Status: ${res.status}`);
  }
  {
    const res = await apiTest('POST', '/v1/axp/checkin');
    log('AXP', 'POST /v1/axp/checkin', [200, 409, 401].includes(res.status), `Status: ${res.status}`);
  }
  {
    const res = await apiTest('GET', '/v1/axp/redeem/catalog');
    const passed = [200, 401, 404].includes(res.status);
    log('AXP', 'GET /v1/axp/redeem/catalog', passed, `Status: ${res.status}${res.status === 404 ? ' ⚠️ NEEDS IMPL' : ''}`);
  }

  // §4. Marketplace
  {
    const res = await apiTest('GET', '/v1/market/skins');
    log('Market', 'GET /v1/market/skins', [200, 401, 404].includes(res.status), `Status: ${res.status}`);
  }
  {
    const res = await apiTest('GET', '/v1/subscription/catalog');
    log('Market', 'GET /v1/subscription/catalog', [200, 401].includes(res.status), `Status: ${res.status}`);
  }
  {
    const res = await apiTest('GET', '/v1/marketplace/skills');
    log('Market', 'GET /v1/marketplace/skills', [200, 401, 404].includes(res.status), `Status: ${res.status}`);
  }
  {
    const res = await apiTest('GET', '/v1/marketplace/tasks');
    log('Market', 'GET /v1/marketplace/tasks', [200, 401, 404].includes(res.status), `Status: ${res.status}`);
  }

  // §5. ClawCore / Device
  {
    const res = await apiTest('GET', '/v1/clawcore/devices');
    log('Device', 'GET /v1/clawcore/devices', [200, 401].includes(res.status), `Status: ${res.status}`);
  }
  {
    const res = await apiTest('POST', '/v1/clawcore/nfc/redeem', { body: { nfc_token: 'test-invalid-token' } });
    log('Device', 'POST /v1/clawcore/nfc/redeem', [200, 401, 404, 409].includes(res.status), `Status: ${res.status}`);
  }
  {
    const res = await apiTest('GET', '/v1/clawcore/ota/manifest?device_type=toy&current_version=1.0.0');
    log('Device', 'GET /v1/clawcore/ota/manifest', [200, 204, 401, 404].includes(res.status), `Status: ${res.status}`);
  }

  // §6. Chat / Streaming
  {
    const res = await apiTest('GET', '/v1/chat/history');
    log('Chat', 'GET /v1/chat/history', [200, 401].includes(res.status), `Status: ${res.status}`);
  }

  // §7. Notifications
  {
    const res = await apiTest('GET', '/v1/notifications');
    log('Notif', 'GET /v1/notifications', [200, 401, 404].includes(res.status), `Status: ${res.status}`);
  }

  // §8. User Profile
  {
    const res = await apiTest('GET', '/v1/user/profile');
    log('User', 'GET /v1/user/profile', [200, 401].includes(res.status), `Status: ${res.status}`);
  }

  // §9. Subscription
  {
    const res = await apiTest('GET', '/v1/subscription/status');
    log('Sub', 'GET /v1/subscription/status', [200, 401, 404].includes(res.status), `Status: ${res.status}`);
  }

  // §10. Co-Raising
  {
    const res = await apiTest('GET', '/v1/co-raising/invites');
    log('Social', 'GET /v1/co-raising/invites', [200, 401, 404].includes(res.status), `Status: ${res.status}`);
  }

  // §11. Greeting Cards
  {
    const res = await apiTest('GET', '/v1/greeting/inbox');
    log('Social', 'GET /v1/greeting/inbox', [200, 401, 404].includes(res.status), `Status: ${res.status}`);
  }

  // §12. Agent Economy
  {
    const res = await apiTest('GET', '/v1/agent/cost-records');
    log('Economy', 'GET /v1/agent/cost-records', [200, 401, 404].includes(res.status), `Status: ${res.status}`);
  }

  // §13. Presence / Cross-Device
  {
    const res = await apiTest('GET', '/v1/presence/devices');
    log('Presence', 'GET /v1/presence/devices', [200, 401, 404].includes(res.status), `Status: ${res.status}`);
  }

  saveReport();
}

function saveReport() {
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  
  const report = {
    date: new Date().toISOString(),
    target: API,
    hasToken: !!TOKEN,
    summary: `${passed}/${total} passed (${Math.round(passed / total * 100)}%)`,
    passed,
    failed,
    total,
    results,
  };

  const reportPath = join(REPORT_DIR, 'api-smoke-results.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`📊 Report: ${reportPath}`);
  console.log(`   ${report.summary}`);
  if (failed > 0) {
    console.log(`   ❌ ${failed} endpoint(s) unreachable or returning unexpected status`);
  }
  console.log('═══════════════════════════════════════════════════════════');
  
  // Exit with error if critical endpoints fail
  const criticalFails = results.filter(r => !r.passed && ['Health', 'Auth'].includes(r.section));
  if (criticalFails.length > 0) {
    process.exit(1);
  }
}

runTests().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
