/**
 * Test Data Seed Script
 * 
 * Seeds the backend with test data for E2E testing.
 * Run before test suites to ensure consistent test state.
 * 
 * Usage:
 *   node tests/e2e/fixtures/seed-test-data.mjs [--reset]
 * 
 * Environment:
 *   AGENTRIX_API_URL — Backend API URL (default: https://api.agentrix.top/api)
 *   AGENTRIX_ADMIN_TOKEN — Admin JWT for seeding operations
 */
import { writeFileSync } from 'fs';
import { join } from 'path';

const API = process.env.AGENTRIX_API_URL || 'https://api.agentrix.top/api';
const ADMIN_TOKEN = process.env.AGENTRIX_ADMIN_TOKEN || '';
const RESET = process.argv.includes('--reset');

const headers = {
  'Content-Type': 'application/json',
  ...(ADMIN_TOKEN ? { Authorization: `Bearer ${ADMIN_TOKEN}` } : {}),
};

// ─── Test Data Definitions ──────────────────────────────────────────────────

const TEST_USER = {
  email: 'e2e-test@agentrix.top',
  nickname: 'E2E Tester',
  plan: 'pro',
};

const TEST_SKINS = [
  { name: 'E2E 默认皮肤', name_en: 'E2E Default', rarity: 'common', price_axp: 0, soul_clan: 'A_office' },
  { name: 'E2E 稀有皮肤', name_en: 'E2E Rare', rarity: 'rare', price_axp: 500, soul_clan: 'A_office' },
  { name: 'E2E 史诗皮肤', name_en: 'E2E Epic', rarity: 'epic', price_axp: 1200, soul_clan: 'C_tech' },
];

const TEST_NFC_TOKENS = [
  { token: 'NFC-E2E-001', reward_type: 'skin', reward_id: 'skin-e2e-rare', redeemed: false },
  { token: 'NFC-E2E-002', reward_type: 'axp', reward_amount: 100, redeemed: false },
  { token: 'NFC-E2E-003', reward_type: 'skin', reward_id: 'skin-e2e-epic', redeemed: true }, // Already redeemed
];

const TEST_DEVICES = [
  { name: 'AGX-E2E-Toy', type: 'toy', firmware: '1.0.0' },
  { name: 'AGX-E2E-Watch', type: 'watch', firmware: '2.0.0' },
];

// ─── API Helpers ────────────────────────────────────────────────────────────

async function apiCall(method, path, body = null) {
  const url = `${API}${path}`;
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  
  try {
    const res = await fetch(url, options);
    const data = await res.json().catch(() => null);
    return { status: res.status, data, ok: res.ok };
  } catch (e) {
    return { status: 0, data: null, ok: false, error: e.message };
  }
}

// ─── Seed Functions ─────────────────────────────────────────────────────────

async function seedUser() {
  console.log('  📧 Seeding test user...');
  const res = await apiCall('POST', '/v1/admin/seed/user', TEST_USER);
  if (res.ok) {
    console.log(`     ✅ User created: ${TEST_USER.email}`);
    return res.data;
  } else if (res.status === 409) {
    console.log(`     ⏭️  User already exists`);
    return { email: TEST_USER.email };
  } else {
    console.log(`     ⚠️  Status ${res.status}: ${res.data?.message || 'Unknown error'}`);
    return null;
  }
}

async function seedSkins() {
  console.log('  🎨 Seeding test skins...');
  for (const skin of TEST_SKINS) {
    const res = await apiCall('POST', '/v1/admin/seed/skin', skin);
    if (res.ok || res.status === 409) {
      console.log(`     ✅ Skin: ${skin.name}`);
    } else {
      console.log(`     ⚠️  ${skin.name}: Status ${res.status}`);
    }
  }
}

async function seedNfcTokens() {
  console.log('  📱 Seeding NFC tokens...');
  for (const nfc of TEST_NFC_TOKENS) {
    const res = await apiCall('POST', '/v1/admin/seed/nfc-token', nfc);
    if (res.ok || res.status === 409) {
      console.log(`     ✅ NFC: ${nfc.token} (${nfc.redeemed ? 'redeemed' : 'available'})`);
    } else {
      console.log(`     ⚠️  ${nfc.token}: Status ${res.status}`);
    }
  }
}

async function seedDevices() {
  console.log('  🔌 Seeding test devices...');
  for (const device of TEST_DEVICES) {
    const res = await apiCall('POST', '/v1/admin/seed/device', device);
    if (res.ok || res.status === 409) {
      console.log(`     ✅ Device: ${device.name}`);
    } else {
      console.log(`     ⚠️  ${device.name}: Status ${res.status}`);
    }
  }
}

async function resetTestData() {
  console.log('  🗑️  Resetting test data...');
  const res = await apiCall('POST', '/v1/admin/seed/reset', { prefix: 'E2E' });
  if (res.ok) {
    console.log('     ✅ Test data reset');
  } else {
    console.log(`     ⚠️  Reset: Status ${res.status}`);
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  Agentrix E2E Test Data Seed');
  console.log(`  API: ${API}`);
  console.log(`  Auth: ${ADMIN_TOKEN ? '✅ Token provided' : '⚠️ No admin token'}`);
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  if (!ADMIN_TOKEN) {
    console.log('⚠️  No AGENTRIX_ADMIN_TOKEN set. Seed operations may fail.');
    console.log('   Set it via: export AGENTRIX_ADMIN_TOKEN=your-admin-jwt');
    console.log('');
  }

  // Health check
  const health = await apiCall('GET', '/health');
  if (!health.ok && health.status !== 200) {
    console.log(`❌ Backend unreachable (${API}/health → ${health.status})`);
    console.log('   Ensure backend is running and accessible.');
    process.exit(1);
  }
  console.log(`✅ Backend healthy (${API})`);
  console.log('');

  if (RESET) {
    await resetTestData();
    console.log('');
  }

  await seedUser();
  await seedSkins();
  await seedNfcTokens();
  await seedDevices();

  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  ✅ Seed complete');
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  // Save seed manifest
  const manifest = {
    seeded_at: new Date().toISOString(),
    api: API,
    user: TEST_USER,
    skins: TEST_SKINS.length,
    nfc_tokens: TEST_NFC_TOKENS.length,
    devices: TEST_DEVICES.length,
  };
  const manifestPath = join(process.cwd(), 'tests', 'e2e', 'fixtures', '.seed-manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`📄 Manifest: ${manifestPath}`);
}

main().catch(e => {
  console.error('❌ Seed failed:', e.message);
  process.exit(1);
});
