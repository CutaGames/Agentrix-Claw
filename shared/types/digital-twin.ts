/**
 * Digital Twin — DT-owned shared contracts (`digital-twin/v1`).
 *
 * Ownership boundary (evidence/dt-g0-owner-map.md, dt-g0-type-reuse-blocklist.md):
 *  - This file owns **product projection state, opaque refs, digests, closed
 *    enums and reason codes**. It never carries a copy of a Trust, Authority,
 *    Payment, Memory or Conversation fact; those arrive as refs + status.
 *  - A Digital Twin Profile is a projection over one existing Agent. Nothing
 *    here can express a second agentId, Soul Core, wallet, balance or
 *    reputation, and the contract test pins that absence.
 *
 * Decoding is strict: unknown schema version, unknown field, unknown enum value
 * or malformed ref all fail closed. A consumer that receives `ok: false` must
 * render "unavailable/unknown", never a best-effort profile.
 */
import {
  CANONICAL_CONTENT_ENVIRONMENTS_V1,
  type CanonicalContentEnvironmentV1,
} from './canonical-content-ports';
import { computeDigest, type DigestRef } from './trust-loop-primitives';

export const DIGITAL_TWIN_SCHEMA_VERSION = 1 as const;
export const DIGITAL_TWIN_CONTRACT_VERSION = 'digital-twin/v1' as const;
export const DIGITAL_TWIN_PROFILE_DIGEST_DOMAIN = 'AGENTRIX_DIGITAL_TWIN_PROFILE_V1' as const;
export const DIGITAL_TWIN_ANSWER_DECISION_DIGEST_DOMAIN =
  'AGENTRIX_DIGITAL_TWIN_ANSWER_DECISION_V1' as const;
export const DIGITAL_TWIN_COMMAND_DIGEST_DOMAIN = 'AGENTRIX_DIGITAL_TWIN_COMMAND_V1' as const;

export const DIGITAL_TWIN_ENVIRONMENTS_V1 = CANONICAL_CONTENT_ENVIRONMENTS_V1;
export type DigitalTwinEnvironmentV1 = CanonicalContentEnvironmentV1;

// ---------------------------------------------------------------------------
// Flags and capabilities (frozen in evidence/dt-g0-flags-claims-rollback.md)
// ---------------------------------------------------------------------------

export const DIGITAL_TWIN_MASTER_FLAG = 'DIGITAL_TWIN_ENABLED' as const;

export const DIGITAL_TWIN_CAPABILITIES_V1 = [
  'private_profile',
  'content_intake',
  'interview',
  'review',
  'public',
  'likeness',
  'voice',
  'avatar',
  'stop',
  'offer_lead',
  'payment',
  'action',
] as const;
export type DigitalTwinCapabilityIdV1 = (typeof DIGITAL_TWIN_CAPABILITIES_V1)[number];

export const DIGITAL_TWIN_CAPABILITY_FLAGS_V1: Readonly<Record<DigitalTwinCapabilityIdV1, string>> = {
  private_profile: 'DIGITAL_TWIN_PRIVATE_ENABLED',
  content_intake: 'DIGITAL_TWIN_CONTENT_INTAKE_ENABLED',
  interview: 'DIGITAL_TWIN_INTERVIEW_ENABLED',
  review: 'DIGITAL_TWIN_REVIEW_ENABLED',
  public: 'DIGITAL_TWIN_PUBLIC_ENABLED',
  likeness: 'DIGITAL_TWIN_LIKENESS_ENABLED',
  voice: 'DIGITAL_TWIN_VOICE_ENABLED',
  avatar: 'DIGITAL_TWIN_AVATAR_ENABLED',
  stop: 'DIGITAL_TWIN_STOP_ENABLED',
  offer_lead: 'DIGITAL_TWIN_OFFER_LEAD_ENABLED',
  payment: 'DIGITAL_TWIN_PAYMENT_ENABLED',
  action: 'DIGITAL_TWIN_ACTION_ENABLED',
};

/** Kill switches (frozen in evidence/dt-g0-flags-claims-rollback.md); exact `'1'` disables, independent of the master. */
export const DIGITAL_TWIN_KILL_SWITCHES_V1 = {
  intakeAdapter: 'DIGITAL_TWIN_INTAKE_ADAPTER_KILL',
  bodyVoice: 'DIGITAL_TWIN_BODY_PROVIDER_VOICE_KILL',
  bodyAvatar: 'DIGITAL_TWIN_BODY_PROVIDER_AVATAR_KILL',
} as const;

/** Adapter enable flags (not capabilities). Exact `'1'`. Default off. */
export const DIGITAL_TWIN_DOCUMENT_PARSER_FLAG = 'DIGITAL_TWIN_DOCUMENT_PARSER_ENABLED' as const;
export const DIGITAL_TWIN_MEDIA_TRANSCRIPT_FLAG = 'DIGITAL_TWIN_MEDIA_TRANSCRIPT_ENABLED' as const;

/** Capabilities that Seed Trial (tasks §0.1) keeps off regardless of flags. */
export const DIGITAL_TWIN_SEED_TRIAL_HARD_OFF_V1: readonly DigitalTwinCapabilityIdV1[] = [
  'payment',
  'action',
];

