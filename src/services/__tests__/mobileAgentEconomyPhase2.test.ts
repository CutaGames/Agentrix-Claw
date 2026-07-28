jest.mock('../api', () => ({
  getApiConfig: () => ({ baseUrl: 'https://api.example.test', token: 'owner-token' }),
}));
jest.mock('../mobileV6FeatureFlags', () => ({
  isMobileV6FeatureEnabled: () => true,
}));
jest.mock('../mobileV6Runtime', () => ({
  mobileV6HttpTransport: { request: jest.fn() },
}));

import {
  SoulCoreClientError,
  createAgentEconomyClient,
  type AgentEconomyWorkflowView,
  type HttpRequestV1,
} from '../../../shared/client';
import { AGENT_ECONOMY_C0_FIXTURES } from '../../../shared/types/agent-economy-fixtures';
import type { AgentFirstAgentStackParamList } from '../../navigation/agent-first/types';
import {
  isMobileEconomyMandateActive,
  isMobileZeroUsdQuote,
  runMobileEconomyMutation,
} from '../mobileAgentEconomyApi';

function workflow(): AgentEconomyWorkflowView {
  const fixtures = AGENT_ECONOMY_C0_FIXTURES;
  return {
    schemaVersion: 1,
    soulCoreId: 'sc-mobile',
    actionId: fixtures.actionReceipt.actionId,
    workflowVersion: 9,
    workflowStatus: 'reserved',
    goal: fixtures.goal,
    plan: fixtures.plan,
    candidates: [fixtures.candidate],
    quote: fixtures.quote,
    mandate: fixtures.mandate,
    reservation: fixtures.reservation,
    paymentAttempts: [],
    settlementEvents: [],
  };
}

describe('Mobile Agent Economy Phase 2 safety contract', () => {
  it('requires both canonical quote amount and maximum ceiling to be 0 USD', () => {
    expect(isMobileZeroUsdQuote({
      amount: { amountMinor: '0', currency: 'USD', decimals: 2 },
      maximumAmount: { amountMinor: '0', currency: 'USD', decimals: 2 },
    })).toBe(true);
    expect(isMobileZeroUsdQuote({
      amount: { amountMinor: '0', currency: 'USD', decimals: 2 },
      maximumAmount: { amountMinor: '1', currency: 'USD', decimals: 2 },
    })).toBe(false);
  });

  it('does not treat an expired active-status mandate as usable', () => {
    expect(isMobileEconomyMandateActive({
      status: 'active',
      expiresAt: '2026-07-24T00:00:00.000Z',
    }, Date.parse('2026-07-25T00:00:00.000Z'))).toBe(false);
  });

  it('marks an unknown mutation result uncertain so callers reconcile before retrying', async () => {
    const outcome = await runMobileEconomyMutation(async () => {
      throw new SoulCoreClientError({
        kind: 'network',
        message: 'connection reset after submit',
        retryable: true,
      });
    });

    expect(outcome).toEqual({
      ok: false,
      error: expect.objectContaining({
        kind: 'network',
        uncertain: true,
        title: 'Request outcome unknown',
      }),
    });
  });

  it('uses canonical revoke and timeout-reconcile routes with independent idempotency keys', async () => {
    const current = workflow();
    const requests: HttpRequestV1[] = [];
    const client = createAgentEconomyClient({
      baseUrl: 'https://api.example.test',
      transport: {
        request: async (request) => {
          requests.push(request);
          return {
            status: 200,
            headers: {},
            body: { schemaVersion: 1, replayed: false, workflow: current },
          };
        },
      },
    });

    await client.revoke('sc-mobile', current, 'mobile-economy:revoke:1', 'owner revoked');
    await client.reconcile('sc-mobile', current, 'mobile-economy:timeout-release:1', 'timeout_release');

    expect(requests.map((request) => ({
      path: request.path,
      key: request.headers?.['Idempotency-Key'],
      body: request.body,
    }))).toEqual([
      expect.objectContaining({
        path: expect.stringMatching(/\/actions\/[^/]+\/revoke$/),
        key: 'mobile-economy:revoke:1',
        body: expect.objectContaining({ expectedVersion: 9, reason: 'owner revoked' }),
      }),
      expect.objectContaining({
        path: expect.stringMatching(/\/actions\/[^/]+\/reservation\/reconcile$/),
        key: 'mobile-economy:timeout-release:1',
        body: expect.objectContaining({ expectedVersion: 9, outcome: 'timeout_release' }),
      }),
    ]);
  });

  it('keeps navigation handoffs ID-only and marks Economy tracking explicitly', () => {
    const compare: AgentFirstAgentStackParamList['CandidateCompare'] = {
      agentId: 'agent-1',
      goalId: 'goal-1',
      actionId: 'action-1',
    };
    const tracking: AgentFirstAgentStackParamList['ActionTracking'] = {
      agentId: compare.agentId,
      actionId: compare.actionId,
      view: 'tracking',
      origin: 'economy',
    };

    expect(Object.keys(compare).sort()).toEqual(['actionId', 'agentId', 'goalId']);
    expect(tracking).toEqual({
      agentId: 'agent-1',
      actionId: 'action-1',
      view: 'tracking',
      origin: 'economy',
    });
  });
});
