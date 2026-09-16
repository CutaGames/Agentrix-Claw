import {
  canDeliverEmbeddedPayloadV1,
  canonicalizeEmbeddedJsonV1,
  collectEmbeddedRecordKindsV1,
  computeCertificateChainDigestV1,
  computeEmbeddedCanonicalSha256V1,
  EMBEDDED_CONTRACT_VERSION_V1,
  negotiateEmbeddedContractV1,
  computeEmbeddedClaimChallengeDigestV1,
  computeEmbeddedClaimRequestDigestV1,
  computeRevocationFenceSetDigestV1,
  computeSignedShellCommandPayloadDigestV1,
  createDefaultOffEmbeddedFeatureFlagStatesV1,
  embeddedFirmwareRangeContainsV1,
  EMBEDDED_FEATURE_FLAG_NAMES_V1,
  EMBEDDED_TRUST_RECORD_TYPES_V1,
  parseEmbeddedJsonV1,
  validateEmbeddedAssociationReservationV1,
  validateEmbeddedClaimChallengeV1,
  validateEmbeddedClaimCommandV1,
  validateEmbeddedElementRefV1,
  validateEmbeddedElementStateEventV1,
  validateEmbeddedEvidenceManifestV1,
  validateEmbeddedFirmwareRangeV1,
  validateEmbeddedFirmwareVersionV1,
  validateEmbeddedSkuReleaseAllowlistSnapshotV1,
  validateEmbeddedSkuReleaseDecisionV1,
  validateEmbeddedSkuReleaseReceiptV1,
  validateFeatureFlagSnapshotV1,
  validateRevocationFenceBindingV1,
  validateRevocationFenceSetV1,
  validateSignedShellCommandSigningPayloadV1,
  validateSignedShellCommandV1,
  type AesSunClaimProofV1,
  type EmbeddedAssociationReservationV1,
  type EmbeddedClaimChallengeV1,
  type EmbeddedClaimCommandV1,
  type EmbeddedElementRefV1,
  type EmbeddedEvidenceManifestV1,
  type EmbeddedSkuKeyV1,
  type EmbeddedSkuReleaseAllowlistSnapshotV1,
  type EmbeddedSkuReleaseDecisionV1,
  type EmbeddedSkuReleaseReceiptV1,
  type FeatureFlagSnapshotV1,
  type RevocationFenceBindingV1,
  type RevocationFenceSetV1,
  type SignedShellCommandSigningPayloadV1,
  type SignedShellCommandV1,
} from '../soul-core-embedded';
import { ASSURANCE_MECHANISMS_V1 } from '../soul-core-assurance';
import {
  SHELL_BINDING_STATUSES_V1,
  SHELL_COMMAND_SCHEMA_VERSION,
  validateShellCommandEnvelopeV1,
} from '../shell-session-binding';
import { TRUST_RECORD_TYPES, type RecordRef } from '../trust-loop-primitives';

const T0 = '2026-07-30T00:00:00.000Z';
const T1 = '2026-07-30T00:00:30.000Z';
const T2 = '2026-07-30T00:01:00.000Z';
const H64 = '0'.repeat(64);

const ref = (type: RecordRef['type'], id: string, version?: number): RecordRef => ({
  type,
  id,
  ...(version === undefined ? {} : { version }),
});

const element: EmbeddedElementRefV1 = {
  schemaVersion: 1,
  elementId: 'element-1',
  batchRef: ref('embedded_batch', 'batch-1'),
  formFactor: 'tag',
  implementationMechanism: 'nfc-tag-aes-sun',
  manufacturingLifecycle: 'manufactured',
  associationState: 'unbound',
  elementAvailability: 'not-applicable',
  riskState: 'clear',
  stateVersion: 1,
  revocationEpoch: 0,
};

