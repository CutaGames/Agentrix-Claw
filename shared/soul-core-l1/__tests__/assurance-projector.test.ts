import type { RecordRef } from '../../types/trust-loop-primitives';
import type { AssuranceMechanismEvidenceV1 } from '../../types/soul-core-assurance';
import {
  projectSoulCoreAssuranceV1,
  SoulCoreAssuranceProjectionError,
  type AssuranceAttestationClassV1,
  type AssuranceEvidenceSourceKindV1,
  type AssuranceProjectionEvidenceInputV1,
} from '../v1_1/assurance-projector';

const digest = (value: string) => ({
  algorithm: 'sha-256' as const,
  canonicalization: 'jcs/1',
  value,
});
const sourceRef = (id: string): RecordRef => ({
  type: 'assurance_evidence',
  id,
  version: 1,
  digest: digest('a'.repeat(64)),
});

function evidence(
  mechanism: AssuranceMechanismEvidenceV1['mechanism'],
  overrides: Partial<AssuranceMechanismEvidenceV1> = {},
): AssuranceMechanismEvidenceV1 {
  return {
    mechanism,
    state: 'verified-active',
    scope: ['proposal-signing'],
    evidenceLevel: 'development-hardware',
    environment: 'test',
    sourceRefs: [sourceRef(`${mechanism}-evidence`)],
    verifierRef: sourceRef(`${mechanism}-verifier`),
    verifiedAt: '2026-07-24T00:00:00.000Z',
    nextUpdateAt: '2026-07-25T00:00:00.000Z',
    fresh: true,
    canProve: ['mechanism-active'],
    cannotProve: ['outcome-correctness', 'legal-responsibility'],
    ...overrides,
  };
}

function item(
  mechanism: AssuranceMechanismEvidenceV1['mechanism'],
  sourceKind: AssuranceEvidenceSourceKindV1,
  attestationClass: AssuranceAttestationClassV1 = 'development',
  overrides: Partial<AssuranceMechanismEvidenceV1> = {},
): AssuranceProjectionEvidenceInputV1 {
  return { evidence: evidence(mechanism, overrides), sourceKind, attestationClass };
}

describe('Soul Core assurance/release projector', () => {
  test('keeps onchain-4337 software-baseline and caps development/test at internal', () => {
    const view = projectSoulCoreAssuranceV1({
      evidence: [item('onchain-4337', 'authority-control-plane')],
      requestedReleaseState: 'production',
    });
    expect(view).toMatchObject({
      projectionState: 'available',
      effectiveAssurance: 'software-baseline',
      releaseState: 'internal',
    });
  });

  test('requires fresh verified non-self-attested SE evidence for hardware-backed', () => {
    const selfAttested = projectSoulCoreAssuranceV1({
      evidence: [item('SE-tap', 'soul-core-card', 'self-attested')],
      requestedReleaseState: 'pilot',
    });
    expect(selfAttested.effectiveAssurance).toBe('software-baseline');
    expect(selfAttested.releaseState).toBe('internal');

    const stale = item('SE-tap', 'soul-core-card', 'development', {
      state: 'stale',
      fresh: false,
    });
    expect(projectSoulCoreAssuranceV1({
      evidence: [stale],
      requestedReleaseState: 'pilot',
    })).toMatchObject({ projectionState: 'stale', effectiveAssurance: 'software-baseline' });

    expect(projectSoulCoreAssuranceV1({
      evidence: [item('SE-tap', 'soul-core-card')],
      requestedReleaseState: 'production',
    }).effectiveAssurance).toBe('hardware-backed');
  });

  test('accepts SE-resident only from a separately evidenced Secure Resident Host', () => {
    const residentRef = sourceRef('resident-host-binding');
    const resident = item('SE-resident', 'secure-resident-host', 'pilot', {
      evidenceLevel: 'pilot-hardware',
      environment: 'pilot',
      sourceRefs: [residentRef],
    });
    resident.secureResidentHostEvidenceRef = residentRef;
    expect(projectSoulCoreAssuranceV1({
      evidence: [resident],
      requestedReleaseState: 'production',
    })).toMatchObject({ effectiveAssurance: 'hardware-resident', releaseState: 'pilot' });
  });

  test.each(['ordinary-embodiment', 'soul-core-card'] as const)(
    'rejects SE-resident asserted by %s',
    (sourceKind) => {
      const value = item('SE-resident', sourceKind);
      value.secureResidentHostEvidenceRef = value.evidence.sourceRefs[0];
      expect(() => projectSoulCoreAssuranceV1({
        evidence: [value],
        requestedReleaseState: 'internal',
      })).toThrow(SoulCoreAssuranceProjectionError);
    },
  );

  test('ordinary Embodiment cannot upgrade assurance through an SE mechanism', () => {
    expect(() => projectSoulCoreAssuranceV1({
      evidence: [item('SE-tap', 'ordinary-embodiment')],
      requestedReleaseState: 'internal',
    })).toThrow(SoulCoreAssuranceProjectionError);
  });

  test('rejects non-canonical mechanism wire values', () => {
    expect(() => projectSoulCoreAssuranceV1({
      evidence: [item('platform-enforcement', 'authority-control-plane')],
      requestedReleaseState: 'internal',
    })).toThrow(SoulCoreAssuranceProjectionError);
  });

  test('permits production only with certified-production evidence and environment', () => {
    const view = projectSoulCoreAssuranceV1({
      evidence: [item('onchain-4337', 'authority-control-plane', 'certified-production', {
        evidenceLevel: 'certified-production',
        environment: 'production',
      })],
      requestedReleaseState: 'production',
    });
    expect(view.releaseState).toBe('production');
  });

  test('empty evidence is not-configured/disabled and emits no post-execution judgments', () => {
    const view = projectSoulCoreAssuranceV1({
      evidence: [],
      requestedReleaseState: 'production',
    });
    expect(view).toEqual({
      schemaVersion: 1,
      projectionState: 'not-configured',
      mechanisms: [],
      effectiveAssurance: 'software-baseline',
      releaseState: 'disabled',
    });
    expect(view).not.toHaveProperty('remedy');
    expect(view).not.toHaveProperty('reputation');
    expect(view).not.toHaveProperty('responsibilityLineage');
  });
});
