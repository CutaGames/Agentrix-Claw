/**
 * Soul Core Action Trust Loop v1.1 — runtime validation (TL-01.1; R1, R11, R12).
 *
 * Dependency-free, fail-closed validation for the nine contracts and the shared
 * primitives. Mirrors the repo's existing pattern (`validateReleaseManifestV2`,
 * `decodeSoulCoreRefV1`): pure functions, normalized results, no I/O.
 *
 * Fail-closed rules (never silently "pass"):
 *   - an unsupported `schemaVersion` invalidates the record (R1);
 *   - an unrecognized enum value invalidates the record;
 *   - the read helpers ({@link isActiveStatus}, {@link isVerifiedVerdict},
 *     {@link isIndependentExternal}) return the safe/negative answer for any
 *     unknown, stale, or malformed value, so `unknown`/`stale` can never be read
 *     as `active`/`verified`/`independent` (Properties 4 & 5, R4.2, R5.3).
 *   - normalizers degrade an unrecognized value of an enum that HAS `unknown`
 *     down to `'unknown'`, never up to a positive value.
 */

import {
  isKnownEnum,
  MINOR_AMOUNT_PATTERN,
  SUPPORTED_TRUST_LOOP_SCHEMA_VERSIONS,
  DATA_CLASSES,
  DIGEST_ALGORITHMS,
  PARTY_KINDS,
  TRUST_RECORD_TYPES,
  EVIDENCE_KINDS,
  INTEGRITY_TYPES,
  ENFORCEMENT_EVIDENCE_STATES,
} from './trust-loop-primitives';
import type { TrustLoopSchemaVersion } from './trust-loop-primitives';
import { validateActionAttributionV1 } from './agent-attribution';
import {
  ACTION_CONTEXT_LIFECYCLE_STATES,
  ASSERTION_CLASSES,
  CREDENTIAL_STATUSES,
  DISPUTE_STATES,
  EXECUTION_STATUSES,
  INDEPENDENCE_CLASSES,
  REPUTATION_UNCERTAINTY_STATUSES,
  RISK_MODES,
  RISK_RECOMMENDATIONS,
  SETTLEMENT_STATUSES,
  VERDICTS,
  FEEDBACK_RIGHT_KINDS,
  FEEDBACK_RIGHT_STATES,
  TRUST_CONTRACT_NAMES,
} from './trust-loop-contracts';
import type {
  CredentialStatus,
  ExecutionStatus,
  TrustContractName,
} from './trust-loop-contracts';

export interface TrustValidationResult {
  valid: boolean;
  errors: string[];
}

export class TrustValidationError extends Error {
  readonly code = 'trust_validation_error';
  readonly errors: string[];
  constructor(errors: string[]) {
    super(`trust contract validation failed: ${errors.join('; ')}`);
    this.name = 'TrustValidationError';
    this.errors = errors;
  }
}

// ---------------------------------------------------------------------------
// Schema-version guard (fail closed)
// ---------------------------------------------------------------------------

export function isSupportedSchemaVersion(v: unknown): v is TrustLoopSchemaVersion {
  return (
    typeof v === 'string' &&
    (SUPPORTED_TRUST_LOOP_SCHEMA_VERSIONS as readonly string[]).includes(v)
  );
}

/** Throw if the schema version is not understood by this build (R1). */
export function assertSupportedSchemaVersion(v: unknown): TrustLoopSchemaVersion {
  if (!isSupportedSchemaVersion(v)) {
    throw new TrustValidationError([`unsupported schemaVersion: ${JSON.stringify(v)}`]);
  }
  return v;
}

// ---------------------------------------------------------------------------
// Safety read helpers — the heart of the honesty invariants
// ---------------------------------------------------------------------------

/** True ONLY for exactly `active`. Stale / unknown / malformed → false (R5.3, Property 5). */
export function isActiveStatus(status: unknown): boolean {
  return status === 'active';
}

/** True ONLY for exactly `verified`. Unknown / expired / malformed → false (R4.2, Property 4). */
export function isVerifiedVerdict(verdict: unknown): boolean {
  return verdict === 'verified';
}

/** True ONLY for exactly `independent_external` (R4.4, R11.5). */
export function isIndependentExternal(independenceClass: unknown): boolean {
  return independenceClass === 'independent_external';
}

