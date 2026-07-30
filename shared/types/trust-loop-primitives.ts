/**
 * Soul Core Action Trust Loop v1.1 — shared envelope and primitives (TL-01.1).
 *
 * Additive, dependency-free, cross-end (Web / Mobile / Desktop / Backend and
 * external Verifier / RP SDKs). This module freezes the common envelope and the
 * shared primitives referenced by the nine versioned contracts
 * (`ActionContextV1` … `FeedbackRightV1`):
 *
 *   - `PartyRef` / `RecordRef` / `DigestRef` / `Money` / `DataClass`
 *   - `Integrity` / `SignedIntegrity`
 *   - a deterministic canonical-JSON rule (`canonicalizeJson`) and a
 *     self-contained SHA-256 (`sha256Hex`) so any runtime can reproduce the
 *     exact digest / golden vector without native crypto.
 *   - fail-closed enum helpers: an unrecognized enum either fails closed or
 *     degrades to `'unknown'`; it is NEVER silently mapped to a positive value.
 *
 * Semantics follow design.md §3 (RFC 3339 UTC timestamps; `Money` as
 * `{ amountMinor, currency, decimals }`; digests carry algorithm +
 * canonicalization version; IDs are unguessable + globally stable). Nothing
 * here rewrites an existing DTO — it only adds new types.
 */

import type { EnforcementLayer } from './authority';

/** Versioned envelope marker shared by every v1.1 contract. */
export const TRUST_LOOP_SCHEMA_VERSION = '1.0' as const;
export type TrustLoopSchemaVersion = typeof TRUST_LOOP_SCHEMA_VERSION;

/** Schema versions this build understands. Unknown versions fail closed (R1, R3). */
export const SUPPORTED_TRUST_LOOP_SCHEMA_VERSIONS = [TRUST_LOOP_SCHEMA_VERSION] as const;

/** Canonicalization scheme id embedded in every {@link DigestRef}. */
export const TRUST_LOOP_CANONICALIZATION = 'jcs/1' as const;

// ---------------------------------------------------------------------------
// Data classification (R12) — every field maps to one of these; default is the
// most restrictive that still lets the object be understood.
// ---------------------------------------------------------------------------

export const DATA_CLASSES = ['public', 'owner', 'private', 'restricted'] as const;
/** public < owner < private < restricted (increasing sensitivity). */
export type DataClass = (typeof DATA_CLASSES)[number];

/** Ordering used for minimal-disclosure clearance checks (higher = more sensitive). */
export const DATA_CLASS_RANK: Record<DataClass, number> = {
  public: 0,
  owner: 1,
  private: 2,
  restricted: 3,
};

// ---------------------------------------------------------------------------
// Party / record / evidence references
// ---------------------------------------------------------------------------

export const PARTY_KINDS = [
  'agent',
  'owner',
  'principal',
  'authorizer',
  'actor',
  'operator',
  'provider',
  'executor',
  'counterparty',
  'referrer',
  'verifier',
  'issuer',
  'status_authority',
  'payment_authority',
  'settlement_authority',
  'remedy_authority',
  'arbiter',
  'relying_party',
  'projector',
  'risk_engine',
  'platform',
  'unknown',
] as const;
export type PartyKind = (typeof PARTY_KINDS)[number];

/** Whether a party is controlled by Agentrix; drives independence honesty (R11.5). */
export const PARTY_AFFILIATIONS = ['internal', 'external', 'unknown'] as const;
export type PartyAffiliation = (typeof PARTY_AFFILIATIONS)[number];

/**
 * Reference to a participating party. `id` is an opaque, unguessable, globally
 * stable identifier and is NEVER derived from owner, signer, or wallet.
 */
export interface PartyRef {
  kind: PartyKind;
  id: string;
  did?: string;
  displayName?: string;
  affiliation?: PartyAffiliation;
}

export const TRUST_RECORD_TYPES = [
  'ownership_snapshot',
  'goal_intent',
  'action_plan',
  'discovery_candidate',
  'creation',
  'offering',
  'provider',
  'action_quote',
  'execution_mandate',
  'budget_reservation',
  'payment_attempt',
  'settlement_event',
  'execution_record',
  'action_receipt',
  'attribution_lineage',
  'responsibility_lineage',
  'commission_allocation',
  'remedy_case',
  'contextual_reputation_card',
  'policy',
  'terms',
  'action_context',
  'outcome_record',
  'verification_result',
  'credential_status',
  'dispute_case',
  'reputation_card',
  'assurance_profile',
  'risk_decision',
  'feedback_right',
  'settlement',
  'evidence',
  'anchor',
  'authority_decision',
  'actor_identity',
  'delegation_chain',
  'runtime',
  'shell_session_binding',
  'host_assurance_binding',
  'assurance_evidence',
  'task_proof',
  'unknown',
] as const;
export type TrustRecordType = (typeof TRUST_RECORD_TYPES)[number];

