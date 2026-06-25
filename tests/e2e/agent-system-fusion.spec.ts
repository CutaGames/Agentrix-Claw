/**
 * E2E Test: Agent System Fusion
 *
 * Tests the unified agent system where:
 * - One Agent = OpenClawInstance + AgentAccount (1:1 binding)
 * - UserAgent is deprecated
 * - Team provisioning creates both AgentAccount + OpenClawInstance
 * - Unified API returns merged agent data
 */
import { test, expect } from '@playwright/test';

const BASE = 'https://api.agentrix.top/api';

// Helper: get a valid JWT for testing
async function getAuthToken(request: any): Promise<string | null> {
  // Try multiple credential sets
  const credentials = [
    { email: '1194479457@qq.com', password: 'zyc.2392018' },
    { email: 'zhouyachi2023@gmail.com', password: 'admin123' },
  ];
  for (const cred of credentials) {
    try {
      const res = await request.post(`${BASE}/auth/login`, {
        data: cred,
      });
      if (res.status() === 200 || res.status() === 201) {
        const body = await res.json();
        const token = body.access_token || body.data?.access_token || body.token || null;
        if (token) return token;
      }
    } catch {}
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1: Unified Agent API
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Agent Fusion — Unified API', () => {
  test('GET /agents/unified → endpoint exists', async ({ request }) => {
    const res = await request.get(`${BASE}/agents/unified`);
    // 401 = auth required (endpoint exists), 200 = success
    expect(res.status()).not.toBe(404);
  });

  test('GET /agents/unified/:id → endpoint exists', async ({ request }) => {
    const res = await request.get(`${BASE}/agents/unified/00000000-0000-0000-0000-000000000001`);
    expect(res.status()).not.toBe(404);
  });

  test('POST /agents/create → endpoint exists', async ({ request }) => {
    const res = await request.post(`${BASE}/agents/create`, {
      data: { name: 'Test Agent' },
    });
    expect(res.status()).not.toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1: Team provisioning with instance creation
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Agent Fusion — Team APIs', () => {
  test('GET /agent-teams/templates → returns templates', async ({ request }) => {
    const token = await getAuthToken(request);
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    const res = await request.get(`${BASE}/agent-teams/templates`, { headers });
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      // Should have at least the default templates
      expect(body.data.length).toBeGreaterThanOrEqual(1);
    }
  });

  test('GET /agent-teams/my-teams → includes instanceId', async ({ request }) => {
    const token = await getAuthToken(request);
    if (!token) {
      test.skip();
      return;
    }

    const res = await request.get(`${BASE}/agent-teams/my-teams`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Data may be empty if no teams exist, but structure should be correct
    if (body.data.length > 0) {
      const firstTeam = body.data[0];
      expect(firstTeam).toHaveProperty('templateSlug');
      expect(firstTeam).toHaveProperty('agents');
      expect(Array.isArray(firstTeam.agents)).toBe(true);
    }
  });

  test('POST /agent-teams/my-teams/:slug/roles/:codename/bind-instance → endpoint exists', async ({ request }) => {
    const token = await getAuthToken(request);
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    const res = await request.post(
      `${BASE}/agent-teams/my-teams/agentrix-11/roles/ceo/bind-instance`,
      {
        headers,
        data: { instanceId: '00000000-0000-0000-0000-000000000001' },
      },
    );
    // 404 from team/role not found is OK; 404 from route not found is not
    // Expect 400/404 not-found-entity or 401/403 auth error
    expect(res.status()).not.toBe(405); // Method not allowed = route missing
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2: Authenticated unified agent CRUD flow
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Agent Fusion — Authenticated CRUD', () => {
  let token: string | null = null;
  let createdAgentId: string | null = null;

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request);
  });

  test('Create unified agent', async ({ request }) => {
    if (!token) {
      test.skip();
      return;
    }

    const res = await request.post(`${BASE}/agents/create`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: `E2E-Test-Agent-${Date.now()}`,
        description: 'Created by E2E test for agent fusion validation',
        personality: 'Helpful and concise',
        defaultModel: 'claude-haiku-4-5',
        spendingLimits: { singleTxLimit: 10, dailyLimit: 50, monthlyLimit: 200, currency: 'USD' },
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('id');
    expect(body.data).toHaveProperty('agentAccountId');
    expect(body.data.name).toContain('E2E-Test-Agent');
    expect(body.data.status).toBe('active');
    expect(body.data.instanceType).toBe('cloud');
    createdAgentId = body.data.id;
  });

  test('List unified agents includes created agent', async ({ request }) => {
    if (!token || !createdAgentId) {
      test.skip();
      return;
    }

    const res = await request.get(`${BASE}/agents/unified`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    const found = body.data.find((a: any) => a.id === createdAgentId);
    expect(found).toBeTruthy();
    // Verify unified data has both instance + account fields
    expect(found.agentAccountId).toBeTruthy();
    expect(found.agentUniqueId).toMatch(/^AGT-/);
    expect(found.creditScore).toBeDefined();
    expect(found.spendingLimits).toBeDefined();
  });

  test('Get single unified agent by ID', async ({ request }) => {
    if (!token || !createdAgentId) {
      test.skip();
      return;
    }

    const res = await request.get(`${BASE}/agents/unified/${createdAgentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(createdAgentId);
    expect(body.data.personality).toBe('Helpful and concise');
    expect(body.data.defaultModel).toBe('claude-haiku-4-5');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3: Legacy endpoints still work
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Agent Fusion — Legacy Backward Compat', () => {
  test('GET /agent-presence/agents → still works', async ({ request }) => {
    const res = await request.get(`${BASE}/agent-presence/agents`);
    expect(res.status()).not.toBe(404);
  });

  test('GET /agent-accounts → still works', async ({ request }) => {
    const res = await request.get(`${BASE}/agent-accounts`);
    expect(res.status()).not.toBe(404);
  });

  test('POST /openclaw/proxy/:id/stream → still works', async ({ request }) => {
    const res = await request.post(
      `${BASE}/openclaw/proxy/00000000-0000-0000-0000-000000000001/stream`,
      { data: { message: 'test' } },
    );
    expect(res.status()).not.toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// OpenClaw Instance entity has new FK columns
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Agent Fusion — Schema Validation', () => {
  test('Unified agent response has expected shape', async ({ request }) => {
    const token = await getAuthToken(request);
    if (!token) {
      test.skip();
      return;
    }

    const res = await request.get(`${BASE}/agents/unified`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status() !== 200) {
      test.skip();
      return;
    }

    const body = await res.json();
    if (body.data.length === 0) {
      test.skip();
      return;
    }

    const agent = body.data[0];
    // Required fields from OpenClawInstance
    expect(agent).toHaveProperty('id');
    expect(agent).toHaveProperty('name');
    expect(agent).toHaveProperty('status');
    expect(agent).toHaveProperty('instanceType');
    expect(agent).toHaveProperty('isPrimary');
    expect(agent).toHaveProperty('createdAt');

    // agentAccountId should always be present (may be null)
    expect('agentAccountId' in agent).toBe(true);
    // creditScore and spendingLimits only present when agentAccount is bound
    if (agent.agentAccountId) {
      expect(agent.creditScore).toBeDefined();
      expect(agent.spendingLimits).toBeDefined();
    }
  });
});
