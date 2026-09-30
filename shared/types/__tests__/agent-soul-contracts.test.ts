import {
  ACTION_ATTRIBUTION_SCHEMA_VERSION,
  decodeActionAttributionV1,
  validateActionAttributionV1,
  type ActionAttributionV1,
  type AuthorityRootRefV1,
} from '../agent-attribution';
import {
  TASK_PROOF_SCHEMA_VERSION,
  TASK_PROOF_V2_DOMAIN,
  TASK_PROOF_V2_SCHEMA_VERSION,
  decodeTaskProofEnvelopeV1V2,
  validateCompatibilityAttributionV1,
  validateTaskProofV2,
  type TaskProofV1,
  type TaskProofV2,
} from '../task-proof';
import {
  SHELL_COMMAND_JOURNAL_SCHEMA_VERSION,
  SHELL_COMMAND_SCHEMA_VERSION,
  SHELL_SESSION_BINDING_SCHEMA_VERSION,
  evaluateShellCommandRetryV1,
  getShellCommandClaimKeysV1,
  validateShellCommandAgainstBindingV1,
  validateShellSessionBindingV1,
  type ShellCommandEnvelopeV1,
  type ShellCommandJournalEntryV1,
  type ShellSessionBindingV1,
} from '../shell-session-binding';
import {
  AGENT_EMBODIMENT_SCHEMA_VERSION,
  ASSURANCE_MECHANISMS_V1,
  HOST_ASSURANCE_BINDING_SCHEMA_VERSION,
  SOUL_CORE_ASSURANCE_SCHEMA_VERSION,
  validateAgentEmbodimentViewV1,
  validateAssuranceMechanismEvidenceV1,
  validateHostAssuranceBindingV1,
  validateSoulCoreAssuranceViewV1,
  type AssuranceMechanismEvidenceV1,
} from '../soul-core-assurance';
import type { RecordRef } from '../trust-loop-primitives';

const T0 = '2026-07-17T00:00:00.000Z';
const T1 = '2026-07-17T00:10:00.000Z';
const T2 = '2026-07-17T01:00:00.000Z';
const AGENT_ID = 'agent-1';
const SOUL_CORE_ID = 'sc_0123456789abcdef0123456789abcdef';

const ref = (type: RecordRef['type'], id: string, version = 1): RecordRef => ({
  type,
  id,
  version,
});

const directRoot: AuthorityRootRefV1 = { kind: 'soul_core', soulCoreId: SOUL_CORE_ID };

const directAttribution: ActionAttributionV1 = {
  schemaVersion: ACTION_ATTRIBUTION_SCHEMA_VERSION,
  actorRef: { kind: 'agent', agentId: AGENT_ID },
  accountableAgentId: AGENT_ID,
  authorityRootRef: directRoot,
  initiatorRef: ref('actor_identity', 'owner-1'),
  runtimeRef: ref('runtime', 'runtime-1'),
};

describe('ADR-SOUL-002 typed attribution', () => {
  test('accepts a direct Agent action only when accountable Agent and direct root agree', () => {
    expect(
      validateActionAttributionV1(directAttribution, { directAuthorityRootRef: directRoot }),
    ).toEqual({ valid: true, errors: [] });
    expect(() =>
      decodeActionAttributionV1(directAttribution, { directAuthorityRootRef: directRoot }),
    ).not.toThrow();
  });

  test('fails closed for unknown kinds, unknown version and Agent accountability mismatch', () => {
    expect(validateActionAttributionV1({ ...directAttribution, schemaVersion: 99 }).valid).toBe(false);
    expect(
      validateActionAttributionV1({
        ...directAttribution,
        actorRef: { kind: 'runtime', runtimeId: 'r-1' },
      }).valid,
    ).toBe(false);
    expect(
      validateActionAttributionV1({ ...directAttribution, accountableAgentId: 'agent-2' }).valid,
    ).toBe(false);
  });

  test('requires a delegation chain for Worker, Team and cross-root actions', () => {
    const worker = {
      ...directAttribution,
      actorRef: { kind: 'worker', workerId: 'worker-1' },
    };
    expect(validateActionAttributionV1(worker).valid).toBe(false);
    expect(
      validateActionAttributionV1({
        ...worker,
        delegationChainRef: ref('delegation_chain', 'delegation-1'),
      }).valid,
    ).toBe(true);

    const team = {
      ...directAttribution,
      authorityRootRef: { kind: 'team_authority', teamId: 'team-1', authorityId: 'auth-1' },
    };
    expect(validateActionAttributionV1(team).valid).toBe(false);

    const otherRoot: AuthorityRootRefV1 = { kind: 'soul_core', soulCoreId: 'sc_other' };
    expect(
      validateActionAttributionV1(
        { ...directAttribution, authorityRootRef: otherRoot },
        { directAuthorityRootRef: directRoot },
      ).valid,
    ).toBe(false);
  });
});

