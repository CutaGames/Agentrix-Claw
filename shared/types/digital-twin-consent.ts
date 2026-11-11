/**
 * Digital Twin — Seed Trial identity and likeness consent records
 * (design §4 semantics; tasks §0.1.2 rows 7.2/7.8, §0.1.4; Task 7).
 *
 * Two `interim_seed_*` product records stand in for the unpublished Trust owner
 * contracts, with the same field meaning so they can migrate:
 *
 *  - `interim_seed_represents`: the Product Owner (an operator who knows the
 *    seed Creator personally) verified over a video call that the Agent owner
 *    is the human the twin will represent. Method is always `operator_verified`,
 *    the disclosure literal is shown on every verification card, the record
 *    expires after 90 days and can be revoked. It is evidence class HUMAN and
 *    never a liveness check.
 *  - `interim_seed_likeness_consent`: the Creator's own, in-product consent
 *    per likeness dimension (face / voice / gesture / style) and purpose
 *    (capture / training / generation / display / commercial), with a typed
 *    statement, a literal self-only attestation, an expiry and a revoke epoch.
 *    Widening needs a new grant (new version); narrowing and revoke are
 *    immediate. A provider-side checkbox is never consent.
 *
 * Neither record authorizes Authority, payment or an action (`notAGrant`).
 */
import {
  DIGITAL_TWIN_DECODE_HELPERS_V1,
  DIGITAL_TWIN_SCHEMA_VERSION,
  type DigitalTwinDecodeResultV1,
  type DigitalTwinPrerequisiteStatusV1,
  type DigitalTwinRefV1,
} from './digital-twin';

const { isRecord, isNonEmptyString, isIsoTimestamp, isMember, fail } = DIGITAL_TWIN_DECODE_HELPERS_V1;

export const DIGITAL_TWIN_REPRESENTS_METHODS_V1 = ['operator_verified'] as const;
export type DigitalTwinRepresentsMethodV1 = (typeof DIGITAL_TWIN_REPRESENTS_METHODS_V1)[number];

export const DIGITAL_TWIN_REPRESENTS_DISCLOSURE_V1 = '由 Agentrix 运营人工核验（非活体检测）' as const;
export const DIGITAL_TWIN_REPRESENTS_VALIDITY_DAYS_V1 = 90 as const;

export const DIGITAL_TWIN_INTERIM_RECORD_STATES_V1 = ['active', 'expired', 'revoked'] as const;
export type DigitalTwinInterimRecordStateV1 = (typeof DIGITAL_TWIN_INTERIM_RECORD_STATES_V1)[number];

export interface DigitalTwinRepresentsRecordV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  record: 'interim_seed_represents';
  notAGrant: true;
  representsRef: DigitalTwinRefV1;
  profileRef: DigitalTwinRefV1;
  /** The Agent owner (`principal:user:<id>`) — the human represented. */
  representedPrincipalRef: DigitalTwinRefV1;
  agentRef: DigitalTwinRefV1;
  method: DigitalTwinRepresentsMethodV1;
  /** Operator principal who performed the verification; never the owner themselves. */
  verifiedByPrincipalRef: DigitalTwinRefV1;
  /** Operator's evidence pointer (meeting note / ticket id); free text, no document content. */
  evidenceNote: string;
  evidenceClass: 'HUMAN';
  disclosure: typeof DIGITAL_TWIN_REPRESENTS_DISCLOSURE_V1;
  state: DigitalTwinInterimRecordStateV1;
  verifiedAt: string;
  expiresAt: string;
  revokedAt?: string;
  revokeEpoch: number;
}

export const DIGITAL_TWIN_LIKENESS_DIMENSIONS_V1 = ['face', 'voice', 'gesture', 'style'] as const;
export type DigitalTwinLikenessDimensionV1 = (typeof DIGITAL_TWIN_LIKENESS_DIMENSIONS_V1)[number];

