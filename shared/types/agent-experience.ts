/**
 * Sovereign Agent Experience — frozen integration contract v1.
 *
 * Contract version: `agent-experience/v1`
 * Owner: Sovereign Agent Backend V1 (Backend / Integration).
 * Consumers: Frontend Owner (`frontend/**`) and any future client surface.
 *
 * Import by path. Do not add this file to `shared/types/index.ts` — that barrel
 * is a cross-Session conflict surface.
 *
 * ── Why this file exists ────────────────────────────────────────────────────
 *
 * The product object is the Sovereign Agent. The web journey is:
 *
 *   / → /start → create / bring / select → Agent Home
 *     → Portability / Connections / Economy / Activity / Soul Core / Machines
 *
 * Each module is backed by a different domain. A client must not decide the
 * next CTA by reading flags, probing routes, or guessing Primary from a list.
 * This contract is the single owner-scoped answer to "what is true for this
 * authenticated owner right now, and which exact routes may be called".
 *
 * It is a READ-ONLY PROJECTION. It owns no canonical write. The embedded
 * `journey` field reuses `ContinuityJourneyProjectionV1` rather than copying
 * that vocabulary.
 *
 * ── Hard rules ──────────────────────────────────────────────────────────────
 *
 *  1. `state: 'available'` is the only state that may publish routes.
 *  2. `blocked` / `not_implemented` / `unknown` stay distinct. `unknown` must
 *     never be rendered as "you have nothing".
 *  3. `writeAllowed` equals whether any published route writes.
 *  4. `recommendedRoute` must appear on an available module, or be null.
 *  5. Primary is the exact selectionRef + selectionEpoch. Never "first Agent".
 *  6. Owner is a truncated digest. Raw owner / user / tenant ids are rejected.
 *  7. Secret-bearing keys and values are rejected.
 *  8. External URLs are rejected. Paths are API templates, not hyperlinks.
 *  9. `publicStatus` may not exceed the v1 evidence ceiling.
 * 10. Module summaries are safe aggregates only — never content payloads.
 */

import {
  validateContinuityJourneyProjectionV1,
  type ContinuityJourneyProjectionV1,
  type JourneyEnvironmentV1,
  type JourneyOwnerRefV1,
} from './web-first-ai-continuity';
import type {
  ExperienceCapabilityKey,
  ExperienceCapabilityState,
} from './agent-portability-experience-v2';

export const AGENT_EXPERIENCE_CONTRACT_VERSION = 'agent-experience/v1' as const;
export const AGENT_EXPERIENCE_SCHEMA_VERSION = 1 as const;
export const AGENT_EXPERIENCE_PUBLIC_STATUS_CEILING_V1 = 'limited_preview' as const;
export const AGENT_EXPERIENCE_FIXTURE_MARK = 'agent-experience-fixture/v1' as const;

export type ExperienceEnvironmentV1 = JourneyEnvironmentV1;
export type ExperienceOwnerRefV1 = JourneyOwnerRefV1;

export type ExperienceStateV1 =
  | 'available'
  | 'blocked'
  | 'not_implemented'
  | 'unknown';

export const EXPERIENCE_PUBLIC_STATUSES_V1 = [
  'roadmap',
  'poc',
  'limited_preview',
  'beta',
  'ga',
] as const;

export type ExperiencePublicStatusV1 = (typeof EXPERIENCE_PUBLIC_STATUSES_V1)[number];

export const AGENT_EXPERIENCE_MODULE_IDS_V1 = [
  'overview',
  'portability',
  'connections',
  'economy',
  'activity',
  'soul_core',
  'machines',
] as const;

export type AgentExperienceModuleIdV1 = (typeof AGENT_EXPERIENCE_MODULE_IDS_V1)[number];

export const AGENT_EXPERIENCE_RECOMMENDED_ACTIONS_V1 = [
  'create_agent',
  'select_primary_agent',
  'resume_import',
  'review_approved_context',
  'start_first_goal',
  'review_receipt',
  'open_agent',
  'retry',
  'none',
] as const;

export type AgentExperienceRecommendedActionV1 =
  (typeof AGENT_EXPERIENCE_RECOMMENDED_ACTIONS_V1)[number];

export type ExperienceHttpMethodV1 = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export const EXPERIENCE_REASON_CODES_V1 = [
  'capability_available',
  'release_gate_not_passed',
  'feature_flag_disabled',
  'kill_switch_engaged',
  'canary_allowlist_excluded',
  'port_unavailable',
  'owner_principal_required',
  'agent_identity_not_selected',
  'agent_identity_selection_stale',
  'no_agent_present',
  'import_in_progress',
  'source_outage',
  'not_implemented_in_main_repo',
  'production_gates_not_attested',
] as const;

export type ExperienceReasonCodeV1 = (typeof EXPERIENCE_REASON_CODES_V1)[number];

export type ExperienceBlockerKindV1 =
  | 'gate'
  | 'flag'
  | 'port'
  | 'authorization'
  | 'source_outage'
  | 'not_implemented'
  | 'owner_state';

export interface ExperienceBlockerV1 {
  kind: ExperienceBlockerKindV1;
  ref: string;
  reasonCode: ExperienceReasonCodeV1;
  note?: string;
}

export type ExperienceFreshnessV1 = 'live' | 'cached' | 'unknown';

export interface ExperienceProvenanceV1 {
  sourceOfTruth: string;
  asOf: string;
  freshness: ExperienceFreshnessV1;
}

/**
 * Exact backend route a client may call.
 *
 * Paths are Nest controller templates (`:param` preserved), never constructed
 * by the client and never an external URL.
 */
export interface AgentExperienceRouteV1 {
  method: ExperienceHttpMethodV1;
  path: string;
  auth: 'bearer_user';
  writes: boolean;
  idempotencyKeyRequired: boolean;
  idempotencyIn?: 'header' | 'body';
  acceptedIsNotSuccess: boolean;
  /**
   * Required when `acceptedIsNotSuccess` is true: the authoritative read-back
   * the client must poll before claiming domain success.
   */
  durableReadBackRoute?: { method: 'GET'; path: string } | null;
}

