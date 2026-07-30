import type { ActionTaskV1 } from '../../../shared/types/action-runtime';
import { actionDimensions, buildMobileAgentDirectoryModel, evaluateMobileHardwareRequirement } from '../mobileAgentEconomyModel';

const refs = [
  {
    schemaVersion: 1 as const,
    soulCoreId: 'sc_0123456789abcdef0123456789abcdef',
    agentAccountId: 'agent-alpha',
  },
  {
    schemaVersion: 1 as const,
    soulCoreId: 'sc_fedcba9876543210fedcba9876543210',
    agentAccountId: 'agent-beta',
  },
];

const instances = [
  {
    id: 'instance-alpha',
    name: 'Alpha',
    instanceUrl: 'https://alpha.example',
    status: 'active' as const,
    deployType: 'cloud' as const,
    agentAccountId: 'agent-alpha',
  },
  {
    id: 'instance-beta',
    name: 'Beta',
    instanceUrl: 'https://beta.example',
    status: 'disconnected' as const,
    deployType: 'local' as const,
    agentAccountId: 'agent-beta',
  },
];

describe('Mobile Agent directory model', () => {
  it('supports multiple Agents while resolving only the explicit selection', () => {
    const model = buildMobileAgentDirectoryModel({
      refs,
      instances,
      selectedAgentId: 'agent-beta',
      activeInstanceId: 'instance-alpha',
    });

    expect(model.agents).toHaveLength(2);
    expect(model.selectedAgentId).toBe('agent-beta');
    expect(model.context).toEqual(expect.objectContaining({
      kind: 'ready',
      context: expect.objectContaining({
        source: 'user_selection',
        agentId: 'agent-beta',
        soulCoreId: refs[1].soulCoreId,
      }),
    }));
  });

  it('uses an already active runtime as a user selection only when directory mapping exists', () => {
    const model = buildMobileAgentDirectoryModel({
      refs,
      instances,
      activeInstanceId: 'instance-alpha',
    });
    expect(model.context).toEqual(expect.objectContaining({
      kind: 'ready',
      context: expect.objectContaining({ agentId: 'agent-alpha' }),
    }));
  });

  it('fails closed when a runtime Agent has no canonical Soul Core mapping', () => {
    const model = buildMobileAgentDirectoryModel({
      refs: [],
      instances: [instances[0]],
      selectedAgentId: 'agent-alpha',
    });
    expect(model.agents[0].canonicalMapping).toBe('missing');
    expect(model.context).toEqual({
      kind: 'unavailable',
      reason: 'agent_authorization_unknown',
      source: 'user_selection',
      agentId: 'agent-alpha',
    });
  });

  it('does not infer Primary from multiple owned directory entries', () => {
    const model = buildMobileAgentDirectoryModel({ refs, instances: [] });
    expect(model.context).toEqual({
      kind: 'missing',
      reason: 'canonical_primary_missing',
    });
  });
});

function task(settlement: ActionTaskV1['lifecycle']['settlement']): ActionTaskV1 {
  return {
    schemaVersion: 1,
    actionType: 'chat.tool_execution.v1',
    toolName: 'economy.discover',
    lifecycle: {
      schemaVersion: 1,
      soulCoreId: refs[0].soulCoreId,
      requestId: 'request-1',
      taskId: 'action-1',
      version: 3,
      authorization: 'approved',
      execution: 'succeeded',
      settlement,
      proof: 'issued',
      reputation: 'not_eligible',
      updatedAt: '2026-07-20T00:00:00.000Z',
    },
    authorization: {
      schemaVersion: 1,
      authorizationId: 'authorization-1',
      soulCoreId: refs[0].soulCoreId,
      taskId: 'action-1',
      scope: 'economy:read',
      inputDigest: 'digest',
      policyVersion: 1,
      decision: 'approved',
      expiresAt: '2026-07-21T00:00:00.000Z',
      requiredEnforcementLayers: ['software'],
      source: 'sovereignty-control-plane',
      requiresHumanApproval: true,
      estimatedCost: { amount: '0', asset: 'USD' },
    },
    createdAt: '2026-07-20T00:00:00.000Z',
  };
}

describe('Mobile five-dimensional Action read model', () => {
  it('keeps Authorization, Execution, Settlement, Verification and Remedy separate', () => {
    const dimensions = actionDimensions(task('settled'));
    expect(dimensions.map((item) => item.key)).toEqual([
      'authorization',
      'execution',
      'settlement',
      'verification',
      'remedy',
    ]);
    expect(dimensions.find((item) => item.key === 'remedy')).toEqual(expect.objectContaining({
      state: 'unavailable',
      canonical: false,
      tone: 'unknown',
    }));
  });

  it.each(['refunded', 'reversed'] as const)('keeps %s in Settlement without inventing Remedy', (settlement) => {
    const dimensions = actionDimensions(task(settlement));
    expect(dimensions.find((item) => item.key === 'settlement')).toEqual(
      expect.objectContaining({ state: settlement, canonical: true }),
    );
    expect(dimensions.find((item) => item.key === 'remedy')).toEqual(
      expect.objectContaining({ state: 'unavailable', canonical: false }),
    );
    expect(dimensions.find((item) => item.key === 'verification')).toEqual(
      expect.objectContaining({ state: 'unavailable', canonical: false }),
    );
  });
});


describe('Mobile hardware requirement gate', () => {
  it('continues the software path when hardware is not required', () => {
    expect(evaluateMobileHardwareRequirement(['software'], {
      nfcEnabled: false,
      attested: false,
    })).toEqual({ required: false, blocked: false, reason: 'not_required' });
  });

  it('blocks a hardware-required Mandate without live attestation', () => {
    expect(evaluateMobileHardwareRequirement(['software', 'SE-tap'], {
      nfcEnabled: true,
      attested: false,
    })).toEqual({ required: true, blocked: true, reason: 'attestation_unavailable' });
  });

  it('never bypasses a hardware requirement when NFC is disabled', () => {
    expect(evaluateMobileHardwareRequirement(['SE-resident'], {
      nfcEnabled: false,
      attested: true,
    })).toEqual({ required: true, blocked: true, reason: 'nfc_disabled' });
  });
});
