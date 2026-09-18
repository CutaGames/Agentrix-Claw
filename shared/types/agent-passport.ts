/**
 * Agent Passport v4 — the per-Agent projection behind the passport card and
 * the per-Agent A2A card. Spec: `.kiro/specs/agent-passport-v4/`.
 *
 * Every field comes from a real table; a dimension that cannot be read says
 * `unavailable` instead of pretending to be empty. Public surfaces (share
 * payload, public page, poster, A2A card) only ever receive
 * {@link AgentPassportPublicV1}: count *buckets*, never exact counts, and only
 * the owner-confirmed persona.
 */

/** Lower bound of the public count range: 0, 1–9, 10–49, 50–99, 100–499, 500+. */
export type PassportCountBucket = 0 | 1 | 10 | 50 | 100 | 500;

export const PASSPORT_COUNT_BUCKETS: readonly PassportCountBucket[] = [0, 1, 10, 50, 100, 500];

export function passportCountBucket(count: number): PassportCountBucket {
  if (!Number.isFinite(count) || count <= 0) return 0;
  let bucket: PassportCountBucket = 0;
  for (const candidate of PASSPORT_COUNT_BUCKETS) {
    if (count >= candidate) bucket = candidate;
  }
  return bucket;
}

export function isPassportCountBucket(value: unknown): value is PassportCountBucket {
  return typeof value === 'number' && (PASSPORT_COUNT_BUCKETS as readonly number[]).includes(value);
}

export type PassportPersonaStatus = 'none' | 'draft' | 'confirmed';
/** `ai` = model draft kept verbatim; `template` = deterministic fallback; `owner` = the owner edited it. */
export type PassportPersonaSource = 'ai' | 'template' | 'owner';

export const PASSPORT_TAGLINE_MAX = 40;
/** Roomy enough for a two-word English skill name; still one line on the stamp. */
export const PASSPORT_TAG_MAX = 16;
export const PASSPORT_TAGS_MAX = 3;
/** The owner-written description travels on the A2A card only as a fallback line; keep it a paragraph, not a page. */
export const PASSPORT_DESCRIPTION_MAX = 280;

/** Phrases the passport never claims (we connect official exports and a read-only calendar, not accounts). */
export const PASSPORT_FORBIDDEN_PHRASES: readonly string[] = ['已连接账号', '自动同步', '授权登录'];

export interface AgentPassportPersonaV1 {
  status: PassportPersonaStatus;
  /** Confirmed text, or the pending draft when `status === 'draft'`. */
  tagline: string | null;
  tags: string[];
  source: PassportPersonaSource | null;
  /** Friendly model name behind an `ai` draft. */
  model?: string | null;
  draftedAt?: string | null;
  confirmedAt?: string | null;
}

export interface AgentPassportPersonaInputV1 {
  tagline: string;
  tags: string[];
}

export interface AgentPassportSkillsV1 {
  state: 'available' | 'unavailable';
  items: Array<{ id: string; name: string }>;
  total: number;
}

export interface AgentPassportTrackV1 {
  state: 'available' | 'unavailable';
  /** Exact values: owner view only. */
  tasksCompleted: number;
  partners: number;
  /** YYYY-MM-DD of the first completed task. */
  since: string | null;
  /** Public ranges. */
  tasksBucket: PassportCountBucket;
  partnersBucket: PassportCountBucket;
}

export interface AgentPassportAuthorityV1 {
  approvalRequired: boolean;
  limits: {
    singleTx?: number;
    daily?: number;
    monthly?: number;
    currency: string;
  } | null;
}

/** What a reputation credential attests: money settled, or a task fulfilled and paid (`agent_reputation_vc.kind`). */
export type PassportCredentialKind = 'settlement' | 'fulfillment';

export const PASSPORT_CREDENTIAL_KINDS: readonly PassportCredentialKind[] = ['settlement', 'fulfillment'];

/**
 * Whether the credentials have reached a chain: `anchored` once at least one
 * verified credential is in a Merkle batch on-chain, `pending` while some wait
 * for the next batch, `not_anchored` otherwise (including "none").
 */
export type PassportCredentialAnchor = 'anchored' | 'pending' | 'not_anchored';

/**
 * Slice 3.1 — the Agent's reputation credentials (`agent-reputation-vc`: W3C VCs
 * Agentrix signs over real settlement / fulfilment events), summarised for the
 * passport. Only credentials whose issuer signature verifies are counted, so
 * the summary cannot be inflated by a forged row. Exact counts stay on the
 * owner's side; every public surface gets {@link AgentPassportCredentialsPublicV1}.
 */