const challenge: EmbeddedClaimChallengeV1 = {
  schemaVersion: 1,
  challengeId: 'challenge-1',
  elementRef: ref('embedded_element', 'element-1'),
  batchRef: ref('embedded_batch', 'batch-1'),
  targetAgentId: 'agent-1',
  accountableAgentId: 'agent-1',
  authorityRootRef: { kind: 'soul_core', soulCoreId: 'soul-core-1' },
  principalRef: ref('actor_identity', 'owner-1'),
  audience: ['agentrix.claim', 'mobile'],
  channel: 'mobile-nfc',
  proofProtocol: 'aes-sun',
  nonce: 'challenge-nonce-1',
  idempotencyKey: 'claim-idempotency-1',
  issuedAt: T0,
  expiresAt: T1,
};

const aesProof: AesSunClaimProofV1 = {
  schemaVersion: 1,
  protocol: 'aes-sun',
  challengeId: challenge.challengeId,
  elementRef: challenge.elementRef,
  batchRef: challenge.batchRef,
  keyVersion: 1,
  counter: '1',
  sunMessage: 'AQID',
  mac: 'BAUG',
  collectedAt: T1,
};

const claimCommand: EmbeddedClaimCommandV1 = {
  schemaVersion: 1,
  challenge,
  ownerAuthorizationRef: ref('authority_decision', 'owner-decision-1', 1),
  proof: aesProof,
  requestedCapabilities: ['companion.read', 'companion.sign'],
  runtimeRef: ref('runtime', 'runtime-1'),
};

const fenceSet: RevocationFenceSetV1 = {
  schemaVersion: 1,
  policyVersion: 'embedded-fence-policy-v1',
  entries: [
    {
      aggregateKind: 'element',
      aggregateRef: ref('embedded_element', 'element-1'),
      observedEpoch: 0,
    },
    {
      aggregateKind: 'batch',
      aggregateRef: ref('embedded_batch', 'batch-1'),
      observedEpoch: 0,
    },
  ],
};

const fence: RevocationFenceBindingV1 = {
  schemaVersion: 1,
  fenceSet,
  fenceSetDigest: computeRevocationFenceSetDigestV1(fenceSet),
  digestProfile: 'sha256-rfc8785-v1',
  downstreamFenceToken: 'A'.repeat(43),
};

const envelope = {
  schemaVersion: SHELL_COMMAND_SCHEMA_VERSION,
  bindingId: 'binding-1',
  bindingVersion: 1,
  nonceDomain: 'shell-command-v1',
  nonce: '0123456789abcdef0123456789abcdef',
  idempotencyKey: 'command-1',
  requestDigest: H64,
  issuedAt: T0,
  expiresAt: T2,
};

/** Low-S uses s=1; high-S fills every s byte with 0xff, which exceeds n/2 on both curves. */
const p1363 = (variant: 'low-s' | 'high-s' | 'zero-s'): string => {
  const bytes = Buffer.alloc(64);
  bytes[31] = 1;
  if (variant === 'low-s') bytes[63] = 1;
  if (variant === 'high-s') bytes.fill(0xff, 32, 64);
  return bytes.toString('base64url');
};

const signingPayload: SignedShellCommandSigningPayloadV1 = {
  wrapperSchemaVersion: 1,
  domain: 'agentrix:shell-command:v1',
  canonicalizationProfile: 'rfc8785-utf8-sha256-v1',
  digestProfile: 'sha256-rfc8785-v1',
  signatureEncoding: 'base64url-p1363',
  envelope,
  signerRef: 'embedded-key-1',
  keyVersion: 1,
  algorithm: 'ecdsa-p256-sha256',
};

const signedCommand: SignedShellCommandV1 = {
  signingPayload,
  signature: p1363('low-s'),
};

const sku: EmbeddedSkuKeyV1 = {
  environment: 'test',
  manufacturerRef: ref('provider', 'manufacturer-1'),
  model: 'tag-a',
  hardwareRevision: 'rev-a',
  firmwareRange: '[1.0.0,1.0.0]',
  formFactor: 'tag',
  implementationMechanism: 'nfc-tag-aes-sun',
};

const flags: FeatureFlagSnapshotV1 = {
  schemaVersion: 1,
  snapshotId: 'flags-1',
  snapshotVersion: 1,
  environment: 'test',
  scope: 'environment-full',
  sourceConfigVersion: 'env-test-1',
  flags: createDefaultOffEmbeddedFeatureFlagStatesV1(),
  capturedAt: T0,
  issuedByRef: ref('actor_identity', 'release-operator-1'),
};

