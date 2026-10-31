import {
  TRUST_LOOP_CANONICALIZATION,
  canonicalizeJson,
  computeDigest,
  verifyDigest,
  type DigestRef,
} from './trust-loop-primitives';
import type { AgentPortabilitySchemaVersion } from './agent-portability';

/**
 * Soul Key envelope V1 (SK-M1).
 *
 * Scope and non-scope, stated explicitly because adjacent work is easy to
 * mistake for this one:
 *
 *   IN  — envelope/AAD/recovery-slot contract for encrypting the portable
 *         Soul payload (`SovereignAgentPackageV1`) under an owner-held key.
 *   OUT — Soul Chip / L1 applet signing, APDU secure messaging, attestation,
 *         wallet MPC/Shamir custody, Continuity restore orchestration. None of
 *         those are Soul Key and none of them may be used to claim SK progress.
 *
 * Hard invariants:
 *   1. This contract carries NO key material. Only per-slot wrapped data keys.
 *      A Soul Root Key, KEK, or DEK must never be serialized into an envelope.
 *   2. Every identity/ownership/version fact lives in `binding`, and `binding`
 *      is the AEAD additional authenticated data. Changing any bound field
 *      makes decryption fail rather than silently succeed on another Soul.
 *   3. Unknown schema version, unknown algorithm, unknown field, malformed
 *      base64, duplicate/empty slots and digest mismatch all fail closed.
 *   4. `evidence.level: 'real'` requires an external attestation ref. Fixtures
 *      cannot be relabelled as real.
 *
 * This module is dependency-free (beyond the shared primitives) so Web, Mobile,
 * Desktop, Backend and an alternate runtime can all validate the same bytes.
 */

export const SOUL_KEY_ENVELOPE_SCHEMA_VERSION = '1.0' as const;
export type SoulKeyEnvelopeSchemaVersion = typeof SOUL_KEY_ENVELOPE_SCHEMA_VERSION;

export const SUPPORTED_SOUL_KEY_ENVELOPE_SCHEMA_VERSIONS = [
  SOUL_KEY_ENVELOPE_SCHEMA_VERSION,
] as const;

export const SOUL_KEY_CANONICALIZATION = TRUST_LOOP_CANONICALIZATION;

export const SOUL_KEY_AEAD_ALGORITHMS = ['AES-256-GCM'] as const;
export type SoulKeyAeadAlgorithm = (typeof SOUL_KEY_AEAD_ALGORITHMS)[number];

export const SOUL_KEY_KDFS = ['HKDF-SHA-256'] as const;
export type SoulKeyKdf = (typeof SOUL_KEY_KDFS)[number];

/**
 * Slot kinds are an assurance ladder, not interchangeable labels. A software
 * recovery kit must never be recorded as hardware-resident.
 */
export const SOUL_KEY_RECOVERY_SLOT_KINDS = [
  'recovery_kit',
  'device',
  'guardian_share',
  'platform_kms',
  'hardware_wrapped',
  'hardware_resident',
] as const;
export type SoulKeyRecoverySlotKind = (typeof SOUL_KEY_RECOVERY_SLOT_KINDS)[number];

/** Slot kinds that SK-M2 (software bounded preview) is allowed to produce. */
export const SOUL_KEY_SOFTWARE_SLOT_KINDS: readonly SoulKeyRecoverySlotKind[] = [
  'recovery_kit',
  'device',
  'guardian_share',
];

export const SOUL_KEY_ENVIRONMENTS = ['local', 'test', 'staging', 'production'] as const;
export type SoulKeyEnvironment = (typeof SOUL_KEY_ENVIRONMENTS)[number];

export const SOUL_KEY_EVIDENCE_LEVELS = ['local_fixture', 'real'] as const;
export type SoulKeyEvidenceLevel = (typeof SOUL_KEY_EVIDENCE_LEVELS)[number];

export interface SoulKeyEvidenceV1 {
  level: SoulKeyEvidenceLevel;
  /** Required when level === 'real'. Opaque ref to out-of-band attestation. */
  attestationRef?: string;
}

/**
 * Everything that must be cryptographically bound to the ciphertext. This is
 * serialized canonically and used verbatim as AEAD additional data.
 */
