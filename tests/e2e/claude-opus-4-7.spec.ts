/**
 * E2E: Claude Opus 4.7 catalog + public-ish surface validation.
 *
 * Target: https://api.agentrix.top/api (build142 deployment of f7effa7f)
 *
 * Three-layer verification:
 *   1. Catalog endpoint remains auth-gated (never leak provider config anonymously).
 *   2. Health endpoint reports the deployed version banner.
 *   3. If a dev-mode JWT is obtainable, the authenticated catalog response
 *      includes the new `claude-opus-4-7` alias in the correct providers.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.AGENTRIX_E2E_BASE || 'https://api.agentrix.top/api';
const TEST_EMAIL = process.env.AGENTRIX_E2E_EMAIL || 'pw-e2e@test.local';

let authToken = '';

test.describe('Claude Opus 4.7 — catalog shape', () => {
  test('Health endpoint reachable', async ({ request }) => {
    const res = await request.get(`${BASE}/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    // build142 deploy should report a version string
    expect(typeof body.version).toBe('string');
  });

  test('AI provider catalog is auth-gated', async ({ request }) => {
    const res = await request.get(`${BASE}/ai-providers/catalog`);
    expect([401, 403]).toContain(res.status());
  });

  test('attempt dev email OTP login for authenticated checks', async ({ request }) => {
    const sendRes = await request.post(`${BASE}/auth/email/send-code`, {
      data: { email: TEST_EMAIL },
    });
    if (![200, 201].includes(sendRes.status())) {
      test.skip(true, 'Email OTP not available in this environment');
      return;
    }
    const verifyRes = await request.post(`${BASE}/auth/email/verify`, {
      data: { email: TEST_EMAIL, code: '000000' },
    });
    if ([200, 201].includes(verifyRes.status())) {
      const body = await verifyRes.json();
      authToken = body.access_token || body.token || '';
    }
  });

  test('authenticated catalog exposes Opus 4.7 in Bedrock + Anthropic + Copilot', async ({ request }) => {
    test.skip(!authToken, 'No auth token acquired — skipping authenticated catalog check');
    const res = await request.get(`${BASE}/ai-providers/catalog`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(res.status()).toBe(200);
    const catalog = await res.json();
    const providers: Array<{ id: string; models: Array<{ id: string; label?: string }> }> =
      Array.isArray(catalog) ? catalog : (catalog?.providers || catalog?.data || []);
    expect(providers.length).toBeGreaterThan(0);

    const findModelIn = (pid: string, idSubstring: string) => {
      const p = providers.find((x) => x.id === pid);
      expect(p, `provider ${pid} missing`).toBeDefined();
      return p!.models.find((m) => m.id.includes(idSubstring));
    };

    expect(findModelIn('aws-bedrock', 'claude-opus-4-7'), 'Bedrock Opus 4.7 not in catalog').toBeDefined();
    expect(findModelIn('anthropic', 'claude-opus-4-7'), 'Anthropic Opus 4.7 not in catalog').toBeDefined();
    expect(findModelIn('copilot-subscription', 'claude-opus-4.7'), 'Copilot Opus 4.7 not in catalog').toBeDefined();
  });
});
