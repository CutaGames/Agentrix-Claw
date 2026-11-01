/**
 * Web-first AI Continuity Launch — frozen integration contract v1.
 *
 * Contract version: `web-first-ai-continuity/v1`
 * Owner: Backend / Overall Integration Owner.
 * Consumers: `frontend/**` (Frontend Owner), and any future client surface.
 *
 * ── Why this file exists ────────────────────────────────────────────────────
 *
 * The consumer journey is `Bring → Continue → Control → Act → Verify → Expand`.
 * Every step of that journey is backed by a DIFFERENT existing domain, each with
 * its own flags, gates and release verdict. Today most of them are deliberately
 * fail-closed. A web client therefore cannot decide what to render by reading
 * flags, by probing routes, or by assuming a happy path — and it must never
 * invent a capability that the backend cannot actually perform.
 *
 * This contract is the single authoritative answer to "what can this specific
 * authenticated owner actually do right now, and what is honestly blocking the
 * rest". It is a READ-ONLY PROJECTION. It performs no canonical write, owns no
 * domain fact, and never becomes a second source of truth: every capability
 * declares the domain that owns it (`sourceOfTruth`).
 *
 * ── Hard rules encoded here ─────────────────────────────────────────────────
 *
 *  1. `state: 'available'` is a positive assertion that the listed routes are
 *     reachable for this owner in this environment. It is derived from the
 *     owning domain's real configuration/data, never hardcoded.
 *  2. `blocked` means implemented but intentionally fail-closed. `blockers`
 *     names the exact gate/flag/port. A client may explain the block to the
 *     user; it must not retry past it.
 *  3. `not_implemented` means no main-repo implementation exists. Work living
 *     only in a git worktree, a backup copy or a spec is `not_implemented`.
 *  4. `unknown` means the authoritative source could not be read. A client MUST
 *     NOT render either a positive or a negative assertion. It is never an error
 *     to show "unknown"; it IS an error to collapse it into "unavailable".
 *  5. `publicStatus` is a hard ceiling on outward-facing claims. A client may
 *     present a capability at or below its ceiling, never above it.
 *  6. Anything listed in `notImplemented` must not be inferred by a client from
 *     any other field.
 *
 * ── What this contract deliberately does NOT do ─────────────────────────────
 *
 * It does not carry Soul Core six-anchor data (see `soul-core-aggregate.ts`), it
 * does not carry import job payloads (see `agent-portability.ts`), and it does
 * not carry Action/Receipt bodies (see `trust-loop-contracts.ts`). It carries
 * capability truth plus the exact route surface to fetch those, so there is one
 * capability vocabulary rather than one per domain.
 */

import type { ProjectionV1 } from './soul-core-aggregate';

export const WEB_FIRST_AI_CONTINUITY_CONTRACT_VERSION = 'web-first-ai-continuity/v1' as const;
export const WEB_FIRST_AI_CONTINUITY_SCHEMA_VERSION = 1 as const;

/** Deployment the projection was produced in. Bound server-side, never from a client. */
export type JourneyEnvironmentV1 = 'local' | 'test' | 'staging' | 'production';

// ───────────────────────────── capability identity ─────────────────────────

/**
 * Closed capability set for the P0 consumer journey. Adding a member is a
 * breaking change for exhaustive client switches, so it requires a contract
 * version bump.
 */
export const JOURNEY_CAPABILITY_IDS_V1 = [
  /** Bring: import selected memory/preferences from an archive the user supplies. */
  'bring_import_generic_archive',
  /** Continue: resolve the owner's one durable Agent identity across sessions. */
  'continue_agent_identity',
  /** Continue: read the user-approved context that survives between sessions. */
  'continue_approved_context',
  /** Control: connect one read-only third-party source. */
  'connect_read_only_connector',
  /** Control: purpose-bound minimum context disclosure to an approved runtime. */
  'context_gateway_disclosure',
  /** Act: perform one bounded, low-risk, unpaid action. */
  'act_first_low_risk_action',
  /** Verify: read a user-comprehensible Action Receipt. */
  'verify_action_receipt',
  /** Control: review, correct, pause, revoke or delete brought-in data. */
  'control_data_and_connections',
] as const;

export type JourneyCapabilityIdV1 = (typeof JOURNEY_CAPABILITY_IDS_V1)[number];

/**
 * Capability availability for THIS owner in THIS environment.
 *
 * This is a different axis from `ProjectionStateV1` in `soul-core-aggregate.ts`.
 * That type answers "is this data section readable"; this one answers "may this
 * owner perform this journey step now". Both are kept because collapsing them
 * would force a data-availability word to carry a permission meaning.
 */
export type JourneyCapabilityStateV1 =
  /** Routes are reachable for this owner now. */
  | 'available'
  /** Implemented, intentionally fail-closed. `blockers` is non-empty. */
  | 'blocked'
  /** No main-repo implementation. Worktree/spec-only work is this, not `blocked`. */
  | 'not_implemented'
  /** Authoritative source unreadable. Assert nothing. */
  | 'unknown';

/**
 * Outward-claim ceiling. Ordered weakest → strongest; a client may present at or
 * below the returned value only.
 */
export const JOURNEY_PUBLIC_STATUSES_V1 = [
  'roadmap',
  'poc',
  'limited_preview',
  'beta',
  'ga',
] as const;

export type JourneyPublicStatusV1 = (typeof JOURNEY_PUBLIC_STATUSES_V1)[number];

// ───────────────────────────── blockers & reasons ──────────────────────────

/** What class of thing is blocking. Lets a client choose the right explanation. */
export type JourneyBlockerKindV1 =
  /** A named release gate has not passed (e.g. AP-G1). Not user-fixable. */
  | 'gate'
  /** A default-off feature flag. Not user-fixable. */
  | 'flag'
  /** A DI port bound to an Unavailable adapter. Not user-fixable. */
  | 'port'
  /** This principal is not an owner-capable `user` audience. */
  | 'authorization'
  /** The owning domain errored/timed out. Possibly transient. */
  | 'source_outage'
  /** Nothing implements this in the main repo. */
  | 'not_implemented';

/**
 * Closed reason-code set. Clients may map these to copy; they must not parse
 * `ref` strings for meaning.
 */