/** Degrade an unrecognized credential status to `unknown` (never up to active). */
export function normalizeCredentialStatus(value: unknown): CredentialStatus {
  return isKnownEnum(value, CREDENTIAL_STATUSES) ? value : 'unknown';
}

/** Degrade an unrecognized execution status to `unknown` (never up to succeeded). */
export function normalizeExecutionStatus(value: unknown): ExecutionStatus {
  return isKnownEnum(value, EXECUTION_STATUSES) ? value : 'unknown';
}

/**
 * A verdict has no `unknown` member; an unrecognized verdict must never be read
 * as a verdict at all. Returns `null` (caller treats null as "not verified").
 */
export function normalizeVerdict(value: unknown): (typeof VERDICTS)[number] | null {
  return isKnownEnum(value, VERDICTS) ? value : null;
}

// ---------------------------------------------------------------------------
// Small structural helpers
// ---------------------------------------------------------------------------

const ISO_DATETIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}
function isTimestamp(v: unknown): boolean {
  return typeof v === 'string' && ISO_DATETIME.test(v);
}

function reqObject(input: unknown, path: string, errors: string[]): Record<string, unknown> | null {
  if (!isObject(input)) {
    errors.push(`${path}: expected object`);
    return null;
  }
  return input;
}
function reqString(o: Record<string, unknown>, key: string, path: string, errors: string[]): void {
  if (!isNonEmptyString(o[key])) errors.push(`${path}.${key}: expected non-empty string`);
}
function optString(o: Record<string, unknown>, key: string, path: string, errors: string[]): void {
  if (o[key] !== undefined && typeof o[key] !== 'string') {
    errors.push(`${path}.${key}: expected string when present`);
  }
}
function reqInt(o: Record<string, unknown>, key: string, path: string, errors: string[]): void {
  if (typeof o[key] !== 'number' || !Number.isInteger(o[key])) {
    errors.push(`${path}.${key}: expected integer`);
  }
}
function reqTimestamp(o: Record<string, unknown>, key: string, path: string, errors: string[]): void {
  if (!isTimestamp(o[key])) errors.push(`${path}.${key}: expected RFC3339 UTC timestamp`);
}
function optTimestamp(o: Record<string, unknown>, key: string, path: string, errors: string[]): void {
  if (o[key] !== undefined && !isTimestamp(o[key])) {
    errors.push(`${path}.${key}: expected RFC3339 UTC timestamp when present`);
  }
}
function reqEnum(
  o: Record<string, unknown>,
  key: string,
  allowed: readonly string[],
  path: string,
  errors: string[],
): void {
  if (!isKnownEnum(o[key], allowed)) {
    errors.push(`${path}.${key}: unrecognized value ${JSON.stringify(o[key])} (fail-closed)`);
  }
}
function reqArray(o: Record<string, unknown>, key: string, path: string, errors: string[]): unknown[] {
  const v = o[key];
  if (!Array.isArray(v)) {
    errors.push(`${path}.${key}: expected array`);
    return [];
  }
  return v;
}
function reqStringArray(o: Record<string, unknown>, key: string, path: string, errors: string[]): void {
  const v = o[key];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) {
    errors.push(`${path}.${key}: expected string[]`);
  }
}

// ---------------------------------------------------------------------------
// Primitive validators
// ---------------------------------------------------------------------------

export function validateDigestRef(input: unknown, path: string, errors: string[]): void {
  const o = reqObject(input, path, errors);
  if (!o) return;
  reqEnum(o, 'algorithm', DIGEST_ALGORITHMS, path, errors);
  reqString(o, 'canonicalization', path, errors);
  if (!/^[0-9a-f]+$/.test(String(o.value ?? ''))) {
    errors.push(`${path}.value: expected lower-case hex digest`);
  }
}

export function validatePartyRef(input: unknown, path: string, errors: string[]): void {
  const o = reqObject(input, path, errors);
  if (!o) return;
  reqEnum(o, 'kind', PARTY_KINDS, path, errors);
  reqString(o, 'id', path, errors);
  optString(o, 'did', path, errors);
  optString(o, 'displayName', path, errors);
  if (o.affiliation !== undefined && !isKnownEnum(o.affiliation, ['internal', 'external', 'unknown'])) {
    errors.push(`${path}.affiliation: unrecognized value (fail-closed)`);
  }
}

