/**
 * S5-02: Desktop Playwright — sync / approval / agent scenarios
 *
 * API-level Playwright tests exercising the desktop-sync module,
 * agent-presence unified devices, and approval workflow.
 *
 * Pre-requisite: backend running at API endpoint.
 */
import { test, expect } from '@playwright/test';

const API = process.env.API_URL || 'https://api.agentrix.top/api';

// ── Helper: create a throwaway auth token via email OTP (dev mode) ──────────

let authToken = '';
const testDeviceId = `test-device-${Date.now()}`;
const testTaskId = `task-pw-${Date.now()}`;
const testSessionId = `sess-pw-${Date.now()}`;

test.describe.serial('Desktop Sync + Approval + Agent Presence', () => {

  // ── 1. Auth bootstrap ───────────────────────────────────────────────────

  test('1.1 health check', async ({ request }) => {
    const res = await request.get(`${API}/health`);
    expect(res.status()).toBeLessThan(500);
  });

  test('1.2 desktop-pair create returns sessionId', async ({ request }) => {
    const sid = `pw-${Date.now()}`;
    const res = await request.post(`${API}/auth/desktop-pair/create`, {
      data: { sessionId: sid },
    });
    expect(res.status()).toBeLessThan(500);
    if (res.status() === 200 || res.status() === 201) {
      const body = await res.json();
      expect(body.sessionId).toBe(sid);
      expect(body.expiresAt).toBeDefined();
    }
  });

  test('1.3 desktop-pair poll returns unresolved for new session', async ({ request }) => {
    const sid = `pw-poll-${Date.now()}`;
    await request.post(`${API}/auth/desktop-pair/create`, { data: { sessionId: sid } });
    const res = await request.get(`${API}/auth/desktop-pair/poll?session=${sid}`);
    expect([200, 204, 404]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.resolved).toBe(false);
    }
  });

  // ── 2. Desktop-Sync Endpoints ───────────────────────────────────────────

  test('2.1 desktop-sync heartbeat requires auth', async ({ request }) => {
    const res = await request.post(`${API}/desktop-sync/heartbeat`, {
      data: { deviceId: testDeviceId, platform: 'windows' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('2.2 desktop-sync state requires auth', async ({ request }) => {
    const res = await request.get(`${API}/desktop-sync/state`);
    expect([401, 403]).toContain(res.status());
  });

  test('2.3 desktop-sync tasks requires auth', async ({ request }) => {
    const res = await request.get(`${API}/desktop-sync/tasks`);
    expect([401, 403, 404]).toContain(res.status());
  });

  test('2.4 desktop-sync approvals requires auth', async ({ request }) => {
    const res = await request.get(`${API}/desktop-sync/approvals`);
    expect([401, 403, 404]).toContain(res.status());
  });

  test('2.5 desktop-sync sessions requires auth', async ({ request }) => {
    const res = await request.get(`${API}/desktop-sync/sessions`);
    expect([401, 403]).toContain(res.status());
  });

  test('2.6 desktop-sync commands requires auth', async ({ request }) => {
    const res = await request.get(`${API}/desktop-sync/commands`);
    expect([401, 403]).toContain(res.status());
  });

  test('2.7 operations control plane requires auth', async ({ request }) => {
    const endpoints = [
      '/operations/overview',
      '/operations/tool-policy',
      '/operations/continuity',
    ];
    for (const endpoint of endpoints) {
      const res = await request.get(`${API}${endpoint}`);
      expect([401, 403, 404]).toContain(res.status());
    }
  });

  // ── 3. Agent-Presence Endpoints ─────────────────────────────────────────

  test('3.1 agent-presence agents list requires auth', async ({ request }) => {
    const res = await request.get(`${API}/agent-presence/agents`);
    expect([401, 403]).toContain(res.status());
  });

  test('3.2 agent-presence devices requires auth', async ({ request }) => {
    const res = await request.get(`${API}/agent-presence/devices`);
    expect([401, 403]).toContain(res.status());
  });

  test('3.3 agent-presence unified devices requires auth', async ({ request }) => {
    const res = await request.get(`${API}/agent-presence/devices/unified`);
    expect([401, 403]).toContain(res.status());
  });

  test('3.4 agent-presence unified stats requires auth', async ({ request }) => {
    const res = await request.get(`${API}/agent-presence/devices/unified/stats`);
    expect([401, 403]).toContain(res.status());
  });

  test('3.5 agent-presence dashboard requires auth', async ({ request }) => {
    const res = await request.get(`${API}/agent-presence/dashboard`);
    expect([401, 403]).toContain(res.status());
  });

  test('3.6 agent-presence handoffs requires auth', async ({ request }) => {
    const res = await request.get(`${API}/agent-presence/handoffs`);
    expect([401, 403, 404]).toContain(res.status());
  });

  // ── 4. Authenticated Flow (if dev OTP available) ────────────────────────

  test('4.0 attempt dev-mode auth via email OTP', async ({ request }) => {
    // Send code
    const sendRes = await request.post(`${API}/auth/email/send-code`, {
      data: { email: 'pw-e2e@test.local' },
    });
    if (sendRes.status() !== 200 && sendRes.status() !== 201) {
      test.skip(true, 'Email OTP not available — skipping authenticated tests');
      return;
    }

    // In dev mode the code is logged; we try common dev bypass "000000"
    // or the backend may accept any code in test mode.
    // This test is best-effort — authenticated tests below will skip if login fails.
    const verifyRes = await request.post(`${API}/auth/email/verify`, {
      data: { email: 'pw-e2e@test.local', code: '000000' },
    });
    if (verifyRes.status() === 200 || verifyRes.status() === 201) {
      const body = await verifyRes.json();
      authToken = body.access_token || '';
    }
  });

  test('4.1 desktop-sync heartbeat with auth', async ({ request }) => {
    test.skip(!authToken, 'No auth token — skip');
    const res = await request.post(`${API}/desktop-sync/heartbeat`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        deviceId: testDeviceId,
        platform: 'windows',
        appVersion: '1.0.0-test',
        context: { activeWindowTitle: 'Playwright Test' },
      },
    });
    expect(res.status()).toBeLessThan(400);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.device).toBeDefined();
  });

  test('4.2 desktop-sync state returns aggregated data', async ({ request }) => {
    test.skip(!authToken, 'No auth token — skip');
    const res = await request.get(`${API}/desktop-sync/state`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.devices).toBeDefined();
    expect(body.tasks).toBeDefined();
    expect(body.approvals).toBeDefined();
    expect(body.sessions).toBeDefined();
    expect(body.serverTime).toBeDefined();
  });

  test('4.3 desktop-sync upsert task', async ({ request }) => {
    test.skip(!authToken, 'No auth token — skip');
    const res = await request.post(`${API}/desktop-sync/tasks`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        taskId: testTaskId,
        deviceId: testDeviceId,
        title: 'Playwright Test Task',
        summary: 'Created by E2E test',
        status: 'executing',
        timeline: [{ ts: new Date().toISOString(), event: 'started' }],
      },
    });
    expect(res.status()).toBeLessThan(400);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test('4.4 desktop-sync create approval', async ({ request }) => {
    test.skip(!authToken, 'No auth token — skip');
    const taskId = `task-approval-${Date.now()}`;

    // Create a task first
    await request.post(`${API}/desktop-sync/tasks`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        taskId,
        deviceId: testDeviceId,
        title: 'Approval Task',
        summary: 'Needs approval',
        status: 'waiting_approval',
        timeline: [],
      },
    });

    const res = await request.post(`${API}/desktop-sync/approvals`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        deviceId: testDeviceId,
        taskId,
        title: 'Delete important file?',
        description: 'Agent wants to delete /etc/important.conf',
        riskLevel: 'L2',
      },
    });
    expect(res.status()).toBeLessThan(400);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.approval).toBeDefined();
    expect(body.approval.status).toBe('pending');
  });

  test('4.5 desktop-sync upsert session', async ({ request }) => {
    test.skip(!authToken, 'No auth token — skip');
    const res = await request.post(`${API}/desktop-sync/sessions`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        sessionId: testSessionId,
        title: 'Playwright Chat',
        deviceId: testDeviceId,
        deviceType: 'desktop',
        messages: [
          { role: 'user', content: 'Hello from Playwright' },
          { role: 'assistant', content: 'Hi!' },
        ],
      },
    });
    expect(res.status()).toBeLessThan(400);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test('4.6 operations overview reports runtime state', async ({ request }) => {
    test.skip(!authToken, 'No auth token — skip');
    const res = await request.get(`${API}/operations/overview`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBeDefined();
    expect(body.counts).toBeDefined();
    expect(body.toolPolicy).toBeDefined();
    expect(body.counts.onlineDevices).toBeGreaterThanOrEqual(1);
  });

  test('4.7 operations continuity exposes wearable payload', async ({ request }) => {
    test.skip(!authToken, 'No auth token — skip');
    const res = await request.get(`${API}/operations/continuity`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.devices)).toBe(true);
    expect(Array.isArray(body.sessions)).toBe(true);
    expect(body.wearableSummary).toBeDefined();
    expect(body.wearableSummary.onlineDeviceCount).toBeGreaterThanOrEqual(1);
  });

  test('4.8 operations follow-up queues desktop command', async ({ request }) => {
    test.skip(!authToken, 'No auth token — skip');
    const res = await request.post(`${API}/operations/follow-up`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        sessionId: testSessionId,
        title: 'Resume Playwright Chat',
        targetDeviceId: testDeviceId,
        requesterDeviceId: 'playwright-mobile',
        action: 'resume-on-desktop',
      },
    });
    expect(res.status()).toBeLessThan(400);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.followUp.command).toBeDefined();
    expect(body.followUp.command.kind).toBe('context');
  });

  test('4.9 desktop-sync create command', async ({ request }) => {
    test.skip(!authToken, 'No auth token — skip');
    const res = await request.post(`${API}/desktop-sync/commands`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        title: 'List open windows',
        kind: 'list_windows',
        targetDeviceId: testDeviceId,
        requesterDeviceId: 'mobile-test',
      },
    });
    expect(res.status()).toBeLessThan(400);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.command).toBeDefined();
  });

  // ── 5. Agent Presence authenticated ─────────────────────────────────────

  test('5.1 agent-presence list devices (authenticated)', async ({ request }) => {
    test.skip(!authToken, 'No auth token — skip');
    const res = await request.get(`${API}/agent-presence/devices`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('5.2 agent-presence unified devices (authenticated)', async ({ request }) => {
    test.skip(!authToken, 'No auth token — skip');
    const res = await request.get(`${API}/agent-presence/devices/unified`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    // After heartbeat, should have at least 1 device
    if (body.length > 0) {
      expect(body[0].deviceId).toBeDefined();
      expect(body[0].source).toBeDefined();
    }
  });

  test('5.3 agent-presence unified stats (authenticated)', async ({ request }) => {
    test.skip(!authToken, 'No auth token — skip');
    const res = await request.get(`${API}/agent-presence/devices/unified/stats`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.total).toBeDefined();
    expect(body.online).toBeDefined();
    expect(body.bySource).toBeDefined();
  });

  test('5.4 agent-presence dashboard (authenticated)', async ({ request }) => {
    test.skip(!authToken, 'No auth token — skip');
    const res = await request.get(`${API}/agent-presence/dashboard`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.totalAgents).toBeDefined();
    expect(body.totalEvents).toBeDefined();
  });

  test('5.5 agent-presence create agent', async ({ request }) => {
    test.skip(!authToken, 'No auth token — skip');
    const res = await request.post(`${API}/agent-presence/agents`, {
      headers: { Authorization: `Bearer ${authToken}` },
      data: {
        name: `pw-agent-${Date.now()}`,
        type: 'personal',
        channels: [],
        config: { model: 'gpt-4o-mini' },
      },
    });
    expect(res.status()).toBeLessThan(400);
    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.name).toContain('pw-agent');
  });

  test('5.6 agent-presence list agents', async ({ request }) => {
    test.skip(!authToken, 'No auth token — skip');
    const res = await request.get(`${API}/agent-presence/agents`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('5.7 agent-presence channel health', async ({ request }) => {
    test.skip(!authToken, 'No auth token — skip');
    const res = await request.get(`${API}/agent-presence/channels/health`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});