export const DIGITAL_TWIN_LIKENESS_PURPOSES_V1 = ['capture', 'training', 'generation', 'display', 'commercial'] as const;
export type DigitalTwinLikenessPurposeV1 = (typeof DIGITAL_TWIN_LIKENESS_PURPOSES_V1)[number];

export const DIGITAL_TWIN_CONSENT_VALIDITY_DAYS_V1 = 365 as const;
export const DIGITAL_TWIN_CONSENT_STATEMENT_MIN_CHARS = 12;
export const DIGITAL_TWIN_CONSENT_STATEMENT_MAX_CHARS = 600;
/** The Creator must type this attestation verbatim (zh or en); it is the "only my own likeness" guardrail (§0.1.3 rule 1). */
export const DIGITAL_TWIN_SELF_ONLY_ATTESTATIONS_V1 = ['我确认只克隆我本人的声音和形象', 'I confirm this clones only my own voice and likeness'] as const;

export type DigitalTwinLikenessScopeV1 = Partial<Record<DigitalTwinLikenessDimensionV1, DigitalTwinLikenessPurposeV1[]>>;

export interface DigitalTwinLikenessConsentRecordV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  record: 'interim_seed_likeness_consent';
  notAGrant: true;
  consentRef: DigitalTwinRefV1;
  profileRef: DigitalTwinRefV1;
  subjectPrincipalRef: DigitalTwinRefV1;
  /** Dimension → purposes the Creator consented to. Empty purposes are dropped. */
  scope: DigitalTwinLikenessScopeV1;
  statement: {
    /** The Creator's own words; stored as typed, never rewritten. */
    text: string;
    language: 'zh-CN' | 'en';
    /** Optional pointer to a self-recorded audio/video statement (asset ref only, never media). */
    recordingRef?: DigitalTwinRefV1;
  };
  selfOnlyAttestation: true;
  /** Provider allowlist the consent covers; empty = no provider may use it yet. */
  providerAllowlist: string[];
  version: number;
  state: DigitalTwinInterimRecordStateV1;
  grantedAt: string;
  expiresAt: string;
  revokedAt?: string;
  revokeEpoch: number;
}

export interface DigitalTwinConsentStateV1 {
  represents: DigitalTwinRepresentsRecordV1 | null;
  likeness: DigitalTwinLikenessConsentRecordV1 | null;
  /** Every superseded/revoked record kept for audit; never rewritten. */
  history: Array<DigitalTwinRepresentsRecordV1 | DigitalTwinLikenessConsentRecordV1>;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export interface DigitalTwinOperatorVerifyCommandV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  action: 'verify' | 'revoke';
  /** Required for `verify`; e.g. "2026-09-08 video call, id checked, ticket OPS-12". */
  evidenceNote?: string;
}

export const DIGITAL_TWIN_CONSENT_ACTIONS_V1 = ['grant', 'narrow', 'revoke'] as const;
export type DigitalTwinConsentActionV1 = (typeof DIGITAL_TWIN_CONSENT_ACTIONS_V1)[number];

