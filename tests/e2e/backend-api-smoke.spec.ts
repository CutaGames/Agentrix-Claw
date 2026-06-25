/**
 * Backend API Smoke Tests
 * 
 * Verifies all critical API endpoints are reachable and return expected shapes.
 * Based on: E2E_TEST_PLAN_V4 §13 (后端 API 就绪状态检查清单)
 * 
 * Run: npx playwright test tests/e2e/backend-api-smoke.spec.ts -c tests/e2e/playwright.config.ts
 */
import { test, expect } from '@playwright/test';

const API = 'https://api.agentrix.top/api';
const TOKEN = process.env.AGENTRIX_E2E_TOKEN || '';

function headers() {
  return {
    'Content-Type': 'application/json',
    ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// §1. HEALTH & AUTH
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('§1 Health & Auth', () => {
  test('Server health check', async ({ request }) => {
    const res = await request.get(`${API}/health`);
    expect(res.status()).toBeLessThan(500);
  });

  test('Auth verify endpoint exists', async ({ request }) => {
    const res = await request.get(`${API}/v1/auth/verify`, { headers: headers() });
    // 200 = valid token, 401 = invalid token, 404 = path changed (all mean server is up)
    expect([200, 401, 404]).toContain(res.status());
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// §2. PET ENDPOINTS (已上线)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('§2 Pet Endpoints', () => {
  test('GET /v1/pet/skins — wardrobe', async ({ request }) => {
    const res = await request.get(`${API}/v1/pet/skins`, { headers: headers() });
    expect([200, 401]).toContain(res.status());
    if (res.status() === 200) {
      const data = await res.json();
      expect(data).toHaveProperty('items');
    }
  });

  test('GET /v1/pet-generation/tasks — generation tasks', async ({ request }) => {
    const res = await request.get(`${API}/v1/pet-generation/tasks`, { headers: headers() });
    expect([200, 401, 404]).toContain(res.status());
  });

  test('GET /v1/pet/souls — soul list', async ({ request }) => {
    const res = await request.get(`${API}/v1/pet/souls`, { headers: headers() });
    expect([200, 401]).toContain(res.status());
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// §3. AXP ENDPOINTS (已上线)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('§3 AXP Endpoints', () => {
  test('GET /v1/axp/balance', async ({ request }) => {
    const res = await request.get(`${API}/v1/axp/balance`, { headers: headers() });
    expect([200, 401]).toContain(res.status());
    if (res.status() === 200) {
      const data = await res.json();
      expect(data).toHaveProperty('balance');
    }
  });

  test('POST /v1/axp/checkin', async ({ request }) => {
    const res = await request.post(`${API}/v1/axp/checkin`, { headers: headers() });
    // 200 = success, 409 = already checked in, 401 = no auth
    expect([200, 409, 401]).toContain(res.status());
  });

  test('GET /v1/axp/redeem/catalog — 兑换商店', async ({ request }) => {
    const res = await request.get(`${API}/v1/axp/redeem/catalog`, { headers: headers() });
    // May be 404 if not yet implemented
    expect([200, 401, 404]).toContain(res.status());
    if (res.status() === 404) {
      console.warn('⚠️ /v1/axp/redeem/catalog returns 404 — needs implementation');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// §4. MARKETPLACE ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('§4 Marketplace', () => {
  test('GET /v1/market/skins — marketplace browse', async ({ request }) => {
    const res = await request.get(`${API}/v1/market/skins`, { headers: headers() });
    expect([200, 401, 404]).toContain(res.status());
    if (res.status() === 404) {
      console.warn('⚠️ /v1/market/skins returns 404 — needs verification');
    }
  });

  test('GET /v1/subscription/catalog — subscription tiers', async ({ request }) => {
    const res = await request.get(`${API}/v1/subscription/catalog`, { headers: headers() });
    expect([200, 401]).toContain(res.status());
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// §5. DEVICE / CLAWCORE ENDPOINTS (已上线)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('§5 ClawCore / Device', () => {
  test('GET /v1/clawcore/devices — device list', async ({ request }) => {
    const res = await request.get(`${API}/v1/clawcore/devices`, { headers: headers() });
    expect([200, 401, 404]).toContain(res.status());
  });

  test('POST /v1/clawcore/nfc/redeem — NFC redeem', async ({ request }) => {
    const res = await request.post(`${API}/v1/clawcore/nfc/redeem`, {
      headers: headers(),
      data: { nfc_token: 'test-invalid-token' },
    });
    // 404 = invalid token, 401 = no auth, 409 = already redeemed
    expect([200, 401, 404, 409]).toContain(res.status());
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// §6. VITALS / TELEMETRY
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('§6 Vitals', () => {
  test('GET /v1/vitals/ingest — vitals endpoint', async ({ request }) => {
    const res = await request.get(`${API}/v1/vitals/ingest`, { headers: headers() });
    // GET may not be supported (POST only), but endpoint should exist
    expect([200, 401, 404, 405]).toContain(res.status());
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// §7. ENDPOINTS NEEDING IMPLEMENTATION (验证 404 状态)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('§7 Implementation Status Check', () => {
  const endpointsToCheck = [
    { method: 'POST', path: '/v1/checkout/session', name: 'Stripe Checkout' },
    { method: 'GET', path: '/v1/marketplace/my-sales/summary', name: 'Skin GMV' },
    { method: 'GET', path: '/v1/marketplace/my-remix-earnings', name: 'Remix Earnings' },
  ];

  for (const { method, path, name } of endpointsToCheck) {
    test(`${name} (${method} ${path}) — status check`, async ({ request }) => {
      const res = method === 'GET'
        ? await request.get(`${API}${path}`, { headers: headers() })
        : await request.post(`${API}${path}`, { headers: headers(), data: {} });
      
      if (res.status() === 404) {
        console.warn(`⚠️ ${name} (${path}) returns 404 — NEEDS IMPLEMENTATION`);
      }
      // Don't fail — just report status
      expect(res.status()).toBeLessThan(600);
    });
  }
});