export const JOURNEY_REASON_CODES_V1 = [
  'capability_available',
  'release_gate_not_passed',
  'feature_flag_disabled',
  'kill_switch_engaged',
  'canary_allowlist_excluded',
  'port_unavailable',
  'owner_principal_required',
  'agent_identity_not_selected',
  'agent_identity_selection_stale',
  'source_outage',
  'not_implemented_in_main_repo',
  'production_gates_not_attested',
] as const;

export type JourneyReasonCodeV1 = (typeof JOURNEY_REASON_CODES_V1)[number];

/**
 * One precise reason a capability is not `available`.
 *
 * `ref` is a stable, human-readable identifier for operators and logs —
 * `gate:AP-G1`, `flag:AGENT_PORTABILITY_COMMIT_ENABLED`,
 * `port:ap-ce-02.export-package.v1`. It is diagnostic, not a client API: never
 * branch product behaviour on its string shape, branch on `reasonCode`.
 */
export interface JourneyBlockerV1 {
  kind: JourneyBlockerKindV1;
  ref: string;
  reasonCode: JourneyReasonCodeV1;
  /** Optional operator-facing note. Never contains secrets or user data. */
  note?: string;
}

// ───────────────────────────── route surface ───────────────────────────────

export type JourneyHttpMethodV1 = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * An exact backend route a client may call for a capability.
 *
 * Paths are absolute API paths without the global prefix, matching the Nest
 * controller declarations verbatim (`:param` placeholders preserved). They are
 * published so the client never guesses or constructs URLs from a template.
 */
export interface JourneyRouteV1 {
  method: JourneyHttpMethodV1;
  path: string;
  /** Only `bearer_user` exists today: guest and admin tokens fail closed. */
  auth: 'bearer_user';
  /** True when the route can change durable state. */
  writes: boolean;
  /** When true, omitting the idempotency key is a 400, not a silent retry. */
  idempotencyKeyRequired: boolean;
  /**
   * WHERE the idempotency key goes. Published because it is not uniform across
   * the domains this projection points at: the Import routes read an
   * `Idempotency-Key` header, while the Primary Agent commands take an
   * `idempotencyKey` body field. A client that assumes one shape silently loses
   * idempotency on the other, which is exactly the failure this field prevents.
   * Absent means `header` (the prior default) for wire compatibility.
   */
  idempotencyIn?: 'header' | 'body';
  /**
   * When true, a 2xx is an ACCEPTED REQUEST, not a domain success. The client
   * must poll/read-back before telling the user anything succeeded.
   */
  acceptedIsNotSuccess: boolean;
}

// ───────────────────────────── provenance ──────────────────────────────────

/** How fresh the projected value is. `unknown` when the domain cannot say. */
export type JourneyFreshnessV1 = 'live' | 'cached' | 'unknown';

/**
 * Provenance for one capability. `sourceOfTruth` names the domain that owns the
 * fact, so it is always visible that this projection is not the owner.
 */
export interface JourneyProvenanceV1 {
  sourceOfTruth: string;
  asOf: string;
  freshness: JourneyFreshnessV1;
}

// ───────────────────────────── capability record ───────────────────────────

export interface JourneyCapabilityV1 {
  capabilityId: JourneyCapabilityIdV1;
  state: JourneyCapabilityStateV1;
  /** Hard ceiling for outward claims about this capability. */
  publicStatus: JourneyPublicStatusV1;
  /** `capability_available` only when `state === 'available'`. */
  reasonCode: JourneyReasonCodeV1;
  provenance: JourneyProvenanceV1;
  /**
   * Non-empty exactly when `state !== 'available'`. Ordered most-blocking first
   * so a client can show one primary explanation.
   */
  blockers: readonly JourneyBlockerV1[];
  /** Empty unless `state === 'available'`. Never advertise unreachable routes. */
  routes: readonly JourneyRouteV1[];
  /** True only when at least one listed route can write durable state. */
  writeAllowed: boolean;
}

// ───────────────────────────── journey position ────────────────────────────

/**
 * Ordered P0 journey steps. `nextStep` points at the one action the client
 * should offer next; `null` means there is nothing honest to offer.
 */
export const JOURNEY_STEP_IDS_V1 = [
  'landing_choose_path',
  'bring_select_source',
  'bring_review_preview',
  'bring_confirm_commit',
  'continue_resolve_agent',
  'continue_review_context',
  'act_select_low_risk_action',
  'act_execute',
  'verify_receipt',
  'control_review_data',
] as const;

export type JourneyStepIdV1 = (typeof JOURNEY_STEP_IDS_V1)[number];

/**
 * Coarse journey position.
 *
 * `unknown` is a first-class value, not a failure: when the authoritative source
 * for progress cannot be read, the client must not claim the user has or has not
 * progressed.
 */
export type JourneyStageV1 =
  /**
   * Owner has no durable Agent identity selected yet.
   *
   * There is deliberately no `not_owner` stage: a non-owner principal (guest or
   * platform admin) never receives a projection at all. The endpoint answers
   * with the same non-enumerating 404 used elsewhere for owner-scoped objects,
   * so "authenticated" can never be mistaken for "owns something".
   */
  | 'no_agent'
  /** Durable Agent resolved; nothing brought in or approved yet. */
  | 'agent_ready'
  /** Brought-in content awaits explicit user review. */
  | 'context_pending_review'
  /** User-approved context exists and is authoritatively readable. */
  | 'context_approved'
  /** At least one low-risk action completed with a durable receipt. */
  | 'action_completed'
  /** Progress source unreadable. Assert nothing. */
  | 'unknown';

/**
 * The owner's durable Agent identity for continuity.
 *
 * This is CONSUMED from the canonical Primary Agent selection; it is never
 * created, repaired or superseded here. A matching id string alone is not
 * identity: `selectionRef` + `selectionEpoch` are what make "the same Agent"
 * checkable across sessions.
 */
export interface ContinuityAgentIdentityV1 {
  agentAccountId: string;
  soulCoreId: string;
  selectionRef: string;
  selectionEpoch: string;
  /** Pinned so a client cannot mistake a fallback for the canonical selection. */
  resolvedFrom: 'primary_agent_selection_v1';
}

