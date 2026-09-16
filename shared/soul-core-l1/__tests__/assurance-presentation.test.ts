import { presentSoulCoreSeAssuranceV1 } from '../v1_1/assurance-presentation';

describe('Soul Core assurance presentation boundary', () => {
  const verifiedTap = {
    state: 'verified',
    attestationClass: 'test_ca_card',
    assurance: 'engineering_pilot',
    enforcedBy: 'SE-tap',
    note: 'Challenge-bound Test CA evidence.',
  };

  test('presents verified canonical SE-tap but caps Test CA at internal release', () => {
    expect(presentSoulCoreSeAssuranceV1(verifiedTap)).toEqual({
      state: 'verified',
      projectionState: 'available',
      mechanism: 'SE-tap',
      attestationClass: 'test_ca_card',
      effectiveAssurance: 'engineering_pilot',
      releaseState: 'internal',
      note: 'Challenge-bound Test CA evidence.',
    });
  });

  test.each(['SE', 'onchain-AA', 'se_tap', 'software'])('rejects non-canonical mechanism %s', (enforcedBy) => {
    expect(presentSoulCoreSeAssuranceV1({ ...verifiedTap, enforcedBy })).toMatchObject({
      state: 'unavailable',
      mechanism: null,
      releaseState: 'internal',
    });
  });

  test('rejects unknown attestation classes instead of inferring release', () => {
    expect(presentSoulCoreSeAssuranceV1({
      ...verifiedTap,
      attestationClass: 'browser_claim',
    }).state).toBe('unavailable');
  });

  test('requires separate Secure Resident Host evidence for SE-resident', () => {
    expect(presentSoulCoreSeAssuranceV1({
      ...verifiedTap,
      enforcedBy: 'SE-resident',
      attestationClass: 'pilot_hardware',
      sourceKind: 'ordinary-embodiment',
    }).state).toBe('unavailable');

    expect(presentSoulCoreSeAssuranceV1({
      ...verifiedTap,
      enforcedBy: 'SE-resident',
      attestationClass: 'pilot_hardware',
      sourceKind: 'secure-resident-host',
      secureResidentHostEvidenceRef: { type: 'assurance_evidence', id: 'host-1', version: 1 },
    })).toMatchObject({ state: 'verified', mechanism: 'SE-resident', releaseState: 'pilot' });
  });

  test('preserves roadmap and malformed inputs never upgrade', () => {
    expect(presentSoulCoreSeAssuranceV1({ state: 'roadmap', note: 'Not configured.' })).toEqual({
      state: 'roadmap',
      projectionState: 'not-configured',
      mechanism: null,
      releaseState: 'internal',
      note: 'Not configured.',
    });
    expect(presentSoulCoreSeAssuranceV1(null).state).toBe('roadmap');
    expect(presentSoulCoreSeAssuranceV1({ state: 'verified' }).state).toBe('unavailable');
  });
});

describe('development-card evidence presentation (T11 方案一 · session-scoped)', () => {
  const developmentVerified = {
    state: 'development_verified',
    evidenceLevel: 'development_card',
    assurance: 'development',
    enforcedBy: null,
    keySeparation: true,
    rollingCounter: 3,
    usedTotal: '3000000',
    note: 'Challenge-bound proof-of-possession verified for the presented development key.',
  };

  test('presents verified development-card evidence without any SE mechanism', () => {
    expect(presentSoulCoreSeAssuranceV1(developmentVerified)).toEqual({
      state: 'development-verified',
      projectionState: 'available',
      mechanism: null,
      evidenceLevel: 'development_card',
      effectiveAssurance: 'development',
      releaseState: 'internal',
      note: developmentVerified.note,
    });
  });

  test.each(['SE-tap', 'SE-resident', 'onchain-4337', 'software'])(
    'refuses development-card evidence that claims mechanism %s',
    (enforcedBy) => {
      expect(
        presentSoulCoreSeAssuranceV1({ ...developmentVerified, enforcedBy }).state,
      ).toBe('unavailable');
    },
  );

  test('refuses a forged evidence level', () => {
    expect(
      presentSoulCoreSeAssuranceV1({ ...developmentVerified, evidenceLevel: 'pilot_hardware' }).state,
    ).toBe('unavailable');
  });

  test('refuses development-card evidence missing assurance or note', () => {
    const { assurance, ...withoutAssurance } = developmentVerified;
    expect(presentSoulCoreSeAssuranceV1(withoutAssurance).state).toBe('unavailable');
    const { note, ...withoutNote } = developmentVerified;
    expect(presentSoulCoreSeAssuranceV1(withoutNote).state).toBe('unavailable');
  });

  test('never lets development-card evidence reach pilot or production release', () => {
    const presented = presentSoulCoreSeAssuranceV1(developmentVerified);
    expect(presented.releaseState).toBe('internal');
    expect(presented.state).not.toBe('verified');
  });
});