/** Safe aggregates only. Never content, never secrets, never raw payloads. */
export interface ExperienceModuleSummaryV1 {
  itemCount: number | null;
  awaitingOwnerCount: number | null;
}

export interface AgentExperienceCapabilityV1 {
  moduleId: AgentExperienceModuleIdV1;
  state: ExperienceStateV1;
  publicStatus: ExperiencePublicStatusV1;
  reasonCode: ExperienceReasonCodeV1;
  provenance: ExperienceProvenanceV1;
  freshness: ExperienceFreshnessV1;
  routes: readonly AgentExperienceRouteV1[];
  writeAllowed: boolean;
  /** Primary blocker. Null exactly when `state === 'available'`. */
  blocker: ExperienceBlockerV1 | null;
  userSafeSummaryKey: string;
  summary: ExperienceModuleSummaryV1;
}

export interface AgentDirectoryEntryV1 {
  agentAccountId: string;
  displayNameKey: string;
  status: 'active' | 'inactive' | 'unknown';
  isPrimary: boolean;
  soulCoreBound: boolean;
}

export interface AgentDirectoryProjectionV1 {
  state: ExperienceStateV1;
  freshness: ExperienceFreshnessV1;
  agents: readonly AgentDirectoryEntryV1[];
  truncated: boolean;
}

/**
 * Canonical Primary selection. Absence of selectionRef is an honest
 * `select_primary_agent` signal — never "use the first directory row".
 */
export interface ExperiencePrimaryAgentV1 {
  state: ExperienceStateV1;
  selectionRef: string | null;
  selectionEpoch: string | null;
  agentAccountId: string | null;
  soulCoreId: string | null;
}

export const EXPERIENCE_ACTIVE_WORK_KINDS_V1 = ['import', 'sync', 'action'] as const;
export type ExperienceActiveWorkKindV1 = (typeof EXPERIENCE_ACTIVE_WORK_KINDS_V1)[number];

export const EXPERIENCE_ACTIVE_WORK_STATES_V1 = [
  'none',
  'in_progress',
  'awaiting_owner',
  'committed',
  'failed',
  'expired',
  'unknown',
] as const;
export type ExperienceActiveWorkStateV1 = (typeof EXPERIENCE_ACTIVE_WORK_STATES_V1)[number];

export interface ExperienceActiveWorkItemV1 {
  kind: ExperienceActiveWorkKindV1;
  /** Opaque work ref. Clients must not parse it. */
  workRef: string;
  agentAccountId: string | null;
  coarseState: ExperienceActiveWorkStateV1;
  awaitingOwner: boolean;
}

export interface ExperienceActiveWorkV1 {
  state: ExperienceStateV1;
  items: readonly ExperienceActiveWorkItemV1[];
}

export const EXPERIENCE_READINESS_IDS_V1 = [
  'identity',
  'primary',
  'approved_context',
  'first_goal',
  'first_receipt',
] as const;
export type ExperienceReadinessIdV1 = (typeof EXPERIENCE_READINESS_IDS_V1)[number];

export interface ExperienceReadinessItemV1 {
  id: ExperienceReadinessIdV1;
  state: 'met' | 'unmet' | 'unknown';
}

/** Independent checklist. There is deliberately no composite "sovereignty score". */
export interface ExperienceReadinessV1 {
  items: readonly ExperienceReadinessItemV1[];
}

export interface ExperienceActivitySummaryV1 {
  state: ExperienceStateV1;
  importReceiptCount: number | null;
  actionReceiptCount: number | null;
  truncated: boolean;
}

/**
 * Honest reputation overlay. Never a global score. `legacy_economic` is the
 * hire-escrow creditScore path and must not be rendered as contextual reputation.
 */
export interface ExperienceReputationSummaryV1 {
  state: ExperienceStateV1;
  source: 'contextual' | 'legacy_economic' | 'none';
  uncertaintyStatus: string | null;
  sampleCount: number | null;
  hasGlobalScore: false;
}

/**
 * Optional experience-layer shell for G-01 / G-03 / G-04 / G-05 / G-06.
 * Additive since 2026-09-06: absent on older backends, in which case clients
 * fall back to `CURRENT_EXPERIENCE_CAPABILITIES` through
 * `resolveExperienceCapability`. Publishing anything other than
 * `not_implemented` requires the matching backend writer to exist. The
 * projection never invents `available`.
 */
export interface AgentExperienceLayerV1 {
  capabilities: Readonly<Partial<Record<ExperienceCapabilityKey, ExperienceCapabilityState>>>;
}

export interface AgentExperienceEntryV1 {
  schemaVersion: typeof AGENT_EXPERIENCE_SCHEMA_VERSION;
  contractVersion: typeof AGENT_EXPERIENCE_CONTRACT_VERSION;
  environment: ExperienceEnvironmentV1;
  asOf: string;
  owner: ExperienceOwnerRefV1;
  directory: AgentDirectoryProjectionV1;
  primaryAgent: ExperiencePrimaryAgentV1;
  /** Reused Continuity journey projection. Not a copy of that contract. */
  journey: ContinuityJourneyProjectionV1;
  activeWork: ExperienceActiveWorkV1;
  reputation?: ExperienceReputationSummaryV1;
  /** Optional and additive; see {@link AgentExperienceLayerV1}. */
  experience?: AgentExperienceLayerV1;
  recommendedAction: AgentExperienceRecommendedActionV1;
  recommendedRoute: AgentExperienceRouteV1 | null;
  modules: Readonly<Record<AgentExperienceModuleIdV1, AgentExperienceCapabilityV1>>;
  blockers: readonly ExperienceBlockerV1[];
  notImplemented: readonly string[];
}