export const DIGITAL_TWIN_COHORT_LIMITED_PREVIEW = 'limited_preview' as const;

// ---------------------------------------------------------------------------
// Closed enums
// ---------------------------------------------------------------------------

export const DIGITAL_TWIN_PROFILE_STATES_V1 = [
  'private_draft',
  'ready_private',
  'public_limited',
  'active',
  'paused',
  'revoked',
  'unknown',
] as const;
export type DigitalTwinProfileStateV1 = (typeof DIGITAL_TWIN_PROFILE_STATES_V1)[number];

export const DIGITAL_TWIN_PROFILE_MODES_V1 = ['private', 'public'] as const;
export type DigitalTwinProfileModeV1 = (typeof DIGITAL_TWIN_PROFILE_MODES_V1)[number];

export const DIGITAL_TWIN_FACETS_V1 = ['private', 'work', 'public'] as const;
export type DigitalTwinFacetV1 = (typeof DIGITAL_TWIN_FACETS_V1)[number];

export const DIGITAL_TWIN_ANSWER_CLASSES_V1 = ['confirmed', 'inferred', 'no_answer'] as const;
export type DigitalTwinAnswerClassV1 = (typeof DIGITAL_TWIN_ANSWER_CLASSES_V1)[number];

export const DIGITAL_TWIN_NO_ANSWER_REASONS_V1 = [
  'hard_boundary',
  'insufficient_source',
  'source_conflict',
  'facet_denied',
  'consent_unknown',
  'mandate_unknown',
  'stale_projection',
  'self_model_unavailable',
  'model_outage',
  'provider_unavailable',
  'rights_unknown',
  'third_party_speech',
  'seed_policy_denied',
  'professional_advice_restricted',
  'price_or_contract_commitment',
  'privacy_or_third_party',
  'requires_human',
] as const;
export type DigitalTwinNoAnswerReasonV1 = (typeof DIGITAL_TWIN_NO_ANSWER_REASONS_V1)[number];

/** Facts owned elsewhere that a Profile state depends on. */
export const DIGITAL_TWIN_PREREQUISITES_V1 = [
  'identity',
  'represents',
  'likeness_consent',
  'mandate',
  'public_facet',
] as const;
export type DigitalTwinPrerequisiteV1 = (typeof DIGITAL_TWIN_PREREQUISITES_V1)[number];

/**
 * Status of a canonical fact as seen by Digital Twin.
 * `unknown` (owner reachable, answer indeterminate) and `unavailable` (owner
 * port not published / blocked) are distinct and neither may be rendered as
 * `absent`.
 */
export const DIGITAL_TWIN_PREREQUISITE_STATUSES_V1 = [
  'active',
  'absent',
  'expired',
  'revoked',
  'unknown',
  'unavailable',
] as const;
export type DigitalTwinPrerequisiteStatusV1 =
  (typeof DIGITAL_TWIN_PREREQUISITE_STATUSES_V1)[number];

export type DigitalTwinPrerequisiteSnapshotV1 = Readonly<
  Record<DigitalTwinPrerequisiteV1, DigitalTwinPrerequisiteStatusV1>
>;

export const DIGITAL_TWIN_REF_KINDS_V1 = [
  'digital_twin_profile',
  'agent_account',
  'principal',
  'represents',
  'likeness_consent',
  'self_model',
  'public_facet',
  'offer_catalog',
  'representation_mandate',
  'body_binding',
  'public_profile',
  'answer_decision',
  'review_item',
  'operation',
  'evidence',
  'interview_session',
  'candidate_plan',
  'intake_plan',
  'import_job',
  'transcript',
  'thread',
  'turn',
  'canonical_item',
  'cluster',
  'digest',
  'twin_stop',
  'likeness_consent_interim',
  'represents_interim',
  'public_facet_interim',
  'visitor_session',
  'body_asset_interim',
  'lead_interim',
  'content_draft_interim',
] as const;
export type DigitalTwinRefKindV1 = (typeof DIGITAL_TWIN_REF_KINDS_V1)[number];

/** Opaque, versioned pointer to a fact owned by a canonical domain. */
export interface DigitalTwinRefV1 {
  kind: DigitalTwinRefKindV1;
  id: string;
  version?: number;
  digest?: DigestRef;
}

export const DIGITAL_TWIN_DECODE_FAILURES_V1 = [
  'unknown_schema_version',
  'unknown_contract_version',
  'invalid_shape',
  'unknown_field',
  'invalid_enum',
  'invalid_ref',
  'invalid_timestamp',
] as const;
export type DigitalTwinDecodeFailureV1 = (typeof DIGITAL_TWIN_DECODE_FAILURES_V1)[number];

