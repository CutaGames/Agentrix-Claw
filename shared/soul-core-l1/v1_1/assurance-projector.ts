import {
  isRecordRefV1,
} from '../../types/agent-attribution';
import {
  SOUL_CORE_ASSURANCE_SCHEMA_VERSION,
  validateAssuranceMechanismEvidenceV1,
  validateSoulCoreAssuranceViewV1,
  type AssuranceMechanismEvidenceV1,
  type AssuranceProjectionStateV1,
  type AssuranceReleaseStateV1,
  type SoulCoreAssuranceViewV1,
} from '../../types/soul-core-assurance';
import type { RecordRef } from '../../types/trust-loop-primitives';

/** T23 canonical execution-assurance wire values. */
export const CANONICAL_ASSURANCE_MECHANISMS_V1 = [
  'SE-tap',
  'onchain-4337',
  'SE-resident',
] as const;
export type CanonicalAssuranceMechanismV1 =
  (typeof CANONICAL_ASSURANCE_MECHANISMS_V1)[number];

export type AssuranceEvidenceSourceKindV1 =
  | 'soul-core-card'
  | 'authority-control-plane'
  | 'secure-resident-host'
  | 'ordinary-embodiment';

export type AssuranceAttestationClassV1 =
  | 'self-attested'
  | 'development'
  | 'pilot'
  | 'certified-production';

export interface AssuranceProjectionEvidenceInputV1 {
  evidence: AssuranceMechanismEvidenceV1;
  sourceKind: AssuranceEvidenceSourceKindV1;
  attestationClass: AssuranceAttestationClassV1;
  /** Required for SE-resident and must also be present in evidence.sourceRefs. */
  secureResidentHostEvidenceRef?: RecordRef;
}

export interface ProjectSoulCoreAssuranceInputV1 {
  evidence: AssuranceProjectionEvidenceInputV1[];
  requestedReleaseState: AssuranceReleaseStateV1;
}

export class SoulCoreAssuranceProjectionError extends Error {
  readonly code = 'soul_core_assurance_projection_invalid';
  readonly errors: string[];

  constructor(errors: string[]) {
    super(`Soul Core assurance projection invalid: ${errors.join('; ')}`);
    this.name = 'SoulCoreAssuranceProjectionError';
    this.errors = errors;
  }
}

const CANONICAL_MECHANISM_SET = new Set<string>(CANONICAL_ASSURANCE_MECHANISMS_V1);
const RELEASE_RANK: Record<AssuranceReleaseStateV1, number> = {
  disabled: 0,
  internal: 1,
  pilot: 2,
  production: 3,
};
const RELEASE_BY_RANK: AssuranceReleaseStateV1[] = [
  'disabled',
  'internal',
  'pilot',
  'production',
];

function refsEqual(left: RecordRef, right: RecordRef): boolean {
  return (
    left.type === right.type &&
    left.id === right.id &&
    left.version === right.version &&
    left.digest?.algorithm === right.digest?.algorithm &&
    left.digest?.canonicalization === right.digest?.canonicalization &&
    left.digest?.value === right.digest?.value
  );
}

function sourceAllowsMechanism(
  sourceKind: AssuranceEvidenceSourceKindV1,
  mechanism: CanonicalAssuranceMechanismV1,
): boolean {
  if (mechanism === 'SE-tap') return sourceKind === 'soul-core-card';
  if (mechanism === 'SE-resident') return sourceKind === 'secure-resident-host';
  return sourceKind === 'authority-control-plane';
}

function projectionState(mechanisms: AssuranceMechanismEvidenceV1[]): AssuranceProjectionStateV1 {
  if (mechanisms.length === 0 || mechanisms.every((item) => item.state === 'not-configured')) {
    return 'not-configured';
  }
  if (mechanisms.some((item) => item.state === 'unavailable' || item.state === 'revoked')) {
    return 'unavailable';
  }
  if (mechanisms.some((item) => item.state === 'stale')) return 'stale';
  return 'available';
}