export interface AgentWorkspaceExperienceV1 {
  schemaVersion: typeof AGENT_EXPERIENCE_SCHEMA_VERSION;
  contractVersion: typeof AGENT_EXPERIENCE_CONTRACT_VERSION;
  environment: ExperienceEnvironmentV1;
  asOf: string;
  owner: ExperienceOwnerRefV1;
  agent: {
    agentAccountId: string;
    soulCoreId: string | null;
    displayNameKey: string;
    status: 'active' | 'inactive' | 'unknown';
  };
  primaryState: 'primary' | 'not_primary' | 'unknown';
  readiness: ExperienceReadinessV1;
  modules: Readonly<Record<AgentExperienceModuleIdV1, AgentExperienceCapabilityV1>>;
  recentActivitySummary: ExperienceActivitySummaryV1;
  reputation?: ExperienceReputationSummaryV1;
  recommendedAction: AgentExperienceRecommendedActionV1;
  recommendedRoute: AgentExperienceRouteV1 | null;
  blockers: readonly ExperienceBlockerV1[];
}

export interface AgentExperienceActivitySummaryProjectionV1 {
  schemaVersion: typeof AGENT_EXPERIENCE_SCHEMA_VERSION;
  contractVersion: typeof AGENT_EXPERIENCE_CONTRACT_VERSION;
  environment: ExperienceEnvironmentV1;
  asOf: string;
  owner: ExperienceOwnerRefV1;
  agentAccountId: string;
  activity: ExperienceActivitySummaryV1;
}

export interface ExperienceValidationErrorV1 {
  path: string;
  code: 'missing' | 'invalid_type' | 'invalid_value' | 'invariant_violated';
  message: string;
}

const PUBLIC_STATUS_RANK: Readonly<Record<ExperiencePublicStatusV1, number>> = {
  roadmap: 0,
  poc: 1,
  limited_preview: 2,
  beta: 3,
  ga: 4,
};

/** Nest controller path without the global `api` prefix. `/v1/...` and legacy `/agent-accounts` are both legal. */
const API_PATH_PATTERN = /^\/[A-Za-z][A-Za-z0-9/_\-:]*$/;
const PRINCIPAL_REF_PATTERN = /^sha256:[0-9a-f]{12}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOUL_CORE_ID_PATTERN = /^sc_[0-9a-f]{32}$/;
const SUMMARY_KEY_PATTERN = /^experience\.[a-z0-9_]+\.[a-z0-9_]+$/;
const DISPLAY_NAME_KEY_PATTERN = /^experience\.(agent|directory)\.[a-z0-9_]+$/;
const FORBIDDEN_ID_KEYS = new Set([
  'ownerid',
  'userid',
  'tenantid',
  'owneruserid',
  'principalid',
  'owner_id',
  'user_id',
  'tenant_id',
  'owner_user_id',
  'principal_id',
]);
const SECRET_KEY_PATTERN =
  /(^|[_-])(token|secret|password|cookie|authorization|privatekey|apikey|mpcshare|walletsigner|refreshtoken|accesstoken|clientsecret)s?$/i;
const SECRET_VALUE_PATTERN =
  /^(Bearer\s+\S+|-----BEGIN[A-Z ]+PRIVATE KEY-----|sk-[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16})$/;

const ACTIONS_REQUIRING_ROUTE: readonly AgentExperienceRecommendedActionV1[] = [
  'create_agent',
  'select_primary_agent',
  'resume_import',
  'review_approved_context',
  'start_first_goal',
  'review_receipt',
  'open_agent',
];

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 20 || value.length > 40) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 19) === value.slice(0, 19);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function publicStatusExceedsCeiling(status: ExperiencePublicStatusV1): boolean {
  return PUBLIC_STATUS_RANK[status] > PUBLIC_STATUS_RANK[AGENT_EXPERIENCE_PUBLIC_STATUS_CEILING_V1];
}

function routeKey(route: { method?: unknown; path?: unknown }): string {
  return `${String(route.method)} ${String(route.path)}`;
}

function scanForbiddenFields(value: unknown, path: string, errors: ExperienceValidationErrorV1[]): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanForbiddenFields(entry, `${path}[${index}]`, errors));
    return;
  }
  if (!isRecord(value)) {
    if (typeof value === 'string' && SECRET_VALUE_PATTERN.test(value)) {
      errors.push({
        path,
        code: 'invariant_violated',
        message: 'secret-bearing value is forbidden on this contract',
      });
    }
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
    const childPath = `${path}.${key}`;
    if (FORBIDDEN_ID_KEYS.has(key.toLowerCase()) || FORBIDDEN_ID_KEYS.has(normalized)) {
      errors.push({
        path: childPath,
        code: 'invariant_violated',
        message: 'raw owner/user/tenant id fields are forbidden; use a masked principalRef',
      });
    }
    if (SECRET_KEY_PATTERN.test(normalized) || SECRET_KEY_PATTERN.test(key)) {
      errors.push({
        path: childPath,
        code: 'invariant_violated',
        message: 'secret-bearing field is forbidden on this contract',
      });
    }
    scanForbiddenFields(child, childPath, errors);
  }
}

export function validateExperienceRouteV1(
  value: unknown,
  path = 'route',
): ExperienceValidationErrorV1[] {
  const errors: ExperienceValidationErrorV1[] = [];
  if (!isRecord(value)) {
    return [{ path, code: 'invalid_type', message: 'route must be an object' }];
  }
  const route = value as Partial<AgentExperienceRouteV1>;
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(route.method as string)) {
    errors.push({ path: `${path}.method`, code: 'invalid_value', message: 'unknown HTTP method' });
  }
  if (typeof route.path !== 'string' || !API_PATH_PATTERN.test(route.path)) {
    errors.push({
      path: `${path}.path`,
      code: 'invalid_value',
      message: 'path must be an in-API template; external URLs are rejected',
    });
  }
  if (route.auth !== 'bearer_user') {
    errors.push({ path: `${path}.auth`, code: 'invalid_value', message: 'only bearer_user is published' });
  }
  if (typeof route.writes !== 'boolean') {
    errors.push({ path: `${path}.writes`, code: 'invalid_type', message: 'writes must be a boolean' });
  }
  if (typeof route.idempotencyKeyRequired !== 'boolean') {
    errors.push({
      path: `${path}.idempotencyKeyRequired`,
      code: 'invalid_type',
      message: 'idempotencyKeyRequired must be a boolean',
    });
  }
  if (route.idempotencyIn != null && route.idempotencyIn !== 'header' && route.idempotencyIn !== 'body') {
    errors.push({ path: `${path}.idempotencyIn`, code: 'invalid_value', message: 'unknown idempotency placement' });
  }
  if (typeof route.acceptedIsNotSuccess !== 'boolean') {
    errors.push({
      path: `${path}.acceptedIsNotSuccess`,
      code: 'invalid_type',
      message: 'acceptedIsNotSuccess must be a boolean',
    });
  }
  if (route.acceptedIsNotSuccess === true) {
    const readBack = route.durableReadBackRoute;
    if (!isRecord(readBack) || readBack.method !== 'GET' || typeof readBack.path !== 'string' || !API_PATH_PATTERN.test(readBack.path)) {
      errors.push({
        path: `${path}.durableReadBackRoute`,
        code: 'invariant_violated',
        message: 'acceptedIsNotSuccess requires a GET durableReadBackRoute',
      });
    }
  }
  return errors;
}

