import {
  CANONICAL_ENFORCEMENT_LAYERS,
  isCanonicalEnforcementLayer,
  partitionEnforcementLayers,
} from '../../types/authority';
import {
  CANONICAL_ASSURANCE_MECHANISMS_V1,
  SoulCoreAssuranceProjectionError,
  projectSoulCoreAssuranceV1,
  type AssuranceProjectionEvidenceInputV1,
} from '../v1_1/assurance-projector';
import {
  PRESENTABLE_SE_MECHANISMS_V1,
  presentSoulCoreSeAssuranceV1,
} from '../v1_1/assurance-presentation';
import type { AssuranceMechanismEvidenceV1 } from '../../types/soul-core-assurance';
import type { RecordRef } from '../../types/trust-loop-primitives';

/**
 * T23 conformance: Backend/Web/Mobile must accept only canonical
 * `SE-tap / onchain-4337 / SE-resident` wire values, and the four dimensions
 * projection / evidence / effective / release must stay separable.
 *
 * These assertions are deliberately about boundaries rather than happy paths:
 * every legacy or unknown value must fail closed, an ordinary Embodiment must
 * never upgrade assurance, and Soul Dock must not exist as an assurance tier.
 */
const ref = (id: string): RecordRef => ({
  type: 'assurance_evidence',
  id,
  version: 1,
  digest: {
    algorithm: 'sha-256' as const,
    canonicalization: 'jcs/1',
    value: 'a'.repeat(64),
  },
});
const REF = ref('conformance-evidence');

function evidence(
  overrides: Partial<AssuranceMechanismEvidenceV1> = {},
): AssuranceMechanismEvidenceV1 {
  return {
    mechanism: 'SE-tap',
    state: 'verified-active',
    scope: ['proposal-signing'],
    evidenceLevel: 'pilot-hardware',
    environment: 'pilot',
    sourceRefs: [REF],
    verifierRef: ref('conformance-verifier'),
    verifiedAt: '2026-07-25T00:00:00.000Z',
    nextUpdateAt: '2026-07-26T00:00:00.000Z',
    fresh: true,
    canProve: ['mechanism-active'],
    cannotProve: ['outcome-correctness', 'legal-responsibility'],
    ...overrides,
  };
}

function input(
  items: AssuranceProjectionEvidenceInputV1[],
  requestedReleaseState: 'disabled' | 'internal' | 'pilot' | 'production' = 'pilot',
) {
  return { evidence: items, requestedReleaseState };
}

const pilotCardEvidence: AssuranceProjectionEvidenceInputV1 = {
  evidence: evidence(),
  sourceKind: 'soul-core-card',
  attestationClass: 'pilot',
};

describe('T23 · canonical wire values are the only accepted vocabulary', () => {
  test('the canonical mechanism and layer sets are frozen', () => {
    expect([...CANONICAL_ASSURANCE_MECHANISMS_V1]).toEqual([
      'SE-tap',
      'onchain-4337',
      'SE-resident',
    ]);
    expect([...CANONICAL_ENFORCEMENT_LAYERS]).toEqual([
      'software',
      'onchain-4337',
      'SE-tap',
      'SE-resident',
    ]);
    // Only SE mechanisms are presentable as hardware assurance; onchain-4337 is an
    // enforcement layer, not a hardware-assurance badge.
    expect([...PRESENTABLE_SE_MECHANISMS_V1]).toEqual(['SE-tap', 'SE-resident']);
    expect(PRESENTABLE_SE_MECHANISMS_V1).not.toContain('onchain-4337');
  });

  test.each(['SE', 'onchain-AA', 'se_tap', 'SE_TAP', 'soul-dock', 'TEE', ''])(
    'the projector refuses non-canonical mechanism %s',
    (mechanism) => {
      expect(() =>
        projectSoulCoreAssuranceV1(
          input([{ ...pilotCardEvidence, evidence: evidence({ mechanism } as never) }]),
        ),
      ).toThrow(SoulCoreAssuranceProjectionError);
    },
  );

  test.each(['SE', 'onchain-AA', 'se-tap', 'soul-dock', 'hardware'])(
    'renderers drop non-canonical enforcement layer %s instead of guessing',
    (layer) => {
      expect(isCanonicalEnforcementLayer(layer)).toBe(false);
      const { canonical, rejected } = partitionEnforcementLayers(['software', layer]);
      expect(canonical).toEqual(['software']);
      expect(rejected).toEqual([layer]);
    },
  );

  test('layer partitioning is fail-closed for malformed input', () => {
    expect(partitionEnforcementLayers(undefined)).toEqual({ canonical: [], rejected: [] });
    expect(partitionEnforcementLayers('SE-tap')).toEqual({ canonical: [], rejected: [] });
    const { canonical, rejected } = partitionEnforcementLayers([
      'SE-tap',
      'SE-tap',
      null,
      42,
      'software',
    ]);
    expect(canonical).toEqual(['SE-tap', 'software']);
    expect(rejected).toHaveLength(2);
  });
});