/**
 * Owner reference. `principalRef` is a truncated SHA-256 digest of the
 * authenticated principal id, not the id itself: the client already knows who it
 * authenticated as, so echoing a raw user id only widens the blast radius of a
 * logged or cached response.
 */
export interface JourneyOwnerRefV1 {
  audience: 'user';
  /** `sha256:` + first 12 lowercase hex chars of the principal id digest. */
  principalRef: string;
}

// ───────────────────────────── top-level projection ────────────────────────

export interface ContinuityJourneyProjectionV1 {
  schemaVersion: typeof WEB_FIRST_AI_CONTINUITY_SCHEMA_VERSION;
  contractVersion: typeof WEB_FIRST_AI_CONTINUITY_CONTRACT_VERSION;
  environment: JourneyEnvironmentV1;
  /** Server ISO timestamp the projection was assembled at. */
  asOf: string;
  /**
   * Capabilities are read independently, so two capabilities may reflect
   * slightly different instants. Pinned as a literal so no client assumes a
   * cross-capability snapshot.
   */
  consistency: 'per-capability-eventual';
  owner: JourneyOwnerRefV1;
  /** `data` present only when `state === 'available'` (see `ProjectionV1`). */
  agent: ProjectionV1<ContinuityAgentIdentityV1>;
  stage: JourneyStageV1;
  nextStep: JourneyStepIdV1 | null;
  /** Every capability id is always present; absence is never used as a signal. */
  capabilities: Readonly<Record<JourneyCapabilityIdV1, JourneyCapabilityV1>>;
  /** De-duplicated union of all capability blockers, for one operator summary. */
  blockers: readonly JourneyBlockerV1[];
  /**
   * Fields/behaviours a client MUST NOT infer from anything else in this
   * response. Published rather than documented so drift is visible on the wire.
   */
  notImplemented: readonly string[];
}

// ───────────────────────── approved context (Continue) ─────────────────────

/**
 * Payload profiles an approved-context item may declare. A client must refuse
 * profiles it does not know, so a server only emits the fact profiles when the
 * caller asked for them with `?include=` (see APPROVED_CONTEXT_INCLUDE_KINDS_V1);
 * the default projection stays preference-only for older clients.
 */
export const APPROVED_CONTEXT_PREFERENCE_PROFILE_V1 = 'agent_preference_payload_v1' as const;
export const APPROVED_CONTEXT_MEMORY_FACT_PROFILE_V1 = 'agent_memory_fact_payload_v1' as const;
export const APPROVED_CONTEXT_PERSONA_FACT_PROFILE_V1 = 'agent_persona_fact_payload_v1' as const;
export const APPROVED_CONTEXT_CONVERSATION_EXCERPT_PROFILE_V1 =
  'agent_conversation_excerpt_payload_v1' as const;
export const APPROVED_CONTEXT_KNOWLEDGE_ARTIFACT_PROFILE_V1 =
  'agent_knowledge_artifact_payload_v1' as const;
export const APPROVED_CONTEXT_SKILL_DECLARATION_PROFILE_V1 =
  'agent_skill_declaration_payload_v1' as const;
export const APPROVED_CONTEXT_WORKFLOW_DECLARATION_PROFILE_V1 =
  'agent_workflow_declaration_payload_v1' as const;
export const APPROVED_CONTEXT_PAYLOAD_PROFILES_V1 = [
  APPROVED_CONTEXT_PREFERENCE_PROFILE_V1,
  APPROVED_CONTEXT_MEMORY_FACT_PROFILE_V1,
  APPROVED_CONTEXT_PERSONA_FACT_PROFILE_V1,
  APPROVED_CONTEXT_CONVERSATION_EXCERPT_PROFILE_V1,
  APPROVED_CONTEXT_KNOWLEDGE_ARTIFACT_PROFILE_V1,
  APPROVED_CONTEXT_SKILL_DECLARATION_PROFILE_V1,
  APPROVED_CONTEXT_WORKFLOW_DECLARATION_PROFILE_V1,
] as const;
export type ApprovedContextPayloadProfileV1 = (typeof APPROVED_CONTEXT_PAYLOAD_PROFILES_V1)[number];

/** Opt-in item kinds beyond preferences; the query value is a comma list of these. */
export const APPROVED_CONTEXT_INCLUDE_KINDS_V1 = [
  'memory',
  'persona',
  'conversation',
  'knowledge',
  'skill',
  'workflow',
] as const;
export type ApprovedContextIncludeKindV1 = (typeof APPROVED_CONTEXT_INCLUDE_KINDS_V1)[number];

/** Payload of an `agent_memory_fact_payload_v1` item: one fact the owner brought home. */
export interface ApprovedContextMemoryFactPayloadV1 {
  fact: string;
  sensitivity: string;
  retention: string;
  confidence: number;
}

/**
 * Payload of an `agent_conversation_excerpt_payload_v1` item: one past
 * conversation the owner brought home, as the conversation owner stored it.
 * `excerpt` is the `role: content` turns joined by newlines.
 */
export interface ApprovedContextConversationExcerptPayloadV1 {
  excerpt: string;
  title: string | null;
  messageCount: number | null;
  sensitivity: string;
}

export const APPROVED_CONTEXT_KNOWLEDGE_KINDS_V1 = [
  'project',
  'knowledge',
  'dataset',
  'prompt_library',
  'ignore_rules',
  'ide_manifest',
] as const;
export type ApprovedContextKnowledgeKindV1 =
  (typeof APPROVED_CONTEXT_KNOWLEDGE_KINDS_V1)[number];

export interface ApprovedContextKnowledgeArtifactPayloadV1 {
  kind: ApprovedContextKnowledgeKindV1;
  body: string;
  title: string | null;
  citation: string | null;
  sensitivity: string;
}

export interface ApprovedContextSkillDeclarationPayloadV1 {
  kind: 'mcp_config' | 'imported_skill';
  name: string;
  description: string;
  citation: string | null;
}

export interface ApprovedContextWorkflowDeclarationPayloadV1 {
  kind: 'imported_workflow';
  name: string;
  description: string;
  citation: string | null;
}

/**
 * Payload of an `agent_persona_fact_payload_v1` item: the persona / goal fact as
 * the Agent W1R owner stored it. Imported instructions arrive in the carrier
 * shape the archive parser produces (`instructions` = the text, `name` = the
 * title, `filename` for provenance); `factKind` is added by the reader.
 */