export interface DigitalTwinConsentCommandV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  action: DigitalTwinConsentActionV1;
  /** `grant`/`narrow`: the full scope after the command. */
  scope?: DigitalTwinLikenessScopeV1;
  /** `grant` only. */
  statement?: { text: string; language: 'zh-CN' | 'en'; recordingRef?: DigitalTwinRefV1 };
  /** `grant` only; must equal one of DIGITAL_TWIN_SELF_ONLY_ATTESTATIONS_V1 verbatim. */
  selfOnlyAttestation?: string;
  /** `grant` only; provider ids allowed to use the likeness (may be empty). */
  providerAllowlist?: string[];
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function addDaysIsoV1(from: string, days: number): string {
  return new Date(new Date(from).getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

/** Effective status at `now`: revoked wins, then expiry, then the stored state. */
export function digitalTwinInterimRecordStatusV1(
  record: { state: DigitalTwinInterimRecordStateV1; expiresAt: string } | null | undefined,
  now: string,
): DigitalTwinPrerequisiteStatusV1 {
  if (!record) return 'absent';
  if (record.state === 'revoked') return 'revoked';
  if (new Date(record.expiresAt).getTime() <= new Date(now).getTime()) return 'expired';
  return 'active';
}

/** Normalizes a scope: known dimensions only, deduplicated known purposes, empty dimensions dropped. Returns null when invalid. */
export function normalizeDigitalTwinLikenessScopeV1(input: unknown): DigitalTwinLikenessScopeV1 | null {
  if (!isRecord(input)) return null;
  const scope: DigitalTwinLikenessScopeV1 = {};
  for (const [dimension, purposes] of Object.entries(input)) {
    if (!isMember(DIGITAL_TWIN_LIKENESS_DIMENSIONS_V1, dimension)) return null;
    if (!Array.isArray(purposes)) return null;
    const cleaned: DigitalTwinLikenessPurposeV1[] = [];
    for (const purpose of purposes) {
      if (!isMember(DIGITAL_TWIN_LIKENESS_PURPOSES_V1, purpose)) return null;
      if (!cleaned.includes(purpose)) cleaned.push(purpose);
    }
    if (cleaned.length > 0) scope[dimension] = cleaned;
  }
  return scope;
}

/** True when `next` grants nothing beyond `current` (narrowing or equal). */
export function digitalTwinScopeIsNarrowerOrEqualV1(current: DigitalTwinLikenessScopeV1, next: DigitalTwinLikenessScopeV1): boolean {
  for (const dimension of DIGITAL_TWIN_LIKENESS_DIMENSIONS_V1) {
    const allowed = new Set(current[dimension] ?? []);
    for (const purpose of next[dimension] ?? []) if (!allowed.has(purpose)) return false;
  }
  return true;
}

/** Does the consent cover a dimension+purpose right now? Unknown/expired/revoked fail closed. */
export function digitalTwinConsentCoversV1(
  record: DigitalTwinLikenessConsentRecordV1 | null | undefined,
  dimension: DigitalTwinLikenessDimensionV1,
  purpose: DigitalTwinLikenessPurposeV1,
  now: string,
): boolean {
  if (!record || digitalTwinInterimRecordStatusV1(record, now) !== 'active') return false;
  return (record.scope[dimension] ?? []).includes(purpose);
}

// ---------------------------------------------------------------------------
// Decoders
// ---------------------------------------------------------------------------

export function decodeDigitalTwinOperatorVerifyCommandV1(input: unknown): DigitalTwinDecodeResultV1<DigitalTwinOperatorVerifyCommandV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['root']);
  if (input.schemaVersion !== DIGITAL_TWIN_SCHEMA_VERSION) return fail('unknown_schema_version', ['schemaVersion']);
  if (input.action !== 'verify' && input.action !== 'revoke') return fail('invalid_enum', ['action']);
  let evidenceNote: string | undefined;
  if (input.action === 'verify') {
    if (!isNonEmptyString(input.evidenceNote) || input.evidenceNote.trim().length < 8 || input.evidenceNote.length > 300) {
      return fail('invalid_shape', ['evidenceNote']);
    }
    evidenceNote = input.evidenceNote.trim();
  }
  return { ok: true, value: { schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION, action: input.action, ...(evidenceNote ? { evidenceNote } : {}) } };
}

