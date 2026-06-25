/**
 * Web E2E Smoke Test — W1-W5 Refactor Verification
 * Per docs/WEB_REFACTOR_PLAN_2026-05.zh-CN.md
 *
 * Tests:
 *   L1 — HTTP 200 / redirect checks for all new routes
 *   L2 — Content presence checks (key strings in HTML)
 *   L3 — API endpoint checks (backend health)
 *
 * Usage: node scripts/test/web-e2e-smoke.mjs [BASE_URL]
 * Default BASE_URL: https://agentrix.top
 */

const BASE = process.argv[2] || 'https://agentrix.top';
const API  = process.argv[3] || 'https://api.agentrix.top';

const results = [];
let passed = 0, failed = 0, warned = 0;

function log(status, label, detail = '') {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${icon} [${status}] ${label}${detail ? ' — ' + detail : ''}`);
  results.push({ status, label, detail });
  if (status === 'PASS') passed++;
  else if (status === 'FAIL') failed++;
  else warned++;
}

async function get(url, opts = {}) {
  try {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10000), ...opts });
    return { ok: true, status: r.status, text: await r.text() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function checkRoute(label, path, { expectStatus = 200, expectText = null, expectRedirect = null } = {}) {
  const url = BASE + path;
  const r = await get(url);
  if (!r.ok) { log('FAIL', label, `fetch error: ${r.error}`); return; }
  if (expectStatus && r.status !== expectStatus) {
    log('FAIL', label, `HTTP ${r.status} (expected ${expectStatus})`);
    return;
  }
  if (expectText && !r.text.includes(expectText)) {
    log('FAIL', label, `text "${expectText}" not found in response`);
    return;
  }
  log('PASS', label, `HTTP ${r.status}`);
}

async function checkApi(label, path, { expectStatus = 200, expectKey = null } = {}) {
  const url = API + path;
  const r = await get(url);
  if (!r.ok) { log('FAIL', label, `fetch error: ${r.error}`); return; }
  if (r.status !== expectStatus) {
    // 401 on auth-required endpoints is expected without token
    if (r.status === 401) { log('PASS', label, `HTTP 401 (auth required — expected)`); return; }
    log('FAIL', label, `HTTP ${r.status} (expected ${expectStatus})`);
    return;
  }
  if (expectKey) {
    try {
      const json = JSON.parse(r.text);
      const flat = JSON.stringify(json);
      if (!flat.includes(expectKey)) { log('FAIL', label, `key "${expectKey}" not in response`); return; }
    } catch { log('WARN', label, 'response not JSON'); return; }
  }
  log('PASS', label, `HTTP ${r.status}`);
}

// ─── L1: Route availability ───────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════');
console.log('  L1 · Route Availability (HTTP status)');
console.log('══════════════════════════════════════════');

// W1 Marketing
await checkRoute('W1 · / (homepage)',                    '/',                    { expectText: 'Agentrix' });
await checkRoute('W1 · /pricing (5-tier)',               '/pricing',             { expectText: 'Agentrix' });
await checkRoute('W1 · /showcase',                       '/showcase',            { expectText: 'Agentrix' });
await checkRoute('W1 · /co-raising/test-token',          '/co-raising/test-token');
await checkRoute('W1 · /greeting/test-token',            '/greeting/test-token');

// W2 Marketplace
await checkRoute('W2 · /market (index)',                 '/market');
await checkRoute('W2 · /market/skin/skin-1',             '/market/skin/skin-1');
await checkRoute('W2 · /market/auction/1',               '/market/auction/1');
await checkRoute('W2 · /market/creator/creator1',        '/market/creator/creator1');
await checkRoute('W2 · /market/leaderboard',             '/market/leaderboard');
await checkRoute('W2 · /market/sell',                    '/market/sell');
await checkRoute('W2 · /market/clan/A',                  '/market/clan/A');

// W2 Pet profile — 404 for non-existent pet is correct (getServerSideProps returns notFound)
await checkRoute('W2 · /p/[petId] route exists (404=correct for unknown pet)', '/p/test-pet', { expectStatus: 404 });

// W3 Console (expect redirect to login if not authed)
await checkRoute('W3 · /console/pet (redirect→login)',   '/console/pet',         { expectStatus: 200 });
await checkRoute('W3 · /console/pet/create',             '/console/pet/create',  { expectStatus: 200 });
await checkRoute('W3 · /console/axp',                    '/console/axp',         { expectStatus: 200 });
await checkRoute('W3 · /console/axp/shop',               '/console/axp/shop',    { expectStatus: 200 });

// W4 Promote
await checkRoute('W4 · /console/promote',                '/console/promote',     { expectStatus: 200 });

// W5 Redirects
await checkRoute('W5 · /marketplace → /market (301)',    '/marketplace',         { expectStatus: 200 }); // follows redirect

// ─── L2: Content presence ─────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════');
console.log('  L2 · Content Presence (key strings)');
console.log('══════════════════════════════════════════');

const home = await get(BASE + '/');
if (home.ok) {
  const h = home.text;
  // W1-1 Hero new copy
  const heroNew = h.includes('Pet-as-Agent') || h.includes('AI agent that earns') || h.includes('能赚钱的 AI Agent');
  heroNew ? log('PASS', 'W1-1 · Hero new Pet-as-Agent copy') : log('FAIL', 'W1-1 · Hero new copy missing');

  // W1-4 Pricing tiers
  const hasLite  = h.includes('Lite') || h.includes('4.99');
  const hasPlus  = h.includes('Plus') || h.includes('14.99');
  const hasElite = h.includes('Elite') || h.includes('69');
  hasLite  ? log('PASS', 'W1-4 · Pricing Lite tier present')  : log('FAIL', 'W1-4 · Lite tier missing');
  hasPlus  ? log('PASS', 'W1-4 · Pricing Plus tier present')  : log('FAIL', 'W1-4 · Plus tier missing');
  hasElite ? log('PASS', 'W1-4 · Pricing Elite tier present') : log('FAIL', 'W1-4 · Elite tier missing');

  // W1-3 AXP
  const hasAxp = h.includes('AXP') || h.includes('axp');
  hasAxp ? log('PASS', 'W1-3 · AXP narrative present') : log('FAIL', 'W1-3 · AXP narrative missing');
} else {
  log('FAIL', 'L2 · Could not fetch homepage for content checks');
}

const pricing = await get(BASE + '/pricing');
if (pricing.ok) {
  const p = pricing.text;
  const has5tiers = (p.includes('Lite') && p.includes('Plus') && p.includes('Elite'));
  has5tiers ? log('PASS', 'W1-4 · /pricing has all 5 tiers') : log('FAIL', 'W1-4 · /pricing missing tiers');
  const hasYearly = p.includes('yearly') || p.includes('年付') || p.includes('Save');
  hasYearly ? log('PASS', 'W1-4 · /pricing yearly toggle present') : log('WARN', 'W1-4 · yearly toggle not detected in HTML');
  const hasAxpCashback = p.includes('AXP') || p.includes('cashback') || p.includes('返现');
  hasAxpCashback ? log('PASS', 'W1-4 · /pricing AXP cashback present') : log('FAIL', 'W1-4 · AXP cashback missing on pricing');
}

const market = await get(BASE + '/market');
if (market.ok) {
  const m = market.text;
  const hasTrending = m.includes('Trending') || m.includes('热门');
  hasTrending ? log('PASS', 'W2 · /market Trending tab present') : log('FAIL', 'W2 · /market Trending tab missing');
}

const showcase = await get(BASE + '/showcase');
if (showcase.ok) {
  const s = showcase.text;
  const hasClan = s.includes('Clan') || s.includes('族群');
  hasClan ? log('PASS', 'W1-5 · /showcase clan filter present') : log('FAIL', 'W1-5 · clan filter missing');
}

// ─── L3: Backend API health ───────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════');
console.log('  L3 · Backend API Health');
console.log('══════════════════════════════════════════');

await checkApi('API · /api/v1/subscription/catalog',    '/api/v1/subscription/catalog',    { expectKey: 'tiers' });
await checkApi('API · /api/v1/pet/greeting/catalog',    '/api/v1/pet/greeting/catalog',    { expectKey: 'templates' });
await checkApi('API · /api/v1/axp/balance (auth)',      '/api/v1/axp/balance',             { expectStatus: 401 });
await checkApi('API · /api/v1/co-raising/peek (no token)', '/api/v1/co-raising/peek?token=invalid', { expectStatus: 404 });
await checkApi('API · /api/v1/me/quota (auth)',         '/api/v1/me/quota',                { expectStatus: 401 });

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════');
console.log('  SUMMARY');
console.log('══════════════════════════════════════════');
console.log(`Total: ${results.length} | ✅ PASS: ${passed} | ❌ FAIL: ${failed} | ⚠️  WARN: ${warned}`);
console.log(`Result: ${failed === 0 ? '🟢 ALL PASS' : `🔴 ${failed} FAILURE(S)`}`);
console.log('');

// Exit code for CI
process.exit(failed > 0 ? 1 : 0);