export interface SoulKeyEnvelopeBindingV1 {
  soulCoreId: string;
  agentId: string;
  ownerPrincipalRef: string;
  tenantRef: string;
  environment: SoulKeyEnvironment;
  /** Portability schema version of the encrypted payload. */
  packageSchemaVersion: AgentPortabilitySchemaVersion;
  packageId: string;
  /** Portability's own package digest. Never re-domained here. */
  packageDigest: DigestRef;
  /** Monotonic per-Soul snapshot counter; blocks rollback/replacement. */
  snapshotSequence: number;
  /** Ownership epoch at seal time; blocks stale-owner restore. */
  ownershipEpoch: number;
  /** Soul Key version at seal time; advances on rotation. */
  keyVersion: number;
}

export interface SoulKeyRecoverySlotV1 {
  slotId: string;
  kind: SoulKeyRecoverySlotKind;
  kdf: SoulKeyKdf;
  wrapAlgorithm: SoulKeyAeadAlgorithm;
  /** base64 */
  salt: string;
  /** base64 */
  iv: string;
  /** base64 — wrapped data key. NOT the data key. */
  wrappedKey: string;
  /** base64 */
  authTag: string;
  createdAt: string;
  revokedAt?: string | null;
}

export interface SoulKeyEnvelopeV1 {
  schemaVersion: SoulKeyEnvelopeSchemaVersion;
  envelopeId: string;
  algorithm: SoulKeyAeadAlgorithm;
  canonicalization: typeof SOUL_KEY_CANONICALIZATION;
  createdAt: string;
  binding: SoulKeyEnvelopeBindingV1;
  /** base64 */
  iv: string;
  /** base64 */
  ciphertext: string;
  /** base64 */
  authTag: string;
  /** Digest over the base64 ciphertext; recomputed on open. */
  ciphertextDigest: DigestRef;
  recoverySlots: SoulKeyRecoverySlotV1[];
  evidence: SoulKeyEvidenceV1;
}

export type SoulKeyFailureCode =
  | 'unknown_schema_version'
  | 'unknown_algorithm'
  | 'unknown_kdf'
  | 'unknown_slot_kind'
  | 'unknown_field'
  | 'missing_field'
  | 'malformed_base64'
  | 'malformed_timestamp'
  | 'malformed_binding'
  | 'ciphertext_digest_mismatch'
  | 'package_digest_mismatch'
  | 'no_usable_recovery_slot'
  | 'duplicate_slot_id'
  | 'slot_revoked'
  | 'slot_not_found'
  | 'wrong_secret_or_slot'
  | 'tampered_ciphertext'
  | 'cross_owner'
  | 'cross_tenant'
  | 'cross_soul'
  | 'wrong_environment'
  | 'stale_ownership_epoch'
  | 'snapshot_rollback'
  | 'key_version_downgrade'
  | 'evidence_level_not_substantiated'
  | 'forbidden_credential_present'
  | 'partial_restore';

export class SoulKeyEnvelopeError extends Error {
  public readonly code: SoulKeyFailureCode;
  public readonly detail?: string;

  constructor(code: SoulKeyFailureCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'SoulKeyEnvelopeError';
    this.code = code;
    this.detail = detail;
  }
}

export type SoulKeyResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: SoulKeyFailureCode; detail?: string };

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

const BINDING_FIELDS: readonly (keyof SoulKeyEnvelopeBindingV1)[] = [
  'soulCoreId',
  'agentId',
  'ownerPrincipalRef',
  'tenantRef',
  'environment',
  'packageSchemaVersion',
  'packageId',
  'packageDigest',
  'snapshotSequence',
  'ownershipEpoch',
  'keyVersion',
];

const SLOT_FIELDS: readonly string[] = [
  'slotId',
  'kind',
  'kdf',
  'wrapAlgorithm',
  'salt',
  'iv',
  'wrappedKey',
  'authTag',
  'createdAt',
  'revokedAt',
];

const ENVELOPE_FIELDS: readonly string[] = [
  'schemaVersion',
  'envelopeId',
  'algorithm',
  'canonicalization',
  'createdAt',
  'binding',
  'iv',
  'ciphertext',
  'authTag',
  'ciphertextDigest',
  'recoverySlots',
  'evidence',
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertNoUnknownFields(value: Record<string, unknown>, allowed: readonly string[], where: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new SoulKeyEnvelopeError('unknown_field', `${where}.${key}`);
    }
  }
}

function assertBase64(value: unknown, where: string): string {
  if (typeof value !== 'string' || value.length === 0 || !BASE64.test(value)) {
    throw new SoulKeyEnvelopeError('malformed_base64', where);
  }
  return value;
}