export interface AgentPassportCredentialsV1 {
  /** `unavailable` when the store could not be read or the VC feature is not enabled — never faked as zero. */
  state: 'available' | 'unavailable';
  /** Exact values: owner view only. */
  verifiedCount: number;
  settlementCount: number;
  fulfillmentCount: number;
  anchoredCount: number;
  /** Public range of verified credentials. */
  verifiedBucket: PassportCountBucket;
  /** Kinds with at least one verified credential, in {@link PASSPORT_CREDENTIAL_KINDS} order. */
  kinds: PassportCredentialKind[];
  anchor: PassportCredentialAnchor;
  /** YYYY-MM of the newest verified credential — month only, like the credential's own public time bucket. */
  latestOn: string | null;
}

/** The credentials as the public sees them: a range, the kinds, the anchor state, the month. No DID, no counts. */
export interface AgentPassportCredentialsPublicV1 {
  state: 'available' | 'unavailable';
  verifiedBucket: PassportCountBucket;
  kinds: PassportCredentialKind[];
  anchor: PassportCredentialAnchor;
  latestOn: string | null;
}

export interface AgentPassportProjectionV1 {
  schemaVersion: 1;
  agentAccountId: string;
  /** `agentUniqueId` — the external handle, also the A2A card path parameter. */
  agentRef: string;
  name: string;
  /** YYYY-MM-DD the Agent got its home. */
  issuedOn: string | null;
  /** Owner-written description, cleaned and capped; the A2A card's fallback line when no tagline is confirmed. */
  description?: string | null;
  persona: AgentPassportPersonaV1;
  skills: AgentPassportSkillsV1;
  track: AgentPassportTrackV1;
  authority: AgentPassportAuthorityV1;
  /** Slice 3.1. Older servers omit it; readers treat a missing block as `unavailable`. */
  credentials: AgentPassportCredentialsV1;
}

/** What leaves the owner's side: confirmed persona, buckets, skill names, authority boundary. */
export interface AgentPassportPublicV1 {
  schemaVersion: 1;
  agentRef: string;
  /** `AGX-XXXX-XXXX`, derived from the account id hash; never the id itself. */
  passportNumber: string;
  name: string;
  issuedOn: string | null;
  /** Owner-written description (cleaned, capped); only the card's fallback `description`. */
  description: string | null;
  tagline: string | null;
  tags: string[];
  skills: string[];
  track: { state: 'available' | 'unavailable'; tasksBucket: PassportCountBucket; partnersBucket: PassportCountBucket; since: string | null };
  authority: AgentPassportAuthorityV1;
  credentials: AgentPassportCredentialsPublicV1;
}

/**
 * `x-agentrix` on the per-Agent A2A card (`GET /api/a2a/agents/:agentRef/card`, spec R6).
 * The public passport minus what the card already says in standard fields (name,
 * description, skills). Buckets and the confirmed persona only — never exact counts,
 * the account id, the owner, a wallet, a DID or a draft.
 */
export interface AgentPassportCardExtensionV1 {
  schemaVersion: 1;
  agentRef: string;
  passportNumber: string;
  tagline: string | null;
  tags: string[];
  track: AgentPassportPublicV1['track'];
  authority: AgentPassportAuthorityV1;
  /** Slice 3.1: verified reputation credentials as a range + kinds + anchor state; never the DID or a count. */
  credentials: AgentPassportCredentialsPublicV1;
  issuedOn: string | null;
  /** The human-readable passport page for this Agent (`/share/agent/<agentRef>`). */
  passportUrl: string;
  /**
   * Slice 3.2 (R12.2): only on `GET …/card?g=<token>` for an `agent`-audience
   * grant that includes `credentialsMaterial`. Absent on the bare card.
   */
  credentialsMaterial?: PassportCredentialsMaterialV1;
}

// ---------------------------------------------------------------------------
// Credentials block, read defensively. One implementation for the Web client
// (owner projection over HTTP) and the shared card (public passport read back
// from an A2A card): anything malformed or missing is `unavailable`.
// ---------------------------------------------------------------------------

export function unavailablePassportCredentials(): AgentPassportCredentialsPublicV1 {
  return { state: 'unavailable', verifiedBucket: 0, kinds: [], anchor: 'not_anchored', latestOn: null };
}