export const DIGITAL_TWIN_REJECTION_REASONS_V1 = [
  'flag_off',
  'capability_off',
  'seed_trial_hard_off',
  'not_in_cohort',
  'environment_denied',
  'audience_denied',
  'wrong_owner',
  'wrong_agent',
  'wrong_tenant',
  /** Canonical Tenant Authority answered `not_found` (or no `AGT-…` id to ask with) while the tenant guard enforces. */
  'tenant_denied',
  /** Canonical Tenant Authority `unavailable` / `ambiguous` / threw while the tenant guard enforces. */
  'tenant_unavailable',
  'invalid_request',
  'idempotency_conflict',
  'version_conflict',
  'profile_already_exists',
  'profile_not_found',
  'owner_port_unavailable',
  'blocked_tc_02_0',
  'seed_interim_only',
  'second_identity_forbidden',
  'secret_prohibited',
  'session_not_found',
  'plan_stale',
  'unverified',
  'profile_stopped',
  'not_published',
  'prerequisite_not_active',
  'rate_limited',
] as const;
export type DigitalTwinRejectionReasonV1 = (typeof DIGITAL_TWIN_REJECTION_REASONS_V1)[number];

/** Rejections a client may retry after the named condition changes. */
export const DIGITAL_TWIN_RETRYABLE_REJECTIONS_V1: readonly DigitalTwinRejectionReasonV1[] = [
  'flag_off',
  'capability_off',
  'not_in_cohort',
  'tenant_unavailable',
  'owner_port_unavailable',
  'blocked_tc_02_0',
  'unverified',
];

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export interface DigitalTwinProfileV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  contractVersion: typeof DIGITAL_TWIN_CONTRACT_VERSION;
  profileRef: DigitalTwinRefV1;
  /** The one existing Agent this Profile projects. Never a new identity. */
  agentRef: DigitalTwinRefV1;
  /** Owner principal (`principal:user:<id>`), derived server-side. */
  ownerRef: DigitalTwinRefV1;
  environment: DigitalTwinEnvironmentV1;
  mode: DigitalTwinProfileModeV1;
  state: DigitalTwinProfileStateV1;
  stateVersion: number;
  prerequisites: DigitalTwinPrerequisiteSnapshotV1;
  representedPrincipalRef?: DigitalTwinRefV1;
  representsRef?: DigitalTwinRefV1;
  selfModelRef?: DigitalTwinRefV1;
  publicFacetRef?: DigitalTwinRefV1;
  offerCatalogRef?: DigitalTwinRefV1;
  likenessConsentRefs: DigitalTwinRefV1[];
  mandateRef?: DigitalTwinRefV1;
  bodyBindingRefs: DigitalTwinRefV1[];
  publicProfileRef?: DigitalTwinRefV1;
  /** Seed Trial marker: interim records are product state, not canonical truth. */
  seedInterim: boolean;
  /**
   * Where each prerequisite status came from. `interim_seed` means a Digital
   * Twin `interim_seed_*` record stood in for an unpublished canonical owner
   * (tasks §0.1.4); such statuses never authorize Authority or payment.
   */
  prerequisiteSources?: Partial<Record<DigitalTwinPrerequisiteV1, DigitalTwinPrerequisiteSourceV1>>;
  createdAt: string;
  updatedAt: string;
}

export const DIGITAL_TWIN_PREREQUISITE_SOURCES_V1 = ['canonical', 'interim_seed'] as const;
export type DigitalTwinPrerequisiteSourceV1 = (typeof DIGITAL_TWIN_PREREQUISITE_SOURCES_V1)[number];

const PROFILE_REQUIRED_KEYS = [
  'schemaVersion',
  'contractVersion',
  'profileRef',
  'agentRef',
  'ownerRef',
  'environment',
  'mode',
  'state',
  'stateVersion',
  'prerequisites',
  'likenessConsentRefs',
  'bodyBindingRefs',
  'seedInterim',
  'createdAt',
  'updatedAt',
] as const;

const PROFILE_OPTIONAL_REF_KEYS = [
  'representedPrincipalRef',
  'representsRef',
  'selfModelRef',
  'publicFacetRef',
  'offerCatalogRef',
  'mandateRef',
  'publicProfileRef',
] as const;

/**
 * Field names a Profile must never carry. A Profile is a projection over one
 * Agent; these would each be a second identity, a second wallet or a second
 * reputation surface (design DT-D01).
 */
export const DIGITAL_TWIN_FORBIDDEN_PROFILE_FIELDS_V1 = [
  'agentId',
  'agentUniqueId',
  'soulCoreId',
  'soulCoreRef',
  'walletId',
  'walletAddress',
  'mpcWalletId',
  'balance',
  'creditScore',
  'reputation',
  'reputationScore',
  'apiKey',
  'did',
] as const;

// ---------------------------------------------------------------------------
// Profile state derivation (I/O free)
// ---------------------------------------------------------------------------

export interface DigitalTwinProfileStateInputV1 {
  mode: DigitalTwinProfileModeV1;
  prerequisites: DigitalTwinPrerequisiteSnapshotV1;
  /** Twin Stop executed and every mandatory target terminal. */
  stopped: boolean;
  /** Twin Stop executed but at least one mandatory target is pending/unknown. */
  stopPending: boolean;
  /** Minimum content/interview present (Task 4 decides; false in Task 2). */
  hasMinimumSelfModel: boolean;
}

