import { expect, test } from '@playwright/test';

const API = process.env.API_URL || 'https://api.agentrix.top/api';
const AUTH_TOKEN = String(
  process.env.PLAYWRIGHT_AUTH_TOKEN || process.env.E2E_BEARER_TOKEN || '',
).trim();
const AUTH_SKIP_HINT =
  'Set PLAYWRIGHT_AUTH_TOKEN or E2E_BEARER_TOKEN to run authenticated Phase 4-6 API coverage.';

function authHeaders() {
  return {
    Authorization: `Bearer ${AUTH_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

test.describe.serial('Pet Phase 4-6 API contracts', () => {
  let partnerAppId = '';
  let partnerApiKey = '';

  test('1.1 protected routes reject anonymous callers', async ({ request }) => {
    const protectedRoutes = [
      `${API}/v1/passkey`,
      `${API}/v1/partner-apps`,
      `${API}/v1/pet/team/roles`,
      `${API}/v1/pet/nft/config`,
      `${API}/v1/pet/sovereign/config`,
    ];

    for (const url of protectedRoutes) {
      const res = await request.get(url);
      expect([401, 403]).toContain(res.status());
    }
  });

  test('1.2 partner runtime rejects missing app key', async ({ request }) => {
    const whoami = await request.get(`${API}/v1/partner-runtime/whoami`);
    expect([401, 403]).toContain(whoami.status());

    const ping = await request.post(`${API}/v1/partner-runtime/ping`, {
      data: { scope: 'pet.read' },
    });
    expect([401, 403]).toContain(ping.status());
  });

  test('2.1 passkey list responds for authenticated caller', async ({ request }) => {
    test.skip(!AUTH_TOKEN, AUTH_SKIP_HINT);
    const res = await request.get(`${API}/v1/passkey`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
  });

  test('2.2 pet team roles config responds for authenticated caller', async ({ request }) => {
    test.skip(!AUTH_TOKEN, AUTH_SKIP_HINT);
    const res = await request.get(`${API}/v1/pet/team/roles`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.roles)).toBe(true);
    expect(body.roles.length).toBeGreaterThanOrEqual(11);
  });

  test('2.3 pet nft config responds for authenticated caller', async ({ request }) => {
    test.skip(!AUTH_TOKEN, AUTH_SKIP_HINT);
    const res = await request.get(`${API}/v1/pet/nft/config`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.min_intimacy_level).toBeDefined();
    expect(Array.isArray(body.supported_chains)).toBe(true);
  });

  test('2.4 pet sovereign config responds for authenticated caller', async ({ request }) => {
    test.skip(!AUTH_TOKEN, AUTH_SKIP_HINT);
    const res = await request.get(`${API}/v1/pet/sovereign/config`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.supported_chains)).toBe(true);
    expect(body.custody_modes).toEqual(expect.arrayContaining(['platform', 'mpc', 'self']));
  });

  test('2.5 partner app owner flow registers throwaway app', async ({ request }) => {
    test.skip(!AUTH_TOKEN, AUTH_SKIP_HINT);
    const slug = `pw-phase6-${Date.now()}`;
    const res = await request.post(`${API}/v1/partner-apps`, {
      headers: authHeaders(),
      data: {
        name: `Playwright ${slug}`,
        slug,
        scopes: ['pet.read', 'pet.write'],
        billingMode: 'per_call',
        perCallUsd: 0.01,
        monthlyCapUsd: 1,
      },
    });
    expect(res.status()).toBeLessThan(400);
    const body = await res.json();
    expect(body.app?.id).toBeDefined();
    expect(body.api_key).toMatch(/^agx_/);
    partnerAppId = body.app.id;
    partnerApiKey = body.api_key;
  });

  test('2.6 partner runtime end-to-end whoami + ping', async ({ request }) => {
    test.skip(!AUTH_TOKEN, AUTH_SKIP_HINT);
    test.skip(!partnerApiKey, 'Partner app registration did not run');

    const whoami = await request.get(`${API}/v1/partner-runtime/whoami`, {
      headers: { 'X-Agentrix-App-Key': partnerApiKey },
    });
    expect(whoami.status()).toBe(200);
    const who = await whoami.json();
    expect(who.app_id).toBe(partnerAppId);
    expect(Array.isArray(who.scopes)).toBe(true);

    const ping = await request.post(`${API}/v1/partner-runtime/ping`, {
      headers: {
        'X-Agentrix-App-Key': partnerApiKey,
        'Content-Type': 'application/json',
      },
      data: { scope: 'pet.read', cost_usd: 0.01 },
    });
    expect(ping.status()).toBe(200);
    const body = await ping.json();
    expect(body.ok).toBe(true);
    expect(body.calls_today).toBeGreaterThanOrEqual(1);
  });

  test('2.7 partner app usage is queryable after runtime ping', async ({ request }) => {
    test.skip(!AUTH_TOKEN, AUTH_SKIP_HINT);
    test.skip(!partnerAppId, 'Partner app registration did not run');

    const res = await request.get(`${API}/v1/partner-apps/${partnerAppId}/usage`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.month).toMatch(/^\d{4}-\d{2}$/);
    expect(Array.isArray(body.days)).toBe(true);
    expect(body.days.length).toBeGreaterThanOrEqual(1);
  });
});