export function validateExperienceCapabilityV1(
  value: unknown,
  path = 'module',
): ExperienceValidationErrorV1[] {
  const errors: ExperienceValidationErrorV1[] = [];
  if (!isRecord(value)) {
    return [{ path, code: 'invalid_type', message: 'capability must be an object' }];
  }
  const record = value as Partial<AgentExperienceCapabilityV1>;

  if (!AGENT_EXPERIENCE_MODULE_IDS_V1.includes(record.moduleId as AgentExperienceModuleIdV1)) {
    errors.push({ path: `${path}.moduleId`, code: 'invalid_value', message: 'unknown moduleId' });
  }
  const states: readonly ExperienceStateV1[] = ['available', 'blocked', 'not_implemented', 'unknown'];
  if (!states.includes(record.state as ExperienceStateV1)) {
    errors.push({ path: `${path}.state`, code: 'invalid_value', message: 'unknown state' });
  }
  if (!EXPERIENCE_PUBLIC_STATUSES_V1.includes(record.publicStatus as ExperiencePublicStatusV1)) {
    errors.push({ path: `${path}.publicStatus`, code: 'invalid_value', message: 'unknown publicStatus' });
  } else if (publicStatusExceedsCeiling(record.publicStatus as ExperiencePublicStatusV1)) {
    errors.push({
      path: `${path}.publicStatus`,
      code: 'invariant_violated',
      message: `publicStatus may not exceed ${AGENT_EXPERIENCE_PUBLIC_STATUS_CEILING_V1} on v1`,
    });
  }
  if (!EXPERIENCE_REASON_CODES_V1.includes(record.reasonCode as ExperienceReasonCodeV1)) {
    errors.push({ path: `${path}.reasonCode`, code: 'invalid_value', message: 'unknown reasonCode' });
  }
  if (!isNonEmptyString(record.userSafeSummaryKey) || !SUMMARY_KEY_PATTERN.test(record.userSafeSummaryKey)) {
    errors.push({
      path: `${path}.userSafeSummaryKey`,
      code: 'invalid_value',
      message: 'userSafeSummaryKey must be an experience.<module>.<state> key, not copy',
    });
  }

  const provenance = record.provenance;
  if (!isRecord(provenance)) {
    errors.push({ path: `${path}.provenance`, code: 'missing', message: 'provenance is required' });
  } else {
    if (!isNonEmptyString(provenance.sourceOfTruth)) {
      errors.push({
        path: `${path}.provenance.sourceOfTruth`,
        code: 'missing',
        message: 'sourceOfTruth is required so the projection never looks authoritative',
      });
    }
    if (!isIsoTimestamp(provenance.asOf)) {
      errors.push({ path: `${path}.provenance.asOf`, code: 'invalid_value', message: 'asOf must be an ISO timestamp' });
    }
    if (!['live', 'cached', 'unknown'].includes(provenance.freshness as string)) {
      errors.push({ path: `${path}.provenance.freshness`, code: 'invalid_value', message: 'unknown freshness' });
    }
  }
  if (!['live', 'cached', 'unknown'].includes(record.freshness as string)) {
    errors.push({ path: `${path}.freshness`, code: 'invalid_value', message: 'unknown freshness' });
  }

  const summary = record.summary;
  if (!isRecord(summary)) {
    errors.push({ path: `${path}.summary`, code: 'missing', message: 'summary is required' });
  } else {
    for (const field of ['itemCount', 'awaitingOwnerCount'] as const) {
      const count = summary[field];
      if (count !== null && (typeof count !== 'number' || !Number.isInteger(count) || count < 0)) {
        errors.push({
          path: `${path}.summary.${field}`,
          code: 'invalid_value',
          message: `${field} must be a non-negative integer or null`,
        });
      }
    }
  }

  if (!Array.isArray(record.routes)) {
    errors.push({ path: `${path}.routes`, code: 'missing', message: 'routes must be an array' });
  } else {
    const seen = new Set<string>();
    for (let index = 0; index < record.routes.length; index += 1) {
      const route = record.routes[index];
      errors.push(...validateExperienceRouteV1(route, `${path}.routes[${index}]`));
      if (isRecord(route) && typeof route.method === 'string' && typeof route.path === 'string') {
        const key = routeKey(route);
        if (seen.has(key)) {
          errors.push({
            path: `${path}.routes[${index}]`,
            code: 'invariant_violated',
            message: 'duplicate method+path is rejected',
          });
        }
        seen.add(key);
      }
    }
  }

  if (record.state === 'available') {
    if (record.blocker !== null) {
      errors.push({
        path: `${path}.blocker`,
        code: 'invariant_violated',
        message: 'an available capability must carry a null blocker',
      });
    }
    if (record.reasonCode !== 'capability_available') {
      errors.push({
        path: `${path}.reasonCode`,
        code: 'invariant_violated',
        message: 'an available capability must report capability_available',
      });
    }
  } else if (states.includes(record.state as ExperienceStateV1)) {
    if (!isRecord(record.blocker)) {
      errors.push({
        path: `${path}.blocker`,
        code: 'invariant_violated',
        message: 'a non-available capability must name a primary blocker',
      });
    }
    if (record.reasonCode === 'capability_available') {
      errors.push({
        path: `${path}.reasonCode`,
        code: 'invariant_violated',
        message: 'capability_available may not be reported for a non-available capability',
      });
    }
    if (Array.isArray(record.routes) && record.routes.length !== 0) {
      errors.push({
        path: `${path}.routes`,
        code: 'invariant_violated',
        message: 'routes may only be published for an available capability',
      });
    }
  }

  if (Array.isArray(record.routes)) {
    const anyWrite = record.routes.some((route) => (route as AgentExperienceRouteV1)?.writes === true);
    if (record.writeAllowed !== anyWrite) {
      errors.push({
        path: `${path}.writeAllowed`,
        code: 'invariant_violated',
        message: 'writeAllowed must equal whether any published route writes',
      });
    }
  }

  return errors;
}