export interface ApprovedContextPersonaFactPayloadV1 {
  factKind: 'persona' | 'goal';
  instructions?: string;
  name?: string;
  filename?: string;
  [key: string]: unknown;
}

/**
 * One item of user-approved context that survives between sessions.
 *
 * Read from the canonical Preference owner, and — when the caller opts in — from
 * the memory and persona fact owners. Every field is provenance-carrying on
 * purpose: the P0 promise is not just "your Agent remembers", it is "you can see
 * WHERE each thing came from, and undo it".
 */
export interface ApprovedContextItemV1 {
  canonicalId: string;
  /** Owner-facing key, e.g. `tone.formality`. */
  preferenceKey: string;
  /** Declared payload profile; a client must refuse profiles it does not know. */
  payloadProfile: string;
  /** Always `'imported'` today — this content came in through Bring. */
  classification: string;
  /** The approved content. The caller is the owner, so this is their own data. */
  payload: unknown;
  /** Canonical version, for optimistic concurrency. Not an ordering key. */
  currentVersion: string;
  /** Provenance: the exact source item and its digest. */
  sourceItemRef: string;
  sourceItemDigest: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * How the owner may change an approved-context item.
 *
 * `revoke_via_compensation` is the only supported route today, and saying so
 * explicitly matters: the canonical table carries an append-only mutation guard,
 * so an in-place "edit" is not merely unimplemented, it is refused at the storage
 * layer. A client that renders an edit affordance would be lying to the user.
 */
export type ApprovedContextMutabilityV1 = 'revoke_via_compensation' | 'read_only';

export interface ApprovedContextProjectionV1 {
  schemaVersion: typeof WEB_FIRST_AI_CONTINUITY_SCHEMA_VERSION;
  contractVersion: typeof WEB_FIRST_AI_CONTINUITY_CONTRACT_VERSION;
  environment: JourneyEnvironmentV1;
  asOf: string;
  owner: JourneyOwnerRefV1;
  /**
   * The Agent this context belongs to. Approved context is always read for ONE
   * durable Agent — an owner with several Agents does not get a merged view,
   * because merging would invent a context that no Agent actually holds.
   */
  agent: ProjectionV1<ContinuityAgentIdentityV1>;
  /** `data` present only when `state === 'available'`. */
  context: ProjectionV1<{
    items: readonly ApprovedContextItemV1[];
    /** True when the page was capped; the view is partial, not complete. */
    truncated: boolean;
    /** What the owner may do about these items. */
    mutability: ApprovedContextMutabilityV1;
  }>;
  /**
   * Non-empty when `context.state !== 'available'`. Reuses the journey blocker
   * vocabulary so a client has one way to explain any unavailability.
   */
  blockers: readonly JourneyBlockerV1[];
  notImplemented: readonly string[];
}

/**
 * Validate an approved-context projection.
 *
 * The invariants worth pinning: `data` only when available, blockers only when
 * not, and — most importantly — items may never be present without an available
 * agent, because context with no owning Agent is unattributable.
 */
export function validateApprovedContextProjectionV1(
  value: unknown,
): JourneyValidationErrorV1[] {
  const errors: JourneyValidationErrorV1[] = [];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [{ path: '$', code: 'invalid_type', message: 'projection must be an object' }];
  }
  const projection = value as Partial<ApprovedContextProjectionV1>;

  if (projection.schemaVersion !== WEB_FIRST_AI_CONTINUITY_SCHEMA_VERSION) {
    errors.push({ path: '$.schemaVersion', code: 'invalid_value', message: 'unsupported schemaVersion' });
  }
  if (projection.contractVersion !== WEB_FIRST_AI_CONTINUITY_CONTRACT_VERSION) {
    errors.push({ path: '$.contractVersion', code: 'invalid_value', message: 'unsupported contractVersion' });
  }
  if (!['local', 'test', 'staging', 'production'].includes(projection.environment as string)) {
    errors.push({ path: '$.environment', code: 'invalid_value', message: 'unknown environment' });
  }
  if (!isIsoTimestamp(projection.asOf)) {
    errors.push({ path: '$.asOf', code: 'invalid_value', message: 'asOf must be an ISO timestamp' });
  }
  if (!/^sha256:[0-9a-f]{12}$/.test(String(projection.owner?.principalRef))) {
    errors.push({
      path: '$.owner.principalRef',
      code: 'invalid_value',
      message: 'principalRef must be sha256:<12 lowercase hex> and never a raw principal id',
    });
  }

  const context = projection.context;
  if (typeof context !== 'object' || context === null) {
    errors.push({ path: '$.context', code: 'missing', message: 'context projection is required' });
    return errors;
  }

  const contextAvailable = context.state === 'available';
  if (contextAvailable) {
    if (!context.data || !Array.isArray(context.data.items)) {
      errors.push({
        path: '$.context.data.items',
        code: 'invariant_violated',
        message: 'an available context projection must carry an items array',
      });
    }
    if (
      context.data &&
      !['revoke_via_compensation', 'read_only'].includes(context.data.mutability as string)
    ) {
      errors.push({ path: '$.context.data.mutability', code: 'invalid_value', message: 'unknown mutability' });
    }
    if (Array.isArray(projection.blockers) && projection.blockers.length !== 0) {
      errors.push({
        path: '$.blockers',
        code: 'invariant_violated',
        message: 'an available context projection must carry no blockers',
      });
    }
  } else {
    if (context.data !== undefined) {
      errors.push({
        path: '$.context.data',
        code: 'invariant_violated',
        message: 'data may only be present when the context projection is available',
      });
    }
    if (!Array.isArray(projection.blockers) || projection.blockers.length === 0) {
      errors.push({
        path: '$.blockers',
        code: 'invariant_violated',
        message: 'an unavailable context projection must name at least one blocker',
      });
    }
  }

  const agentAvailable = projection.agent?.state === 'available';
  if (contextAvailable && !agentAvailable) {
    errors.push({
      path: '$.agent',
      code: 'invariant_violated',
      message: 'approved context cannot be served without a resolved owning Agent',
    });
  }

  return errors;
}

// ───────────────────────── action receipts (Verify) ────────────────────────