const emptyAllowlist: EmbeddedSkuReleaseAllowlistSnapshotV1 = {
  schemaVersion: 1,
  snapshotId: 'allowlist-empty-1',
  snapshotVersion: 1,
  environment: 'test',
  scope: 'environment-full',
  entries: [],
  capturedAt: T0,
  issuedByRef: ref('actor_identity', 'release-operator-1'),
};

const decision: EmbeddedSkuReleaseDecisionV1 = {
  schemaVersion: 1,
  decisionId: 'decision-1',
  skuKey: sku,
  decisionVersion: 1,
  disposition: 'approved',
  approvedMaturityCeiling: 'protocol-only',
  evidenceManifestRefs: [ref('embedded_evidence_manifest', 'manifest-1', 1)],
  reasonCode: 'protocol-fixture-only',
  decidedByRef: ref('actor_identity', 'release-operator-1'),
  decidedAt: T0,
  expiresAt: T2,
};

const receipt: EmbeddedSkuReleaseReceiptV1 = {
  schemaVersion: 1,
  receiptId: 'receipt-1',
  skuKey: sku,
  decisionRef: ref('embedded_release_decision', decision.decisionId, decision.decisionVersion),
  decisionVersion: decision.decisionVersion,
  flagSnapshotRef: ref('feature_flag_snapshot', flags.snapshotId, flags.snapshotVersion),
  releaseAllowlistSnapshotRef: ref(
    'embedded_release_allowlist_snapshot',
    'allowlist-active-1',
    2,
  ),
  effectiveAt: T1,
  issuedByRef: ref('actor_identity', 'release-operator-1'),
};

describe('Soul Core Embedded canonical vocabulary and CURRENT compatibility', () => {
  test('adds exactly the frozen 18 RecordRef kinds without changing CURRENT enums', () => {
    expect(EMBEDDED_TRUST_RECORD_TYPES_V1).toHaveLength(18);
    expect(TRUST_RECORD_TYPES.slice(-18)).toEqual([...EMBEDDED_TRUST_RECORD_TYPES_V1]);
    expect(SHELL_BINDING_STATUSES_V1).toEqual(['active', 'expired', 'revoked', 'superseded']);
    expect(ASSURANCE_MECHANISMS_V1).toEqual([
      'software-policy',
      'platform-enforcement',
      'onchain-4337',
      'SE-tap',
      'SE-resident',
    ]);
    expect(validateShellCommandEnvelopeV1(envelope)).toEqual({ valid: true, errors: [] });
  });

  test('strict parser rejects duplicate keys, negative zero, invalid Unicode and excess depth', () => {
    expect(parseEmbeddedJsonV1('{"a":1,"b":[true,null]}')).toEqual({ a: 1, b: [true, null] });
    expect(() => parseEmbeddedJsonV1('{"a":1,"a":2}')).toThrow(/Duplicate JSON key/);
    expect(() => parseEmbeddedJsonV1('-0')).toThrow(/number/);
    expect(() => parseEmbeddedJsonV1('"\\ud800"')).toThrow(/Unicode/);
    expect(() => parseEmbeddedJsonV1('[[[]]]', 100, 1)).toThrow(/nesting/);
  });

  test('canonical bytes and digest are deterministic and reject unsupported wire values', () => {
    expect(canonicalizeEmbeddedJsonV1({ z: 1, a: 'x' })).toBe('{"a":"x","z":1}');
    expect(computeEmbeddedCanonicalSha256V1({ z: 1, a: 'x' })).toMatch(/^[0-9a-f]{64}$/);
    expect(() => canonicalizeEmbeddedJsonV1({ value: undefined })).toThrow(/undefined/);
    expect(() => canonicalizeEmbeddedJsonV1({ value: Number.NaN })).toThrow(/number/);
  });
});