describe('T23 · source binding: only the right producer may assert a mechanism', () => {
  test('an ordinary Embodiment cannot assert any canonical mechanism', () => {
    for (const mechanism of CANONICAL_ASSURANCE_MECHANISMS_V1) {
      expect(() =>
        projectSoulCoreAssuranceV1(
          input([
            {
              evidence: evidence({ mechanism }),
              sourceKind: 'ordinary-embodiment',
              attestationClass: 'pilot',
            },
          ]),
        ),
      ).toThrow(SoulCoreAssuranceProjectionError);
    }
  });

  test('an ordinary Embodiment cannot raise effectiveAssurance above software-baseline', () => {
    // Its only legal projection is "no mechanism at all", which stays software-baseline.
    const view = projectSoulCoreAssuranceV1(input([], 'production'));
    expect(view.effectiveAssurance).toBe('software-baseline');
    expect(view.projectionState).toBe('not-configured');
    expect(view.releaseState).toBe('disabled');
  });

  test('SE-resident requires a digest-bound Secure Resident Host evidence ref', () => {
    const residentEvidence = evidence({ mechanism: 'SE-resident' });
    // Missing ref → refused.
    expect(() =>
      projectSoulCoreAssuranceV1(
        input([
          {
            evidence: residentEvidence,
            sourceKind: 'secure-resident-host',
            attestationClass: 'pilot',
          },
        ]),
      ),
    ).toThrow(SoulCoreAssuranceProjectionError);
    // Present but not digest-bound in sourceRefs → refused.
    expect(() =>
      projectSoulCoreAssuranceV1(
        input([
          {
            evidence: { ...residentEvidence, sourceRefs: [REF] },
            sourceKind: 'secure-resident-host',
            attestationClass: 'pilot',
            secureResidentHostEvidenceRef: ref('other-host'),
          },
        ]),
      ),
    ).toThrow(SoulCoreAssuranceProjectionError);
  });

  test('a Soul Core card cannot assert SE-resident, and a host cannot assert SE-tap', () => {
    expect(() =>
      projectSoulCoreAssuranceV1(
        input([
          {
            evidence: evidence({ mechanism: 'SE-resident', sourceRefs: [REF] }),
            sourceKind: 'soul-core-card',
            attestationClass: 'pilot',
            secureResidentHostEvidenceRef: REF,
          },
        ]),
      ),
    ).toThrow(SoulCoreAssuranceProjectionError);
    expect(() =>
      projectSoulCoreAssuranceV1(
        input([
          {
            evidence: evidence({ mechanism: 'SE-tap' }),
            sourceKind: 'secure-resident-host',
            attestationClass: 'pilot',
          },
        ]),
      ),
    ).toThrow(SoulCoreAssuranceProjectionError);
  });

  test('Soul Dock is not an assurance tier, source kind or mechanism', () => {
    const vocabulary = JSON.stringify({
      mechanisms: CANONICAL_ASSURANCE_MECHANISMS_V1,
      layers: CANONICAL_ENFORCEMENT_LAYERS,
      presentable: PRESENTABLE_SE_MECHANISMS_V1,
    }).toLowerCase();
    expect(vocabulary).not.toContain('dock');
    expect(() =>
      projectSoulCoreAssuranceV1(
        input([
          {
            evidence: evidence(),
            sourceKind: 'soul-dock' as never,
            attestationClass: 'pilot',
          },
        ]),
      ),
    ).toThrow(SoulCoreAssuranceProjectionError);
  });
});