const CREDENTIAL_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isPassportCredentialKind(value: unknown): value is PassportCredentialKind {
  return value === 'settlement' || value === 'fulfillment';
}

export function isPassportCredentialAnchor(value: unknown): value is PassportCredentialAnchor {
  return value === 'anchored' || value === 'pending' || value === 'not_anchored';
}

/** Public credentials block out of untrusted JSON; `unavailable` unless every field is well-formed. */
export function readPassportCredentialsPublic(value: unknown): AgentPassportCredentialsPublicV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return unavailablePassportCredentials();
  const record = value as Record<string, unknown>;
  if (record.state !== 'available' || !isPassportCountBucket(record.verifiedBucket)) {
    return unavailablePassportCredentials();
  }
  const kinds = PASSPORT_CREDENTIAL_KINDS.filter((kind) => Array.isArray(record.kinds) && record.kinds.includes(kind));
  return {
    state: 'available',
    verifiedBucket: record.verifiedBucket,
    kinds,
    anchor: isPassportCredentialAnchor(record.anchor) ? record.anchor : 'not_anchored',
    latestOn: typeof record.latestOn === 'string' && CREDENTIAL_MONTH_PATTERN.test(record.latestOn) ? record.latestOn : null,
  };
}

// ---------------------------------------------------------------------------
// Slice 3.2 — audience-graded sharing (spec R9–R13, decision d-145).
// A grant is a server-issued link the owner can preview, scope, expire and
// revoke; what it resolves to is an {@link AgentPassportViewV1}: the public
// passport plus whatever the audience's fields add. Exact counts never leave
// the owner's side for any audience; the subject DID leaves only inside the
// `agent` audience's verification material.
// ---------------------------------------------------------------------------

export type PassportAudience = 'public' | 'partner' | 'agent';
export const PASSPORT_AUDIENCES: readonly PassportAudience[] = ['public', 'partner', 'agent'];

/**
 * What a grant may carry. `authority` is not listed: the spending boundary is
 * the platform's promise and is on every view. `partner` shares the `public`
 * catalogue today (d-145 (a): no exact counts for anyone) — the audience still
 * matters for the receipt and for fields a later slice may add.
 */
export type PassportShareField =
  | 'persona'
  | 'skills'
  | 'track'
  | 'credentials'
  | 'credentialsMaterial'
  | 'description'
  | 'issuedOn';

const PUBLIC_SHARE_FIELDS: readonly PassportShareField[] = ['persona', 'skills', 'track', 'credentials', 'description', 'issuedOn'];

export const PASSPORT_SHARE_FIELDS_ALLOWED: Record<PassportAudience, readonly PassportShareField[]> = {
  public: PUBLIC_SHARE_FIELDS,
  partner: PUBLIC_SHARE_FIELDS,
  agent: [...PUBLIC_SHARE_FIELDS, 'credentialsMaterial'],
};

/** Ticked by default when the owner opens the share sheet; today equal to the allowed set. */
export const PASSPORT_SHARE_FIELDS_DEFAULT: Record<PassportAudience, readonly PassportShareField[]> = PASSPORT_SHARE_FIELDS_ALLOWED;

export type PassportShareExpiry = '7d' | '30d' | 'never';
export const PASSPORT_SHARE_EXPIRIES: readonly PassportShareExpiry[] = ['7d', '30d', 'never'];
export const PASSPORT_SHARE_EXPIRY_MS: Record<Exclude<PassportShareExpiry, 'never'>, number> = {
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};
export const PASSPORT_SHARE_LABEL_MAX = 40;

export interface AgentPassportShareRequestV1 {
  audience: PassportAudience;
  fields: PassportShareField[];
  expiresIn: PassportShareExpiry;
  /** Owner's own note ("给小明的 Agent"); shown only on the receipt, never to the viewer. */
  label: string | null;
}

export interface PassportShareValidationError {
  field: 'audience' | 'fields' | 'expiresIn' | 'label';
  code: 'audience_invalid' | 'fields_not_allowed' | 'expires_in_invalid' | 'label_too_long';
  message: string;
}

export interface PassportShareValidation {
  ok: boolean;
  value: AgentPassportShareRequestV1;
  errors: PassportShareValidationError[];
}

export function isPassportAudience(value: unknown): value is PassportAudience {
  return value === 'public' || value === 'partner' || value === 'agent';
}