export function validateRecordRef(input: unknown, path: string, errors: string[]): void {
  const o = reqObject(input, path, errors);
  if (!o) return;
  reqEnum(o, 'type', TRUST_RECORD_TYPES, path, errors);
  reqString(o, 'id', path, errors);
  if (o.version !== undefined && (typeof o.version !== 'number' || !Number.isInteger(o.version))) {
    errors.push(`${path}.version: expected integer when present`);
  }
  if (o.digest !== undefined) validateDigestRef(o.digest, `${path}.digest`, errors);
}

export function validateMoney(input: unknown, path: string, errors: string[]): void {
  const o = reqObject(input, path, errors);
  if (!o) return;
  if (typeof o.amountMinor !== 'string' || !MINOR_AMOUNT_PATTERN.test(o.amountMinor)) {
    errors.push(`${path}.amountMinor: expected decimal-string integer (never a JS number)`);
  }
  reqString(o, 'currency', path, errors);
  if (typeof o.decimals !== 'number' || !Number.isInteger(o.decimals) || o.decimals < 0) {
    errors.push(`${path}.decimals: expected non-negative integer`);
  }
}

export function validateSignedIntegrity(input: unknown, path: string, errors: string[]): void {
  const o = reqObject(input, path, errors);
  if (!o) return;
  reqEnum(o, 'type', INTEGRITY_TYPES, path, errors);
  validateDigestRef(o.payloadDigest, `${path}.payloadDigest`, errors);
  if (o.type === 'signature') {
    // A signed record must actually carry the signature material.
    reqString(o, 'scheme', path, errors);
    reqString(o, 'keyId', path, errors);
    reqString(o, 'signature', path, errors);
    reqTimestamp(o, 'signedAt', path, errors);
    if (o.signer === undefined) errors.push(`${path}.signer: required when type=signature`);
    else validatePartyRef(o.signer, `${path}.signer`, errors);
  }
}

export function validateEvidenceRef(input: unknown, path: string, errors: string[]): void {
  const o = reqObject(input, path, errors);
  if (!o) return;
  reqString(o, 'evidenceId', path, errors);
  reqEnum(o, 'kind', EVIDENCE_KINDS, path, errors);
  validateDigestRef(o.digest, `${path}.digest`, errors);
  reqEnum(o, 'dataClass', DATA_CLASSES, path, errors);
  reqTimestamp(o, 'createdAt', path, errors);
}

export function validateEnforcementLayerEvidence(input: unknown, path: string, errors: string[]): void {
  const o = reqObject(input, path, errors);
  if (!o) return;
  // EnforcementLayer union lives in authority.ts; validate against known values.
  reqEnum(o, 'layer', ['software', 'onchain-4337', 'SE-tap', 'SE-resident'], path, errors);
  reqEnum(o, 'state', ENFORCEMENT_EVIDENCE_STATES, path, errors);
}

export function validateTrustActionProvenanceV1(input: unknown, path: string, errors: string[]): void {
  const o = reqObject(input, path, errors);
  if (!o) return;
  const attribution = validateActionAttributionV1(o.attribution);
  for (const error of attribution.errors) errors.push(`${path}.${error}`);
  reqEnum(o, 'source', ['action_runtime_task', 'task_proof_v2', 'compatibility_v1'], path, errors);
  reqString(o, 'sourceId', path, errors);
  if (typeof o.cryptographicallyBound !== 'boolean') {
    errors.push(`${path}.cryptographicallyBound: expected boolean`);
  }
  if (o.taskProofRef !== undefined) validateRecordRef(o.taskProofRef, `${path}.taskProofRef`, errors);
  if (o.canonicalProofDigest !== undefined) {
    validateDigestRef(o.canonicalProofDigest, `${path}.canonicalProofDigest`, errors);
  }
  if (o.source === 'task_proof_v2') {
    if (o.cryptographicallyBound !== true) {
      errors.push(`${path}.cryptographicallyBound: TaskProof V2 provenance must be bound`);
    }
    if (o.taskProofRef === undefined || o.canonicalProofDigest === undefined) {
      errors.push(`${path}: TaskProof V2 provenance requires proof ref and digest`);
    }
  }
  if (o.source === 'compatibility_v1' && o.cryptographicallyBound !== false) {
    errors.push(`${path}.cryptographicallyBound: V1 compatibility attribution is never bound`);
  }
}