/**
 * Independent state of one accountability layer.
 *
 * `not_applicable` is load-bearing: a zero-cost read-only action has nothing to
 * settle, and reporting that as `absent` would imply a missing step that a user
 * might wait for. `unknown_outcome` is likewise distinct from `failed` — it
 * requires reconciliation, not a retry, and must never be shown as success.
 */
export type ReceiptLayerStateV1 =
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'unknown_outcome'
  | 'recorded'
  | 'absent'
  | 'not_applicable';

/**
 * One Action Receipt, projected for a user who needs to understand what their
 * Agent did on their behalf.
 *
 * The five layers are SEPARATE FIELDS by design. Collapsing Execution, Outcome,
 * Settlement, Verification and Remedy into a single green "completed" is the
 * specific dishonesty this shape exists to prevent: an action can execute
 * successfully, produce no recorded outcome, need no settlement, never be
 * independently verified, and have no remedy authority — and a user is entitled
 * to see all five of those facts separately.
 */
export interface ActionReceiptSummaryV1 {
  receiptId: string;
  actionId: string;
  taskId: string;
  /** Accountable Agent. */
  agentAccountId: string;
  soulCoreId: string;
  actionType: string;
  /** Which tool actually ran. */
  toolName: string;
  /** `read_only` | `internal_side_effect` | `external_side_effect`. */
  capabilityClass: string;
  capabilityScope: string;
  /** True when the server-owned capability matrix declares the tool cost-free. */
  zeroCost: boolean;
  environment: string;
  recordedAt: string;
  receiptDigest: string;

  /** Layer 1 — what actually ran, and which required controls left no record. */
  execution: {
    state: ReceiptLayerStateV1;
    executionId: string;
    startedAt: string | null;
    completedAt: string | null;
    missingControls: readonly string[];
  };
  /** Layer 2 — the recorded result. `absent` when nothing was recorded. */
  outcome: {
    state: ReceiptLayerStateV1;
    outcomeId: string | null;
    result: string | null;
    recordedAt: string | null;
  };
  /** Layer 3 — money. `not_applicable` for zero-cost actions. */
  settlement: { state: ReceiptLayerStateV1; authorityCount: number };
  /** Layer 4 — independent checking. */
  verification: { state: ReceiptLayerStateV1; verifierCount: number };
  /** Layer 5 — how the owner can be made whole. */
  remedy: { state: ReceiptLayerStateV1; authorityCount: number };

  /** Coarse party labels only; party refs can carry internal ids. */
  responsibility: {
    controller: string | null;
    provider: string | null;
    executor: string | null;
    shellMode: string;
  };
}

export interface ActionReceiptProjectionV1 {
  schemaVersion: typeof WEB_FIRST_AI_CONTINUITY_SCHEMA_VERSION;
  contractVersion: typeof WEB_FIRST_AI_CONTINUITY_CONTRACT_VERSION;
  environment: JourneyEnvironmentV1;
  asOf: string;
  owner: JourneyOwnerRefV1;
  /** Receipts are always read for ONE durable Agent. */
  agent: ProjectionV1<ContinuityAgentIdentityV1>;
  receipts: ProjectionV1<{
    items: readonly ActionReceiptSummaryV1[];
    truncated: boolean;
  }>;
  blockers: readonly JourneyBlockerV1[];
  notImplemented: readonly string[];
}

/**
 * Validate an Action Receipt projection.
 *
 * Beyond the availability invariants this pins the anti-collapse rule: every
 * receipt must carry all five layer states. A producer that drops one — the
 * cheapest way to make a receipt look cleaner than it is — fails here.
 */
export function validateActionReceiptProjectionV1(
  value: unknown,
): JourneyValidationErrorV1[] {
  const errors: JourneyValidationErrorV1[] = [];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [{ path: '$', code: 'invalid_type', message: 'projection must be an object' }];
  }
  const projection = value as Partial<ActionReceiptProjectionV1>;

  if (projection.schemaVersion !== WEB_FIRST_AI_CONTINUITY_SCHEMA_VERSION) {
    errors.push({ path: '$.schemaVersion', code: 'invalid_value', message: 'unsupported schemaVersion' });
  }
  if (projection.contractVersion !== WEB_FIRST_AI_CONTINUITY_CONTRACT_VERSION) {
    errors.push({ path: '$.contractVersion', code: 'invalid_value', message: 'unsupported contractVersion' });
  }
  if (!isIsoTimestamp(projection.asOf)) {
    errors.push({ path: '$.asOf', code: 'invalid_value', message: 'asOf must be an ISO timestamp' });
  }
  if (!/^sha256:[0-9a-f]{12}$/.test(String(projection.owner?.principalRef))) {
    errors.push({
      path: '$.owner.principalRef',
      code: 'invalid_value',
      message: 'principalRef must be sha256:<12 lowercase hex> and never a raw principal id',
    });
  }

  const receipts = projection.receipts;
  if (typeof receipts !== 'object' || receipts === null) {
    errors.push({ path: '$.receipts', code: 'missing', message: 'receipts projection is required' });
    return errors;
  }

  const layerStates: readonly ReceiptLayerStateV1[] = [
    'succeeded',
    'failed',
    'cancelled',
    'unknown_outcome',
    'recorded',
    'absent',
    'not_applicable',
  ];

  if (receipts.state === 'available') {
    if (!receipts.data || !Array.isArray(receipts.data.items)) {
      errors.push({
        path: '$.receipts.data.items',
        code: 'invariant_violated',
        message: 'an available receipts projection must carry an items array',
      });
    } else {
      receipts.data.items.forEach((item, index) => {
        // All five layers, always. This is the anti-collapse invariant.
        for (const layer of ['execution', 'outcome', 'settlement', 'verification', 'remedy'] as const) {
          const state = (item as Record<string, any>)?.[layer]?.state;
          if (!layerStates.includes(state)) {
            errors.push({
              path: `$.receipts.data.items[${index}].${layer}.state`,
              code: 'invariant_violated',
              message: `layer ${layer} must carry an explicit state; a receipt may not collapse its layers`,
            });
          }
        }
        if (!Array.isArray((item as Record<string, any>)?.execution?.missingControls)) {
          errors.push({
            path: `$.receipts.data.items[${index}].execution.missingControls`,
            code: 'missing',
            message: 'missingControls must be an array, even when empty',
          });
        }
        // A cost-free action must never claim a settlement.
        if (item.zeroCost === true && item.settlement?.state !== 'not_applicable') {
          errors.push({
            path: `$.receipts.data.items[${index}].settlement.state`,
            code: 'invariant_violated',
            message: 'a zero-cost action must report settlement as not_applicable',
          });
        }
      });
    }
    if (Array.isArray(projection.blockers) && projection.blockers.length !== 0) {
      errors.push({
        path: '$.blockers',
        code: 'invariant_violated',
        message: 'an available receipts projection must carry no blockers',
      });
    }
  } else {
    if (receipts.data !== undefined) {
      errors.push({
        path: '$.receipts.data',
        code: 'invariant_violated',
        message: 'data may only be present when the receipts projection is available',
      });
    }
    if (!Array.isArray(projection.blockers) || projection.blockers.length === 0) {
      errors.push({
        path: '$.blockers',
        code: 'invariant_violated',
        message: 'an unavailable receipts projection must name at least one blocker',
      });
    }
  }

  if (receipts.state === 'available' && projection.agent?.state !== 'available') {
    errors.push({
      path: '$.agent',
      code: 'invariant_violated',
      message: 'receipts cannot be served without a resolved owning Agent',
    });
  }

  return errors;
}