export function decodeDigitalTwinConsentCommandV1(input: unknown): DigitalTwinDecodeResultV1<DigitalTwinConsentCommandV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['root']);
  if (input.schemaVersion !== DIGITAL_TWIN_SCHEMA_VERSION) return fail('unknown_schema_version', ['schemaVersion']);
  if (!isMember(DIGITAL_TWIN_CONSENT_ACTIONS_V1, input.action)) return fail('invalid_enum', ['action']);
  const action = input.action;
  const value: DigitalTwinConsentCommandV1 = { schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION, action };
  if (action === 'grant' || action === 'narrow') {
    const scope = normalizeDigitalTwinLikenessScopeV1(input.scope);
    if (!scope) return fail('invalid_shape', ['scope']);
    if (action === 'grant' && Object.keys(scope).length === 0) return fail('invalid_shape', ['scope must grant at least one dimension']);
    value.scope = scope;
  }
  if (action === 'grant') {
    if (!isRecord(input.statement)) return fail('invalid_shape', ['statement']);
    const text = input.statement.text;
    if (!isNonEmptyString(text) || text.trim().length < DIGITAL_TWIN_CONSENT_STATEMENT_MIN_CHARS || text.length > DIGITAL_TWIN_CONSENT_STATEMENT_MAX_CHARS) {
      return fail('invalid_shape', ['statement.text']);
    }
    if (input.statement.language !== 'zh-CN' && input.statement.language !== 'en') return fail('invalid_enum', ['statement.language']);
    const statement: DigitalTwinConsentCommandV1['statement'] = { text: text.trim(), language: input.statement.language };
    if (input.statement.recordingRef !== undefined) {
      const ref = input.statement.recordingRef;
      if (!isRecord(ref) || !isNonEmptyString(ref.kind) || !isNonEmptyString(ref.id)) return fail('invalid_ref', ['statement.recordingRef']);
      statement.recordingRef = { kind: ref.kind as DigitalTwinRefV1['kind'], id: ref.id };
    }
    value.statement = statement;
    if (!isNonEmptyString(input.selfOnlyAttestation) || !(DIGITAL_TWIN_SELF_ONLY_ATTESTATIONS_V1 as readonly string[]).includes(input.selfOnlyAttestation.trim())) {
      return fail('invalid_shape', ['selfOnlyAttestation must be typed verbatim']);
    }
    value.selfOnlyAttestation = input.selfOnlyAttestation.trim();
    if (input.providerAllowlist !== undefined) {
      if (!Array.isArray(input.providerAllowlist) || !input.providerAllowlist.every((item) => isNonEmptyString(item) && item.length <= 64)) {
        return fail('invalid_shape', ['providerAllowlist']);
      }
      value.providerAllowlist = [...new Set(input.providerAllowlist.map((item: string) => item.trim()))];
    } else {
      value.providerAllowlist = [];
    }
  }
  return { ok: true, value };
}

export function decodeDigitalTwinConsentStateV1(input: unknown): DigitalTwinDecodeResultV1<DigitalTwinConsentStateV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['root']);
  if (input.represents !== null && input.represents !== undefined) {
    const r = input.represents;
    if (!isRecord(r) || r.record !== 'interim_seed_represents' || r.notAGrant !== true || r.method !== 'operator_verified') return fail('invalid_shape', ['represents']);
    if (r.disclosure !== DIGITAL_TWIN_REPRESENTS_DISCLOSURE_V1 || r.evidenceClass !== 'HUMAN') return fail('invalid_shape', ['represents.disclosure']);
    if (!isMember(DIGITAL_TWIN_INTERIM_RECORD_STATES_V1, r.state) || !isIsoTimestamp(r.verifiedAt) || !isIsoTimestamp(r.expiresAt)) return fail('invalid_enum', ['represents.state']);
  }
  if (input.likeness !== null && input.likeness !== undefined) {
    const c = input.likeness;
    if (!isRecord(c) || c.record !== 'interim_seed_likeness_consent' || c.notAGrant !== true || c.selfOnlyAttestation !== true) return fail('invalid_shape', ['likeness']);
    if (!normalizeDigitalTwinLikenessScopeV1(c.scope)) return fail('invalid_shape', ['likeness.scope']);
    if (!isMember(DIGITAL_TWIN_INTERIM_RECORD_STATES_V1, c.state) || !isIsoTimestamp(c.grantedAt) || !isIsoTimestamp(c.expiresAt)) return fail('invalid_enum', ['likeness.state']);
  }
  if (!Array.isArray(input.history)) return fail('invalid_shape', ['history']);
  if (!isIsoTimestamp(input.updatedAt)) return fail('invalid_timestamp', ['updatedAt']);
  return { ok: true, value: input as unknown as DigitalTwinConsentStateV1 };
}