export function isPassportShareField(value: unknown): value is PassportShareField {
  return value === 'persona' || value === 'skills' || value === 'track' || value === 'credentials'
    || value === 'credentialsMaterial' || value === 'description' || value === 'issuedOn';
}

/**
 * Cleans and validates a share request. Omitted fields mean "the default set";
 * a field outside the audience's allowed set is an error, not a silent drop.
 * Omitted expiry defaults to 30 days — a link the owner forgot about should
 * not live forever by accident.
 */
export function validatePassportShareRequest(input: unknown): PassportShareValidation {
  const errors: PassportShareValidationError[] = [];
  const record = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};

  const audience: PassportAudience = isPassportAudience(record.audience) ? record.audience : 'public';
  if (!isPassportAudience(record.audience)) {
    errors.push({ field: 'audience', code: 'audience_invalid', message: `audience must be one of ${PASSPORT_AUDIENCES.join(', ')}` });
  }

  const allowed = PASSPORT_SHARE_FIELDS_ALLOWED[audience];
  let fields: PassportShareField[];
  if (Array.isArray(record.fields) && record.fields.length) {
    const seen = new Set<PassportShareField>();
    const rejected: unknown[] = [];
    for (const raw of record.fields) {
      if (isPassportShareField(raw) && allowed.includes(raw)) seen.add(raw);
      else rejected.push(raw);
    }
    if (rejected.length) {
      errors.push({
        field: 'fields',
        code: 'fields_not_allowed',
        message: `fields not allowed for audience "${audience}": ${rejected.map((item) => String(item)).join(', ')}`,
      });
    }
    // Keep the catalogue order so two owners ticking the same boxes get the same receipt.
    fields = allowed.filter((field) => seen.has(field));
  } else {
    fields = [...PASSPORT_SHARE_FIELDS_DEFAULT[audience]];
  }

  let expiresIn: PassportShareExpiry = '30d';
  if (record.expiresIn !== undefined && record.expiresIn !== null) {
    if (record.expiresIn === '7d' || record.expiresIn === '30d' || record.expiresIn === 'never') {
      expiresIn = record.expiresIn;
    } else {
      errors.push({ field: 'expiresIn', code: 'expires_in_invalid', message: `expiresIn must be one of ${PASSPORT_SHARE_EXPIRIES.join(', ')}` });
    }
  }

  const label = cleanPassportText(record.label) || null;
  if (label && Array.from(label).length > PASSPORT_SHARE_LABEL_MAX) {
    errors.push({ field: 'label', code: 'label_too_long', message: `label must be at most ${PASSPORT_SHARE_LABEL_MAX} characters` });
  }

  return { ok: errors.length === 0, value: { audience, fields, expiresIn, label }, errors };
}

export type PassportShareStatus = 'active' | 'expired' | 'revoked';

/** The receipt for one issued link: what was shared, with whom (as an audience), and what happened to it. Never the token. */
export interface AgentPassportShareGrantV1 {
  shareId: string;
  audience: PassportAudience;
  fields: PassportShareField[];
  label: string | null;
  status: PassportShareStatus;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  accessCount: number;
  firstAccessedAt: string | null;
  lastAccessedAt: string | null;
  /** Only when the viewer was an Agent that presented a valid Agentrix bearer; humans stay anonymous. */
  viewerAgentRef: string | null;
}

/** Everything a third party needs to re-verify one credential offline; contains the subject DID by necessity. */
export interface PassportCredentialsMaterialItemV1 {
  did: string;
  issuer: string;
  anchorStatus: string;
  batchId?: string | null;
  anchorTxHash?: string | null;
  merkleProof?: string[] | null;
  leaf?: string | null;
  anchorContract?: string | null;
  chainId: number;
  publicCredential: Record<string, unknown>;
  proofJws: string;
  howToVerify: string;
}

export interface PassportCredentialsMaterialV1 {
  /** `unavailable` = VC feature off or store unreadable; `items` is then empty and nothing is claimed. */
  state: 'available' | 'unavailable';
  issuer: string | null;
  issuerKeyHistory: Array<{ version: string; address: string }>;
  /** Verified credentials only, newest first. */
  items: PassportCredentialsMaterialItemV1[];
}

/**
 * What a grant link resolves to. A superset of the public passport, so every
 * surface renders it with the same card builder; a field the owner did not
 * share is neutral (`null` / empty / `unavailable`), never invented.
 */
