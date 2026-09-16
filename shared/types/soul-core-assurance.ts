import {
  isAuthorityRootRefV1,
  isRecordRefV1,
  type AgentSoulContractValidationResultV1,
  type AuthorityRootRefV1,
} from './agent-attribution';
import type { RecordRef } from './trust-loop-primitives';

/** ADR-SOUL-002 per-mechanism assurance, Embodiment and optional Host contract. */
export const SOUL_CORE_ASSURANCE_SCHEMA_VERSION = 1 as const;
export const AGENT_EMBODIMENT_SCHEMA_VERSION = 1 as const;
export const HOST_ASSURANCE_BINDING_SCHEMA_VERSION = 1 as const;

export const ASSURANCE_MECHANISMS_V1 = [
  'software-policy',
  'platform-enforcement',
  'onchain-4337',
  'SE-tap',
  'SE-resident',
] as const;
export type AssuranceMechanismV1 = (typeof ASSURANCE_MECHANISMS_V1)[number];

export const ASSURANCE_MECHANISM_STATES_V1 = [
  'not-configured',
  'declared-only',
  'verified-active',
  'degraded',
  'stale',
  'unavailable',
  'revoked',
] as const;
export type AssuranceMechanismStateV1 = (typeof ASSURANCE_MECHANISM_STATES_V1)[number];

export const ASSURANCE_EVIDENCE_LEVELS_V1 = [
  'configuration-only',
  'protocol-only',
  'simulator',
  'development-hardware',
  'pilot-hardware',
  'certified-production',
] as const;
export type AssuranceEvidenceLevelV1 = (typeof ASSURANCE_EVIDENCE_LEVELS_V1)[number];

export const ASSURANCE_ENVIRONMENTS_V1 = [
  'local',
  'test',
  'testnet',
  'pilot',
  'production',
] as const;
export type AssuranceEnvironmentV1 = (typeof ASSURANCE_ENVIRONMENTS_V1)[number];

export interface AssuranceMechanismEvidenceV1 {
  mechanism: AssuranceMechanismV1;
  state: AssuranceMechanismStateV1;
  scope: string[];
  evidenceLevel: AssuranceEvidenceLevelV1;
  environment: AssuranceEnvironmentV1;
  sourceRefs: RecordRef[];
  verifierRef?: RecordRef;
  verifiedAt?: string;
  nextUpdateAt?: string;
  fresh: boolean;
  canProve: string[];
  cannotProve: string[];
}

export const ASSURANCE_PROJECTION_STATES_V1 = [
  'available',
  'not-configured',
  'unavailable',
  'stale',
  'redacted',
] as const;
export type AssuranceProjectionStateV1 = (typeof ASSURANCE_PROJECTION_STATES_V1)[number];

export type EffectiveAssuranceV1 =
  | 'software-baseline'
  | 'hardware-backed'
  | 'hardware-resident';
export type AssuranceReleaseStateV1 = 'disabled' | 'internal' | 'pilot' | 'production';

export interface SoulCoreAssuranceViewV1 {
  schemaVersion: typeof SOUL_CORE_ASSURANCE_SCHEMA_VERSION;
  projectionState: AssuranceProjectionStateV1;
  mechanisms: AssuranceMechanismEvidenceV1[];
  effectiveAssurance: EffectiveAssuranceV1;
  releaseState: AssuranceReleaseStateV1;
}

export interface AgentEmbodimentViewV1 {
  schemaVersion: typeof AGENT_EMBODIMENT_SCHEMA_VERSION;
  agentId: string;
  activeShellBindingRefs: RecordRef[];
  primaryShellBindingRef?: RecordRef;
}

export const HOST_ASSURANCE_BINDING_STATUSES_V1 = [
  'pending',
  'active',
  'suspended',
  'stale',
  'unavailable',
  'revoked',
  'compromised',
  'expired',
] as const;
export type HostAssuranceBindingStatusV1 =
  (typeof HOST_ASSURANCE_BINDING_STATUSES_V1)[number];

/**
 * Host identity/lifecycle is independent from Shell embodiment. A Shell ref is
 * optional and never creates or upgrades this binding.
 */