function validateOwner(owner: unknown, path: string, errors: ExperienceValidationErrorV1[]): void {
  if (!isRecord(owner)) {
    errors.push({ path, code: 'missing', message: 'owner is required' });
    return;
  }
  if (owner.audience !== 'user') {
    errors.push({ path: `${path}.audience`, code: 'invalid_value', message: 'only the user audience is projected' });
  }
  if (!PRINCIPAL_REF_PATTERN.test(String(owner.principalRef))) {
    errors.push({
      path: `${path}.principalRef`,
      code: 'invalid_value',
      message: 'principalRef must be sha256:<12 lowercase hex> and never a raw principal id',
    });
  }
}

function validateHeader(
  projection: Record<string, unknown>,
  errors: ExperienceValidationErrorV1[],
): void {
  if (projection.schemaVersion !== AGENT_EXPERIENCE_SCHEMA_VERSION) {
    errors.push({ path: '$.schemaVersion', code: 'invalid_value', message: 'unsupported schemaVersion' });
  }
  if (projection.contractVersion !== AGENT_EXPERIENCE_CONTRACT_VERSION) {
    errors.push({ path: '$.contractVersion', code: 'invalid_value', message: 'unsupported contractVersion' });
  }
  if (!['local', 'test', 'staging', 'production'].includes(projection.environment as string)) {
    errors.push({ path: '$.environment', code: 'invalid_value', message: 'unknown environment' });
  }
  if (!isIsoTimestamp(projection.asOf)) {
    errors.push({ path: '$.asOf', code: 'invalid_value', message: 'asOf must be an ISO timestamp' });
  }
  validateOwner(projection.owner, '$.owner', errors);
}

function collectAvailableRoutes(
  modules: Record<string, unknown>,
): Set<string> {
  const keys = new Set<string>();
  for (const moduleId of AGENT_EXPERIENCE_MODULE_IDS_V1) {
    const capability = modules[moduleId];
    if (!isRecord(capability) || capability.state !== 'available' || !Array.isArray(capability.routes)) {
      continue;
    }
    for (const route of capability.routes) {
      if (isRecord(route) && typeof route.method === 'string' && typeof route.path === 'string') {
        keys.add(routeKey(route));
      }
    }
  }
  return keys;
}

function validateRecommended(
  recommendedAction: unknown,
  recommendedRoute: unknown,
  modules: Record<string, unknown> | null,
  errors: ExperienceValidationErrorV1[],
): void {
  if (!AGENT_EXPERIENCE_RECOMMENDED_ACTIONS_V1.includes(recommendedAction as AgentExperienceRecommendedActionV1)) {
    errors.push({ path: '$.recommendedAction', code: 'invalid_value', message: 'unknown recommendedAction' });
    return;
  }
  const action = recommendedAction as AgentExperienceRecommendedActionV1;
  if (action === 'none' || action === 'retry') {
    if (recommendedRoute !== null) {
      errors.push({
        path: '$.recommendedRoute',
        code: 'invariant_violated',
        message: `${action} must not publish a recommendedRoute`,
      });
    }
    return;
  }
  if (!ACTIONS_REQUIRING_ROUTE.includes(action)) return;
  if (!isRecord(recommendedRoute)) {
    errors.push({
      path: '$.recommendedRoute',
      code: 'invariant_violated',
      message: `${action} requires a recommendedRoute on an available module`,
    });
    return;
  }
  errors.push(...validateExperienceRouteV1(recommendedRoute, '$.recommendedRoute'));
  if (modules) {
    const published = collectAvailableRoutes(modules);
    if (typeof recommendedRoute.method === 'string' && typeof recommendedRoute.path === 'string') {
      if (!published.has(routeKey(recommendedRoute))) {
        errors.push({
          path: '$.recommendedRoute',
          code: 'invariant_violated',
          message: 'recommendedRoute must exist on an available module',
        });
      }
    }
  }
}

function validateModules(
  modules: unknown,
  errors: ExperienceValidationErrorV1[],
): Record<string, unknown> | null {
  if (!isRecord(modules)) {
    errors.push({ path: '$.modules', code: 'missing', message: 'modules is required' });
    return null;
  }
  const seenIds = new Set<string>();
  for (const moduleId of AGENT_EXPERIENCE_MODULE_IDS_V1) {
    const entry = modules[moduleId];
    if (entry === undefined) {
      errors.push({
        path: `$.modules.${moduleId}`,
        code: 'missing',
        message: 'every module id must be present; absence is never a signal',
      });
      continue;
    }
    errors.push(...validateExperienceCapabilityV1(entry, `$.modules.${moduleId}`));
    if (isRecord(entry)) {
      if (entry.moduleId !== moduleId) {
        errors.push({
          path: `$.modules.${moduleId}.moduleId`,
          code: 'invariant_violated',
          message: 'module key and moduleId must match',
        });
      }
      if (typeof entry.moduleId === 'string') {
        if (seenIds.has(entry.moduleId)) {
          errors.push({
            path: `$.modules.${moduleId}.moduleId`,
            code: 'invariant_violated',
            message: 'duplicate moduleId is rejected',
          });
        }
        seenIds.add(entry.moduleId);
      }
    }
  }
  return modules;
}