describe('element, event and claim invariants', () => {
  test('validates orthogonal element state and fails closed on state/ref or lane mismatch', () => {
    expect(validateEmbeddedElementRefV1(element).valid).toBe(true);
    expect(validateEmbeddedElementRefV1({ ...element, extra: true }).valid).toBe(false);
    expect(validateEmbeddedElementRefV1({
      ...element,
      associationState: 'bound',
      activeShellBindingRef: ref('shell_session_binding', 'binding-1'),
    }).valid).toBe(false);
    expect(validateEmbeddedElementRefV1({
      ...element,
      formFactor: 'sim',
    }).valid).toBe(false);
  });

  test('registration event is reconstructible and versions advance exactly once', () => {
    const event = {
      schemaVersion: 1,
      eventId: 'event-1',
      elementRef: ref('embedded_element', element.elementId),
      expectedStateVersion: 0,
      resultingStateVersion: 1,
      actorRef: ref('actor_identity', 'operator-1'),
      reasonCode: 'batch-registration',
      sourceRef: ref('evidence', 'batch-manifest-1'),
      occurredAt: T0,
      dimension: 'registration',
      initial: element,
    };
    expect(validateEmbeddedElementStateEventV1(event).valid).toBe(true);
    expect(validateEmbeddedElementStateEventV1({ ...event, resultingStateVersion: 2 }).valid).toBe(false);
  });

  test('enforces target accountability, freshness, protocol binding and digest projection', () => {
    expect(validateEmbeddedClaimChallengeV1(challenge).valid).toBe(true);
    expect(validateEmbeddedClaimCommandV1(claimCommand).valid).toBe(true);
    expect(validateEmbeddedClaimChallengeV1({
      ...challenge,
      accountableAgentId: 'agent-2',
    }).valid).toBe(false);
    expect(validateEmbeddedClaimChallengeV1({
      ...challenge,
      expiresAt: '2026-07-30T00:01:00.001Z',
    }).valid).toBe(false);
    expect(validateEmbeddedClaimCommandV1({
      ...claimCommand,
      proof: { ...aesProof, challengeId: 'other' },
    }).valid).toBe(false);

    const movedAuthorization = {
      ...claimCommand,
      ownerAuthorizationRef: ref('authority_decision', 'owner-decision-2', 2),
    };
    expect(computeEmbeddedClaimRequestDigestV1(movedAuthorization)).toBe(
      computeEmbeddedClaimRequestDigestV1(claimCommand),
    );
    expect(computeEmbeddedClaimRequestDigestV1({
      ...claimCommand,
      proof: { ...aesProof, counter: '2' },
    })).not.toBe(computeEmbeddedClaimRequestDigestV1(claimCommand));
    expect(computeEmbeddedClaimChallengeDigestV1(challenge)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('typed revocation fences and reservations', () => {
  test('accepts only canonical complete kind/ref/epoch order and exact digest', () => {
    expect(validateRevocationFenceSetV1(fenceSet).valid).toBe(true);
    expect(validateRevocationFenceBindingV1(fence).valid).toBe(true);
    expect(validateRevocationFenceSetV1({
      ...fenceSet,
      entries: [...fenceSet.entries].reverse(),
    }).valid).toBe(false);
    expect(validateRevocationFenceBindingV1({
      ...fence,
      fenceSetDigest: 'f'.repeat(64),
    }).valid).toBe(false);
    expect(validateRevocationFenceSetV1(fenceSet, {
      expectedEntries: [{
        aggregateKind: 'element',
        aggregateRef: ref('embedded_element', 'element-1'),
        currentEpoch: 0,
      }],
    }).valid).toBe(false);
  });

  test('keeps association and downstream tokens independent and binds state to Shell ref', () => {
    const reservation: EmbeddedAssociationReservationV1 = {
      schemaVersion: 1,
      reservationId: 'reservation-1',
      claimAttemptRef: ref('embedded_claim_attempt', 'attempt-1', 1),
      elementRef: challenge.elementRef,
      targetAgentId: 'agent-1',
      accountableAgentId: 'agent-1',
      requestDigest: computeEmbeddedClaimRequestDigestV1(claimCommand),
      associationFenceToken: 'B'.repeat(43),
      revocationFence: fence,
      state: 'reserved',
      createdAt: T0,
      updatedAt: T0,
      expiresAt: T2,
    };
    expect(validateEmbeddedAssociationReservationV1(reservation).valid).toBe(true);
    expect(validateEmbeddedAssociationReservationV1({
      ...reservation,
      associationFenceToken: fence.downstreamFenceToken,
    }).valid).toBe(false);
    expect(validateEmbeddedAssociationReservationV1({
      ...reservation,
      state: 'binding-created',
    }).valid).toBe(false);
  });
});

describe('fully signed Shell wrapper and target bytes', () => {
  test('signs every dispatch field and rejects unsigned outer or inner additions', () => {
    expect(validateSignedShellCommandSigningPayloadV1(signingPayload).valid).toBe(true);
    expect(validateSignedShellCommandV1(signedCommand).valid).toBe(true);
    expect(computeSignedShellCommandPayloadDigestV1(signingPayload)).toMatch(/^[0-9a-f]{64}$/);
    expect(validateSignedShellCommandV1({ ...signedCommand, algorithm: 'unsigned' }).valid).toBe(false);
    expect(validateSignedShellCommandSigningPayloadV1({
      ...signingPayload,
      dispatch: 'outside-signature',
    }).valid).toBe(false);
  });

  test('rejects wrong P1363 length, high-S and malformed DER while accepting minimal low-S DER', () => {
    expect(validateSignedShellCommandV1({ ...signedCommand, signature: p1363('high-s') }).valid).toBe(false);
    expect(validateSignedShellCommandV1({ ...signedCommand, signature: p1363('zero-s') }).valid).toBe(false);
    expect(validateSignedShellCommandV1({ ...signedCommand, signature: 'AQ' }).valid).toBe(false);
    expect(validateSignedShellCommandV1({
      signingPayload: { ...signingPayload, signatureEncoding: 'base64url-der' },
      signature: p1363('low-s'),
    }).valid).toBe(false);
    const derPayload = { ...signingPayload, signatureEncoding: 'base64url-der' as const };
    const minimalDer = Buffer.from([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x01]).toString('base64url');
    expect(validateSignedShellCommandV1({ signingPayload: derPayload, signature: minimalDer }).valid).toBe(true);
    const nonMinimalDer = Buffer.from([0x30, 0x07, 0x02, 0x02, 0x00, 0x01, 0x02, 0x01, 0x01]).toString('base64url');
    expect(validateSignedShellCommandV1({ signingPayload: derPayload, signature: nonMinimalDer }).valid).toBe(false);
  });

  test('certificate target length-prefixing is deterministic and order-sensitive', () => {
    const leaf = new Uint8Array([1, 2, 3]);
    const root = new Uint8Array([4, 5]);
    expect(computeCertificateChainDigestV1([leaf, root])).toMatch(/^[0-9a-f]{64}$/);
    expect(computeCertificateChainDigestV1([leaf, root])).not.toBe(
      computeCertificateChainDigestV1([root, leaf]),
    );
    expect(() => computeCertificateChainDigestV1([])).toThrow(/non-empty/);
  });
});

describe('firmware, release snapshots and default deny', () => {
  test('uses one canonical inclusive firmware grammar', () => {
    expect(validateEmbeddedFirmwareVersionV1('0.0.0').valid).toBe(true);
    expect(validateEmbeddedFirmwareVersionV1('2147483647.0.1').valid).toBe(true);
    for (const invalid of ['01.0.0', '1.0', '1.0.0-beta', '2147483648.0.0']) {
      expect(validateEmbeddedFirmwareVersionV1(invalid).valid).toBe(false);
    }
    expect(validateEmbeddedFirmwareRangeV1('[1.0.0,2.0.0]').valid).toBe(true);
    expect(validateEmbeddedFirmwareRangeV1('[2.0.0,1.0.0]').valid).toBe(false);
    expect(validateEmbeddedFirmwareRangeV1('[1.0.0, 2.0.0]').valid).toBe(false);
    expect(embeddedFirmwareRangeContainsV1('[1.0.0,2.0.0]', '2.0.0')).toBe(true);
    expect(embeddedFirmwareRangeContainsV1('[1.0.0,2.0.0]', '2.0.1')).toBe(false);
  });

  test('requires all nine flags in canonical order and starts all off', () => {
    expect(EMBEDDED_FEATURE_FLAG_NAMES_V1).toHaveLength(9);
    expect(flags.flags.every((entry) => entry.enabled === false)).toBe(true);
    expect(validateFeatureFlagSnapshotV1(flags).valid).toBe(true);
    expect(validateFeatureFlagSnapshotV1({
      ...flags,
      flags: flags.flags.slice(1),
    }).valid).toBe(false);
    expect(validateFeatureFlagSnapshotV1({
      ...flags,
      flags: [...flags.flags].reverse(),
    }).valid).toBe(false);
  });

  test('empty environment-full allowlist is structurally valid and denies receipt activation', () => {
    expect(validateEmbeddedSkuReleaseDecisionV1(decision).valid).toBe(true);
    expect(validateEmbeddedSkuReleaseAllowlistSnapshotV1(emptyAllowlist).valid).toBe(true);
    expect(validateEmbeddedSkuReleaseReceiptV1(receipt, {
      decision,
      flagSnapshot: flags,
      allowlistSnapshot: emptyAllowlist,
    }).valid).toBe(false);

    const activeAllowlist: EmbeddedSkuReleaseAllowlistSnapshotV1 = {
      ...emptyAllowlist,
      snapshotId: 'allowlist-active-1',
      snapshotVersion: 2,
      entries: [{
        skuKey: sku,
        decisionRef: ref('embedded_release_decision', decision.decisionId, decision.decisionVersion),
        decisionVersion: decision.decisionVersion,
      }],
    };
    expect(validateEmbeddedSkuReleaseAllowlistSnapshotV1(activeAllowlist).valid).toBe(true);
    expect(validateEmbeddedSkuReleaseReceiptV1(receipt, {
      decision,
      flagSnapshot: flags,
      allowlistSnapshot: activeAllowlist,
    }).valid).toBe(true);
  });
});

describe('immutable evidence manifest graph', () => {
  const artifactRef = ref('task_proof', 'protocol-test-1', 1);
  const manifest: EmbeddedEvidenceManifestV1 = {
    schemaVersion: 1,
    manifestId: 'manifest-1',
    environment: 'test',
    integrationMaturity: 'protocol-only',
    sources: [{
      component: 'shared-types',
      sourceSha: '0'.repeat(40),
      worktreeState: 'dirty',
    }],
    artifacts: [{
      artifactRef,
      repositoryPath: 'shared/types/__tests__/soul-core-embedded.test.ts',
      sha256: H64,
      role: 'protocol-only validator test',
    }],
    results: [{
      resultId: 'contract-validation',
      requirementIds: ['R3.2', 'R4.1'],
      taskIds: ['2.1'],
      status: 'pass',
      artifactRefs: [artifactRef],
      limitations: [],
    }],
    versions: {
      hardware: [],
      firmwareVersions: [],
      appVersions: [],
      backendVersions: [],
      apiSchemaVersions: ['embedded-v1'],
    },
    flagSnapshotRef: ref('feature_flag_snapshot', flags.snapshotId, flags.snapshotVersion),
    releaseAllowlistSnapshotRef: ref(
      'embedded_release_allowlist_snapshot',
      emptyAllowlist.snapshotId,
      emptyAllowlist.snapshotVersion,
    ),
    limitations: ['No app, backend, firmware or hardware version applies to this protocol-only test.'],
    ownerRef: ref('actor_identity', 'contract-owner-1'),
    reviewerRefs: [ref('actor_identity', 'contract-reviewer-1')],
    capturedAt: T1,
    evidencePhase: 'pre-decision',
  };

  test('accepts protocol-only pre-decision evidence without promoting dirty source', () => {
    expect(validateEmbeddedEvidenceManifestV1(manifest, {
      allowCandidateSkuAbsent: true,
    }).valid).toBe(true);
  });

  test('rejects unknown maturity, backwritten receipt and missing limitations for empty versions', () => {
    expect(validateEmbeddedEvidenceManifestV1({
      ...manifest,
      integrationMaturity: 'hardware-ready',
    }, { allowCandidateSkuAbsent: true }).valid).toBe(false);
    expect(validateEmbeddedEvidenceManifestV1({
      ...manifest,
      releaseReceiptRef: ref('embedded_release_receipt', 'future-receipt', 1),
    }, { allowCandidateSkuAbsent: true }).valid).toBe(false);
    expect(validateEmbeddedEvidenceManifestV1({
      ...manifest,
      limitations: [],
    }, { allowCandidateSkuAbsent: true }).valid).toBe(false);
  });
});

describe('EMB-01.1 consumer capability and contract-version negotiation', () => {
  const upgraded = {
    consumerId: 'backend-canonical-reader',
    contractVersion: EMBEDDED_CONTRACT_VERSION_V1,
    supportedRecordKinds: [...EMBEDDED_TRUST_RECORD_TYPES_V1, 'shell_session_binding', 'runtime'],
  };
  const legacy = {
    consumerId: 'legacy-mobile-build',
    contractVersion: EMBEDDED_CONTRACT_VERSION_V1,
    supportedRecordKinds: ['shell_session_binding', 'runtime', 'actor_identity'],
  };

  test('an upgraded consumer negotiates the exact contract version it declares', () => {
    const negotiated = negotiateEmbeddedContractV1(upgraded, {
      requiredRecordKinds: ['embedded_element', 'embedded_batch'],
      minimumContractVersion: 1,
    });
    expect(negotiated).toEqual({
      accepted: true,
      negotiatedContractVersion: 1,
      missingRecordKinds: [],
      denyReasons: [],
    });
  });

  test('a legacy consumer is denied the new record kinds instead of silently served', () => {
    const negotiated = negotiateEmbeddedContractV1(legacy, {
      requiredRecordKinds: ['embedded_element'],
    });
    expect(negotiated.accepted).toBe(false);
    expect(negotiated.negotiatedContractVersion).toBeNull();
    expect(negotiated.missingRecordKinds).toEqual(['embedded_element']);
    expect(negotiated.denyReasons).toContain('consumer-missing-record-kinds');
  });

  test('unknown versions, malformed declarations and off-registry kinds fail closed', () => {
    expect(negotiateEmbeddedContractV1({ ...upgraded, contractVersion: 2 }, {
      requiredRecordKinds: ['embedded_element'],
    }).denyReasons).toContain('unknown-contract-version');
    expect(negotiateEmbeddedContractV1({ consumerId: 'x' }, {
      requiredRecordKinds: ['embedded_element'],
    }).denyReasons).toEqual(['capability-declaration-invalid']);
    expect(negotiateEmbeddedContractV1(upgraded, {
      requiredRecordKinds: ['embedded_wallet'],
    }).denyReasons).toContain('required-kind-not-in-canonical-registry');
    expect(negotiateEmbeddedContractV1(upgraded, { requiredRecordKinds: [] }).accepted).toBe(false);
  });

  test('payload delivery is gated on the kinds the payload actually carries', () => {
    const payload = {
      reservationRef: ref('embedded_association_reservation', 'reservation-1', 1),
      nested: { list: [ref('embedded_element', 'element-1'), { deep: ref('runtime', 'runtime-1') }] },
    };
    expect(collectEmbeddedRecordKindsV1(payload)).toEqual([
      'embedded_association_reservation',
      'embedded_element',
      'runtime',
    ]);
    expect(canDeliverEmbeddedPayloadV1(upgraded, payload).accepted).toBe(true);
    const denied = canDeliverEmbeddedPayloadV1(legacy, payload);
    expect(denied.accepted).toBe(false);
    expect(denied.missingRecordKinds).toEqual([
      'embedded_association_reservation',
      'embedded_element',
    ]);
    // A payload that only uses CURRENT kinds stays deliverable to the legacy consumer.
    expect(canDeliverEmbeddedPayloadV1(legacy, { runtimeRef: ref('runtime', 'runtime-1') }).accepted).toBe(true);
  });
});