function assertNonEmptyString(value: unknown, where: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new SoulKeyEnvelopeError('missing_field', where);
  }
  return value;
}

function assertTimestamp(value: unknown, where: string): string {
  if (typeof value !== 'string' || !ISO_TIMESTAMP.test(value)) {
    throw new SoulKeyEnvelopeError('malformed_timestamp', where);
  }
  return value;
}

function assertNonNegativeInteger(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new SoulKeyEnvelopeError('malformed_binding', where);
  }
  return value;
}

function assertDigestRef(value: unknown, where: string): DigestRef {
  if (!isPlainObject(value)) throw new SoulKeyEnvelopeError('malformed_binding', where);
  assertNoUnknownFields(value, ['algorithm', 'canonicalization', 'value'], where);
  assertNonEmptyString(value.algorithm, `${where}.algorithm`);
  assertNonEmptyString(value.canonicalization, `${where}.canonicalization`);
  assertNonEmptyString(value.value, `${where}.value`);
  return value as unknown as DigestRef;
}

/** Canonical AAD bytes. Any bound-field change invalidates the ciphertext. */
export function soulKeyAdditionalData(binding: SoulKeyEnvelopeBindingV1): string {
  return canonicalizeJson({
    context: 'agentrix/soul-key/envelope/v1',
    binding,
  });
}

export function computeSoulKeyCiphertextDigest(ciphertextBase64: string): DigestRef {
  return computeDigest(ciphertextBase64);
}

export function verifySoulKeyCiphertextDigest(envelope: SoulKeyEnvelopeV1): boolean {
  try {
    return verifyDigest(envelope.ciphertext, envelope.ciphertextDigest);
  } catch {
    return false;
  }
}

export function validateSoulKeyEnvelopeBindingV1(input: unknown): SoulKeyEnvelopeBindingV1 {
  if (!isPlainObject(input)) throw new SoulKeyEnvelopeError('malformed_binding', 'binding');
  assertNoUnknownFields(input, BINDING_FIELDS as readonly string[], 'binding');

  for (const field of BINDING_FIELDS) {
    if (!(field in input)) throw new SoulKeyEnvelopeError('missing_field', `binding.${field}`);
  }

  const environment = input.environment;
  if (typeof environment !== 'string' || !SOUL_KEY_ENVIRONMENTS.includes(environment as SoulKeyEnvironment)) {
    throw new SoulKeyEnvelopeError('wrong_environment', `binding.environment=${String(environment)}`);
  }

  return {
    soulCoreId: assertNonEmptyString(input.soulCoreId, 'binding.soulCoreId'),
    agentId: assertNonEmptyString(input.agentId, 'binding.agentId'),
    ownerPrincipalRef: assertNonEmptyString(input.ownerPrincipalRef, 'binding.ownerPrincipalRef'),
    tenantRef: assertNonEmptyString(input.tenantRef, 'binding.tenantRef'),
    environment: environment as SoulKeyEnvironment,
    packageSchemaVersion: assertNonEmptyString(
      input.packageSchemaVersion,
      'binding.packageSchemaVersion',
    ) as AgentPortabilitySchemaVersion,
    packageId: assertNonEmptyString(input.packageId, 'binding.packageId'),
    packageDigest: assertDigestRef(input.packageDigest, 'binding.packageDigest'),
    snapshotSequence: assertNonNegativeInteger(input.snapshotSequence, 'binding.snapshotSequence'),
    ownershipEpoch: assertNonNegativeInteger(input.ownershipEpoch, 'binding.ownershipEpoch'),
    keyVersion: assertNonNegativeInteger(input.keyVersion, 'binding.keyVersion'),
  };
}