function validateDirectory(directory: unknown, errors: ExperienceValidationErrorV1[]): void {
  if (!isRecord(directory)) {
    errors.push({ path: '$.directory', code: 'missing', message: 'directory is required' });
    return;
  }
  const states: readonly ExperienceStateV1[] = ['available', 'blocked', 'not_implemented', 'unknown'];
  if (!states.includes(directory.state as ExperienceStateV1)) {
    errors.push({ path: '$.directory.state', code: 'invalid_value', message: 'unknown directory state' });
  }
  if (!['live', 'cached', 'unknown'].includes(directory.freshness as string)) {
    errors.push({ path: '$.directory.freshness', code: 'invalid_value', message: 'unknown freshness' });
  }
  if (typeof directory.truncated !== 'boolean') {
    errors.push({ path: '$.directory.truncated', code: 'invalid_type', message: 'truncated must be a boolean' });
  }
  if (!Array.isArray(directory.agents)) {
    errors.push({ path: '$.directory.agents', code: 'missing', message: 'agents must be an array' });
    return;
  }
  const seen = new Set<string>();
  let primaryCount = 0;
  for (let index = 0; index < directory.agents.length; index += 1) {
    const entry = directory.agents[index];
    if (!isRecord(entry)) {
      errors.push({ path: `$.directory.agents[${index}]`, code: 'invalid_type', message: 'directory entry must be an object' });
      continue;
    }
    if (typeof entry.agentAccountId !== 'string' || !UUID_PATTERN.test(entry.agentAccountId)) {
      errors.push({
        path: `$.directory.agents[${index}].agentAccountId`,
        code: 'invalid_value',
        message: 'agentAccountId must be a UUID',
      });
    } else if (seen.has(entry.agentAccountId)) {
      errors.push({
        path: `$.directory.agents[${index}].agentAccountId`,
        code: 'invariant_violated',
        message: 'duplicate agentAccountId in directory',
      });
    } else {
      seen.add(entry.agentAccountId);
    }
    if (typeof entry.displayNameKey !== 'string' || !DISPLAY_NAME_KEY_PATTERN.test(entry.displayNameKey)) {
      errors.push({
        path: `$.directory.agents[${index}].displayNameKey`,
        code: 'invalid_value',
        message: 'displayNameKey must be an i18n key, not a raw display name',
      });
    }
    if (!['active', 'inactive', 'unknown'].includes(entry.status as string)) {
      errors.push({ path: `$.directory.agents[${index}].status`, code: 'invalid_value', message: 'unknown agent status' });
    }
    if (typeof entry.isPrimary !== 'boolean') {
      errors.push({ path: `$.directory.agents[${index}].isPrimary`, code: 'invalid_type', message: 'isPrimary must be a boolean' });
    } else if (entry.isPrimary) {
      primaryCount += 1;
    }
    if (typeof entry.soulCoreBound !== 'boolean') {
      errors.push({
        path: `$.directory.agents[${index}].soulCoreBound`,
        code: 'invalid_type',
        message: 'soulCoreBound must be a boolean',
      });
    }
  }
  if (primaryCount > 1) {
    errors.push({
      path: '$.directory.agents',
      code: 'invariant_violated',
      message: 'at most one directory row may be marked primary',
    });
  }
}

function validatePrimaryAgent(
  primary: unknown,
  directory: unknown,
  errors: ExperienceValidationErrorV1[],
): void {
  if (!isRecord(primary)) {
    errors.push({ path: '$.primaryAgent', code: 'missing', message: 'primaryAgent is required' });
    return;
  }
  const states: readonly ExperienceStateV1[] = ['available', 'blocked', 'not_implemented', 'unknown'];
  if (!states.includes(primary.state as ExperienceStateV1)) {
    errors.push({ path: '$.primaryAgent.state', code: 'invalid_value', message: 'unknown primary state' });
  }
  const selected =
    isNonEmptyString(primary.selectionRef) &&
    isNonEmptyString(primary.selectionEpoch) &&
    typeof primary.agentAccountId === 'string' &&
    UUID_PATTERN.test(primary.agentAccountId);
  if (primary.state === 'available') {
    if (!selected) {
      errors.push({
        path: '$.primaryAgent',
        code: 'invariant_violated',
        message: 'an available primary must carry selectionRef, selectionEpoch and agentAccountId',
      });
    }
    if (primary.soulCoreId !== null && (typeof primary.soulCoreId !== 'string' || !SOUL_CORE_ID_PATTERN.test(primary.soulCoreId))) {
      errors.push({
        path: '$.primaryAgent.soulCoreId',
        code: 'invalid_value',
        message: 'soulCoreId must be sc_<32 hex> or null',
      });
    }
    if (isRecord(directory) && Array.isArray(directory.agents) && typeof primary.agentAccountId === 'string') {
      const match = directory.agents.find(
        (entry) => isRecord(entry) && entry.agentAccountId === primary.agentAccountId,
      );
      if (!match) {
        errors.push({
          path: '$.primaryAgent.agentAccountId',
          code: 'invariant_violated',
          message: 'primary agentAccountId must appear in the owner directory',
        });
      } else if (isRecord(match) && match.isPrimary !== true) {
        errors.push({
          path: '$.directory.agents',
          code: 'invariant_violated',
          message: 'directory row for the primary Agent must have isPrimary=true',
        });
      }
    }
  } else if (primary.selectionRef !== null || primary.selectionEpoch !== null || primary.agentAccountId !== null) {
    errors.push({
      path: '$.primaryAgent',
      code: 'invariant_violated',
      message: 'an unresolved primary must not invent a selection',
    });
  }
}