const PUBLIC_MANDATORY_PREREQUISITES: readonly DigitalTwinPrerequisiteV1[] = [
  'identity',
  'represents',
  'likeness_consent',
  'mandate',
  'public_facet',
];

/**
 * Derive Profile state from canonical prerequisite statuses.
 *
 *  - A private Profile never needs principal, consent, mandate or facet
 *    (design DT-D02); it is `private_draft` until minimum Self Model exists.
 *  - A public Profile is `active` only when every mandatory prerequisite is
 *    exactly `active`. Any `unknown`/`unavailable` yields `paused` and any
 *    `revoked` yields `revoked`; `absent`/`expired` yield `public_limited`.
 *  - Stop pending is `paused`; stop converged is `revoked`.
 */
export function deriveDigitalTwinProfileStateV1(
  input: DigitalTwinProfileStateInputV1,
): DigitalTwinProfileStateV1 {
  if (input.stopped) return 'revoked';
  if (input.stopPending) return 'paused';
  const statuses = PUBLIC_MANDATORY_PREREQUISITES.map((key) => input.prerequisites[key]);
  if (statuses.some((status) => status === 'revoked')) {
    return input.mode === 'public' ? 'revoked' : 'private_draft';
  }
  if (input.mode === 'private') {
    return input.hasMinimumSelfModel ? 'ready_private' : 'private_draft';
  }
  if (statuses.some((status) => status === 'unknown' || status === 'unavailable')) {
    return 'paused';
  }
  if (statuses.every((status) => status === 'active')) {
    return 'active';
  }
  return 'public_limited';
}

// ---------------------------------------------------------------------------
// Answer decision and review projection (no raw text)
// ---------------------------------------------------------------------------

export interface TwinAnswerDecisionV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  decisionRef: DigitalTwinRefV1;
  profileRef: DigitalTwinRefV1;
  facet: DigitalTwinFacetV1;
  threadRef: DigitalTwinRefV1;
  projectionRef?: DigitalTwinRefV1;
  answerClass: DigitalTwinAnswerClassV1;
  noAnswerReason?: DigitalTwinNoAnswerReasonV1;
  sourceRefs: DigitalTwinRefV1[];
  requiresHumanHandoff: boolean;
  policyVersion: string;
  requestDigest: DigestRef;
  decisionDigest: DigestRef;
  createdAt: string;
}

export const DIGITAL_TWIN_REVIEW_PRIORITIES_V1 = ['critical', 'action', 'review', 'insight'] as const;
export type DigitalTwinReviewPriorityV1 = (typeof DIGITAL_TWIN_REVIEW_PRIORITIES_V1)[number];

export const DIGITAL_TWIN_REVIEW_ACTIONS_V1 = [
  'confirm',
  'correct',
  'forbid_inference',
  'expire',
  'remove_source',
  'reply',
  'remedy',
  'defer',
] as const;
export type DigitalTwinReviewActionV1 = (typeof DIGITAL_TWIN_REVIEW_ACTIONS_V1)[number];

export const DIGITAL_TWIN_REVIEW_STATES_V1 = ['open', 'decided', 'superseded', 'expired'] as const;
export type DigitalTwinReviewStateV1 = (typeof DIGITAL_TWIN_REVIEW_STATES_V1)[number];

export interface TwinReviewItemV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  reviewRef: DigitalTwinRefV1;
  profileRef: DigitalTwinRefV1;
  sourceOutputRefs: DigitalTwinRefV1[];
  clusterRef?: DigitalTwinRefV1;
  priority: DigitalTwinReviewPriorityV1;
  reasonCodes: string[];
  recommendedActions: DigitalTwinReviewActionV1[];
  state: DigitalTwinReviewStateV1;
  /** Redacted question (≤160 chars) when the question has no Creator thread turn, e.g. a Visitor question on the public Facet. */
  questionSample?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Capability projection (what the Web client is allowed to believe)
// ---------------------------------------------------------------------------

export const DIGITAL_TWIN_CAPABILITY_STATUSES_V1 = ['available', 'unavailable', 'unknown'] as const;
export type DigitalTwinCapabilityStatusV1 = (typeof DIGITAL_TWIN_CAPABILITY_STATUSES_V1)[number];

export interface DigitalTwinCapabilityV1 {
  capability: DigitalTwinCapabilityIdV1;
  status: DigitalTwinCapabilityStatusV1;
  reasonCode?: DigitalTwinRejectionReasonV1;
  /** e.g. `flag:DIGITAL_TWIN_PUBLIC_ENABLED`, `gate:TC-02.0`, `owner:trust-core` */
  blockedBy?: string;
}

// ---------------------------------------------------------------------------
// Interview / Self Model summaries carried on the projection (Task 4)
// ---------------------------------------------------------------------------

export const DIGITAL_TWIN_INTERVIEW_SESSION_STATES_V1 = ['in_progress', 'minimum_met', 'complete'] as const;
export type DigitalTwinInterviewSessionStateV1 = (typeof DIGITAL_TWIN_INTERVIEW_SESSION_STATES_V1)[number];