function evidenceReleaseRank(item: AssuranceProjectionEvidenceInputV1): number {
  const { evidence, attestationClass } = item;
  if (evidence.state !== 'verified-active' || !evidence.fresh) return RELEASE_RANK.internal;

  const attestationRank =
    attestationClass === 'certified-production'
      ? RELEASE_RANK.production
      : attestationClass === 'pilot'
        ? RELEASE_RANK.pilot
        : RELEASE_RANK.internal;
  const levelRank =
    evidence.evidenceLevel === 'certified-production'
      ? RELEASE_RANK.production
      : evidence.evidenceLevel === 'pilot-hardware'
        ? RELEASE_RANK.pilot
        : RELEASE_RANK.internal;
  const environmentRank =
    evidence.environment === 'production'
      ? RELEASE_RANK.production
      : evidence.environment === 'pilot'
        ? RELEASE_RANK.pilot
        : RELEASE_RANK.internal;
  return Math.min(attestationRank, levelRank, environmentRank);
}

function capReleaseState(
  requested: AssuranceReleaseStateV1,
  evidence: AssuranceProjectionEvidenceInputV1[],
): AssuranceReleaseStateV1 {
  if (requested === 'disabled' || evidence.length === 0) return 'disabled';
  const maximum = Math.min(...evidence.map(evidenceReleaseRank));
  return RELEASE_BY_RANK[Math.min(RELEASE_RANK[requested], maximum)];
}

/**
 * Projects mechanism evidence only. It deliberately has no Receipt, lineage,
 * Remedy, reputation or responsibility-decision output.
 */
export function projectSoulCoreAssuranceV1(
  input: ProjectSoulCoreAssuranceInputV1,
): SoulCoreAssuranceViewV1 {
  const errors: string[] = [];
  if (!Array.isArray(input.evidence)) {
    throw new SoulCoreAssuranceProjectionError(['evidence: expected array']);
  }
  if (!(input.requestedReleaseState in RELEASE_RANK)) {
    errors.push('requestedReleaseState: unknown release state');
  }

  const seen = new Set<string>();
  for (const [index, item] of input.evidence.entries()) {
    const path = `evidence[${index}]`;
    if (!item || typeof item !== 'object') {
      errors.push(`${path}: expected object`);
      continue;
    }
    const validation = validateAssuranceMechanismEvidenceV1(item.evidence);
    errors.push(...validation.errors.map((error) => `${path}.${error}`));
    const mechanism = item.evidence?.mechanism;
    if (!CANONICAL_MECHANISM_SET.has(mechanism)) {
      errors.push(`${path}.mechanism: non-canonical wire value ${String(mechanism)}`);
      continue;
    }
    if (seen.has(mechanism)) errors.push(`${path}.mechanism: duplicate ${mechanism}`);
    seen.add(mechanism);

    const canonicalMechanism = mechanism as CanonicalAssuranceMechanismV1;
    if (!sourceAllowsMechanism(item.sourceKind, canonicalMechanism)) {
      errors.push(`${path}.sourceKind: cannot assert ${canonicalMechanism}`);
    }
    if (canonicalMechanism === 'SE-resident') {
      if (!isRecordRefV1(item.secureResidentHostEvidenceRef)) {
        errors.push(`${path}.secureResidentHostEvidenceRef: required for SE-resident`);
      } else if (!item.evidence.sourceRefs.some((ref) => refsEqual(ref, item.secureResidentHostEvidenceRef!))) {
        errors.push(`${path}.secureResidentHostEvidenceRef: must be digest-bound in sourceRefs`);
      }
    } else if (item.secureResidentHostEvidenceRef !== undefined) {
      errors.push(`${path}.secureResidentHostEvidenceRef: only valid for SE-resident`);
    }
  }
  if (errors.length > 0) throw new SoulCoreAssuranceProjectionError(errors);

  const mechanisms = input.evidence.map((item) => ({ ...item.evidence }));
  const freshActive = (mechanism: CanonicalAssuranceMechanismV1): boolean =>
    input.evidence.some(
      (item) =>
        item.evidence.mechanism === mechanism &&
        item.evidence.state === 'verified-active' &&
        item.evidence.fresh &&
        item.attestationClass !== 'self-attested',
    );
  const effectiveAssurance = freshActive('SE-resident')
    ? 'hardware-resident' as const
    : freshActive('SE-tap')
      ? 'hardware-backed' as const
      : 'software-baseline' as const;

  const view: SoulCoreAssuranceViewV1 = {
    schemaVersion: SOUL_CORE_ASSURANCE_SCHEMA_VERSION,
    projectionState: projectionState(mechanisms),
    mechanisms,
    effectiveAssurance,
    releaseState: capReleaseState(input.requestedReleaseState, input.evidence),
  };
  const validation = validateSoulCoreAssuranceViewV1(view);
  if (!validation.valid) throw new SoulCoreAssuranceProjectionError(validation.errors);
  return view;
}