function validateReputationSummary(
  reputation: unknown,
  path: string,
  errors: ExperienceValidationErrorV1[],
): void {
  if (reputation === undefined) return;
  if (!isRecord(reputation)) {
    errors.push({ path, code: 'invalid_type', message: 'reputation must be an object' });
    return;
  }
  const states: readonly ExperienceStateV1[] = ['available', 'blocked', 'not_implemented', 'unknown'];
  if (!states.includes(reputation.state as ExperienceStateV1)) {
    errors.push({ path: `${path}.state`, code: 'invalid_value', message: 'unknown reputation state' });
  }
  if (!['contextual', 'legacy_economic', 'none'].includes(reputation.source as string)) {
    errors.push({ path: `${path}.source`, code: 'invalid_value', message: 'unknown reputation source' });
  }
  if (reputation.hasGlobalScore !== false) {
    errors.push({
      path: `${path}.hasGlobalScore`,
      code: 'invariant_violated',
      message: 'contextual reputation must not publish a global score',
    });
  }
  if ('creditScore' in reputation || 'score' in reputation) {
    errors.push({
      path,
      code: 'invariant_violated',
      message: 'legacy creditScore cannot be mixed into contextual reputation',
    });
  }
}

/**
 * Structural check only. Individual capability values are deliberately not
 * validated here: `resolveExperienceCapability` degrades anything unexpected
 * to `unknown`, so a new state string from a newer backend must not make the
 * whole entry unreadable on an older client.
 */
function validateExperienceLayer(experience: unknown, errors: ExperienceValidationErrorV1[]): void {
  if (experience === undefined) return;
  if (!isRecord(experience)) {
    errors.push({ path: '$.experience', code: 'invalid_type', message: 'experience must be an object when present' });
    return;
  }
  if (experience.capabilities !== undefined && !isRecord(experience.capabilities)) {
    errors.push({
      path: '$.experience.capabilities',
      code: 'invalid_type',
      message: 'experience.capabilities must be an object keyed by capability',
    });
  }
}

function validateActiveWork(activeWork: unknown, errors: ExperienceValidationErrorV1[]): void {
  if (!isRecord(activeWork)) {
    errors.push({ path: '$.activeWork', code: 'missing', message: 'activeWork is required' });
    return;
  }
  const states: readonly ExperienceStateV1[] = ['available', 'blocked', 'not_implemented', 'unknown'];
  if (!states.includes(activeWork.state as ExperienceStateV1)) {
    errors.push({ path: '$.activeWork.state', code: 'invalid_value', message: 'unknown activeWork state' });
  }
  if (!Array.isArray(activeWork.items)) {
    errors.push({ path: '$.activeWork.items', code: 'missing', message: 'items must be an array' });
    return;
  }
  for (let index = 0; index < activeWork.items.length; index += 1) {
    const item = activeWork.items[index];
    if (!isRecord(item)) {
      errors.push({ path: `$.activeWork.items[${index}]`, code: 'invalid_type', message: 'work item must be an object' });
      continue;
    }
    if (!EXPERIENCE_ACTIVE_WORK_KINDS_V1.includes(item.kind as ExperienceActiveWorkKindV1)) {
      errors.push({ path: `$.activeWork.items[${index}].kind`, code: 'invalid_value', message: 'unknown work kind' });
    }
    if (!isNonEmptyString(item.workRef) || item.workRef.length > 128) {
      errors.push({
        path: `$.activeWork.items[${index}].workRef`,
        code: 'invalid_value',
        message: 'workRef must be an opaque non-empty string',
      });
    }
    if (
      item.agentAccountId !== null &&
      (typeof item.agentAccountId !== 'string' || !UUID_PATTERN.test(item.agentAccountId))
    ) {
      errors.push({
        path: `$.activeWork.items[${index}].agentAccountId`,
        code: 'invalid_value',
        message: 'agentAccountId must be a UUID or null',
      });
    }
    if (!EXPERIENCE_ACTIVE_WORK_STATES_V1.includes(item.coarseState as ExperienceActiveWorkStateV1)) {
      errors.push({
        path: `$.activeWork.items[${index}].coarseState`,
        code: 'invalid_value',
        message: 'unknown coarseState',
      });
    }
    if (typeof item.awaitingOwner !== 'boolean') {
      errors.push({
        path: `$.activeWork.items[${index}].awaitingOwner`,
        code: 'invalid_type',
        message: 'awaitingOwner must be a boolean',
      });
    }
  }
}

function validateReadiness(readiness: unknown, errors: ExperienceValidationErrorV1[]): void {
  if (!isRecord(readiness) || !Array.isArray(readiness.items)) {
    errors.push({ path: '$.readiness', code: 'missing', message: 'readiness.items is required' });
    return;
  }
  if ('score' in readiness || 'sovereigntyScore' in readiness || 'total' in readiness) {
    errors.push({
      path: '$.readiness',
      code: 'invariant_violated',
      message: 'readiness must stay a checklist; composite scores are forbidden',
    });
  }
  const seen = new Set<string>();
  for (const id of EXPERIENCE_READINESS_IDS_V1) {
    const item = readiness.items.find((entry) => isRecord(entry) && entry.id === id);
    if (!item || !isRecord(item)) {
      errors.push({
        path: `$.readiness.items`,
        code: 'missing',
        message: `readiness item ${id} is required`,
      });
      continue;
    }
    if (!['met', 'unmet', 'unknown'].includes(item.state as string)) {
      errors.push({ path: `$.readiness.items.${id}.state`, code: 'invalid_value', message: 'unknown readiness state' });
    }
    seen.add(id);
  }
  if (readiness.items.length !== EXPERIENCE_READINESS_IDS_V1.length || seen.size !== EXPERIENCE_READINESS_IDS_V1.length) {
    errors.push({
      path: '$.readiness.items',
      code: 'invariant_violated',
      message: 'readiness must contain each checklist id exactly once',
    });
  }
}

function validateActivitySummary(
  activity: unknown,
  path: string,
  errors: ExperienceValidationErrorV1[],
): void {
  if (!isRecord(activity)) {
    errors.push({ path, code: 'missing', message: 'activity summary is required' });
    return;
  }
  const states: readonly ExperienceStateV1[] = ['available', 'blocked', 'not_implemented', 'unknown'];
  if (!states.includes(activity.state as ExperienceStateV1)) {
    errors.push({ path: `${path}.state`, code: 'invalid_value', message: 'unknown activity state' });
  }
  for (const field of ['importReceiptCount', 'actionReceiptCount'] as const) {
    const count = activity[field];
    if (count !== null && (typeof count !== 'number' || !Number.isInteger(count) || count < 0)) {
      errors.push({
        path: `${path}.${field}`,
        code: 'invalid_value',
        message: `${field} must be a non-negative integer or null`,
      });
    }
  }
  if (typeof activity.truncated !== 'boolean') {
    errors.push({ path: `${path}.truncated`, code: 'invalid_type', message: 'truncated must be a boolean' });
  }
}