export interface HostAssuranceBindingV1 {
  schemaVersion: typeof HOST_ASSURANCE_BINDING_SCHEMA_VERSION;
  bindingId: string;
  authorityRootRef: AuthorityRootRefV1;
  hostId: string;
  deviceId: string;
  profileRef: string;
  mechanisms: AssuranceMechanismV1[];
  scope: string[];
  policyRef: string;
  shellBindingRef?: RecordRef;
  assuranceEvidenceRef: RecordRef;
  issuedAt: string;
  expiresAt?: string;
  status: HostAssuranceBindingStatusV1;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isUniqueStringArray(value: unknown, allowEmpty = true): value is string[] {
  return (
    Array.isArray(value) &&
    (allowEmpty || value.length > 0) &&
    value.every(isNonEmptyString) &&
    new Set(value).size === value.length
  );
}

function result(errors: string[]): AgentSoulContractValidationResultV1 {
  return { valid: errors.length === 0, errors };
}

export function validateAssuranceMechanismEvidenceV1(
  input: unknown,
): AgentSoulContractValidationResultV1 {
  const errors: string[] = [];
  if (!isObject(input)) return result(['evidence: expected object']);

  if (!(ASSURANCE_MECHANISMS_V1 as readonly unknown[]).includes(input.mechanism)) {
    errors.push('evidence.mechanism: unknown mechanism');
  }
  if (!(ASSURANCE_MECHANISM_STATES_V1 as readonly unknown[]).includes(input.state)) {
    errors.push('evidence.state: unknown state');
  }
  if (!(ASSURANCE_EVIDENCE_LEVELS_V1 as readonly unknown[]).includes(input.evidenceLevel)) {
    errors.push('evidence.evidenceLevel: unknown evidence level');
  }
  if (!(ASSURANCE_ENVIRONMENTS_V1 as readonly unknown[]).includes(input.environment)) {
    errors.push('evidence.environment: unknown environment');
  }
  if (!isUniqueStringArray(input.scope, false)) {
    errors.push('evidence.scope: expected non-empty unique string array');
  }
  if (!Array.isArray(input.sourceRefs) || !input.sourceRefs.every(isRecordRefV1)) {
    errors.push('evidence.sourceRefs: expected known RecordRef array');
  }
  if (input.verifierRef !== undefined && !isRecordRefV1(input.verifierRef)) {
    errors.push('evidence.verifierRef: expected known RecordRef when present');
  }
  if (input.verifiedAt !== undefined && !isTimestamp(input.verifiedAt)) {
    errors.push('evidence.verifiedAt: expected valid timestamp when present');
  }
  if (input.nextUpdateAt !== undefined && !isTimestamp(input.nextUpdateAt)) {
    errors.push('evidence.nextUpdateAt: expected valid timestamp when present');
  }
  if (typeof input.fresh !== 'boolean') errors.push('evidence.fresh: expected boolean');
  if (!isUniqueStringArray(input.canProve)) {
    errors.push('evidence.canProve: expected unique string array');
  }
  if (!isUniqueStringArray(input.cannotProve)) {
    errors.push('evidence.cannotProve: expected unique string array');
  }

  if (input.state === 'verified-active') {
    if (input.fresh !== true) errors.push('evidence.fresh: verified-active evidence must be fresh');
    if (!Array.isArray(input.sourceRefs) || input.sourceRefs.length === 0) {
      errors.push('evidence.sourceRefs: verified-active evidence requires a source');
    }
    if (!isTimestamp(input.verifiedAt)) {
      errors.push('evidence.verifiedAt: verified-active evidence requires verification time');
    }
  }
  if (
    ['not-configured', 'stale', 'unavailable', 'revoked'].includes(String(input.state)) &&
    input.fresh === true
  ) {
    errors.push('evidence.fresh: inactive/stale evidence cannot be fresh');
  }
  if (input.evidenceLevel === 'certified-production' && input.environment !== 'production') {
    errors.push('evidence.environment: certified-production evidence requires production');
  }

  return result(errors);
}

export function validateSoulCoreAssuranceViewV1(
  input: unknown,
): AgentSoulContractValidationResultV1 {
  const errors: string[] = [];
  if (!isObject(input)) return result(['assurance: expected object']);

  if (input.schemaVersion !== SOUL_CORE_ASSURANCE_SCHEMA_VERSION) {
    errors.push(`assurance.schemaVersion: unsupported version ${JSON.stringify(input.schemaVersion)}`);
  }
  if (!(ASSURANCE_PROJECTION_STATES_V1 as readonly unknown[]).includes(input.projectionState)) {
    errors.push('assurance.projectionState: unknown state');
  }
  const effective = ['software-baseline', 'hardware-backed', 'hardware-resident'];
  if (!effective.includes(String(input.effectiveAssurance))) {
    errors.push('assurance.effectiveAssurance: unknown value');
  }
  const releases = ['disabled', 'internal', 'pilot', 'production'];
  if (!releases.includes(String(input.releaseState))) {
    errors.push('assurance.releaseState: unknown value');
  }
  if (!Array.isArray(input.mechanisms)) {
    errors.push('assurance.mechanisms: expected array');
    return result(errors);
  }
  const mechanisms = input.mechanisms;

  const seen = new Set<string>();
  for (const mechanism of mechanisms) {
    const validation = validateAssuranceMechanismEvidenceV1(mechanism);
    errors.push(...validation.errors.map((error) => `assurance.mechanisms: ${error}`));
    if (isObject(mechanism) && typeof mechanism.mechanism === 'string') {
      if (seen.has(mechanism.mechanism)) {
        errors.push(`assurance.mechanisms: duplicate mechanism ${mechanism.mechanism}`);
      }
      seen.add(mechanism.mechanism);
    }
  }

  const hasFreshActive = (mechanism: AssuranceMechanismV1): boolean =>
    mechanisms.some(
      (entry) =>
        isObject(entry) &&
        entry.mechanism === mechanism &&
        entry.state === 'verified-active' &&
        entry.fresh === true,
    );
  if (
    input.effectiveAssurance === 'hardware-backed' &&
    !hasFreshActive('SE-tap') &&
    !hasFreshActive('SE-resident')
  ) {
    errors.push('assurance.effectiveAssurance: hardware-backed requires fresh active SE evidence');
  }
  if (
    input.effectiveAssurance === 'hardware-resident' &&
    !hasFreshActive('SE-resident')
  ) {
    errors.push('assurance.effectiveAssurance: hardware-resident requires fresh active SE-resident evidence');
  }

  return result(errors);
}

export function validateAgentEmbodimentViewV1(
  input: unknown,
): AgentSoulContractValidationResultV1 {
  const errors: string[] = [];
  if (!isObject(input)) return result(['embodiment: expected object']);
  if (input.schemaVersion !== AGENT_EMBODIMENT_SCHEMA_VERSION) {
    errors.push(`embodiment.schemaVersion: unsupported version ${JSON.stringify(input.schemaVersion)}`);
  }
  if (!isNonEmptyString(input.agentId)) errors.push('embodiment.agentId: expected non-empty string');
  const activeShellBindingRefs = input.activeShellBindingRefs;
  if (!Array.isArray(activeShellBindingRefs) || !activeShellBindingRefs.every(isRecordRefV1)) {
    errors.push('embodiment.activeShellBindingRefs: expected known RecordRef array');
  }
  const primaryShellBindingRef = input.primaryShellBindingRef;
  if (primaryShellBindingRef !== undefined && !isRecordRefV1(primaryShellBindingRef)) {
    errors.push('embodiment.primaryShellBindingRef: expected known RecordRef when present');
  }
  if (
    isRecordRefV1(primaryShellBindingRef) &&
    Array.isArray(activeShellBindingRefs) &&
    !activeShellBindingRefs.some(
      (ref) =>
        isRecordRefV1(ref) &&
        ref.type === primaryShellBindingRef.type &&
        ref.id === primaryShellBindingRef.id &&
        ref.version === primaryShellBindingRef.version,
    )
  ) {
    errors.push('embodiment.primaryShellBindingRef: primary binding must be active');
  }
  return result(errors);
}

export function validateHostAssuranceBindingV1(
  input: unknown,
  now?: string,
): AgentSoulContractValidationResultV1 {
  const errors: string[] = [];
  if (!isObject(input)) return result(['hostBinding: expected object']);

  if (input.schemaVersion !== HOST_ASSURANCE_BINDING_SCHEMA_VERSION) {
    errors.push(`hostBinding.schemaVersion: unsupported version ${JSON.stringify(input.schemaVersion)}`);
  }
  for (const key of ['bindingId', 'hostId', 'deviceId', 'profileRef', 'policyRef'] as const) {
    if (!isNonEmptyString(input[key])) errors.push(`hostBinding.${key}: expected non-empty string`);
  }
  if (!isAuthorityRootRefV1(input.authorityRootRef)) {
    errors.push('hostBinding.authorityRootRef: unknown kind or malformed reference');
  }
  if (
    !Array.isArray(input.mechanisms) ||
    input.mechanisms.length === 0 ||
    !input.mechanisms.every((value) =>
      (ASSURANCE_MECHANISMS_V1 as readonly unknown[]).includes(value),
    ) ||
    new Set(input.mechanisms).size !== input.mechanisms.length
  ) {
    errors.push('hostBinding.mechanisms: expected non-empty unique canonical mechanism array');
  }
  if (!isUniqueStringArray(input.scope, false)) {
    errors.push('hostBinding.scope: expected non-empty unique string array');
  }
  if (input.shellBindingRef !== undefined && !isRecordRefV1(input.shellBindingRef)) {
    errors.push('hostBinding.shellBindingRef: expected known RecordRef when present');
  }
  if (!isRecordRefV1(input.assuranceEvidenceRef)) {
    errors.push('hostBinding.assuranceEvidenceRef: expected known RecordRef');
  }
  if (!isTimestamp(input.issuedAt)) errors.push('hostBinding.issuedAt: expected valid timestamp');
  if (input.expiresAt !== undefined && !isTimestamp(input.expiresAt)) {
    errors.push('hostBinding.expiresAt: expected valid timestamp when present');
  }
  if (
    isTimestamp(input.issuedAt) &&
    isTimestamp(input.expiresAt) &&
    Date.parse(input.issuedAt) >= Date.parse(input.expiresAt)
  ) {
    errors.push('hostBinding.expiresAt: must be after issuedAt');
  }
  if (!(HOST_ASSURANCE_BINDING_STATUSES_V1 as readonly unknown[]).includes(input.status)) {
    errors.push('hostBinding.status: unknown status');
  }
  if (
    input.status === 'active' &&
    (!Array.isArray(input.mechanisms) || !input.mechanisms.includes('SE-resident'))
  ) {
    errors.push('hostBinding.mechanisms: active Secure Host requires SE-resident');
  }
  if (
    now !== undefined &&
    (!isTimestamp(now) ||
      (input.status === 'active' &&
        isTimestamp(input.expiresAt) &&
        Date.parse(now) >= Date.parse(input.expiresAt)))
  ) {
    errors.push('hostBinding: active binding is expired or validation time is invalid');
  }
  return result(errors);
}