describe('T23 · projection / evidence / effective / release stay separated', () => {
  test('a fresh pilot card yields hardware-backed effective assurance at pilot release', () => {
    const view = projectSoulCoreAssuranceV1(input([pilotCardEvidence], 'pilot'));
    expect(view.projectionState).toBe('available');
    expect(view.mechanisms[0].evidenceLevel).toBe('pilot-hardware');
    expect(view.effectiveAssurance).toBe('hardware-backed');
    expect(view.releaseState).toBe('pilot');
  });

  test('self-attested evidence keeps projection available but does not raise effective assurance', () => {
    const view = projectSoulCoreAssuranceV1(
      input([{ ...pilotCardEvidence, attestationClass: 'self-attested' }], 'pilot'),
    );
    // The evidence is still reported (projection dimension) …
    expect(view.projectionState).toBe('available');
    expect(view.mechanisms).toHaveLength(1);
    // … while the effective dimension refuses to upgrade.
    expect(view.effectiveAssurance).toBe('software-baseline');
  });

  test('release is capped by the weakest of attestation class, evidence level and environment', () => {
    const requestProduction = (
      overrides: Partial<AssuranceProjectionEvidenceInputV1>,
    ) => projectSoulCoreAssuranceV1(
      input([{ ...pilotCardEvidence, ...overrides }], 'production'),
    ).releaseState;

    expect(requestProduction({})).toBe('pilot');
    expect(
      requestProduction({
        attestationClass: 'certified-production',
        evidence: evidence({ evidenceLevel: 'certified-production', environment: 'production' }),
      }),
    ).toBe('production');
    // Weakest dimension wins: a certified attestation class cannot lift
    // development-grade evidence out of internal release.
    expect(
      requestProduction({
        attestationClass: 'certified-production',
        evidence: evidence({ evidenceLevel: 'development-hardware', environment: 'production' }),
      }),
    ).toBe('internal');
    // A pilot-hardware evidence level stays at pilot even in a production environment.
    expect(
      requestProduction({
        attestationClass: 'certified-production',
        evidence: evidence({ evidenceLevel: 'pilot-hardware', environment: 'production' }),
      }),
    ).toBe('pilot');
  });

  test('claiming certified-production evidence outside production is refused, not merely capped', () => {
    // Stronger than release capping: the mismatch itself is invalid input.
    expect(() =>
      projectSoulCoreAssuranceV1(
        input(
          [
            {
              ...pilotCardEvidence,
              attestationClass: 'certified-production',
              evidence: evidence({ evidenceLevel: 'certified-production', environment: 'test' }),
            },
          ],
          'production',
        ),
      ),
    ).toThrow(SoulCoreAssuranceProjectionError);
  });

  test('a stale or revoked mechanism degrades projection without silently dropping evidence', () => {
    const stale = projectSoulCoreAssuranceV1(
      input([{ ...pilotCardEvidence, evidence: evidence({ state: 'stale', fresh: false }) }]),
    );
    expect(stale.projectionState).toBe('stale');
    expect(stale.mechanisms).toHaveLength(1);
    expect(stale.effectiveAssurance).toBe('software-baseline');

    const revoked = projectSoulCoreAssuranceV1(
      input([{ ...pilotCardEvidence, evidence: evidence({ state: 'revoked', fresh: false }) }]),
    );
    expect(revoked.projectionState).toBe('unavailable');
    expect(revoked.effectiveAssurance).toBe('software-baseline');
  });

  test('requesting disabled release never returns a higher release than requested', () => {
    expect(projectSoulCoreAssuranceV1(input([pilotCardEvidence], 'disabled')).releaseState).toBe(
      'disabled',
    );
    expect(projectSoulCoreAssuranceV1(input([pilotCardEvidence], 'internal')).releaseState).toBe(
      'internal',
    );
  });

  test('duplicate mechanisms are refused rather than double-counted', () => {
    expect(() =>
      projectSoulCoreAssuranceV1(input([pilotCardEvidence, pilotCardEvidence])),
    ).toThrow(SoulCoreAssuranceProjectionError);
  });
});

describe('T23 · UI boundary agrees with the projector', () => {
  test('the presenter refuses every mechanism the projector would refuse', () => {
    for (const mechanism of ['SE', 'onchain-AA', 'se_tap', 'soul-dock', 'onchain-4337']) {
      expect(
        presentSoulCoreSeAssuranceV1({
          state: 'verified',
          attestationClass: 'pilot_hardware',
          assurance: 'pilot',
          enforcedBy: mechanism,
          note: 'n',
        }).state,
      ).toBe('unavailable');
    }
  });

  test('the presenter never reports a release state above the attestation class', () => {
    expect(
      presentSoulCoreSeAssuranceV1({
        state: 'verified',
        attestationClass: 'self_attested_dev',
        assurance: 'production_hardware',
        enforcedBy: 'SE-tap',
        note: 'n',
      }).releaseState,
    ).toBe('internal');
  });
});