export function validateAgentExperienceEntryV1(value: unknown): ExperienceValidationErrorV1[] {
  const errors: ExperienceValidationErrorV1[] = [];
  if (!isRecord(value)) {
    return [{ path: '$', code: 'invalid_type', message: 'projection must be an object' }];
  }
  validateHeader(value, errors);
  validateDirectory(value.directory, errors);
  validatePrimaryAgent(value.primaryAgent, value.directory, errors);
  validateActiveWork(value.activeWork, errors);
  validateReputationSummary(value.reputation, '$.reputation', errors);
  validateExperienceLayer(value.experience, errors);

  const journeyErrors = validateContinuityJourneyProjectionV1(value.journey);
  for (const error of journeyErrors) {
    errors.push({
      path: error.path === '$' ? '$.journey' : `$.journey${error.path.slice(1)}`,
      code: error.code,
      message: error.message,
    });
  }
  if (isRecord(value.owner) && isRecord(value.journey) && isRecord(value.journey.owner)) {
    if (value.owner.principalRef !== value.journey.owner.principalRef) {
      errors.push({
        path: '$.journey.owner.principalRef',
        code: 'invariant_violated',
        message: 'embedded journey owner must match the experience owner',
      });
    }
  }

  const modules = validateModules(value.modules, errors);
  validateRecommended(value.recommendedAction, value.recommendedRoute, modules, errors);
  if (!Array.isArray(value.blockers)) {
    errors.push({ path: '$.blockers', code: 'missing', message: 'blockers must be an array' });
  }
  if (!Array.isArray(value.notImplemented)) {
    errors.push({ path: '$.notImplemented', code: 'missing', message: 'notImplemented must be an array' });
  }
  scanForbiddenFields(value, '$', errors);
  return errors;
}

export function validateAgentWorkspaceExperienceV1(value: unknown): ExperienceValidationErrorV1[] {
  const errors: ExperienceValidationErrorV1[] = [];
  if (!isRecord(value)) {
    return [{ path: '$', code: 'invalid_type', message: 'projection must be an object' }];
  }
  validateHeader(value, errors);
  if (!isRecord(value.agent)) {
    errors.push({ path: '$.agent', code: 'missing', message: 'agent is required' });
  } else {
    if (typeof value.agent.agentAccountId !== 'string' || !UUID_PATTERN.test(value.agent.agentAccountId)) {
      errors.push({ path: '$.agent.agentAccountId', code: 'invalid_value', message: 'agentAccountId must be a UUID' });
    }
    if (
      value.agent.soulCoreId !== null &&
      (typeof value.agent.soulCoreId !== 'string' || !SOUL_CORE_ID_PATTERN.test(value.agent.soulCoreId))
    ) {
      errors.push({ path: '$.agent.soulCoreId', code: 'invalid_value', message: 'soulCoreId must be sc_<32 hex> or null' });
    }
    if (typeof value.agent.displayNameKey !== 'string' || !DISPLAY_NAME_KEY_PATTERN.test(value.agent.displayNameKey)) {
      errors.push({
        path: '$.agent.displayNameKey',
        code: 'invalid_value',
        message: 'displayNameKey must be an i18n key, not a raw display name',
      });
    }
    if (!['active', 'inactive', 'unknown'].includes(value.agent.status as string)) {
      errors.push({ path: '$.agent.status', code: 'invalid_value', message: 'unknown agent status' });
    }
  }
  if (!['primary', 'not_primary', 'unknown'].includes(value.primaryState as string)) {
    errors.push({ path: '$.primaryState', code: 'invalid_value', message: 'unknown primaryState' });
  }
  validateReadiness(value.readiness, errors);
  validateActivitySummary(value.recentActivitySummary, '$.recentActivitySummary', errors);
  validateReputationSummary(value.reputation, '$.reputation', errors);
  const modules = validateModules(value.modules, errors);
  validateRecommended(value.recommendedAction, value.recommendedRoute, modules, errors);
  if (!Array.isArray(value.blockers)) {
    errors.push({ path: '$.blockers', code: 'missing', message: 'blockers must be an array' });
  }
  scanForbiddenFields(value, '$', errors);
  return errors;
}

export function validateAgentExperienceActivitySummaryProjectionV1(
  value: unknown,
): ExperienceValidationErrorV1[] {
  const errors: ExperienceValidationErrorV1[] = [];
  if (!isRecord(value)) {
    return [{ path: '$', code: 'invalid_type', message: 'projection must be an object' }];
  }
  validateHeader(value, errors);
  if (typeof value.agentAccountId !== 'string' || !UUID_PATTERN.test(value.agentAccountId)) {
    errors.push({ path: '$.agentAccountId', code: 'invalid_value', message: 'agentAccountId must be a UUID' });
  }
  validateActivitySummary(value.activity, '$.activity', errors);
  scanForbiddenFields(value, '$', errors);
  return errors;
}

export function isAgentExperienceEntryV1(value: unknown): value is AgentExperienceEntryV1 {
  return validateAgentExperienceEntryV1(value).length === 0;
}

export function isAgentWorkspaceExperienceV1(value: unknown): value is AgentWorkspaceExperienceV1 {
  return validateAgentWorkspaceExperienceV1(value).length === 0;
}

/**
 * Contract fixtures are local/test vectors. Calling this in production is a
 * hard refusal so a fixture suite cannot be mistaken for live evidence.
 */
function readNodeEnv(): string | undefined {
  const runtime = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process;
  return runtime?.env?.NODE_ENV;
}

export function refuseAgentExperienceFixtureInProduction(
  nodeEnv: string | undefined = readNodeEnv(),
): void {
  if (nodeEnv === 'production') {
    throw new Error('agent-experience contract fixtures are forbidden outside local/test');
  }
}