/** Stable cross-record link (R1.2). Optional `digest` binds the referenced payload. */
export interface RecordRef {
  type: TrustRecordType;
  id: string;
  version?: number;
  digest?: DigestRef;
}

export const DIGEST_ALGORITHMS = ['sha-256'] as const;
export type DigestAlgorithm = (typeof DIGEST_ALGORITHMS)[number];

/** A content digest that always carries its algorithm and canonicalization scheme. */
export interface DigestRef {
  algorithm: DigestAlgorithm;
  /** Canonicalization applied before hashing; a verifier MUST match this. */
  canonicalization: string;
  /** Lower-case hex digest value. */
  value: string;
}

export const EVIDENCE_KINDS = [
  'log',
  'artifact',
  'attestation',
  'receipt',
  'signature',
  'anchor',
  'telemetry',
  'task_proof',
  'manual_check',
  'unknown',
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/**
 * Reference to evidence stored out of band. Raw evidence, PII, secrets and
 * sensitive dispute material never inline here — only a digest plus an
 * authorization-gated locator (R3.4, R12.2).
 */
export interface EvidenceRef {
  evidenceId: string;
  kind: EvidenceKind;
  digest: DigestRef;
  /** Authorization-gated locator; not a public URL for restricted data. */
  locator?: string;
  issuer?: PartyRef;
  dataClass: DataClass;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Money (design §3) — never a JS number.
// ---------------------------------------------------------------------------

/**
 * Monetary value. `amountMinor` is an integer in the currency's smallest unit,
 * expressed as a decimal string (aligned with `MinorUnitAmountV1` in
 * `risk-funding.ts`). `decimals` records how many minor digits the currency has.
 */
export interface Money {
  amountMinor: string;
  currency: string;
  decimals: number;
}

/** Decimal-string integer grammar for {@link Money.amountMinor}. */
export const MINOR_AMOUNT_PATTERN = /^-?(0|[1-9][0-9]*)$/;

// ---------------------------------------------------------------------------
// Integrity / signature
// ---------------------------------------------------------------------------

export const INTEGRITY_TYPES = ['digest', 'signature'] as const;
export type IntegrityType = (typeof INTEGRITY_TYPES)[number];

/** Integrity-only binding (no signature) — e.g. a client-submitted draft. */
export interface Integrity {
  type: 'digest';
  payloadDigest: DigestRef;
}

/**
 * Integrity binding with an optional cryptographic signature. `type: 'digest'`
 * covers "integrity reference" records; `type: 'signature'` is a signed record
 * and MUST carry `scheme` / `signer` / `keyId` / `signature` / `signedAt`
 * (enforced by {@link module:trust-loop-validation}). Satisfies R1's
 * "signature or integrity reference" requirement.
 */
export interface SignedIntegrity {
  type: IntegrityType;
  payloadDigest: DigestRef;
  scheme?: string;
  signer?: PartyRef;
  keyId?: string;
  signature?: string;
  signedAt?: string;
}

// ---------------------------------------------------------------------------
// Enforcement evidence (shared by ActionContext and AssuranceProfile)
// ---------------------------------------------------------------------------

/** Verification state of an enforcement layer (design §8.1). */
export const ENFORCEMENT_EVIDENCE_STATES = [
  'claimed',
  'observed',
  'verified',
  'enforced',
  'unknown',
] as const;
export type EnforcementEvidenceState = (typeof ENFORCEMENT_EVIDENCE_STATES)[number];

/**
 * One enforcement layer plus the strength of evidence that it actually applied.
 * Reuses the canonical {@link EnforcementLayer} union from `authority.ts` so the
 * trust loop never diverges from the existing authority contract.
 */
export interface EnforcementLayerEvidence {
  layer: EnforcementLayer;
  state: EnforcementEvidenceState;
  evidenceRef?: RecordRef;
  note?: string;
}

/** Owner-authorized ceiling that risk / authority may tighten within, never raise (R9). */
export interface PolicyCeiling {
  maxCost?: Money;
  maxSessionSeconds?: number;
  allowlist?: string[];
  requiredApprovals?: number;
  note?: string;
}

// ---------------------------------------------------------------------------
// Canonical JSON (JCS-style) + self-contained SHA-256
// ---------------------------------------------------------------------------

export class TrustCanonicalizationError extends Error {
  readonly code = 'trust_canonicalization_error';
  constructor(message: string) {
    super(message);
    this.name = 'TrustCanonicalizationError';
  }
}

/**
 * Deterministic canonical JSON serialization (RFC 8785 / JCS style):
 *   - object keys sorted by UTF-16 code unit;
 *   - `undefined` object properties dropped (JSON semantics);
 *   - `undefined` array elements become `null`;
 *   - no insignificant whitespace;
 *   - non-finite numbers (NaN / Infinity) are rejected.
 *
 * Together with {@link sha256Hex} this guarantees byte-identical digests across
 * every runtime and external SDK. Money stays a string, so number formatting
 * differences never affect financial fields.
 */
export function canonicalizeJson(value: unknown): string {
  if (value === undefined) {
    throw new TrustCanonicalizationError('cannot canonicalize top-level undefined');
  }
  return writeCanonical(value);
}

function writeCanonical(value: unknown): string {
  if (value === null) return 'null';

  const t = typeof value;
  if (t === 'string') return JSON.stringify(value);
  if (t === 'boolean') return value ? 'true' : 'false';
  if (t === 'number') {
    if (!Number.isFinite(value as number)) {
      throw new TrustCanonicalizationError('cannot canonicalize non-finite number');
    }
    return JSON.stringify(value);
  }
  if (t === 'bigint') {
    // BigInt is not part of the contract surface; reject rather than guess a format.
    throw new TrustCanonicalizationError('cannot canonicalize bigint');
  }
  if (t === 'function' || t === 'symbol') {
    throw new TrustCanonicalizationError(`cannot canonicalize ${t}`);
  }

  if (Array.isArray(value)) {
    const parts = value.map((el) => (el === undefined ? 'null' : writeCanonical(el)));
    return `[${parts.join(',')}]`;
  }

  // Plain object.
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts: string[] = [];
  for (const key of keys) {
    const v = obj[key];
    if (v === undefined) continue; // JSON semantics: skip undefined properties.
    parts.push(`${JSON.stringify(key)}:${writeCanonical(v)}`);
  }
  return `{${parts.join(',')}}`;
}

/** UTF-8 encode a string to bytes without depending on TextEncoder / Buffer. */
export function utf8Encode(str: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i);
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // High surrogate — combine with the following low surrogate.
      const hi = code;
      const lo = str.charCodeAt(++i);
      code = 0x10000 + ((hi - 0xd800) << 10) + (lo - 0xdc00);
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    } else {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return new Uint8Array(out);
}

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

/** Self-contained SHA-256 over raw bytes; returns lower-case hex. */
export function sha256Hex(bytes: Uint8Array): string {
  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const l = bytes.length;
  const bitLen = l * 8;
  const withOne = l + 1;
  const padZeros = ((56 - (withOne % 64)) + 64) % 64;
  const total = withOne + padZeros + 8;
  const buf = new Uint8Array(total);
  buf.set(bytes, 0);
  buf[l] = 0x80;

  // 64-bit big-endian message length in bits.
  const hi = Math.floor(bitLen / 0x100000000);
  const lo = bitLen >>> 0;
  buf[total - 8] = (hi >>> 24) & 0xff;
  buf[total - 7] = (hi >>> 16) & 0xff;
  buf[total - 6] = (hi >>> 8) & 0xff;
  buf[total - 5] = hi & 0xff;
  buf[total - 4] = (lo >>> 24) & 0xff;
  buf[total - 3] = (lo >>> 16) & 0xff;
  buf[total - 2] = (lo >>> 8) & 0xff;
  buf[total - 1] = lo & 0xff;

  const w = new Uint32Array(64);
  for (let offset = 0; offset < total; offset += 64) {
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4;
      w[i] = ((buf[j] << 24) | (buf[j + 1] << 16) | (buf[j + 2] << 8) | buf[j + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return (
    toHex8(h0) + toHex8(h1) + toHex8(h2) + toHex8(h3) +
    toHex8(h4) + toHex8(h5) + toHex8(h6) + toHex8(h7)
  );
}

function toHex8(x: number): string {
  return (x >>> 0).toString(16).padStart(8, '0');
}

/** Compute a {@link DigestRef} over a value's canonical JSON. */
export function computeDigest(value: unknown, algorithm: DigestAlgorithm = 'sha-256'): DigestRef {
  const canonical = canonicalizeJson(value);
  return {
    algorithm,
    canonicalization: TRUST_LOOP_CANONICALIZATION,
    value: sha256Hex(utf8Encode(canonical)),
  };
}

/**
 * Recompute and compare a digest. Fails closed for an unknown algorithm or a
 * mismatched canonicalization scheme (Property 1 — context binding).
 */
export function verifyDigest(value: unknown, digest: DigestRef): boolean {
  if (!DIGEST_ALGORITHMS.includes(digest.algorithm)) return false;
  if (digest.canonicalization !== TRUST_LOOP_CANONICALIZATION) return false;
  const recomputed = computeDigest(value, digest.algorithm);
  return constantTimeEqualHex(recomputed.value, digest.value);
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Fail-closed enum helpers
// ---------------------------------------------------------------------------

/** True when `value` is one of the allowed enum members. */
export function isKnownEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

/**
 * Degrade an unrecognized enum value to `'unknown'` — used ONLY for enums that
 * include an `'unknown'` member (e.g. credential status, execution status).
 * It never returns a positive value, so an unknown status can never be read as
 * `active` / `verified` / `succeeded` (R5.3, R4.2, Properties 4 & 5).
 */
export function coerceToUnknown<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | 'unknown' {
  return isKnownEnum(value, allowed) ? value : 'unknown';
}