function validateArrayOf(
  o: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
  itemValidator: (item: unknown, itemPath: string, errors: string[]) => void,
): void {
  const arr = reqArray(o, key, path, errors);
  arr.forEach((item, i) => itemValidator(item, `${path}.${key}[${i}]`, errors));
}

// ---------------------------------------------------------------------------
// Contract validators
// ---------------------------------------------------------------------------

export function validateActionContextV1(input: unknown): TrustValidationResult {
  const errors: string[] = [];
  const o = reqObject(input, '$', errors);
  if (!o) return result(errors);
  if (!isSupportedSchemaVersion(o.schemaVersion)) errors.push('schemaVersion: unsupported (fail-closed)');
  reqString(o, 'contextId', '$', errors);
  reqInt(o, 'contextVersion', '$', errors);
  reqString(o, 'actionId', '$', errors);
  optString(o, 'taskId', '$', errors);
  validatePartyRef(o.actor, '$.actor', errors);
  validatePartyRef(o.agent, '$.agent', errors);
  validatePartyRef(o.owner, '$.owner', errors);
  const intent = reqObject(o.intent, '$.intent', errors);
  if (intent) {
    reqString(intent, 'type', '$.intent', errors);
    validateDigestRef(intent.digest, '$.intent.digest', errors);
  }
  const cap = reqObject(o.capability, '$.capability', errors);
  if (cap) {
    reqString(cap, 'tool', '$.capability', errors);
    reqString(cap, 'operation', '$.capability', errors);
    reqStringArray(cap, 'scope', '$.capability', errors);
  }
  const policy = reqObject(o.policy, '$.policy', errors);
  if (policy) {
    reqString(policy, 'policyRef', '$.policy', errors);
    reqString(policy, 'version', '$.policy', errors);
  }
  validateArrayOf(o, 'enforcementLayers', '$', errors, validateEnforcementLayerEvidence);
  reqEnum(o, 'riskMode', RISK_MODES, '$', errors);
  reqEnum(o, 'privacyClass', DATA_CLASSES, '$', errors);
  reqEnum(o, 'lifecycleState', ACTION_CONTEXT_LIFECYCLE_STATES, '$', errors);
  reqTimestamp(o, 'validFrom', '$', errors);
  optTimestamp(o, 'expiresAt', '$', errors);
  optTimestamp(o, 'authorizedAt', '$', errors);
  if (o.provenance !== undefined) validateTrustActionProvenanceV1(o.provenance, '$.provenance', errors);
  validateDigestRef(o.canonicalDigest, '$.canonicalDigest', errors);
  reqTimestamp(o, 'createdAt', '$', errors);
  validateSignedIntegrity(o.integrity, '$.integrity', errors);
  return result(errors);
}

export function validateOutcomeRecordV1(input: unknown): TrustValidationResult {
  const errors: string[] = [];
  const o = reqObject(input, '$', errors);
  if (!o) return result(errors);
  if (!isSupportedSchemaVersion(o.schemaVersion)) errors.push('schemaVersion: unsupported (fail-closed)');
  reqString(o, 'outcomeId', '$', errors);
  reqString(o, 'actionId', '$', errors);
  reqString(o, 'contextId', '$', errors);
  validateDigestRef(o.contextDigest, '$.contextDigest', errors);
  reqEnum(o, 'executionStatus', EXECUTION_STATUSES, '$', errors);
  const bo = reqObject(o.businessOutcome, '$.businessOutcome', errors);
  if (bo) {
    reqString(bo, 'value', '$.businessOutcome', errors);
    reqEnum(bo, 'assertionClass', ASSERTION_CLASSES, '$.businessOutcome', errors);
  }
  const settlement = reqObject(o.settlement, '$.settlement', errors);
  if (settlement) {
    reqEnum(settlement, 'status', SETTLEMENT_STATUSES, '$.settlement', errors);
    validateArrayOf(settlement, 'settlementRefs', '$.settlement', errors, validateRecordRef);
    if (settlement.actualDebit !== undefined) validateMoney(settlement.actualDebit, '$.settlement.actualDebit', errors);
    if (settlement.net !== undefined) validateMoney(settlement.net, '$.settlement.net', errors);
  }
  validateArrayOf(o, 'artifacts', '$', errors, validateEvidenceRef);
  validatePartyRef(o.producer, '$.producer', errors);
  reqEnum(o, 'assertionClass', ASSERTION_CLASSES, '$', errors);
  if (o.provenance !== undefined) validateTrustActionProvenanceV1(o.provenance, '$.provenance', errors);
  reqTimestamp(o, 'occurredAt', '$', errors);
  reqTimestamp(o, 'recordedAt', '$', errors);
  validateSignedIntegrity(o.integrity, '$.integrity', errors);
  return result(errors);
}