const proofV1: TaskProofV1 = {
  schemaVersion: TASK_PROOF_SCHEMA_VERSION,
  taskProofId: 'proof-1',
  soulCoreId: SOUL_CORE_ID,
  request: { requestId: 'request-1', requestedBy: 'owner-1', requestedAt: T0, intentDigest: 'i' },
  authorization: {
    authorizationId: 'authorization-1',
    decision: 'approved',
    authorityPolicyIds: ['policy-1'],
    decidedAt: T0,
    decidedBy: 'controller-1',
  },
  execution: {
    executionId: 'execution-1',
    runtimeId: 'runtime-1',
    status: 'succeeded',
    inputDigest: 'input',
    outputDigest: 'output',
  },
  settlement: { settlementId: 'settlement-1', status: 'not_required' },
  outcome: { outcomeId: 'outcome-1', result: 'success', resultDigest: 'result', recordedAt: T1 },
  evidence: [],
  proofDigest: 'v1-digest-is-unchanged',
  createdAt: T1,
};

const proofV2: TaskProofV2 = {
  ...proofV1,
  schemaVersion: TASK_PROOF_V2_SCHEMA_VERSION,
  proofDomain: TASK_PROOF_V2_DOMAIN,
  attribution: directAttribution,
};

describe('TaskProof V2 and V1 compatibility', () => {
  test('dispatches V1 unchanged and validates additive V2 without downgrade', () => {
    expect(decodeTaskProofEnvelopeV1V2(proofV1)).toEqual({ version: 1, proof: proofV1 });
    expect(
      decodeTaskProofEnvelopeV1V2(proofV2, { directAuthorityRootRef: directRoot }),
    ).toEqual({ version: 2, proof: proofV2 });
    expect(validateTaskProofV2({ ...proofV2, proofDomain: 'V1' }).valid).toBe(false);
    expect(() => decodeTaskProofEnvelopeV1V2({ ...proofV2, proofDomain: 'V1' })).toThrow();
    expect(() => decodeTaskProofEnvelopeV1V2({ ...proofV2, schemaVersion: 99 })).toThrow();
  });

  test('rejects a Soul Core compatibility mismatch', () => {
    expect(validateTaskProofV2({ ...proofV2, soulCoreId: 'sc_other' }).valid).toBe(false);
  });

  test('compatibility attribution can only state cryptographicallyBound false', () => {
    const compatibility = {
      sourceProofVersion: 1,
      actorRef: { kind: 'agent', agentId: AGENT_ID },
      accountableAgentId: AGENT_ID,
      derivationSourceRef: ref('evidence', 'mapping-report-1'),
      derivedAt: T1,
      cryptographicallyBound: false,
      confidence: 'deterministic-mapping',
    } as const;
    expect(validateCompatibilityAttributionV1(compatibility).valid).toBe(true);
    expect(
      validateCompatibilityAttributionV1({ ...compatibility, cryptographicallyBound: true }).valid,
    ).toBe(false);
  });
});

const shellBinding: ShellSessionBindingV1 = {
  schemaVersion: SHELL_SESSION_BINDING_SCHEMA_VERSION,
  bindingId: 'binding-1',
  bindingVersion: 1,
  agentId: AGENT_ID,
  accountableAgentId: AGENT_ID,
  authorityRootRef: directRoot,
  principalRef: ref('actor_identity', 'owner-1'),
  shellId: 'shell-1',
  deviceId: 'device-1',
  runtimeRef: ref('runtime', 'runtime-1'),
  keyRef: 'device-key-1',
  keyPurpose: 'device-auth',
  audience: ['shell-gateway'],
  capabilities: ['companion.command'],
  nonceDomain: 'shell-command-v1',
  issuedAt: T0,
  expiresAt: T2,
  status: 'active',
};

const command: ShellCommandEnvelopeV1 = {
  schemaVersion: SHELL_COMMAND_SCHEMA_VERSION,
  bindingId: shellBinding.bindingId,
  bindingVersion: shellBinding.bindingVersion,
  nonceDomain: shellBinding.nonceDomain,
  nonce: '0123456789abcdef0123456789abcdef',
  idempotencyKey: 'command-1',
  requestDigest: 'request-digest-1',
  issuedAt: T1,
  expiresAt: T2,
};

const journal = (state: ShellCommandJournalEntryV1['state']): ShellCommandJournalEntryV1 => ({
  schemaVersion: SHELL_COMMAND_JOURNAL_SCHEMA_VERSION,
  bindingId: command.bindingId,
  bindingVersion: command.bindingVersion,
  nonceDomain: command.nonceDomain,
  nonce: command.nonce,
  idempotencyKey: command.idempotencyKey,
  requestDigest: command.requestDigest,
  state,
  reservedAt: T1,
  updatedAt: T1,
});

