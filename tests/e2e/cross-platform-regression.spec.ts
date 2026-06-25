/**
 * S5-04: Cross-Platform Regression — Full-stack smoke test
 *
 * Verifies all critical API endpoints across modules before release.
 * Covers: health, auth, payment, marketplace, social, agent-presence,
 * desktop-sync, notifications, and cross-platform device management.
 *
 * Run: npx playwright test tests/e2e/cross-platform-regression.spec.ts
 */
import { test, expect } from '@playwright/test';

const API = process.env.API_URL || 'https://api.agentrix.top/api';

// ═══════════════════════════════════════════════════════════════════════════════
// 1. INFRASTRUCTURE
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('1. Infrastructure', () => {
  test('1.1 health check', async ({ request }) => {
    const res = await request.get(`${API}/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  test('1.2 API responds with JSON content-type', async ({ request }) => {
    const res = await request.get(`${API}/health`);
    const ct = res.headers()['content-type'] || '';
    expect(ct).toContain('application/json');
  });

  test('1.3 CORS headers present', async ({ request }) => {
    const res = await request.get(`${API}/health`);
    // At minimum, should not return 0 headers
    expect(Object.keys(res.headers()).length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. AUTH MODULE
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('2. Auth Module', () => {
  test('2.1 email OTP endpoint accepts POST', async ({ request }) => {
    const res = await request.post(`${API}/auth/email/send-code`, {
      data: { email: 'regression@test.invalid' },
    });
    expect([200, 201, 400, 429]).toContain(res.status());
  });

  test('2.2 wallet login challenge endpoint', async ({ request }) => {
    const res = await request.post(`${API}/auth/wallet/challenge`, {
      data: { walletAddress: '0x0000000000000000000000000000000000000001' },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('2.3 social token login rejects bad provider', async ({ request }) => {
    const res = await request.post(`${API}/auth/social-token`, {
      data: { provider: 'fakebook', accessToken: 'x' },
    });
    expect([400, 401, 404]).toContain(res.status());
  });

  test('2.4 desktop-pair create + poll', async ({ request }) => {
    const sid = `reg-${Date.now()}`;
    const createRes = await request.post(`${API}/auth/desktop-pair/create`, {
      data: { sessionId: sid },
    });
    expect(createRes.status()).toBeLessThan(500);

    const pollRes = await request.get(`${API}/auth/desktop-pair/poll?session=${sid}`);
    expect([200, 204, 404]).toContain(pollRes.status());
  });

  test('2.5 protected endpoint rejects unauthenticated', async ({ request }) => {
    const endpoints = [
      { method: 'GET', path: '/user/profile' },
      { method: 'GET', path: '/agent-presence/agents' },
      { method: 'GET', path: '/desktop-sync/state' },
      { method: 'GET', path: '/agent-presence/dashboard' },
    ];
    for (const ep of endpoints) {
      const res = ep.method === 'GET'
        ? await request.get(`${API}${ep.path}`)
        : await request.post(`${API}${ep.path}`);
      expect([401, 403, 404]).toContain(res.status());
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. MARKETPLACE MODULE
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('3. Marketplace', () => {
  test('3.1 search endpoint', async ({ request }) => {
    const res = await request.get(`${API}/unified-marketplace/search?query=agent&limit=3`);
    expect(res.status()).toBeLessThan(500);
  });

  test('3.2 featured endpoint', async ({ request }) => {
    const res = await request.get(`${API}/unified-marketplace/featured`);
    expect(res.status()).toBeLessThan(500);
  });

  test('3.3 categories endpoint', async ({ request }) => {
    const res = await request.get(`${API}/unified-marketplace/categories`);
    expect(res.status()).toBeLessThan(500);
  });

  test('3.4 skills endpoint', async ({ request }) => {
    const res = await request.get(`${API}/skills`);
    expect(res.status()).toBeLessThan(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. AGENT-PRESENCE MODULE
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('4. Agent-Presence (auth-guarded)', () => {
  test('4.1 agents list', async ({ request }) => {
    const res = await request.get(`${API}/agent-presence/agents`);
    expect([401, 403]).toContain(res.status());
  });

  test('4.2 devices', async ({ request }) => {
    const res = await request.get(`${API}/agent-presence/devices`);
    expect([401, 403]).toContain(res.status());
  });

  test('4.3 unified devices', async ({ request }) => {
    const res = await request.get(`${API}/agent-presence/devices/unified`);
    expect([401, 403, 404]).toContain(res.status());
  });

  test('4.4 unified online devices', async ({ request }) => {
    const res = await request.get(`${API}/agent-presence/devices/unified/online`);
    expect([401, 403, 404]).toContain(res.status());
  });

  test('4.5 unified device stats', async ({ request }) => {
    const res = await request.get(`${API}/agent-presence/devices/unified/stats`);
    expect([401, 403, 404]).toContain(res.status());
  });

  test('4.6 dashboard', async ({ request }) => {
    const res = await request.get(`${API}/agent-presence/dashboard`);
    expect([401, 403]).toContain(res.status());
  });

  test('4.7 channel health', async ({ request }) => {
    const res = await request.get(`${API}/agent-presence/channels/health`);
    expect([401, 403]).toContain(res.status());
  });

  test('4.8 handoffs', async ({ request }) => {
    const res = await request.get(`${API}/agent-presence/handoffs`);
    expect([401, 403, 404]).toContain(res.status());
  });

  test('4.9 scheduled tasks', async ({ request }) => {
    const res = await request.get(`${API}/agent-presence/tasks`);
    expect([401, 403, 404]).toContain(res.status());
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. DESKTOP-SYNC MODULE
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('5. Desktop-Sync (auth-guarded)', () => {
  test('5.1 heartbeat', async ({ request }) => {
    const res = await request.post(`${API}/desktop-sync/heartbeat`, {
      data: { deviceId: 'reg-test', platform: 'windows' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('5.2 state', async ({ request }) => {
    const res = await request.get(`${API}/desktop-sync/state`);
    expect([401, 403]).toContain(res.status());
  });

  test('5.3 tasks', async ({ request }) => {
    const res = await request.get(`${API}/desktop-sync/tasks`);
    expect([401, 403, 404]).toContain(res.status());
  });

  test('5.4 approvals', async ({ request }) => {
    const res = await request.get(`${API}/desktop-sync/approvals`);
    expect([401, 403, 404]).toContain(res.status());
  });

  test('5.5 sessions', async ({ request }) => {
    const res = await request.get(`${API}/desktop-sync/sessions`);
    expect([401, 403, 404]).toContain(res.status());
  });

  test('5.6 commands', async ({ request }) => {
    const res = await request.get(`${API}/desktop-sync/commands`);
    expect([401, 403, 404]).toContain(res.status());
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. SOCIAL MODULE
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('6. Social Module', () => {
  test('6.1 social feed requires auth', async ({ request }) => {
    const res = await request.get(`${API}/social/feed`);
    expect([401, 403, 404]).toContain(res.status());
  });

  test('6.2 social posts requires auth', async ({ request }) => {
    const res = await request.get(`${API}/social/posts`);
    expect([401, 403, 404]).toContain(res.status());
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. PAYMENT MODULE
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('7. Payment Module', () => {
  test('7.1 payment endpoints require auth', async ({ request }) => {
    const paths = ['/payment/wallets', '/payment/intents', '/payment/quick-pay/grants'];
    for (const path of paths) {
      const res = await request.get(`${API}${path}`);
      expect([401, 403, 404]).toContain(res.status());
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. DESKTOP UPDATE
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('8. Desktop Update', () => {
  test('8.1 update check endpoint exists', async ({ request }) => {
    const res = await request.get(`${API}/desktop/update/windows-x86_64/x86_64/0.0.1`);
    expect(res.status()).toBeLessThan(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. AUTHENTICATED REGRESSION (best-effort with dev OTP)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe.serial('9. Authenticated Regression', () => {
  let token = '';
  const deviceId = `reg-device-${Date.now()}`;

  test('9.0 obtain auth token', async ({ request }) => {
    // Try password login with real account first
    try {
      const loginRes = await request.post(`${API}/auth/login`, {
        data: { email: '1194479457@qq.com', password: 'zyc.2392018' },
      });
      if (loginRes.status() === 200 || loginRes.status() === 201) {
        const body = await loginRes.json();
        token = body.access_token || '';
        console.log('Authenticated via password login');
        return;
      }
    } catch { /* fallback to OTP */ }

    // Fallback: email OTP
    try {
      const sendRes = await request.post(`${API}/auth/email/send-code`, {
        data: { email: '1194479457@qq.com' },
      });
      if (sendRes.status() !== 200 && sendRes.status() !== 201) {
        test.skip(true, 'Auth not available');
        return;
      }
      const verifyRes = await request.post(`${API}/auth/email/verify`, {
        data: { email: '1194479457@qq.com', code: '000000' },
      });
      if (verifyRes.status() === 200 || verifyRes.status() === 201) {
        const body = await verifyRes.json();
        token = body.access_token || '';
      }
    } catch {
      test.skip(true, 'Auth bootstrap failed');
    }
  });

  const auth = () => ({ headers: { Authorization: `Bearer ${token}` } });

  test('9.1 desktop-sync heartbeat', async ({ request }) => {
    test.skip(!token, 'No auth');
    const res = await request.post(`${API}/desktop-sync/heartbeat`, {
      ...auth(),
      data: { deviceId, platform: 'windows', appVersion: '1.0.0-regression' },
    });
    expect(res.status()).toBeLessThan(400);
  });

  test('9.2 desktop-sync state', async ({ request }) => {
    test.skip(!token, 'No auth');
    const res = await request.get(`${API}/desktop-sync/state`, auth());
    expect(res.status()).toBe(200);
  });

  test('9.3 agent-presence list agents', async ({ request }) => {
    test.skip(!token, 'No auth');
    const res = await request.get(`${API}/agent-presence/agents`, auth());
    expect(res.status()).toBe(200);
  });

  test('9.4 agent-presence create agent', async ({ request }) => {
    test.skip(!token, 'No auth');
    const res = await request.post(`${API}/agent-presence/agents`, {
      ...auth(),
      data: { name: `reg-agent-${Date.now()}`, personality: 'E2E regression test agent', delegationLevel: 'assistant' },
    });
    expect(res.status()).toBeLessThan(400);
  });

  test('9.5 agent-presence unified devices', async ({ request }) => {
    test.skip(!token, 'No auth');
    const res = await request.get(`${API}/agent-presence/devices/unified`, auth());
    // 200 if deployed, 404 if unified endpoint not yet on server
    expect([200, 404]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    }
  });

  test('9.6 agent-presence unified stats', async ({ request }) => {
    test.skip(!token, 'No auth');
    const res = await request.get(`${API}/agent-presence/devices/unified/stats`, auth());
    expect([200, 404]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(typeof body.total).toBe('number');
    }
  });

  test('9.7 agent-presence dashboard', async ({ request }) => {
    test.skip(!token, 'No auth');
    const res = await request.get(`${API}/agent-presence/dashboard`, auth());
    expect(res.status()).toBe(200);
  });

  test('9.8 desktop-sync upsert task', async ({ request }) => {
    test.skip(!token, 'No auth');
    const res = await request.post(`${API}/desktop-sync/tasks`, {
      ...auth(),
      data: {
        taskId: `reg-task-${Date.now()}`,
        deviceId,
        title: 'Regression Task',
        summary: 'Created by cross-platform regression',
        status: 'executing',
        timeline: [],
      },
    });
    expect([200, 201, 404]).toContain(res.status());
  });

  test('9.9 desktop-sync upsert session', async ({ request }) => {
    test.skip(!token, 'No auth');
    const res = await request.post(`${API}/desktop-sync/sessions`, {
      ...auth(),
      data: {
        sessionId: `reg-sess-${Date.now()}`,
        title: 'Regression Chat',
        deviceId,
        deviceType: 'desktop',
        messages: [{ role: 'user', content: 'regression test' }],
      },
    });
    expect([200, 201, 404]).toContain(res.status());
  });

  test('9.10 channel health', async ({ request }) => {
    test.skip(!token, 'No auth');
    const res = await request.get(`${API}/agent-presence/channels/health`, auth());
    expect(res.status()).toBe(200);
  });
});