export function validateVerificationResultV1(input: unknown): TrustValidationResult {
  const errors: string[] = [];
  const o = reqObject(input, '$', errors);
  if (!o) return result(errors);
  if (!isSupportedSchemaVersion(o.schemaVersion)) errors.push('schemaVersion: unsupported (fail-closed)');
  reqString(o, 'verificationId', '$', errors);
  validateArrayOf(o, 'subjectRefs', '$', errors, validateRecordRef);
  validatePartyRef(o.verifier, '$.verifier', errors);
  reqEnum(o, 'independenceClass', INDEPENDENCE_CLASSES, '$', errors);
  const method = reqObject(o.method, '$.method', errors);
  if (method) {
    reqString(method, 'id', '$.method', errors);
    reqString(method, 'version', '$.method', errors);
  }
  optString(o, 'challengeId', '$', errors);
  optString(o, 'purpose', '$', errors);
  if ((o.challengeId === undefined) !== (o.purpose === undefined)) {
    errors.push('challengeId/purpose: both required when challenge-bound');
  }
  validateArrayOf(o, 'claims', '$', errors, (item, p, e) => {
    const c = reqObject(item, p, e);
    if (!c) return;
    reqString(c, 'claimId', p, e);
    reqString(c, 'statement', p, e);
    reqString(c, 'scope', p, e);
    reqEnum(c, 'result', VERDICTS, p, e);
  });
  validateArrayOf(o, 'evidenceRefs', '$', errors, validateEvidenceRef);
  reqEnum(o, 'verdict', VERDICTS, '$', errors);
  reqStringArray(o, 'reasonCodes', '$', errors);
  reqTimestamp(o, 'issuedAt', '$', errors);
  optTimestamp(o, 'expiresAt', '$', errors);
  validateSignedIntegrity(o.signature, '$.signature', errors);
  return result(errors);
}

export function validateCredentialStatusV1(input: unknown): TrustValidationResult {
  const errors: string[] = [];
  const o = reqObject(input, '$', errors);
  if (!o) return result(errors);
  if (!isSupportedSchemaVersion(o.schemaVersion)) errors.push('schemaVersion: unsupported (fail-closed)');
  reqString(o, 'statusId', '$', errors);
  validateRecordRef(o.credentialRef, '$.credentialRef', errors);
  reqEnum(o, 'status', CREDENTIAL_STATUSES, '$', errors);
  reqInt(o, 'statusVersion', '$', errors);
  reqTimestamp(o, 'effectiveAt', '$', errors);
  optString(o, 'reasonCode', '$', errors);
  validatePartyRef(o.authority, '$.authority', errors);
  optTimestamp(o, 'nextUpdateAt', '$', errors);
  validateSignedIntegrity(o.integrity, '$.integrity', errors);
  return result(errors);
}