describe('Shell binding and atomic journal semantics', () => {
  test('requires active matching binding and tenantRef for tenant-scoped use', () => {
    expect(validateShellCommandAgainstBindingV1(command, shellBinding, T1).valid).toBe(true);
    expect(validateShellSessionBindingV1(shellBinding, { tenantScoped: true }).valid).toBe(false);
    expect(
      validateShellCommandAgainstBindingV1(command, { ...shellBinding, status: 'revoked', revokedAt: T1 }, T1)
        .valid,
    ).toBe(false);
  });

  test('freezes both atomic unique claim tuples', () => {
    expect(getShellCommandClaimKeysV1(command)).toEqual({
      nonceKey: ['binding-1', 1, 'shell-command-v1', command.nonce],
      idempotencyKey: ['binding-1', 1, 'shell-command-v1', 'command-1'],
    });
  });

  test('same digest retries do not re-execute; conflicts and unknown outcomes fail closed', () => {
    expect(evaluateShellCommandRetryV1(journal('executing'), command)).toBe('in-progress');
    expect(evaluateShellCommandRetryV1(journal('succeeded'), command)).toBe(
      'return-terminal-result',
    );
    expect(evaluateShellCommandRetryV1(journal('unknown-outcome'), command)).toBe(
      'reconciliation-required',
    );
    expect(
      evaluateShellCommandRetryV1(journal('reserved'), { ...command, requestDigest: 'different' }),
    ).toBe('conflict');
  });
});

const residentEvidence: AssuranceMechanismEvidenceV1 = {
  mechanism: 'SE-resident',
  state: 'verified-active',
  scope: ['high-value.command'],
  evidenceLevel: 'simulator',
  environment: 'test',
  sourceRefs: [ref('assurance_evidence', 'evidence-1')],
  verifierRef: ref('evidence', 'backend-verifier-1'),
  verifiedAt: T1,
  fresh: true,
  canProve: ['protocol conformance'],
  cannotProve: ['production hardware'],
};

describe('per-mechanism assurance and Embodiment/Host orthogonality', () => {
  test('freezes canonical mechanism wires and rejects upward/unknown evidence', () => {
    expect(ASSURANCE_MECHANISMS_V1).toEqual([
      'software-policy',
      'platform-enforcement',
      'onchain-4337',
      'SE-tap',
      'SE-resident',
    ]);
    expect(validateAssuranceMechanismEvidenceV1(residentEvidence).valid).toBe(true);
    expect(
      validateAssuranceMechanismEvidenceV1({ ...residentEvidence, mechanism: 'SE' }).valid,
    ).toBe(false);
    expect(
      validateAssuranceMechanismEvidenceV1({ ...residentEvidence, state: 'stale', fresh: true }).valid,
    ).toBe(false);
  });

  test('effective hardware assurance requires matching fresh active evidence', () => {
    expect(
      validateSoulCoreAssuranceViewV1({
        schemaVersion: SOUL_CORE_ASSURANCE_SCHEMA_VERSION,
        projectionState: 'available',
        mechanisms: [residentEvidence],
        effectiveAssurance: 'hardware-resident',
        releaseState: 'internal',
      }).valid,
    ).toBe(true);
    expect(
      validateSoulCoreAssuranceViewV1({
        schemaVersion: SOUL_CORE_ASSURANCE_SCHEMA_VERSION,
        projectionState: 'available',
        mechanisms: [],
        effectiveAssurance: 'hardware-backed',
        releaseState: 'disabled',
      }).valid,
    ).toBe(false);
  });

  test('Embodiment and Host are separately referenced and separately validated', () => {
    const shellRef = ref('shell_session_binding', 'binding-1', 1);
    expect(
      validateAgentEmbodimentViewV1({
        schemaVersion: AGENT_EMBODIMENT_SCHEMA_VERSION,
        agentId: AGENT_ID,
        activeShellBindingRefs: [shellRef],
        primaryShellBindingRef: shellRef,
      }).valid,
    ).toBe(true);
    expect(
      validateAgentEmbodimentViewV1({
        schemaVersion: AGENT_EMBODIMENT_SCHEMA_VERSION,
        agentId: AGENT_ID,
        activeShellBindingRefs: [],
        primaryShellBindingRef: shellRef,
      }).valid,
    ).toBe(false);

    expect(
      validateHostAssuranceBindingV1(
        {
          schemaVersion: HOST_ASSURANCE_BINDING_SCHEMA_VERSION,
          bindingId: 'host-binding-1',
          authorityRootRef: directRoot,
          hostId: 'host-1',
          deviceId: 'device-1',
          profileRef: 'secure-host-v1',
          mechanisms: ['SE-resident'],
          scope: ['high-value.command'],
          policyRef: 'policy-1',
          assuranceEvidenceRef: ref('assurance_evidence', 'evidence-1'),
          issuedAt: T0,
          expiresAt: T2,
          status: 'active',
        },
        T1,
      ).valid,
    ).toBe(true);
  });
});