export interface AgentPassportViewV1 extends AgentPassportPublicV1 {
  audience: PassportAudience;
  fields: PassportShareField[];
  credentialsMaterial?: PassportCredentialsMaterialV1;
}

export function passportShareStatus(grant: { expiresAt: string | Date | null; revokedAt: string | Date | null }, now: number = Date.now()): PassportShareStatus {
  if (grant.revokedAt) return 'revoked';
  if (grant.expiresAt) {
    const expiry = grant.expiresAt instanceof Date ? grant.expiresAt.getTime() : Date.parse(grant.expiresAt);
    if (Number.isFinite(expiry) && expiry <= now) return 'expired';
  }
  return 'active';
}

/** Field-level validation failure for a persona submission. */
export interface PassportPersonaValidationError {
  field: 'tagline' | 'tags';
  code:
    | 'tagline_required'
    | 'tagline_too_long'
    | 'tags_required'
    | 'tags_too_many'
    | 'tag_too_long'
    | 'forbidden_phrase';
  message: string;
}

// ---------------------------------------------------------------------------
// Hash-derived passport number. Shared so the backend can print the same
// `AGX-…` on the A2A card that the owner sees on the passport.
// ---------------------------------------------------------------------------

/** FNV-1a 32-bit; stable across runtimes, no dependency. */
export function passportHash(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function passportNumberFromHash(hash: number): string {
  const hex = (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
  return `AGX-${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

export function passportNumber(seed: string): string {
  return passportNumberFromHash(passportHash(seed));
}

/** The number is the hash in hex, so a public page can rebuild the exact sigil from it. */
export function passportHashFromNumber(number: string): number | null {
  const match = /^AGX-([0-9A-F]{4})-([0-9A-F]{4})$/.exec(number);
  if (!match) return null;
  return parseInt(`${match[1]}${match[2]}`, 16) >>> 0;
}

// ---------------------------------------------------------------------------
// Persona cleaning + validation. One implementation for the API and the UI.
// ---------------------------------------------------------------------------

/** Strips control characters and angle brackets; collapses whitespace. */
export function cleanPassportText(value: unknown): string {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
}

export function containsForbiddenPassportPhrase(value: string): boolean {
  return PASSPORT_FORBIDDEN_PHRASES.some((phrase) => value.includes(phrase));
}

export interface PassportPersonaValidation {
  ok: boolean;
  value: AgentPassportPersonaInputV1;
  errors: PassportPersonaValidationError[];
}

/**
 * Cleans and validates a persona. Never truncates silently: over-long input is
 * an error the owner sees, not a quiet edit.
 */
export function validatePassportPersona(input: unknown): PassportPersonaValidation {
  const errors: PassportPersonaValidationError[] = [];
  const record = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const tagline = cleanPassportText(record.tagline);
  if (!tagline) {
    errors.push({ field: 'tagline', code: 'tagline_required', message: 'tagline is required' });
  } else if (Array.from(tagline).length > PASSPORT_TAGLINE_MAX) {
    errors.push({ field: 'tagline', code: 'tagline_too_long', message: `tagline must be at most ${PASSPORT_TAGLINE_MAX} characters` });
  } else if (containsForbiddenPassportPhrase(tagline)) {
    errors.push({ field: 'tagline', code: 'forbidden_phrase', message: 'tagline contains a phrase the passport never claims' });
  }

  const rawTags = Array.isArray(record.tags) ? record.tags : [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of rawTags) {
    const tag = cleanPassportText(raw);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  if (!tags.length) {
    errors.push({ field: 'tags', code: 'tags_required', message: 'at least one tag is required' });
  } else if (tags.length > PASSPORT_TAGS_MAX) {
    errors.push({ field: 'tags', code: 'tags_too_many', message: `at most ${PASSPORT_TAGS_MAX} tags` });
  }
  for (const tag of tags) {
    if (Array.from(tag).length > PASSPORT_TAG_MAX) {
      errors.push({ field: 'tags', code: 'tag_too_long', message: `tag "${tag}" must be at most ${PASSPORT_TAG_MAX} characters` });
      break;
    }
    if (containsForbiddenPassportPhrase(tag)) {
      errors.push({ field: 'tags', code: 'forbidden_phrase', message: `tag "${tag}" contains a phrase the passport never claims` });
      break;
    }
  }

  return { ok: errors.length === 0, value: { tagline, tags }, errors };
}