export function validateDisputeCaseV1(input: unknown): TrustValidationResult {
  const errors: string[] = [];
  const o = reqObject(input, '$', errors);
  if (!o) return result(errors);
  if (!isSupportedSchemaVersion(o.schemaVersion)) errors.push('schemaVersion: unsupported (fail-closed)');
  reqString(o, 'disputeId', '$', errors);
  validateArrayOf(o, 'contestedRefs', '$', errors, validateRecordRef);
  validatePartyRef(o.claimant, '$.claimant', errors);
  validateArrayOf(o, 'respondents', '$', errors, validatePartyRef);
  validateArrayOf(o, 'claims', '$', errors, (item, p, e) => {
    const c = reqObject(item, p, e);
    if (!c) return;
    reqString(c, 'claimId', p, e);
    reqString(c, 'statement', p, e);
    validateRecordRef(c.contestedRef, `${p}.contestedRef`, e);
  });
  validateArrayOf(o, 'evidenceRefs', '$', errors, validateEvidenceRef);
  reqEnum(o, 'state', DISPUTE_STATES, '$', errors);
  reqEnum(o, 'privacyClass', DATA_CLASSES, '$', errors);
  reqInt(o, 'version', '$', errors);
  const sla = reqObject(o.sla, '$.sla', errors);
  if (sla) reqTimestamp(sla, 'openedAt', '$.sla', errors);
  validateSignedIntegrity(o.integrity, '$.integrity', errors);
  return result(errors);
}

export function validateReputationCardV1(input: unknown): TrustValidationResult {
  const errors: string[] = [];
  const o = reqObject(input, '$', errors);
  if (!o) return result(errors);
  if (!isSupportedSchemaVersion(o.schemaVersion)) errors.push('schemaVersion: unsupported (fail-closed)');
  reqString(o, 'cardId', '$', errors);
  validatePartyRef(o.subject, '$.subject', errors);
  if (!isObject(o.context)) errors.push('$.context: expected object');
  const win = reqObject(o.window, '$.window', errors);
  if (win) {
    reqTimestamp(win, 'from', '$.window', errors);
    reqTimestamp(win, 'to', '$.window', errors);
  }
  const proj = reqObject(o.projector, '$.projector', errors);
  if (proj) {
    reqString(proj, 'id', '$.projector', errors);
    reqString(proj, 'version', '$.projector', errors);
    validateDigestRef(proj.inputSetDigest, '$.projector.inputSetDigest', errors);
  }
  validateArrayOf(o, 'dimensions', '$', errors, (item, p, e) => {
    const d = reqObject(item, p, e);
    if (!d) return;
    if (typeof d.dimension !== 'string') e.push(`${p}.dimension: expected string`);
    if (!(d.value === null || typeof d.value === 'number')) e.push(`${p}.value: expected number|null`);
    if (typeof d.sampleSize !== 'number' || !Number.isInteger(d.sampleSize)) e.push(`${p}.sampleSize: expected integer`);
  });
  const unc = reqObject(o.uncertainty, '$.uncertainty', errors);
  if (unc) reqEnum(unc, 'status', REPUTATION_UNCERTAINTY_STATUSES, '$.uncertainty', errors);
  reqString(o, 'sourceManifestRef', '$', errors);
  reqTimestamp(o, 'generatedAt', '$', errors);
  validateSignedIntegrity(o.integrity, '$.integrity', errors);
  return result(errors);
}

export function validateAssuranceProfileV1(input: unknown): TrustValidationResult {
  const errors: string[] = [];
  const o = reqObject(input, '$', errors);
  if (!o) return result(errors);
  if (!isSupportedSchemaVersion(o.schemaVersion)) errors.push('schemaVersion: unsupported (fail-closed)');
  reqString(o, 'profileId', '$', errors);
  validatePartyRef(o.subject, '$.subject', errors);
  const assuranceClaim = (item: unknown, p: string, e: string[]): void => {
    const c = reqObject(item, p, e);
    if (!c) return;
    reqString(c, 'claimId', p, e);
    reqString(c, 'category', p, e);
    reqEnum(c, 'state', ENFORCEMENT_EVIDENCE_STATES, p, e);
  };
  validateArrayOf(o, 'identity', '$', errors, assuranceClaim);
  validateArrayOf(o, 'execution', '$', errors, assuranceClaim);
  validateArrayOf(o, 'enforcementLayers', '$', errors, validateEnforcementLayerEvidence);
  validateArrayOf(o, 'verificationIndependence', '$', errors, assuranceClaim);
  const fresh = reqObject(o.freshness, '$.freshness', errors);
  if (fresh) reqTimestamp(fresh, 'evaluatedAt', '$.freshness', errors);
  const evaluator = reqObject(o.evaluator, '$.evaluator', errors);
  if (evaluator) {
    reqString(evaluator, 'id', '$.evaluator', errors);
    reqString(evaluator, 'version', '$.evaluator', errors);
  }
  reqTimestamp(o, 'generatedAt', '$', errors);
  validateSignedIntegrity(o.integrity, '$.integrity', errors);
  return result(errors);
}

