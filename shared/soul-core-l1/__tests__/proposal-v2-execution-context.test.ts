import {
  ACTION_ATTRIBUTION_SCHEMA_VERSION,
  type ActionAttributionV1,
} from '../../types/agent-attribution';
import {
  AGENT_ECONOMY_SCHEMA_VERSION,
  type ExecutionMandateV1,
} from '../../types/agent-economy';
import type { RecordRef } from '../../types/trust-loop-primitives';
import {
  buildProposalV2ExecutionContext,
  ProposalV2ExecutionContextError,
  type BuildProposalV2ExecutionContextInput,
} from '../v1_1/proposal-v2-execution-context';
import { EMPTY_DELEGATION_CHAIN_DIGEST } from '../v1_1/proposal-digest-v2';

const HEX_A = 'a'.repeat(64);
const HEX_B = 'b'.repeat(64);
const digest = (value: string) => ({ algorithm: 'sha-256' as const, canonicalization: 'jcs/1', value });
const ref = (type: RecordRef['type'], id: string, value?: string): RecordRef => ({
  type,
  id,
  version: 1,
  ...(value ? { digest: digest(value) } : {}),
});
const root = { kind: 'soul_core' as const, soulCoreId: 'sc_direct' };

const attribution: ActionAttributionV1 = {
  schemaVersion: ACTION_ATTRIBUTION_SCHEMA_VERSION,
  actorRef: { kind: 'agent', agentId: 'agent-1' },
  accountableAgentId: 'agent-1',
  authorityRootRef: root,
  initiatorRef: ref('actor_identity', 'owner-1'),
  runtimeRef: ref('runtime', 'runtime-1'),
};

const mandate: ExecutionMandateV1 = {
  schemaVersion: AGENT_ECONOMY_SCHEMA_VERSION,
  mandateId: 'mandate-1',
  actionId: 'action-1',
  accountableAgentId: 'agent-1',
  principalRef: { kind: 'principal', id: 'principal-1' },
  authorizerRef: { kind: 'authorizer', id: 'authorizer-1' },
  authorityRootRef: root,
  quoteRef: ref('action_quote', 'quote-1'),
  scope: ['recover'],
  budgetCeiling: { amountMinor: '0', currency: 'USDC', decimals: 6 },
  allowedCandidateRefs: [ref('discovery_candidate', 'candidate-1')],
  policyRefs: [ref('policy', 'policy-1')],
  termsRefs: [ref('terms', 'terms-1')],
  requiredMechanisms: ['SE-tap'],
  status: 'active',
  issuedAt: '2026-07-24T00:00:00.000Z',
  expiresAt: '2026-07-25T00:00:00.000Z',
  integrity: {
    type: 'digest',
    payloadDigest: digest(HEX_A),
  },
};

const input = (): BuildProposalV2ExecutionContextInput => ({
  base: {
    kitId: 'kit-1',
    accountId: 'account-1',
    chainId: '133',
    authorityId: 'sc_direct',
    proposalType: 'recover',
    policyVersion: 'v1',
    proposalNonce: 'nonce-1',
    expiresAtOrEpoch: '2026-07-25T00:00:00.000Z',
    requiredRole: 'personal-primary',
  },
  actionId: 'action-1',
  attribution,
  mandate,
  mandateRef: ref('execution_mandate', 'mandate-1', HEX_A),
  proposalEvidenceRefs: [ref('authority_decision', 'decision-1', HEX_B)],
  authoritative: {
    kitId: 'kit-1',
    accountId: 'account-1',
    chainId: '133',
    authorityId: 'sc_direct',
    controlEpoch: '7',
    lifecycleCounter: '3',
    directAuthorityRootRef: root,
  },
});

describe('ProposalV2 execution-context binder', () => {
  test('builds V2 only and binds mandate/action/pre-execution refs into payloadHash', () => {
    const result = buildProposalV2ExecutionContext(input());
    expect(result.proposal.schemaVersion).toBe('2');
    expect(result.proposal.payloadHash).toBe(result.proposalContextDigest);
    expect(result.proposal.controlEpoch).toBe('7');
    expect(result.proposal.expectedLifecycleCounter).toBe('3');
    expect(result.proposal.delegationChainDigest).toBe(EMPTY_DELEGATION_CHAIN_DIGEST);
    expect(result.proposalDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(result).not.toHaveProperty('digestVersion');
  });

  test.each([
    ['action', (value: ReturnType<typeof input>) => { value.actionId = 'action-other'; }],
    ['agent', (value: ReturnType<typeof input>) => { value.mandate = { ...value.mandate, accountableAgentId: 'agent-2' }; }],
    ['root', (value: ReturnType<typeof input>) => { value.mandate = { ...value.mandate, authorityRootRef: { kind: 'soul_core', soulCoreId: 'sc_other' } }; }],
    ['chain', (value: ReturnType<typeof input>) => { value.base.chainId = '1'; }],
    ['kit', (value: ReturnType<typeof input>) => { value.base.kitId = 'kit-other'; }],
    ['account', (value: ReturnType<typeof input>) => { value.base.accountId = 'account-other'; }],
    ['authority', (value: ReturnType<typeof input>) => { value.base.authorityId = 'sc_other'; }],
    ['epoch', (value: ReturnType<typeof input>) => { value.authoritative.controlEpoch = '07'; }],
    ['lifecycle', (value: ReturnType<typeof input>) => { value.authoritative.lifecycleCounter = '-1'; }],
  ])('fails closed on %s mismatch', (_name, mutate) => {
    const value = input();
    mutate(value);
    expect(() => buildProposalV2ExecutionContext(value)).toThrow(ProposalV2ExecutionContextError);
  });

  test('requires the same digest-bound delegation for Worker and Team authority', () => {
    const value = input();
    const delegation = ref('delegation_chain', 'delegation-1', HEX_B);
    value.attribution = {
      ...attribution,
      actorRef: { kind: 'worker', workerId: 'worker-1' },
      authorityRootRef: { kind: 'team_authority', teamId: 'team-1', authorityId: 'team-auth-1' },
      delegationChainRef: delegation,
    };
    value.mandate = {
      ...mandate,
      authorityRootRef: value.attribution.authorityRootRef,
      delegationChainRef: delegation,
    };
    value.base.authorityId = 'team-auth-1';
    value.authoritative.authorityId = 'team-auth-1';
    value.authoritative.directAuthorityRootRef = value.attribution.authorityRootRef;
    expect(buildProposalV2ExecutionContext(value).proposal.delegationChainDigest).toBe(HEX_B);

    value.attribution = { ...value.attribution, delegationChainRef: undefined };
    expect(() => buildProposalV2ExecutionContext(value)).toThrow(ProposalV2ExecutionContextError);
  });

  test('rejects post-execution refs instead of prewriting receipt/lineage', () => {
    const value = input();
    value.proposalEvidenceRefs = [ref('action_receipt', 'receipt-not-created-yet', HEX_B)];
    expect(() => buildProposalV2ExecutionContext(value)).toThrow(ProposalV2ExecutionContextError);
  });
});
