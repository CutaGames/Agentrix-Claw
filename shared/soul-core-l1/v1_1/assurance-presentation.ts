export const PRESENTABLE_SE_MECHANISMS_V1 = ['SE-tap', 'SE-resident'] as const;
export type PresentableSeMechanismV1 = (typeof PRESENTABLE_SE_MECHANISMS_V1)[number];
export type AssurancePresentationReleaseStateV1 = 'internal' | 'pilot' | 'production';

export type SoulCoreSeAssurancePresentationV1 =
  | {
      state: 'verified';
      projectionState: 'available';
      mechanism: PresentableSeMechanismV1;
      attestationClass: string;
      effectiveAssurance: string;
      releaseState: AssurancePresentationReleaseStateV1;
      note: string;
    }
  | {
      /**
       * A development card proved challenge-bound possession, but it has no CA,
       * registry or reference values. It is shown as its own state so the UI can be
       * explicit instead of either claiming SE or hiding real evidence. `mechanism`
       * stays null: nothing is hardware-enforced for the platform at this level.
       */
      state: 'development-verified';
      projectionState: 'available';
      mechanism: null;
      evidenceLevel: 'development_card';
      effectiveAssurance: string;
      releaseState: 'internal';
      note: string;
    }
  | {
      state: 'roadmap';
      projectionState: 'not-configured';
      mechanism: null;
      releaseState: 'internal';
      note: string;
    }
  | {
      state: 'unavailable';
      projectionState: 'unavailable';
      mechanism: null;
      releaseState: 'internal';
      note: string;
    };

const RELEASE_BY_ATTESTATION_CLASS: Record<string, AssurancePresentationReleaseStateV1> = {
  self_attested_dev: 'internal',
  test_ca_card: 'internal',
  pilot_hardware: 'pilot',
  production_hardware: 'production',
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function unavailable(note: string): SoulCoreSeAssurancePresentationV1 {
  return {
    state: 'unavailable',
    projectionState: 'unavailable',
    mechanism: null,
    releaseState: 'internal',
    note,
  };
}

/**
 * Fail-closed UI boundary for the T9/T23 backend projection. It accepts only
 * canonical SE wire values and never infers assurance from ordinary Shell or
 * Embodiment data. Unknown/legacy values remain unavailable rather than being
 * upgraded for display.
 */
export function presentSoulCoreSeAssuranceV1(
  input: unknown,
): SoulCoreSeAssurancePresentationV1 {
  if (!isObject(input) || input.state === 'roadmap') {
    return {
      state: 'roadmap',
      projectionState: 'not-configured',
      mechanism: null,
      releaseState: 'internal',
      note: isObject(input) && isNonEmptyString(input.note)
        ? input.note
        : 'Soul Core hardware assurance is not configured.',
    };
  }
  if (input.state === 'development_verified') {
    // Accepted for display only, and only when the projection structurally refuses
    // to carry an enforcement mechanism. Anything else fails closed.
    if (input.evidenceLevel !== 'development_card') {
      return unavailable('Development-card evidence must declare evidenceLevel=development_card.');
    }
    if (input.enforcedBy != null) {
      return unavailable('Development-card evidence must not claim an enforcement mechanism.');
    }
    if (!isNonEmptyString(input.assurance) || !isNonEmptyString(input.note)) {
      return unavailable('Development-card evidence is missing required metadata.');
    }
    return {
      state: 'development-verified',
      projectionState: 'available',
      mechanism: null,
      evidenceLevel: 'development_card',
      effectiveAssurance: input.assurance,
      releaseState: 'internal',
      note: input.note,
    };
  }
  if (input.state !== 'verified') return unavailable('Hardware assurance projection is unavailable.');
  if (!(PRESENTABLE_SE_MECHANISMS_V1 as readonly unknown[]).includes(input.enforcedBy)) {
    return unavailable('Rejected non-canonical hardware assurance mechanism.');
  }
  if (!isNonEmptyString(input.attestationClass) || !isNonEmptyString(input.assurance) || !isNonEmptyString(input.note)) {
    return unavailable('Verified hardware assurance is missing required evidence metadata.');
  }
  const releaseState = RELEASE_BY_ATTESTATION_CLASS[input.attestationClass];
  if (!releaseState) return unavailable('Unknown attestation class cannot upgrade assurance.');

  if (input.enforcedBy === 'SE-resident') {
    if (input.sourceKind !== 'secure-resident-host' || !isObject(input.secureResidentHostEvidenceRef)) {
      return unavailable('SE-resident requires independently verified Secure Resident Host evidence.');
    }
  }

  return {
    state: 'verified',
    projectionState: 'available',
    mechanism: input.enforcedBy as PresentableSeMechanismV1,
    attestationClass: input.attestationClass,
    effectiveAssurance: input.assurance,
    releaseState,
    note: input.note,
  };
}