export interface DigitalTwinInterviewProgressV1 {
  answered: number;
  skipped: number;
  total: number;
  coreAnswered: number;
  coreTotal: number;
  /** Every core question answered (not skipped). The ten-minute minimum. */
  minimumMet: boolean;
}

export interface DigitalTwinInterviewSummaryV1 {
  sessionRef: DigitalTwinRefV1;
  templateVersion: string;
  state: DigitalTwinInterviewSessionStateV1;
  progress: DigitalTwinInterviewProgressV1;
  /** Digest of the last candidate plan built from this session, if any. */
  lastPlanDigest?: DigestRef;
  updatedAt: string;
}

/**
 * What Digital Twin knows about the Self Model. It never holds Self Model
 * content: canonical items live with the Agent/Memory/Knowledge owners and are
 * reached through their receipts. `linkedImportJobRefs` are Portability job
 * refs whose committed receipt was corroborated through the owner-scoped
 * progress port; `hasMinimum` is the `ready_private` input.
 */
export interface DigitalTwinSelfModelSummaryV1 {
  selfModelRef?: DigitalTwinRefV1;
  linkedImportJobRefs: DigitalTwinRefV1[];
  interimPolicyVersion: number;
  offerDraftCount: number;
  hasMinimum: boolean;
}

export interface DigitalTwinProjectionV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  contractVersion: typeof DIGITAL_TWIN_CONTRACT_VERSION;
  agentRef: DigitalTwinRefV1;
  environment: DigitalTwinEnvironmentV1;
  cohort: string;
  capabilities: DigitalTwinCapabilityV1[];
  profile: DigitalTwinProfileV1 | null;
  interview?: DigitalTwinInterviewSummaryV1 | null;
  selfModel?: DigitalTwinSelfModelSummaryV1 | null;
  /** Honest edges, published so a client cannot infer them away. */
  notImplemented: string[];
  projectedAt: string;
}

// ---------------------------------------------------------------------------
// Commands and results
// ---------------------------------------------------------------------------

export interface DigitalTwinCreatePrivateProfileCommandV1 {
  schemaVersion: typeof DIGITAL_TWIN_SCHEMA_VERSION;
  /** Only `private` is accepted before DT-G2. */
  mode: 'private';
}

export type DigitalTwinCommandResultV1<T> =
  | { status: 'applied'; value: T; operationRef: DigitalTwinRefV1 }
  | { status: 'replayed'; value: T; operationRef: DigitalTwinRefV1 }
  | { status: 'rejected'; reasonCode: DigitalTwinRejectionReasonV1; retryable: boolean; blockedBy?: string };

/** The `rejected` arm alone; assignable to any `DigitalTwinCommandResultV1<T>`. */
export type DigitalTwinRejectionV1 = Extract<DigitalTwinCommandResultV1<never>, { status: 'rejected' }>;

export function digitalTwinRejectionV1<T = never>(
  reasonCode: DigitalTwinRejectionReasonV1,
  blockedBy?: string,
): DigitalTwinCommandResultV1<T> {
  return {
    status: 'rejected',
    reasonCode,
    retryable: DIGITAL_TWIN_RETRYABLE_REJECTIONS_V1.includes(reasonCode),
    ...(blockedBy ? { blockedBy } : {}),
  };
}

// ---------------------------------------------------------------------------
// Digests
// ---------------------------------------------------------------------------

export function computeDigitalTwinProfileDigestV1(profile: DigitalTwinProfileV1): DigestRef {
  return computeDigest({ domain: DIGITAL_TWIN_PROFILE_DIGEST_DOMAIN, profile });
}

export function computeDigitalTwinCommandDigestV1(input: {
  ownerRef: DigitalTwinRefV1;
  agentRef: DigitalTwinRefV1;
  environment: DigitalTwinEnvironmentV1;
  command: DigitalTwinCreatePrivateProfileCommandV1;
}): DigestRef {
  return computeDigest({ domain: DIGITAL_TWIN_COMMAND_DIGEST_DOMAIN, ...input });
}

export function computeTwinAnswerDecisionDigestV1(
  decision: Omit<TwinAnswerDecisionV1, 'decisionDigest'>,
): DigestRef {
  return computeDigest({ domain: DIGITAL_TWIN_ANSWER_DECISION_DIGEST_DOMAIN, decision });
}

// ---------------------------------------------------------------------------
// Strict decoders
// ---------------------------------------------------------------------------

export type DigitalTwinDecodeResultV1<T> =
  | { ok: true; value: T }
  | { ok: false; reasonCode: DigitalTwinDecodeFailureV1; errors: string[] };

function fail<T>(reasonCode: DigitalTwinDecodeFailureV1, errors: string[]): DigitalTwinDecodeResultV1<T> {
  return { ok: false, reasonCode, errors };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.includes('T') && Number.isFinite(Date.parse(value));
}

