/**
 * Mobile Agent Economy client — request-shape parity with the canonical
 * Backend/Web contract. These assertions lock the endpoint paths, the
 * Idempotency-Key header, injected auth/schema headers and the cross-Soul-Core
 * guard so the Mobile surface can never drift from the shared client.
 */
jest.mock('../api', () => ({
  getApiConfig: () => ({ baseUrl: 'https://api.example.test', token: 'tkn' }),
}));
jest.mock('../mobileV6FeatureFlags', () => ({
  isMobileV6FeatureEnabled: () => true,
}));
jest.mock('../mobileV6Runtime', () => ({
  mobileV6HttpTransport: { request: jest.fn() },
}));

import {
  createAgentEconomyClient,
  type AgentEconomyWorkflowView,
  type HttpRequestV1,
  type HttpResponseV1,
  type HttpTransportV1,
} from '../../../shared/client';
import { createMobileEconomyIdempotencyKey } from '../mobileAgentEconomyApi';

function recordingClient(response: HttpResponseV1 = { status: 200, headers: {}, body: {} }) {
  const requests: HttpRequestV1[] = [];
  const transport: HttpTransportV1 = {
    async request(req) {
      requests.push(req);
      return response;
    },
  };
  const client = createAgentEconomyClient({
    transport,
    baseUrl: 'https://api.example.test',
    getAuthToken: () => 'tkn',
    defaultHeaders: { 'X-Agentrix-Surface': 'mobile' },
  });
  return { client, requests };
}

const MINIMAL_WORKFLOW = {
  soulCoreId: 'soul-1',
  actionId: 'action-1',
  workflowVersion: 3,
  goal: { goalId: 'goal-1' },
  plan: { planId: 'plan-1' },
} as unknown as AgentEconomyWorkflowView;

describe('Mobile Agent Economy client request parity', () => {
  test('createGoal posts to the canonical soul-core economy path with injected headers', async () => {
    const { client, requests } = recordingClient();
    // Decoding an empty body rejects; we only assert the outbound request shape.
    await expect(
      client.createGoal('soul-1', { intent: 'translate my launch page' }, 'mobile-economy:goal:abc'),
    ).rejects.toBeDefined();

    expect(requests).toHaveLength(1);
    const req = requests[0];
    expect(req.method).toBe('POST');
    expect(req.path).toBe('https://api.example.test/v1/soul-cores/soul-1/economy/goals');
    expect(req.headers?.['Idempotency-Key']).toBe('mobile-economy:goal:abc');
    expect(req.headers?.Authorization).toBe('Bearer tkn');
    expect(req.headers?.['Accept-Schema-Version']).toBe('1');
    expect(req.headers?.['X-Agentrix-Surface']).toBe('mobile');
    expect(req.body).toEqual({ schemaVersion: 1, intent: 'translate my launch page', constraints: undefined });
  });

  test('discover issues a GET to the global discovery endpoint with canonical query', async () => {
    const { client, requests } = recordingClient();
    await expect(client.discover({ query: 'translate', kinds: ['service'], limit: 3 })).rejects.toBeDefined();

    const req = requests[0];
    expect(req.method).toBe('GET');
    expect(req.path).toContain('/v1/agent-economy/discovery');
    expect(req.query).toEqual({ schemaVersion: 1, query: 'translate', kinds: 'service', limit: 3 });
  });

  test('authorize targets the action authorize path and carries expectedVersion', async () => {
    const { client, requests } = recordingClient();
    await expect(
      client.authorize('soul-1', MINIMAL_WORKFLOW, 'mobile-economy:authorize:xyz'),
    ).rejects.toBeDefined();

    const req = requests[0];
    expect(req.path).toBe('https://api.example.test/v1/soul-cores/soul-1/economy/actions/action-1/authorize');
    expect(req.body).toMatchObject({ schemaVersion: 1, expectedVersion: 3 });
  });

  test('refuses a cross-Soul-Core workflow request before any transport call', () => {
    const { client, requests } = recordingClient();
    expect(() =>
      client.discoverCandidates('soul-2', MINIMAL_WORKFLOW, {}, 'mobile-economy:discover:1'),
    ).toThrow(/cross-Soul-Core/);
    expect(requests).toHaveLength(0);
  });

  test('mobile idempotency keys are namespaced', () => {
    expect(createMobileEconomyIdempotencyKey('goal').startsWith('mobile-economy:goal:')).toBe(true);
  });
});