function validateSlot(input: unknown, index: number): SoulKeyRecoverySlotV1 {
  const where = `recoverySlots[${index}]`;
  if (!isPlainObject(input)) throw new SoulKeyEnvelopeError('missing_field', where);
  assertNoUnknownFields(input, SLOT_FIELDS, where);

  const kind = input.kind;
  if (typeof kind !== 'string' || !SOUL_KEY_RECOVERY_SLOT_KINDS.includes(kind as SoulKeyRecoverySlotKind)) {
    throw new SoulKeyEnvelopeError('unknown_slot_kind', `${where}.kind=${String(kind)}`);
  }
  if (input.kdf !== 'HKDF-SHA-256') {
    throw new SoulKeyEnvelopeError('unknown_kdf', `${where}.kdf=${String(input.kdf)}`);
  }
  if (input.wrapAlgorithm !== 'AES-256-GCM') {
    throw new SoulKeyEnvelopeError('unknown_algorithm', `${where}.wrapAlgorithm=${String(input.wrapAlgorithm)}`);
  }
  if (input.revokedAt !== undefined && input.revokedAt !== null) {
    assertTimestamp(input.revokedAt, `${where}.revokedAt`);
  }

  return {
    slotId: assertNonEmptyString(input.slotId, `${where}.slotId`),
    kind: kind as SoulKeyRecoverySlotKind,
    kdf: 'HKDF-SHA-256',
    wrapAlgorithm: 'AES-256-GCM',
    salt: assertBase64(input.salt, `${where}.salt`),
    iv: assertBase64(input.iv, `${where}.iv`),
    wrappedKey: assertBase64(input.wrappedKey, `${where}.wrappedKey`),
    authTag: assertBase64(input.authTag, `${where}.authTag`),
    createdAt: assertTimestamp(input.createdAt, `${where}.createdAt`),
    revokedAt: (input.revokedAt as string | null | undefined) ?? null,
  };
}

/**
 * Strict, fail-closed decoder. Throws `SoulKeyEnvelopeError` on any deviation;
 * never returns a partially trusted envelope.
 */
export function validateSoulKeyEnvelopeV1(input: unknown): SoulKeyEnvelopeV1 {
  if (!isPlainObject(input)) throw new SoulKeyEnvelopeError('missing_field', 'envelope');
  assertNoUnknownFields(input, ENVELOPE_FIELDS, 'envelope');

  if (
    typeof input.schemaVersion !== 'string' ||
    !SUPPORTED_SOUL_KEY_ENVELOPE_SCHEMA_VERSIONS.includes(
      input.schemaVersion as SoulKeyEnvelopeSchemaVersion,
    )
  ) {
    throw new SoulKeyEnvelopeError('unknown_schema_version', String(input.schemaVersion));
  }
  if (input.algorithm !== 'AES-256-GCM') {
    throw new SoulKeyEnvelopeError('unknown_algorithm', String(input.algorithm));
  }
  if (input.canonicalization !== SOUL_KEY_CANONICALIZATION) {
    throw new SoulKeyEnvelopeError('unknown_algorithm', `canonicalization=${String(input.canonicalization)}`);
  }

  const evidenceInput = input.evidence;
  if (!isPlainObject(evidenceInput)) throw new SoulKeyEnvelopeError('missing_field', 'evidence');
  assertNoUnknownFields(evidenceInput, ['level', 'attestationRef'], 'evidence');
  const level = evidenceInput.level;
  if (typeof level !== 'string' || !SOUL_KEY_EVIDENCE_LEVELS.includes(level as SoulKeyEvidenceLevel)) {
    throw new SoulKeyEnvelopeError('missing_field', 'evidence.level');
  }
  if (level === 'real') {
    // A fixture cannot be promoted to real by editing one string.
    const ref = evidenceInput.attestationRef;
    if (typeof ref !== 'string' || ref.trim().length === 0) {
      throw new SoulKeyEnvelopeError(
        'evidence_level_not_substantiated',
        'evidence.level=real requires attestationRef',
      );
    }
  }

  const slotsInput = input.recoverySlots;
  if (!Array.isArray(slotsInput) || slotsInput.length === 0) {
    throw new SoulKeyEnvelopeError('no_usable_recovery_slot', 'recoverySlots must be a non-empty array');
  }
  const recoverySlots = slotsInput.map((slot, index) => validateSlot(slot, index));
  const seen = new Set<string>();
  for (const slot of recoverySlots) {
    if (seen.has(slot.slotId)) throw new SoulKeyEnvelopeError('duplicate_slot_id', slot.slotId);
    seen.add(slot.slotId);
  }
  if (recoverySlots.every((slot) => slot.revokedAt)) {
    throw new SoulKeyEnvelopeError('no_usable_recovery_slot', 'every slot is revoked');
  }

  const envelope: SoulKeyEnvelopeV1 = {
    schemaVersion: SOUL_KEY_ENVELOPE_SCHEMA_VERSION,
    envelopeId: assertNonEmptyString(input.envelopeId, 'envelope.envelopeId'),
    algorithm: 'AES-256-GCM',
    canonicalization: SOUL_KEY_CANONICALIZATION,
    createdAt: assertTimestamp(input.createdAt, 'envelope.createdAt'),
    binding: validateSoulKeyEnvelopeBindingV1(input.binding),
    iv: assertBase64(input.iv, 'envelope.iv'),
    ciphertext: assertBase64(input.ciphertext, 'envelope.ciphertext'),
    authTag: assertBase64(input.authTag, 'envelope.authTag'),
    ciphertextDigest: assertDigestRef(input.ciphertextDigest, 'envelope.ciphertextDigest'),
    recoverySlots,
    evidence: {
      level: level as SoulKeyEvidenceLevel,
      ...(typeof evidenceInput.attestationRef === 'string'
        ? { attestationRef: evidenceInput.attestationRef }
        : {}),
    },
  };

  if (!verifySoulKeyCiphertextDigest(envelope)) {
    throw new SoulKeyEnvelopeError('ciphertext_digest_mismatch', envelope.envelopeId);
  }

  return envelope;
}