function isMember<T extends readonly string[]>(list: T, value: unknown): value is T[number] {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

function isDigestRef(value: unknown): value is DigestRef {
  return (
    isRecord(value) &&
    value.algorithm === 'sha-256' &&
    isNonEmptyString(value.canonicalization) &&
    typeof value.value === 'string' &&
    /^[0-9a-f]{64}$/.test(value.value) &&
    Object.keys(value).every((key) => ['algorithm', 'canonicalization', 'value'].includes(key))
  );
}

export function isDigitalTwinRefV1(value: unknown): value is DigitalTwinRefV1 {
  if (!isRecord(value)) return false;
  if (!isMember(DIGITAL_TWIN_REF_KINDS_V1, value.kind)) return false;
  if (!isNonEmptyString(value.id)) return false;
  if (value.version !== undefined && !(Number.isInteger(value.version) && (value.version as number) >= 0)) {
    return false;
  }
  if (value.digest !== undefined && !isDigestRef(value.digest)) return false;
  return Object.keys(value).every((key) => ['kind', 'id', 'version', 'digest'].includes(key));
}

function unknownKeys(record: Record<string, unknown>, allowed: readonly string[]): string[] {
  return Object.keys(record).filter((key) => !allowed.includes(key));
}

function decodePrerequisites(value: unknown): DigitalTwinPrerequisiteSnapshotV1 | undefined {
  if (!isRecord(value)) return undefined;
  if (unknownKeys(value, DIGITAL_TWIN_PREREQUISITES_V1).length > 0) return undefined;
  const out: Partial<Record<DigitalTwinPrerequisiteV1, DigitalTwinPrerequisiteStatusV1>> = {};
  for (const key of DIGITAL_TWIN_PREREQUISITES_V1) {
    const status = value[key];
    if (!isMember(DIGITAL_TWIN_PREREQUISITE_STATUSES_V1, status)) return undefined;
    out[key] = status;
  }
  return out as DigitalTwinPrerequisiteSnapshotV1;
}

function decodeRefArray(value: unknown): DigitalTwinRefV1[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.every(isDigitalTwinRefV1) ? (value as DigitalTwinRefV1[]) : undefined;
}

/**
 * Shared strict-decode primitives for the other `digital-twin-*` contract files.
 * Namespaced so the barrel re-export cannot collide with another module's helpers.
 */
export const DIGITAL_TWIN_DECODE_HELPERS_V1 = {
  isRecord,
  isNonEmptyString,
  isIsoTimestamp,
  isMember,
  isDigestRef,
  unknownKeys,
  decodeRefArray,
  fail,
} as const;

function checkVersionAndContract(record: Record<string, unknown>): DigitalTwinDecodeResultV1<never> | undefined {
  if (record.schemaVersion !== DIGITAL_TWIN_SCHEMA_VERSION) {
    return fail('unknown_schema_version', [`schemaVersion=${String(record.schemaVersion)}`]);
  }
  if ('contractVersion' in record && record.contractVersion !== DIGITAL_TWIN_CONTRACT_VERSION) {
    return fail('unknown_contract_version', [`contractVersion=${String(record.contractVersion)}`]);
  }
  return undefined;
}

export function decodeDigitalTwinProfileV1(input: unknown): DigitalTwinDecodeResultV1<DigitalTwinProfileV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['profile must be an object']);
  const versionFailure = checkVersionAndContract(input);
  if (versionFailure) return versionFailure;
  if (input.contractVersion !== DIGITAL_TWIN_CONTRACT_VERSION) {
    return fail('unknown_contract_version', ['contractVersion missing']);
  }

  const forbidden = Object.keys(input).filter((key) =>
    (DIGITAL_TWIN_FORBIDDEN_PROFILE_FIELDS_V1 as readonly string[]).includes(key),
  );
  if (forbidden.length > 0) return fail('unknown_field', forbidden.map((key) => `forbidden:${key}`));

  const extra = unknownKeys(input, [...PROFILE_REQUIRED_KEYS, ...PROFILE_OPTIONAL_REF_KEYS, 'prerequisiteSources']);
  if (extra.length > 0) return fail('unknown_field', extra);
  if (input.prerequisiteSources !== undefined) {
    if (!isRecord(input.prerequisiteSources)) return fail('invalid_shape', ['prerequisiteSources']);
    for (const [key, value] of Object.entries(input.prerequisiteSources)) {
      if (!isMember(DIGITAL_TWIN_PREREQUISITES_V1, key) || !isMember(DIGITAL_TWIN_PREREQUISITE_SOURCES_V1, value)) {
        return fail('invalid_enum', [`prerequisiteSources.${key}`]);
      }
    }
  }

  const errors: string[] = [];
  for (const key of ['profileRef', 'agentRef', 'ownerRef'] as const) {
    if (!isDigitalTwinRefV1(input[key])) errors.push(key);
  }
  if (errors.length > 0) return fail('invalid_ref', errors);
  if ((input.profileRef as DigitalTwinRefV1).kind !== 'digital_twin_profile') {
    return fail('invalid_ref', ['profileRef.kind']);
  }
  if ((input.agentRef as DigitalTwinRefV1).kind !== 'agent_account') {
    return fail('invalid_ref', ['agentRef.kind']);
  }
  if ((input.ownerRef as DigitalTwinRefV1).kind !== 'principal') {
    return fail('invalid_ref', ['ownerRef.kind']);
  }

  if (!isMember(DIGITAL_TWIN_ENVIRONMENTS_V1, input.environment)) return fail('invalid_enum', ['environment']);
  if (!isMember(DIGITAL_TWIN_PROFILE_MODES_V1, input.mode)) return fail('invalid_enum', ['mode']);
  if (!isMember(DIGITAL_TWIN_PROFILE_STATES_V1, input.state)) return fail('invalid_enum', ['state']);
  if (!(Number.isInteger(input.stateVersion) && (input.stateVersion as number) >= 1)) {
    return fail('invalid_shape', ['stateVersion']);
  }
  const prerequisites = decodePrerequisites(input.prerequisites);
  if (!prerequisites) return fail('invalid_enum', ['prerequisites']);
  const likenessConsentRefs = decodeRefArray(input.likenessConsentRefs);
  if (!likenessConsentRefs) return fail('invalid_ref', ['likenessConsentRefs']);
  const bodyBindingRefs = decodeRefArray(input.bodyBindingRefs);
  if (!bodyBindingRefs) return fail('invalid_ref', ['bodyBindingRefs']);
  if (typeof input.seedInterim !== 'boolean') return fail('invalid_shape', ['seedInterim']);
  if (!isIsoTimestamp(input.createdAt) || !isIsoTimestamp(input.updatedAt)) {
    return fail('invalid_timestamp', ['createdAt/updatedAt']);
  }
  for (const key of PROFILE_OPTIONAL_REF_KEYS) {
    if (input[key] !== undefined && !isDigitalTwinRefV1(input[key])) return fail('invalid_ref', [key]);
  }

  return { ok: true, value: input as unknown as DigitalTwinProfileV1 };
}

