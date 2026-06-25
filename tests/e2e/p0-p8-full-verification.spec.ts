/**
 * P0–P8 Full Verification Suite
 *
 * Comprehensive API-level tests covering all phase features (P0 through P8).
 * Validates endpoint existence, auth guards, and response shapes on production.
 *
 * Run: npx playwright test -c tests/e2e/playwright.config.ts tests/e2e/p0-p8-full-verification.spec.ts --project=chromium --reporter=line
 */
import { test, expect } from '@playwright/test';

const API = process.env.API_URL || 'https://api.agentrix.top/api';

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('0. Health Check', () => {
  test('GET /health → 200 ok', async ({ request }) => {
    const res = await request.get(`${API}/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P0 — COPILOT CATALOG (AI Provider + Capability)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('P0 – Copilot Catalog', () => {
  test('P0.1 GET /ai-providers/catalog → non-404', async ({ request }) => {
    const res = await request.get(`${API}/ai-providers/catalog`);
    expect(res.status()).not.toBe(404);
    expect(res.status()).toBeLessThan(500);
  });

  test('P0.2 GET /ai-capability/platforms → non-404', async ({ request }) => {
    const res = await request.get(`${API}/ai-capability/platforms`);
    expect(res.status()).not.toBe(404);
    expect(res.status()).toBeLessThan(500);
  });

  test('P0.3 GET /ai-capability/system-capabilities → non-404', async ({ request }) => {
    const res = await request.get(`${API}/ai-capability/system-capabilities`);
    expect(res.status()).not.toBe(404);
    expect(res.status()).toBeLessThan(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P1 — WEB SEARCH / WEB FETCH TOOLS + CLAUDE CHAT
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('P1 – Web Search + Claude Chat', () => {
  test('P1.1 POST /claude/chat → endpoint exists', async ({ request }) => {
    const res = await request.post(`${API}/claude/chat`, {
      data: { message: 'ping' },
    });
    expect(res.status()).not.toBe(404);
  });

  test('P1.2 POST /sandbox/execute → endpoint exists', async ({ request }) => {
    const res = await request.post(`${API}/sandbox/execute`, {
      data: { code: 'console.log(1)', language: 'javascript' },
    });
    expect(res.status()).not.toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P2 — BROWSER CONTROL (open_url, Desktop Tauri)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('P2 – Browser Control / OpenClaw Proxy', () => {
  test('P2.1 GET /openclaw/bridge/skill-hub/status → non-5xx', async ({ request }) => {
    const res = await request.get(`${API}/openclaw/bridge/skill-hub/status`);
    expect(res.status()).toBeLessThan(500);
  });

  test('P2.2 GET /openclaw/bridge/skill-hub/categories → non-5xx', async ({ request }) => {
    const res = await request.get(`${API}/openclaw/bridge/skill-hub/categories`);
    expect(res.status()).toBeLessThan(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P3 — MULTI-TURN AGENT LOOP + CODE SANDBOX
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('P3 – Agent Loop + Social', () => {
  test('P3.1 GET /social/callback/status → 200 with platforms', async ({ request }) => {
    const res = await request.get(`${API}/social/callback/status`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.platforms).toHaveProperty('telegram');
    expect(body.platforms).toHaveProperty('discord');
  });

  test('P3.2 POST /voice/transcribe → endpoint exists', async ({ request }) => {
    const res = await request.post(`${API}/voice/transcribe`, { data: {} });
    expect(res.status()).not.toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P4 — PLAN MODE, AUTO-MEMORY, COMPACTION, SESSION RESUME
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('P4 – Plan Mode + Memory + Sessions', () => {
  test('P4.1 GET /agent-intelligence/sessions → requires auth (401/403)', async ({ request }) => {
    const res = await request.get(`${API}/agent-intelligence/sessions`);
    expect([401, 403]).toContain(res.status());
  });

  test('P4.2 GET /agent-intelligence/memories → requires auth', async ({ request }) => {
    const res = await request.get(`${API}/agent-intelligence/memories`);
    expect([401, 403]).toContain(res.status());
  });

  test('P4.3 POST /agent-intelligence/sessions/test-session-id/compact → requires auth', async ({ request }) => {
    const res = await request.post(`${API}/agent-intelligence/sessions/test-session-id/compact`);
    expect([401, 403]).toContain(res.status());
  });

  test('P4.4 GET /agent-intelligence/sessions/test-session-id/resume → requires auth', async ({ request }) => {
    const res = await request.get(`${API}/agent-intelligence/sessions/test-session-id/resume`);
    expect([401, 403]).toContain(res.status());
  });

  test('P4.5 GET /agent-intelligence/sessions/test-session-id/context-usage → requires auth', async ({ request }) => {
    const res = await request.get(`${API}/agent-intelligence/sessions/test-session-id/context-usage`);
    expect([401, 403]).toContain(res.status());
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P5 — CROSS-DEVICE SYNC, SUBTASKS, AGENT TEAMS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('P5 – Cross-device + Subtasks + Teams', () => {
  test('P5.1 GET /agent-presence/agents → requires auth', async ({ request }) => {
    const res = await request.get(`${API}/agent-presence/agents`);
    expect([401, 403]).toContain(res.status());
  });

  test('P5.2 GET /agent-presence/devices → requires auth', async ({ request }) => {
    const res = await request.get(`${API}/agent-presence/devices`);
    expect([401, 403]).toContain(res.status());
  });

  test('P5.3 GET /agent-presence/devices/unified → requires auth', async ({ request }) => {
    const res = await request.get(`${API}/agent-presence/devices/unified`);
    expect([401, 403]).toContain(res.status());
  });

  test('P5.4 GET /agent-presence/dashboard → requires auth', async ({ request }) => {
    const res = await request.get(`${API}/agent-presence/dashboard`);
    expect([401, 403]).toContain(res.status());
  });

  test('P5.5 GET /agent-intelligence/subtasks/fake-parent → requires auth', async ({ request }) => {
    const res = await request.get(`${API}/agent-intelligence/subtasks/fake-parent`);
    expect([401, 403]).toContain(res.status());
  });

  test('P5.6 GET /agent-intelligence/teams/fake-parent → requires auth', async ({ request }) => {
    const res = await request.get(`${API}/agent-intelligence/teams/fake-parent`);
    expect([401, 403]).toContain(res.status());
  });

  test('P5.7 POST /agent-presence/handoffs → requires auth', async ({ request }) => {
    const res = await request.post(`${API}/agent-presence/handoffs`, { data: {} });
    expect([401, 403]).toContain(res.status());
  });

  test('P5.8 POST /desktop-sync/heartbeat → requires auth', async ({ request }) => {
    const res = await request.post(`${API}/desktop-sync/heartbeat`, {
      data: { deviceId: 'test', platform: 'windows' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('P5.9 GET /desktop-sync/state → requires auth', async ({ request }) => {
    const res = await request.get(`${API}/desktop-sync/state`);
    expect([401, 403]).toContain(res.status());
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P6 — HOOKS, SLASH COMMANDS, MCP SERVER REGISTRY, PLUGINS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('P6 – Hooks', () => {
  test('P6.1 GET /hooks → requires auth', async ({ request }) => {
    const res = await request.get(`${API}/hooks`);
    expect([401, 403]).toContain(res.status());
  });

  test('P6.2 POST /hooks → requires auth', async ({ request }) => {
    const res = await request.post(`${API}/hooks`, { data: {} });
    expect([401, 403]).toContain(res.status());
  });
});

test.describe('P6 – Slash Commands', () => {
  test('P6.3 GET /slash-commands → requires auth', async ({ request }) => {
    const res = await request.get(`${API}/slash-commands`);
    expect([401, 403]).toContain(res.status());
  });

  test('P6.4 POST /slash-commands → requires auth', async ({ request }) => {
    const res = await request.post(`${API}/slash-commands`, { data: {} });
    expect([401, 403]).toContain(res.status());
  });
});

test.describe('P6 – MCP Server Registry', () => {
  test('P6.5 GET /mcp-servers → requires auth', async ({ request }) => {
    const res = await request.get(`${API}/mcp-servers`);
    expect([401, 403]).toContain(res.status());
  });

  test('P6.6 POST /mcp-servers → requires auth', async ({ request }) => {
    const res = await request.post(`${API}/mcp-servers`, { data: {} });
    expect([401, 403]).toContain(res.status());
  });

  test('P6.7 GET /mcp-servers/tools/all → requires auth', async ({ request }) => {
    const res = await request.get(`${API}/mcp-servers/tools/all`);
    expect([401, 403]).toContain(res.status());
  });
});

test.describe('P6 – Plugins', () => {
  test('P6.8 GET /plugins → non-404', async ({ request }) => {
    const res = await request.get(`${API}/plugins`);
    expect(res.status()).not.toBe(404);
    expect(res.status()).toBeLessThan(500);
  });

  test('P6.9 GET /plugins/user/installed → requires auth', async ({ request }) => {
    const res = await request.get(`${API}/plugins/user/installed`);
    expect([401, 403]).toContain(res.status());
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P7 — THINKING BLOCKS, SESSION EXPORT/FORK/SEARCH, CONTEXT VIZ
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('P7 – Session Export/Fork/Search', () => {
  test('P7.1 GET /agent-intelligence/sessions/test-id/export?format=json → requires auth', async ({ request }) => {
    const res = await request.get(`${API}/agent-intelligence/sessions/test-id/export?format=json`);
    expect([401, 403]).toContain(res.status());
  });

  test('P7.2 POST /agent-intelligence/sessions/test-id/fork → requires auth', async ({ request }) => {
    const res = await request.post(`${API}/agent-intelligence/sessions/test-id/fork`, {
      data: { forkFromMessageIndex: 0 },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('P7.3 GET /agent-intelligence/search?q=test → requires auth', async ({ request }) => {
    const res = await request.get(`${API}/agent-intelligence/search?q=test`);
    expect([401, 403]).toContain(res.status());
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P8 — CROSS-PLATFORM DEEP INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('P8.1 – Unified Session History', () => {
  test('P8.1.1 GET /desktop-sync/sessions/unified → requires auth', async ({ request }) => {
    const res = await request.get(`${API}/desktop-sync/sessions/unified`);
    expect([401, 403]).toContain(res.status());
  });
});

test.describe('P8.2 – Remote Control + Capabilities', () => {
  test('P8.2.1 POST /desktop-sync/notify-completion → requires auth', async ({ request }) => {
    const res = await request.post(`${API}/desktop-sync/notify-completion`, {
      data: { sessionId: 'test', summary: 'done' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('P8.2.2 GET /desktop-sync/capabilities → requires auth', async ({ request }) => {
    const res = await request.get(`${API}/desktop-sync/capabilities`);
    expect([401, 403]).toContain(res.status());
  });

  test('P8.2.3 POST /desktop-sync/capabilities → requires auth', async ({ request }) => {
    const res = await request.post(`${API}/desktop-sync/capabilities`, {
      data: { deviceId: 'test', gps: { latitude: 0, longitude: 0 } },
    });
    expect([401, 403]).toContain(res.status());
  });
});

test.describe('P8.3 – Device Media Transfer', () => {
  test('P8.3.1 POST /desktop-sync/media → requires auth', async ({ request }) => {
    const res = await request.post(`${API}/desktop-sync/media`, {
      data: {
        sourceDeviceId: 'test-src',
        targetDeviceId: 'test-dst',
        mediaType: 'screenshot',
        dataUrl: 'data:image/png;base64,iVBOR',
      },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('P8.3.2 GET /desktop-sync/media → requires auth', async ({ request }) => {
    const res = await request.get(`${API}/desktop-sync/media`);
    expect([401, 403]).toContain(res.status());
  });

  test('P8.3.3 GET /desktop-sync/media/fake-transfer-id → requires auth', async ({ request }) => {
    const res = await request.get(`${API}/desktop-sync/media/fake-transfer-id`);
    expect([401, 403]).toContain(res.status());
  });
});

test.describe('P8.4 – Shared Workspaces', () => {
  test('P8.4.1 POST /desktop-sync/workspaces → requires auth', async ({ request }) => {
    const res = await request.post(`${API}/desktop-sync/workspaces`, {
      data: { name: 'Test Workspace' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('P8.4.2 GET /desktop-sync/workspaces → requires auth', async ({ request }) => {
    const res = await request.get(`${API}/desktop-sync/workspaces`);
    expect([401, 403]).toContain(res.status());
  });

  test('P8.4.3 POST /desktop-sync/workspaces/fake-id/invite → requires auth', async ({ request }) => {
    const res = await request.post(`${API}/desktop-sync/workspaces/fake-id/invite`, {
      data: { userId: 'test-user', role: 'EDITOR' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('P8.4.4 POST /desktop-sync/workspaces/fake-id/respond → requires auth', async ({ request }) => {
    const res = await request.post(`${API}/desktop-sync/workspaces/fake-id/respond`, {
      data: { accept: true },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('P8.4.5 POST /desktop-sync/workspaces/fake-id/sessions → requires auth', async ({ request }) => {
    const res = await request.post(`${API}/desktop-sync/workspaces/fake-id/sessions`, {
      data: { sessionId: 'test-session' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('P8.4.6 GET /desktop-sync/workspaces/fake-id/sessions → requires auth', async ({ request }) => {
    const res = await request.get(`${API}/desktop-sync/workspaces/fake-id/sessions`);
    expect([401, 403]).toContain(res.status());
  });

  test('P8.4.7 GET /desktop-sync/workspaces/fake-id/members → requires auth', async ({ request }) => {
    const res = await request.get(`${API}/desktop-sync/workspaces/fake-id/members`);
    expect([401, 403]).toContain(res.status());
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MARKETPLACE + AUTH (Cross-cutting)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Cross-cutting – Marketplace', () => {
  test('CC.1 GET /unified-marketplace/search → non-5xx', async ({ request }) => {
    const res = await request.get(`${API}/unified-marketplace/search?query=agent&limit=3`);
    expect(res.status()).toBeLessThan(500);
  });

  test('CC.2 GET /unified-marketplace/featured → non-5xx', async ({ request }) => {
    const res = await request.get(`${API}/unified-marketplace/featured`);
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('Cross-cutting – Auth', () => {
  test('CC.3 POST /auth/email/send-code → accepts POST', async ({ request }) => {
    const res = await request.post(`${API}/auth/email/send-code`, {
      data: { email: 'e2e-p8-test@test.invalid' },
    });
    expect([200, 201, 400, 429]).toContain(res.status());
  });

  test('CC.4 POST /auth/desktop-pair/create → non-5xx', async ({ request }) => {
    const res = await request.post(`${API}/auth/desktop-pair/create`, {
      data: { sessionId: `e2e-${Date.now()}` },
    });
    expect(res.status()).toBeLessThan(500);
  });
});