export function parseSoulKeyEnvelopeV1(serialized: string): SoulKeyEnvelopeV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    throw new SoulKeyEnvelopeError('malformed_base64', 'envelope is not valid JSON');
  }
  return validateSoulKeyEnvelopeV1(parsed);
}

export function encodeSoulKeyEnvelopeV1(envelope: SoulKeyEnvelopeV1): string {
  return canonicalizeJson(validateSoulKeyEnvelopeV1(envelope));
}

/**
 * Restore-time expectations. Every field is optional so a caller can only
 * assert what it actually knows, but any supplied field is enforced exactly.
 */
export interface SoulKeyRestoreExpectationV1 {
  soulCoreId?: string;
  agentId?: string;
  ownerPrincipalRef?: string;
  tenantRef?: string;
  environment?: SoulKeyEnvironment;
  /** Minimum acceptable ownership epoch; a lower bound blocks stale restore. */
  minOwnershipEpoch?: number;
  /** Last applied snapshot; a lower or equal sequence is a rollback. */
  lastAppliedSnapshotSequence?: number;
  /** Minimum acceptable key version; blocks downgrade to a revoked key. */
  minKeyVersion?: number;
}

/**
 * Cross-owner / cross-tenant / rollback / downgrade gate. Returns a typed
 * result instead of throwing so callers can record the exact reason code.
 */
export function checkSoulKeyRestoreExpectation(
  binding: SoulKeyEnvelopeBindingV1,
  expectation: SoulKeyRestoreExpectationV1,
): SoulKeyResult<SoulKeyEnvelopeBindingV1> {
  const fail = (code: SoulKeyFailureCode, detail: string): SoulKeyResult<SoulKeyEnvelopeBindingV1> => ({
    ok: false,
    code,
    detail,
  });

  if (expectation.soulCoreId !== undefined && expectation.soulCoreId !== binding.soulCoreId) {
    return fail('cross_soul', `expected=${expectation.soulCoreId} actual=${binding.soulCoreId}`);
  }
  if (expectation.agentId !== undefined && expectation.agentId !== binding.agentId) {
    return fail('cross_soul', `expected=${expectation.agentId} actual=${binding.agentId}`);
  }
  if (
    expectation.ownerPrincipalRef !== undefined &&
    expectation.ownerPrincipalRef !== binding.ownerPrincipalRef
  ) {
    return fail('cross_owner', 'ownerPrincipalRef mismatch');
  }
  if (expectation.tenantRef !== undefined && expectation.tenantRef !== binding.tenantRef) {
    return fail('cross_tenant', 'tenantRef mismatch');
  }
  if (expectation.environment !== undefined && expectation.environment !== binding.environment) {
    return fail('wrong_environment', `expected=${expectation.environment} actual=${binding.environment}`);
  }
  if (
    expectation.minOwnershipEpoch !== undefined &&
    binding.ownershipEpoch < expectation.minOwnershipEpoch
  ) {
    return fail(
      'stale_ownership_epoch',
      `min=${expectation.minOwnershipEpoch} actual=${binding.ownershipEpoch}`,
    );
  }
  if (
    expectation.lastAppliedSnapshotSequence !== undefined &&
    binding.snapshotSequence <= expectation.lastAppliedSnapshotSequence
  ) {
    return fail(
      'snapshot_rollback',
      `lastApplied=${expectation.lastAppliedSnapshotSequence} actual=${binding.snapshotSequence}`,
    );
  }
  if (expectation.minKeyVersion !== undefined && binding.keyVersion < expectation.minKeyVersion) {
    return fail('key_version_downgrade', `min=${expectation.minKeyVersion} actual=${binding.keyVersion}`);
  }

  return { ok: true, value: binding };
}