export function decodeDigitalTwinCapabilityV1(input: unknown): DigitalTwinDecodeResultV1<DigitalTwinCapabilityV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['capability must be an object']);
  const extra = unknownKeys(input, ['capability', 'status', 'reasonCode', 'blockedBy']);
  if (extra.length > 0) return fail('unknown_field', extra);
  if (!isMember(DIGITAL_TWIN_CAPABILITIES_V1, input.capability)) return fail('invalid_enum', ['capability']);
  if (!isMember(DIGITAL_TWIN_CAPABILITY_STATUSES_V1, input.status)) return fail('invalid_enum', ['status']);
  if (input.reasonCode !== undefined && !isMember(DIGITAL_TWIN_REJECTION_REASONS_V1, input.reasonCode)) {
    return fail('invalid_enum', ['reasonCode']);
  }
  if (input.blockedBy !== undefined && !isNonEmptyString(input.blockedBy)) return fail('invalid_shape', ['blockedBy']);
  return { ok: true, value: input as unknown as DigitalTwinCapabilityV1 };
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

export function decodeDigitalTwinInterviewProgressV1(
  input: unknown,
): DigitalTwinDecodeResultV1<DigitalTwinInterviewProgressV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['progress must be an object']);
  const keys = ['answered', 'skipped', 'total', 'coreAnswered', 'coreTotal', 'minimumMet'];
  const extra = unknownKeys(input, keys);
  if (extra.length > 0) return fail('unknown_field', extra);
  for (const key of ['answered', 'skipped', 'total', 'coreAnswered', 'coreTotal']) {
    if (!isNonNegativeInteger(input[key])) return fail('invalid_shape', [key]);
  }
  if (typeof input.minimumMet !== 'boolean') return fail('invalid_shape', ['minimumMet']);
  return { ok: true, value: input as unknown as DigitalTwinInterviewProgressV1 };
}

export function decodeDigitalTwinInterviewSummaryV1(
  input: unknown,
): DigitalTwinDecodeResultV1<DigitalTwinInterviewSummaryV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['interview summary must be an object']);
  const extra = unknownKeys(input, ['sessionRef', 'templateVersion', 'state', 'progress', 'lastPlanDigest', 'updatedAt']);
  if (extra.length > 0) return fail('unknown_field', extra);
  if (!isDigitalTwinRefV1(input.sessionRef) || input.sessionRef.kind !== 'interview_session') {
    return fail('invalid_ref', ['sessionRef']);
  }
  if (!isNonEmptyString(input.templateVersion)) return fail('invalid_shape', ['templateVersion']);
  if (!isMember(DIGITAL_TWIN_INTERVIEW_SESSION_STATES_V1, input.state)) return fail('invalid_enum', ['state']);
  const progress = decodeDigitalTwinInterviewProgressV1(input.progress);
  if (progress.ok === false) return progress as DigitalTwinDecodeResultV1<DigitalTwinInterviewSummaryV1>;
  if (input.lastPlanDigest !== undefined && !isDigestRef(input.lastPlanDigest)) {
    return fail('invalid_shape', ['lastPlanDigest']);
  }
  if (!isIsoTimestamp(input.updatedAt)) return fail('invalid_timestamp', ['updatedAt']);
  return { ok: true, value: input as unknown as DigitalTwinInterviewSummaryV1 };
}