// ───────────────────────────── validators ──────────────────────────────────

/**
 * Pure structural validators. Shared by both sides so the backend cannot emit a
 * shape the frontend rejects, and a test can pin the invariants that matter.
 * They intentionally validate INVARIANTS, not just types: the state/blocker/
 * route relationships are the part that would otherwise rot.
 */

export interface JourneyValidationErrorV1 {
  path: string;
  code:
    | 'missing'
    | 'invalid_type'
    | 'invalid_value'
    | 'invariant_violated';
  message: string;
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 20 || value.length > 40) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 19) === value.slice(0, 19);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validate one capability record.
 *
 * The invariants are the point:
 *  - `available` ⇒ no blockers, reasonCode is `capability_available`;
 *  - not `available` ⇒ at least one blocker, and reasonCode is NOT
 *    `capability_available` (otherwise a blocked capability could read as fine);
 *  - routes are only published when `available` (never advertise a 503);
 *  - `writeAllowed` must agree with the published routes, so a client cannot be
 *    told "you may write" while every route is read-only.
 */
export function validateJourneyCapabilityV1(
  value: unknown,
  path = 'capability',
): JourneyValidationErrorV1[] {
  const errors: JourneyValidationErrorV1[] = [];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [{ path, code: 'invalid_type', message: 'capability must be an object' }];
  }
  const record = value as Partial<JourneyCapabilityV1>;

  if (!JOURNEY_CAPABILITY_IDS_V1.includes(record.capabilityId as JourneyCapabilityIdV1)) {
    errors.push({ path: `${path}.capabilityId`, code: 'invalid_value', message: 'unknown capabilityId' });
  }
  const states: readonly JourneyCapabilityStateV1[] = ['available', 'blocked', 'not_implemented', 'unknown'];
  if (!states.includes(record.state as JourneyCapabilityStateV1)) {
    errors.push({ path: `${path}.state`, code: 'invalid_value', message: 'unknown state' });
  }
  if (!JOURNEY_PUBLIC_STATUSES_V1.includes(record.publicStatus as JourneyPublicStatusV1)) {
    errors.push({ path: `${path}.publicStatus`, code: 'invalid_value', message: 'unknown publicStatus' });
  }
  if (!JOURNEY_REASON_CODES_V1.includes(record.reasonCode as JourneyReasonCodeV1)) {
    errors.push({ path: `${path}.reasonCode`, code: 'invalid_value', message: 'unknown reasonCode' });
  }

  const provenance = record.provenance;
  if (typeof provenance !== 'object' || provenance === null) {
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

  const blockers = record.blockers;
  if (!Array.isArray(blockers)) {
    errors.push({ path: `${path}.blockers`, code: 'missing', message: 'blockers must be an array' });
  }
  const routes = record.routes;
  if (!Array.isArray(routes)) {
    errors.push({ path: `${path}.routes`, code: 'missing', message: 'routes must be an array' });
  }

  if (Array.isArray(blockers) && Array.isArray(routes)) {
    if (record.state === 'available') {
      if (blockers.length !== 0) {
        errors.push({
          path: `${path}.blockers`,
          code: 'invariant_violated',
          message: 'an available capability must carry no blockers',
        });
      }
      if (record.reasonCode !== 'capability_available') {
        errors.push({
          path: `${path}.reasonCode`,
          code: 'invariant_violated',
          message: 'an available capability must report capability_available',
        });
      }
    } else {
      if (blockers.length === 0) {
        errors.push({
          path: `${path}.blockers`,
          code: 'invariant_violated',
          message: 'a non-available capability must name at least one blocker',
        });
      }
      if (record.reasonCode === 'capability_available') {
        errors.push({
          path: `${path}.reasonCode`,
          code: 'invariant_violated',
          message: 'capability_available may not be reported for a non-available capability',
        });
      }
      if (routes.length !== 0) {
        errors.push({
          path: `${path}.routes`,
          code: 'invariant_violated',
          message: 'routes may only be published for an available capability',
        });
      }
    }

    const anyWrite = routes.some((route) => (route as JourneyRouteV1)?.writes === true);
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

/**
 * Validate the whole projection.
 *
 * Beyond the per-capability invariants this pins two cross-cutting ones:
 *  - every capability id is present (so a client never treats a missing key as
 *    a signal);
 *  - `stage` and `agent` agree — a resolved Agent cannot coexist with
 *    `no_agent`, and `agent_ready` or later cannot claim an unresolved Agent.
 */
export function validateContinuityJourneyProjectionV1(
  value: unknown,
): JourneyValidationErrorV1[] {
  const errors: JourneyValidationErrorV1[] = [];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [{ path: '$', code: 'invalid_type', message: 'projection must be an object' }];
  }
  const projection = value as Partial<ContinuityJourneyProjectionV1>;

  if (projection.schemaVersion !== WEB_FIRST_AI_CONTINUITY_SCHEMA_VERSION) {
    errors.push({ path: '$.schemaVersion', code: 'invalid_value', message: 'unsupported schemaVersion' });
  }
  if (projection.contractVersion !== WEB_FIRST_AI_CONTINUITY_CONTRACT_VERSION) {
    errors.push({ path: '$.contractVersion', code: 'invalid_value', message: 'unsupported contractVersion' });
  }
  if (!['local', 'test', 'staging', 'production'].includes(projection.environment as string)) {
    errors.push({ path: '$.environment', code: 'invalid_value', message: 'unknown environment' });
  }
  if (!isIsoTimestamp(projection.asOf)) {
    errors.push({ path: '$.asOf', code: 'invalid_value', message: 'asOf must be an ISO timestamp' });
  }
  if (projection.consistency !== 'per-capability-eventual') {
    errors.push({ path: '$.consistency', code: 'invalid_value', message: 'consistency is pinned' });
  }

  const owner = projection.owner;
  if (typeof owner !== 'object' || owner === null) {
    errors.push({ path: '$.owner', code: 'missing', message: 'owner is required' });
  } else {
    if (owner.audience !== 'user') {
      errors.push({ path: '$.owner.audience', code: 'invalid_value', message: 'only the user audience is projected' });
    }
    if (!/^sha256:[0-9a-f]{12}$/.test(String(owner.principalRef))) {
      errors.push({
        path: '$.owner.principalRef',
        code: 'invalid_value',
        message: 'principalRef must be sha256:<12 lowercase hex> and never a raw principal id',
      });
    }
  }

  const stages: readonly JourneyStageV1[] = [
    'no_agent',
    'agent_ready',
    'context_pending_review',
    'context_approved',
    'action_completed',
    'unknown',
  ];
  if (!stages.includes(projection.stage as JourneyStageV1)) {
    errors.push({ path: '$.stage', code: 'invalid_value', message: 'unknown stage' });
  }
  if (
    projection.nextStep !== null &&
    !JOURNEY_STEP_IDS_V1.includes(projection.nextStep as JourneyStepIdV1)
  ) {
    errors.push({ path: '$.nextStep', code: 'invalid_value', message: 'unknown nextStep' });
  }

  const capabilities = projection.capabilities as
    | Record<string, unknown>
    | undefined;
  if (typeof capabilities !== 'object' || capabilities === null) {
    errors.push({ path: '$.capabilities', code: 'missing', message: 'capabilities is required' });
  } else {
    for (const capabilityId of JOURNEY_CAPABILITY_IDS_V1) {
      const entry = capabilities[capabilityId];
      if (entry === undefined) {
        errors.push({
          path: `$.capabilities.${capabilityId}`,
          code: 'missing',
          message: 'every capability id must be present; absence is never a signal',
        });
        continue;
      }
      errors.push(...validateJourneyCapabilityV1(entry, `$.capabilities.${capabilityId}`));
      if ((entry as JourneyCapabilityV1).capabilityId !== capabilityId) {
        errors.push({
          path: `$.capabilities.${capabilityId}.capabilityId`,
          code: 'invariant_violated',
          message: 'capability key and capabilityId must match',
        });
      }
    }
  }

  if (!Array.isArray(projection.blockers)) {
    errors.push({ path: '$.blockers', code: 'missing', message: 'blockers must be an array' });
  }
  if (!Array.isArray(projection.notImplemented)) {
    errors.push({ path: '$.notImplemented', code: 'missing', message: 'notImplemented must be an array' });
  }

  const agent = projection.agent;
  if (typeof agent !== 'object' || agent === null) {
    errors.push({ path: '$.agent', code: 'missing', message: 'agent projection is required' });
  } else {
    const agentAvailable = agent.state === 'available';
    if (agentAvailable && (agent.data === undefined || agent.data === null)) {
      errors.push({
        path: '$.agent.data',
        code: 'invariant_violated',
        message: 'an available agent projection must carry data',
      });
    }
    if (!agentAvailable && agent.data !== undefined) {
      errors.push({
        path: '$.agent.data',
        code: 'invariant_violated',
        message: 'data may only be present when the agent projection is available',
      });
    }
    if (agentAvailable && projection.stage === 'no_agent') {
      errors.push({
        path: '$.stage',
        code: 'invariant_violated',
        message: 'no_agent contradicts a resolved agent identity',
      });
    }
    const requiresAgent: readonly JourneyStageV1[] = [
      'agent_ready',
      'context_pending_review',
      'context_approved',
      'action_completed',
    ];
    if (!agentAvailable && requiresAgent.includes(projection.stage as JourneyStageV1)) {
      errors.push({
        path: '$.stage',
        code: 'invariant_violated',
        message: 'this stage requires a resolved agent identity',
      });
    }
  }

  return errors;
}

/** Convenience guard. Prefer the validators when the errors matter. */
export function isContinuityJourneyProjectionV1(
  value: unknown,
): value is ContinuityJourneyProjectionV1 {
  return validateContinuityJourneyProjectionV1(value).length === 0;
}

// ═══════════════════════════ import authorization ═══════════════════════════
//
// Additive to `web-first-ai-continuity/v1`. Nothing above this line changes.
//
// Why this exists at all: committing an imported preference into canonical
// storage requires a durable AuthorityGrant that matches ONE narrow profile
// exactly (one capability, one audience, an exact tenant/environment/domain/
// write-kind constraint, a finite window). The verifier that checks it returns
// a single indistinguishable denial for every failure mode, deliberately, so it
// cannot be used to enumerate grants. That is correct for a verifier and fatal
// for a client: a caller that assembled the profile itself and got one field
// wrong would receive "denied" with no way to learn which field.
//
// So the profile is server-owned. The client never builds it, never names a
// capability, and never sees a grant body. It asks for consent copy, shows it,
// and on confirmation receives one opaque `authorizationEvidenceRef` to hand to
// the commit call. Every field below is bound server-side from the
// authenticated principal and the verified Primary Agent selection.

/** Capability this authorization covers. One, always. */
export const IMPORT_AUTHORITY_CAPABILITY_V1 = 'agent.preference.write' as const;

/** The only consumer allowed to present the resulting evidence. */
export const IMPORT_AUTHORITY_AUDIENCE_V1 = 'agent-portability-commit' as const;

/** The narrow grant profile the canonical owner's verifier accepts. */
export const IMPORT_AUTHORITY_PROFILE_V1 =
  'agent-preference-canonical-owner-v1' as const;

/**
 * Consent copy for the confirmation screen, rendered by the authority itself.
 *
 * This is passed through from the authority's own preview renderer rather than
 * re-written here. If the client composed its own description of what is being
 * authorized, the words the user agreed to and the policy actually recorded
 * could drift apart, which is the one thing a consent record must never allow.
 */
export interface ImportAuthorityConsentDisplayV1 {
  title: string;
  summary: string;
  capabilityLines: string[];
  materialTerms: string[];
  warnings: string[];
}

/**
 * What the owner is about to authorize.
 *
 * `status` is a string discriminant on purpose. The backend `tsconfig` runs with
 * `strictNullChecks: false`, under which boolean-literal discriminants do not
 * narrow, so a `available: true | false` union would silently type-check while
 * reading fields that may be absent.
 */
export interface ImportAuthorityConsentV1 {
  schemaVersion: typeof WEB_FIRST_AI_CONTINUITY_SCHEMA_VERSION;
  contractVersion: typeof WEB_FIRST_AI_CONTINUITY_CONTRACT_VERSION;
  status: 'ready';
  /** Verified Primary Agent selection this authorization would be bound to. */
  agentAccountId: string;
  soulCoreId: string;
  environment: JourneyEnvironmentV1;
  capability: typeof IMPORT_AUTHORITY_CAPABILITY_V1;
  audience: typeof IMPORT_AUTHORITY_AUDIENCE_V1;
  profile: typeof IMPORT_AUTHORITY_PROFILE_V1;
  /** Lifetime of the grant that would be issued, in seconds. Always finite. */
  validitySeconds: number;
  display: ImportAuthorityConsentDisplayV1;
  renderedAt: string;
}

/**
 * The issued authorization.
 *
 * `authorizationEvidenceRef` is the ONLY field the client needs to carry. It is
 * opaque by contract: clients must not parse it, derive anything from its shape,
 * or construct one. `agentAccountId` and `validUntil` are included so a UI can
 * say which Agent was authorized and for how long without a second round trip.
 */
export interface ImportAuthorityGrantV1 {
  schemaVersion: typeof WEB_FIRST_AI_CONTINUITY_SCHEMA_VERSION;
  contractVersion: typeof WEB_FIRST_AI_CONTINUITY_CONTRACT_VERSION;
  status: 'issued';
  /** Opaque. Pass to the preference import commit call unchanged. */
  authorizationEvidenceRef: string;
  agentAccountId: string;
  soulCoreId: string;
  environment: JourneyEnvironmentV1;
  validFrom: string;
  validUntil: string;
}

/**
 * Preconditions this route cannot satisfy on the owner's behalf.
 *
 * These are owner-state facts, not deployment flags: a flag blocker is reported
 * the same way every other capability reports one (503 + `blockedBy`), while
 * these mean "the owner has more to do first" and are recoverable by the user.
 */
export const IMPORT_AUTHORITY_PRECONDITION_CODES_V1 = [
  /** No durable Agent selected, so there is no subject to bind authority to. */
  'primary_agent_not_selected',
  /** No unambiguous tenant assignment; the verifier requires an exact match. */
  'tenant_not_assigned',
  /** Conflicting tenant assignments. Never auto-resolved to a winner. */
  'tenant_ambiguous',
] as const;

export type ImportAuthorityPreconditionCodeV1 =
  (typeof IMPORT_AUTHORITY_PRECONDITION_CODES_V1)[number];

/**
 * Validate an issued authorization before a client stores or forwards it.
 *
 * Deliberately does NOT validate the internal shape of
 * `authorizationEvidenceRef` beyond non-emptiness. Teaching clients the grant
 * ref format would invite them to build or mutate one, and the server is the
 * only component entitled to know that format.
 */
export function validateImportAuthorityGrantV1(
  value: unknown,
): JourneyValidationErrorV1[] {
  const errors: JourneyValidationErrorV1[] = [];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [{ path: 'grant', code: 'invalid_type', message: 'grant must be an object' }];
  }
  const grant = value as Record<string, unknown>;

  if (grant.schemaVersion !== WEB_FIRST_AI_CONTINUITY_SCHEMA_VERSION) {
    errors.push({
      path: 'grant.schemaVersion',
      code: 'invalid_value',
      message: `schemaVersion must be ${WEB_FIRST_AI_CONTINUITY_SCHEMA_VERSION}`,
    });
  }
  if (grant.contractVersion !== WEB_FIRST_AI_CONTINUITY_CONTRACT_VERSION) {
    errors.push({
      path: 'grant.contractVersion',
      code: 'invalid_value',
      message: `contractVersion must be ${WEB_FIRST_AI_CONTINUITY_CONTRACT_VERSION}`,
    });
  }
  if (grant.status !== 'issued') {
    errors.push({
      path: 'grant.status',
      code: 'invalid_value',
      message: 'status must be "issued"',
    });
  }
  for (const field of ['authorizationEvidenceRef', 'agentAccountId', 'soulCoreId'] as const) {
    if (!isNonEmptyString(grant[field])) {
      errors.push({
        path: `grant.${field}`,
        code: 'missing',
        message: `${field} is required`,
      });
    }
  }

  // A grant with no upper bound would be a standing permission. The canonical
  // verifier rejects one; catching it here keeps a client from ever presenting
  // something it should have recognised as malformed.
  if (!isIsoTimestamp(grant.validFrom)) {
    errors.push({
      path: 'grant.validFrom',
      code: 'invalid_value',
      message: 'validFrom must be an ISO timestamp',
    });
  }
  if (!isIsoTimestamp(grant.validUntil)) {
    errors.push({
      path: 'grant.validUntil',
      code: 'invalid_value',
      message: 'validUntil is required and must be an ISO timestamp',
    });
  }
  if (isIsoTimestamp(grant.validFrom) && isIsoTimestamp(grant.validUntil)) {
    if (Date.parse(grant.validUntil) <= Date.parse(grant.validFrom)) {
      errors.push({
        path: 'grant.validUntil',
        code: 'invariant_violated',
        message: 'validUntil must be after validFrom',
      });
    }
  }

  return errors;
}