/**
 * Soul-Key-specific forbidden material detector.
 *
 * Complements Portability's `findPortableSecretViolations`: that one does not
 * know about Soul Root Keys, data keys or recovery kits, and this one does not
 * try to re-implement its wallet/token shapes. Both must be run.
 *
 * Findings expose a redacted path only — never the value, never the key name.
 */
export interface SoulKeySecretFindingV1 {
  path: string;
  kind:
    | 'soul_root_key'
    | 'data_encryption_key'
    | 'recovery_secret'
    | 'guardian_share'
    | 'raw_key_bytes';
}

const FORBIDDEN_KEY_ALIASES: ReadonlyArray<{ pattern: RegExp; kind: SoulKeySecretFindingV1['kind'] }> = [
  { pattern: /^(soulrootkey|srk|rootkey|masterkey|soulkeysecret)$/, kind: 'soul_root_key' },
  { pattern: /^(dek|datakey|dataencryptionkey|contentkey|plaintextkey|unwrappedkey)$/, kind: 'data_encryption_key' },
  { pattern: /^(recoverykey|recoverysecret|recoverykit|recoveryphrase|mnemonic|seedphrase)$/, kind: 'recovery_secret' },
  { pattern: /^(guardianshare|share|shamirshare|keyshare)$/, kind: 'guardian_share' },
  { pattern: /^(kek|keyencryptionkey|privatekey|secretkey)$/, kind: 'raw_key_bytes' },
];

/**
 * Fields that legitimately carry ciphertext, authenticators or random material
 * of exactly key length, so the raw-key-shape heuristic must not fire on them.
 * `wrap`/`tag`/`nonce` matter specifically: a wrapped 32-byte data key is 44
 * base64 characters and would otherwise look identical to a smuggled key.
 *
 * This only relaxes the *shape* heuristic. The forbidden key-name aliases below
 * still apply to every field regardless of suffix.
 */
const KEY_SHAPE_EXEMPT =
  /(digest|wrappedkey|wrap|authtag|tag|ciphertext|iv|nonce|salt|commitment|value|hash|signature|id|ref)$/;

function normalizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

export function findSoulKeySecretViolations(input: unknown): SoulKeySecretFindingV1[] {
  const findings: SoulKeySecretFindingV1[] = [];
  const seen = new Set<object>();

  const visit = (value: unknown, path: string, keyName: string, depth: number): void => {
    if (depth > 64 || value === null || value === undefined) return;

    if (typeof value === 'string') {
      const normalized = normalizeKey(keyName);
      for (const alias of FORBIDDEN_KEY_ALIASES) {
        if (alias.pattern.test(normalized)) {
          findings.push({ path, kind: alias.kind });
          return;
        }
      }
      // A bare 32-byte key smuggled into a non-key field.
      if (!KEY_SHAPE_EXEMPT.test(normalized) && /^(?:[A-Fa-f0-9]{64}|[A-Za-z0-9+/]{43}=)$/.test(value)) {
        findings.push({ path, kind: 'raw_key_bytes' });
      }
      return;
    }

    if (typeof value !== 'object') return;
    if (seen.has(value as object)) return;
    seen.add(value as object);

    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, `${path}[${index}]`, keyName, depth + 1));
      return;
    }

    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const normalized = normalizeKey(key);
      const matched = FORBIDDEN_KEY_ALIASES.find((alias) => alias.pattern.test(normalized));
      if (matched && (entry === null || typeof entry !== 'object')) {
        findings.push({ path: `${path}.${key}`, kind: matched.kind });
        continue;
      }
      visit(entry, `${path}.${key}`, key, depth + 1);
    }
  };

  visit(input, '$', '', 0);
  return findings;
}

/** Throws unless the envelope is free of both Soul Key and Portability secrets. */
export function assertSoulKeyEnvelopeCarriesNoSecrets(envelope: SoulKeyEnvelopeV1): void {
  const findings = findSoulKeySecretViolations(envelope);
  if (findings.length > 0) {
    throw new SoulKeyEnvelopeError(
      'forbidden_credential_present',
      findings.map((finding) => `${finding.kind}@${finding.path}`).join(','),
    );
  }
}