export function decodeDigitalTwinSelfModelSummaryV1(
  input: unknown,
): DigitalTwinDecodeResultV1<DigitalTwinSelfModelSummaryV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['self model summary must be an object']);
  const extra = unknownKeys(input, [
    'selfModelRef',
    'linkedImportJobRefs',
    'interimPolicyVersion',
    'offerDraftCount',
    'hasMinimum',
  ]);
  if (extra.length > 0) return fail('unknown_field', extra);
  if (input.selfModelRef !== undefined) {
    if (!isDigitalTwinRefV1(input.selfModelRef) || input.selfModelRef.kind !== 'self_model') {
      return fail('invalid_ref', ['selfModelRef']);
    }
  }
  const links = decodeRefArray(input.linkedImportJobRefs);
  if (!links || links.some((ref) => ref.kind !== 'import_job')) return fail('invalid_ref', ['linkedImportJobRefs']);
  if (!isNonNegativeInteger(input.interimPolicyVersion)) return fail('invalid_shape', ['interimPolicyVersion']);
  if (!isNonNegativeInteger(input.offerDraftCount)) return fail('invalid_shape', ['offerDraftCount']);
  if (typeof input.hasMinimum !== 'boolean') return fail('invalid_shape', ['hasMinimum']);
  return { ok: true, value: input as unknown as DigitalTwinSelfModelSummaryV1 };
}

export function decodeDigitalTwinProjectionV1(
  input: unknown,
): DigitalTwinDecodeResultV1<DigitalTwinProjectionV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['projection must be an object']);
  const versionFailure = checkVersionAndContract(input);
  if (versionFailure) return versionFailure;
  if (input.contractVersion !== DIGITAL_TWIN_CONTRACT_VERSION) {
    return fail('unknown_contract_version', ['contractVersion missing']);
  }
  const extra = unknownKeys(input, [
    'schemaVersion',
    'contractVersion',
    'agentRef',
    'environment',
    'cohort',
    'capabilities',
    'profile',
    'interview',
    'selfModel',
    'notImplemented',
    'projectedAt',
  ]);
  if (extra.length > 0) return fail('unknown_field', extra);
  if (input.interview !== undefined && input.interview !== null) {
    const interview = decodeDigitalTwinInterviewSummaryV1(input.interview);
    if (interview.ok === false) return interview as DigitalTwinDecodeResultV1<DigitalTwinProjectionV1>;
  }
  if (input.selfModel !== undefined && input.selfModel !== null) {
    const selfModel = decodeDigitalTwinSelfModelSummaryV1(input.selfModel);
    if (selfModel.ok === false) return selfModel as DigitalTwinDecodeResultV1<DigitalTwinProjectionV1>;
  }
  if (!isDigitalTwinRefV1(input.agentRef) || input.agentRef.kind !== 'agent_account') {
    return fail('invalid_ref', ['agentRef']);
  }
  if (!isMember(DIGITAL_TWIN_ENVIRONMENTS_V1, input.environment)) return fail('invalid_enum', ['environment']);
  if (typeof input.cohort !== 'string') return fail('invalid_shape', ['cohort']);
  if (!Array.isArray(input.capabilities)) return fail('invalid_shape', ['capabilities']);
  const capabilities: DigitalTwinCapabilityV1[] = [];
  for (const item of input.capabilities) {
    const decoded = decodeDigitalTwinCapabilityV1(item);
    if (!decoded.ok) return decoded as DigitalTwinDecodeResultV1<DigitalTwinProjectionV1>;
    capabilities.push(decoded.value);
  }
  const seen = new Set(capabilities.map((item) => item.capability));
  if (seen.size !== DIGITAL_TWIN_CAPABILITIES_V1.length) {
    return fail('invalid_shape', ['capabilities must list every capability exactly once']);
  }
  if (input.profile !== null) {
    const profile = decodeDigitalTwinProfileV1(input.profile);
    if (!profile.ok) return profile as DigitalTwinDecodeResultV1<DigitalTwinProjectionV1>;
  }
  if (!Array.isArray(input.notImplemented) || !input.notImplemented.every((item) => typeof item === 'string')) {
    return fail('invalid_shape', ['notImplemented']);
  }
  if (!isIsoTimestamp(input.projectedAt)) return fail('invalid_timestamp', ['projectedAt']);
  return { ok: true, value: input as unknown as DigitalTwinProjectionV1 };
}

export function decodeDigitalTwinCreatePrivateProfileCommandV1(
  input: unknown,
): DigitalTwinDecodeResultV1<DigitalTwinCreatePrivateProfileCommandV1> {
  if (!isRecord(input)) return fail('invalid_shape', ['command must be an object']);
  if (input.schemaVersion !== DIGITAL_TWIN_SCHEMA_VERSION) {
    return fail('unknown_schema_version', [`schemaVersion=${String(input.schemaVersion)}`]);
  }
  const extra = unknownKeys(input, ['schemaVersion', 'mode']);
  if (extra.length > 0) return fail('unknown_field', extra);
  if (input.mode !== 'private') return fail('invalid_enum', ['mode']);
  return { ok: true, value: { schemaVersion: DIGITAL_TWIN_SCHEMA_VERSION, mode: 'private' } };
}