export function validateRiskDecisionV1(input: unknown): TrustValidationResult {
  const errors: string[] = [];
  const o = reqObject(input, '$', errors);
  if (!o) return result(errors);
  if (!isSupportedSchemaVersion(o.schemaVersion)) errors.push('schemaVersion: unsupported (fail-closed)');
  reqString(o, 'decisionId', '$', errors);
  reqString(o, 'actionId', '$', errors);
  reqString(o, 'contextId', '$', errors);
  reqEnum(o, 'mode', RISK_MODES, '$', errors);
  const engine = reqObject(o.engine, '$.engine', errors);
  if (engine) {
    reqString(engine, 'id', '$.engine', errors);
    reqString(engine, 'version', '$.engine', errors);
  }
  validateArrayOf(o, 'inputSnapshotRefs', '$', errors, validateRecordRef);
  reqEnum(o, 'recommendation', RISK_RECOMMENDATIONS, '$', errors);
  if (!isObject(o.ownerPolicyCeiling)) errors.push('$.ownerPolicyCeiling: expected object');
  reqStringArray(o, 'reasonCodes', '$', errors);
  reqTimestamp(o, 'createdAt', '$', errors);
  validateSignedIntegrity(o.integrity, '$.integrity', errors);
  return result(errors);
}

export function validateFeedbackRightV1(input: unknown): TrustValidationResult {
  const errors: string[] = [];
  const o = reqObject(input, '$', errors);
  if (!o) return result(errors);
  if (!isSupportedSchemaVersion(o.schemaVersion)) errors.push('schemaVersion: unsupported (fail-closed)');
  reqString(o, 'feedbackRightId', '$', errors);
  validatePartyRef(o.subject, '$.subject', errors);
  validateArrayOf(o, 'triggerRefs', '$', errors, validateRecordRef);
  const rights = reqArray(o, 'rights', '$', errors);
  rights.forEach((r, i) => {
    if (!isKnownEnum(r, FEEDBACK_RIGHT_KINDS)) {
      errors.push(`$.rights[${i}]: unrecognized right ${JSON.stringify(r)} (fail-closed)`);
    }
  });
  reqEnum(o, 'state', FEEDBACK_RIGHT_STATES, '$', errors);
  reqString(o, 'channel', '$', errors);
  reqInt(o, 'version', '$', errors);
  validatePartyRef(o.authority, '$.authority', errors);
  reqTimestamp(o, 'createdAt', '$', errors);
  validateSignedIntegrity(o.integrity, '$.integrity', errors);
  return result(errors);
}

// ---------------------------------------------------------------------------
// Registry + generic entry point
// ---------------------------------------------------------------------------

export const TRUST_CONTRACT_VALIDATORS: Record<
  TrustContractName,
  (input: unknown) => TrustValidationResult
> = {
  ActionContextV1: validateActionContextV1,
  OutcomeRecordV1: validateOutcomeRecordV1,
  VerificationResultV1: validateVerificationResultV1,
  CredentialStatusV1: validateCredentialStatusV1,
  DisputeCaseV1: validateDisputeCaseV1,
  ReputationCardV1: validateReputationCardV1,
  AssuranceProfileV1: validateAssuranceProfileV1,
  RiskDecisionV1: validateRiskDecisionV1,
  FeedbackRightV1: validateFeedbackRightV1,
};

export function isTrustContractName(name: unknown): name is TrustContractName {
  return isKnownEnum(name, TRUST_CONTRACT_NAMES);
}

/** Validate any contract by name. An unknown contract name fails closed. */
export function validateTrustContract(name: TrustContractName, input: unknown): TrustValidationResult {
  const validator = TRUST_CONTRACT_VALIDATORS[name];
  if (!validator) {
    return { valid: false, errors: [`unknown contract: ${String(name)}`] };
  }
  return validator(input);
}

function result(errors: string[]): TrustValidationResult {
  return { valid: errors.length === 0, errors };
}
