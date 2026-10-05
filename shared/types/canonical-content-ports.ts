/**
 * Canonical Agent/content ports — the minimum `AP-SA-W1R` profile.
 *
 * These are **owner-neutral interface declarations**. Publishing them creates no
 * writer: each canonical domain owner (Agent, Memory, Conversation, Knowledge,
 * Attachment, Skill registry) implements its own adapter behind its own flag.
 * Portability and Continuity consume these contracts and never touch a canonical
 * repository directly.
 *
 * Two rules are structural rather than advisory:
 *  - **Reads never repair.** Every reader declares `repairsState: false` as a
 *    literal type, so a read-through-write adapter cannot satisfy the interface.
 *  - **Executable items arrive inert.** Skill, tool and workflow writes must be
 *    `disabled` and `quarantined` and must require reauthorization. The contract
 *    encodes this with literal `false`/`true` types instead of trusting a caller
 *    to remember.
 *
 * `not_found`, `outage`, `unknown` and `unavailable` are four distinct outcomes.
 * An outage must never be reported as absence, and an unknown write must never be
 * reported as success.
 */
import { computeDigest, type DigestRef } from './trust-loop-primitives';
import { isCanonicalTenantIdV1 } from './canonical-tenant-authority';

export const CANONICAL_CONTENT_PORTS_SCHEMA_VERSION = 1 as const;
export const CANONICAL_CONTENT_RECEIPT_DOMAIN =
  'AGENTRIX_CANONICAL_CONTENT_WRITER_RECEIPT_V1' as const;
export const CANONICAL_CONTENT_CHECKPOINT_DOMAIN =
  'AGENTRIX_CANONICAL_CONTENT_CHECKPOINT_V1' as const;

export const CANONICAL_CONTENT_ENVIRONMENTS_V1 = [
  'local',
  'test',
  'staging',
  'production',
] as const;
export type CanonicalContentEnvironmentV1 =
  (typeof CANONICAL_CONTENT_ENVIRONMENTS_V1)[number];

/** Aligned with `PORTABILITY_MATERIALIZATION_TARGET_DOMAINS`. */
export const CANONICAL_CONTENT_DOMAINS_V1 = [
  'agent',
  'memory',
  'conversation',
  'knowledge',
  'skill_registry',
] as const;
export type CanonicalContentDomainV1 = (typeof CANONICAL_CONTENT_DOMAINS_V1)[number];

/**
 * The minimum W1R item types. Each is taken from the published Portability item
 * type set; nothing here is invented.
 */
export const CANONICAL_CONTENT_ITEM_TYPES_V1 = [
  'persona',
  'goal',
  'preference',
  'fact_memory',
  'relationship_memory',
  'conversation',
  'conversation_summary',
  'history',
  'knowledge',
  'attachment',
  'skill',
  'tool',
  'workflow',
] as const;
export type CanonicalContentItemTypeV1 = (typeof CANONICAL_CONTENT_ITEM_TYPES_V1)[number];

export const CANONICAL_CONTENT_ITEM_DOMAIN_V1: Record<
  CanonicalContentItemTypeV1,
  CanonicalContentDomainV1
> = {
  persona: 'agent',
  goal: 'agent',
  preference: 'agent',
  fact_memory: 'memory',
  relationship_memory: 'memory',
  conversation: 'conversation',
  conversation_summary: 'conversation',
  history: 'conversation',
  knowledge: 'knowledge',
  attachment: 'knowledge',
  skill: 'skill_registry',
  tool: 'skill_registry',
  workflow: 'skill_registry',
};

/**
 * Item types that are published in the contract but have **no canonical store
 * anywhere in the platform**, and are therefore permanently unservable.
 *
 * This exists because `unsupported_item_type` alone is ambiguous: a consumer
 * cannot tell "this owner has not shipped it yet" from "no owner will ever
 * serve it". The registry makes the second case machine-readable so a caller
 * can stop retrying and a reverse handoff can state it as a closed decision
 * rather than an open gap.
 *
 * `tool` is here because the Agentrix tool registry is code-defined: tools are
 * declared with decorators and resolved from the running process, so there is no
 * row to read, no version to compare and nothing to create in a disabled state.
 * The item type and its `create_disabled_tool` write kind stay published because
 * they belong to the Agent Portability item type set, which this contract must
 * mirror exactly; shrinking them here would desync the two sides.
 */
export const CANONICAL_CONTENT_STRUCTURAL_OMISSIONS_V1 = {
  tool: {
    domain: 'skill_registry',
    reasonCode: 'unsupported_item_type',
    /** Permanent by design, not a backlog item. */
    permanence: 'no_canonical_store',
    rationale:
      'The tool registry is code-defined (decorators resolved from the running process). ' +
      'There is no canonical table, so no owner can read, version or inertly create a tool.',
  },
} as const satisfies Readonly<
  Partial<
    Record<
      CanonicalContentItemTypeV1,
      {
        domain: CanonicalContentDomainV1;
        reasonCode: CanonicalContentReasonCodeV1;
        permanence: 'no_canonical_store';
        rationale: string;
      }
    >
  >
>;

export type CanonicalContentStructurallyOmittedItemTypeV1 =
  keyof typeof CANONICAL_CONTENT_STRUCTURAL_OMISSIONS_V1;

export function isCanonicalContentStructurallyOmittedV1(
  itemType: CanonicalContentItemTypeV1,
): itemType is CanonicalContentStructurallyOmittedItemTypeV1 {
  return Object.prototype.hasOwnProperty.call(CANONICAL_CONTENT_STRUCTURAL_OMISSIONS_V1, itemType);
}

/**
 * Write kinds that can never be accepted, derived from the omission registry so
 * the two can never disagree.
 */
export function isCanonicalContentStructurallyOmittedWriteKindV1(
  writeKind: CanonicalContentWriteKindV1,
): boolean {
  return isCanonicalContentStructurallyOmittedV1(
    CANONICAL_CONTENT_WRITE_KIND_ITEM_TYPE_V1[writeKind],
  );
}

/** Item types whose materialization creates something executable. */
export const CANONICAL_CONTENT_EXECUTABLE_ITEM_TYPES_V1 = ['skill', 'tool', 'workflow'] as const;
export type CanonicalContentExecutableItemTypeV1 =
  (typeof CANONICAL_CONTENT_EXECUTABLE_ITEM_TYPES_V1)[number];

export function isCanonicalContentExecutableItemTypeV1(
  itemType: CanonicalContentItemTypeV1,
): itemType is CanonicalContentExecutableItemTypeV1 {
  return (CANONICAL_CONTENT_EXECUTABLE_ITEM_TYPES_V1 as readonly string[]).includes(itemType);
}

export const CANONICAL_CONTENT_REASON_CODES_V1 = [
  'canonical_ok',
  'feature_disabled',
  'unsupported_schema_version',
  'unsupported_item_type',
  'object_authorization_denied',
  'wrong_tenant',
  'wrong_owner',
  'wrong_agent',
  'wrong_environment',
  'ownership_epoch_stale',
  'authorization_evidence_unavailable',
  'checkpoint_not_found',
  'checkpoint_stale',
  'cursor_invalid',
  'ordering_unstable',
  'freshness_expired',
  'digest_mismatch',
  'target_version_conflict',
  'target_not_found',
  'idempotency_conflict',
  'executable_activation_forbidden',
  'quarantine_required',
  'reauthorization_required',
  'evidence_classification_escalated',
  'source_outage',
  'writer_unavailable',
  'reader_unavailable',
  'write_outcome_unknown',
  'manual_resolution_required',
] as const;
export type CanonicalContentReasonCodeV1 = (typeof CANONICAL_CONTENT_REASON_CODES_V1)[number];

/**
 * Four distinct dispositions. `not_found` is an authoritative absence; `outage`
 * means the owner is reachable but cannot answer authoritatively; `unavailable`
 * means the port is not wired; `unknown` applies only to writes whose outcome
 * could not be established and must be reconciled, never retried blindly.
 */
export const CANONICAL_CONTENT_DISPOSITIONS_V1 = [
  'unavailable',
  'not_found',
  'outage',
  'unknown',
] as const;
export type CanonicalContentDispositionV1 = (typeof CANONICAL_CONTENT_DISPOSITIONS_V1)[number];

export const CANONICAL_CONTENT_DISPOSITION_REASONS_V1: Record<
  CanonicalContentDispositionV1,
  CanonicalContentReasonCodeV1
> = {
  unavailable: 'reader_unavailable',
  not_found: 'target_not_found',
  outage: 'source_outage',
  unknown: 'write_outcome_unknown',
};

export interface CanonicalContentFailureV1 {
  status: 'failed';
  disposition: CanonicalContentDispositionV1;
  reasonCode: CanonicalContentReasonCodeV1;
  /** Present only when the owner has a durable handle to reconcile against. */
  operationRef?: string;
}

export function canonicalContentFailureV1(
  disposition: CanonicalContentDispositionV1,
  reasonCode?: CanonicalContentReasonCodeV1,
  operationRef?: string,
): CanonicalContentFailureV1 {
  return {
    status: 'failed',
    disposition,
    reasonCode: reasonCode ?? CANONICAL_CONTENT_DISPOSITION_REASONS_V1[disposition],
    ...(operationRef === undefined ? {} : { operationRef }),
  };
}

/**
 * Object-level authorization. The caller presents the exact object it claims
 * authority over plus the owner's authorization evidence. A canonical owner must
 * verify this against its own source of truth and must never infer tenant or
 * owner from identifier formatting.
 */
export interface CanonicalContentObjectAuthorizationV1 {
  schemaVersion: typeof CANONICAL_CONTENT_PORTS_SCHEMA_VERSION;
  agentId: string;
  agentAccountId: string;
  soulCoreId: string;
  ownerPrincipalRef: string;
  /**
   * Canonical tenant id, as issued by the canonical Tenant Authority
   * (`shared/types/canonical-tenant-authority.ts`). It must satisfy
   * `isCanonicalTenantIdV1`, so a caller cannot pass a workspace id, an owner id
   * or `'global'` and have it accepted as a tenant.
   *
   * No canonical Agent/content table stores a tenant column today, so an owner
   * must resolve this through the Tenant Authority rather than trust the caller.
   */
  tenantRef: string;
  environment: CanonicalContentEnvironmentV1;
  expectedOwnershipEpoch: string;
  /** Immutable evidence ref issued by the authorization owner. */
  authorizationEvidenceRef: string;
}

export interface CanonicalContentOrderingV1 {
  /**
   * The reader must expose a total order. `sortKey` values are compared as
   * strings and must be unique within the checkpoint, otherwise pagination can
   * silently skip or duplicate an item.
   */
  field: 'sortKey';
  direction: 'asc';
}

export const CANONICAL_CONTENT_ORDERING_V1: CanonicalContentOrderingV1 = {
  field: 'sortKey',
  direction: 'asc',
};

/**
 * A checkpoint pins the read to a specific consistent point so a multi-page
 * export cannot mix pre- and post-mutation state.
 */
export interface CanonicalContentCheckpointV1 {
  domain: CanonicalContentDomainV1;
  checkpointId: string;
  /** Monotonic watermark owned by the domain. */
  watermark: string;
  /** When the owner observed this checkpoint. */
  observedAt: string;
  /** Beyond this the consumer must re-open a checkpoint. */
  expiresAt: string;
  checkpointDigest: DigestRef;
}

export interface CanonicalContentFreshnessV1 {
  observedAt: string;
  /** Owner-declared staleness bound for this answer. */
  maxStalenessSeconds: number;
  /** True only when the owner read its authoritative store, not a cache. */
  authoritative: boolean;
}

export interface CanonicalContentItemRefV1 {
  itemType: CanonicalContentItemTypeV1;
  /** Canonical identifier in the owning domain. */
  canonicalId: string;
  /** Unique, totally ordered pagination key. */
  sortKey: string;
  /**
   * The owner's version for this object. Today no canonical content entity has
   * an optimistic version column, so each owner must introduce one; the contract
   * requires it up front so consumers never guess.
   */
  targetVersion: string;
  updatedAt: string;
  contentDigest: DigestRef;
}

export interface CanonicalContentCheckpointReadRequestV1 {
  schemaVersion: typeof CANONICAL_CONTENT_PORTS_SCHEMA_VERSION;
  authorization: CanonicalContentObjectAuthorizationV1;
  domain: CanonicalContentDomainV1;
  itemTypes: readonly CanonicalContentItemTypeV1[];
  /** Omit to open a new checkpoint; supply to continue an existing one. */
  checkpointId?: string;
  cursor?: string;
  limit: number;
  requestDigest: DigestRef;
}

export interface CanonicalContentCheckpointPageV1 {
  schemaVersion: typeof CANONICAL_CONTENT_PORTS_SCHEMA_VERSION;
  domain: CanonicalContentDomainV1;
  checkpoint: CanonicalContentCheckpointV1;
  freshness: CanonicalContentFreshnessV1;
  ordering: CanonicalContentOrderingV1;
  items: readonly CanonicalContentItemRefV1[];
  /** Null when the checkpoint is fully drained. */
  nextCursor: string | null;
  /** Item types the owner refused or cannot serve, with a typed reason. */
  omissions: readonly {
    itemType: CanonicalContentItemTypeV1;
    reasonCode: CanonicalContentReasonCodeV1;
  }[];
  /** Binds the exact request to the exact answer. */
  pageDigest: DigestRef;
}

export type CanonicalContentCheckpointReadResultV1 =
  | { status: 'available'; page: CanonicalContentCheckpointPageV1 }
  | CanonicalContentFailureV1;

/**
 * Query-only canonical reader. `repairsState: false` is a literal, so an adapter
 * that lazily backfills or migrates during a read cannot implement this port.
 */
export interface CanonicalContentCheckpointReaderPortV1 {
  readonly portId: string;
  readonly domain: CanonicalContentDomainV1;
  readonly available: boolean;
  readonly repairsState: false;
  readonly supportedItemTypes: readonly CanonicalContentItemTypeV1[];
  read(
    request: CanonicalContentCheckpointReadRequestV1,
  ): Promise<CanonicalContentCheckpointReadResultV1>;
}

export const CANONICAL_CONTENT_WRITE_KINDS_V1 = [
  'upsert_persona',
  'upsert_goal',
  'upsert_preference',
  'append_fact_memory',
  'append_relationship_memory',
  'append_imported_conversation',
  'append_imported_summary',
  'append_imported_history',
  'create_knowledge_item',
  'attach_imported_object',
  'create_disabled_skill',
  'create_disabled_tool',
  'create_disabled_workflow',
] as const;
export type CanonicalContentWriteKindV1 = (typeof CANONICAL_CONTENT_WRITE_KINDS_V1)[number];

export const CANONICAL_CONTENT_WRITE_KIND_ITEM_TYPE_V1: Record<
  CanonicalContentWriteKindV1,
  CanonicalContentItemTypeV1
> = {
  upsert_persona: 'persona',
  upsert_goal: 'goal',
  upsert_preference: 'preference',
  append_fact_memory: 'fact_memory',
  append_relationship_memory: 'relationship_memory',
  append_imported_conversation: 'conversation',
  append_imported_summary: 'conversation_summary',
  append_imported_history: 'history',
  create_knowledge_item: 'knowledge',
  attach_imported_object: 'attachment',
  create_disabled_skill: 'skill',
  create_disabled_tool: 'tool',
  create_disabled_workflow: 'workflow',
};

/**
 * Imported content keeps its provenance classification. An owner must never
 * relabel imported material as natively earned.
 */
export const CANONICAL_CONTENT_CLASSIFICATIONS_V1 = [
  'imported',
  'legacy',
  'derived',
  'user_edited',
] as const;
export type CanonicalContentClassificationV1 =
  (typeof CANONICAL_CONTENT_CLASSIFICATIONS_V1)[number];

/**
 * Mandatory inert activation for executable items. Every field is a literal, so
 * an enabled skill/tool/workflow write is a compile error rather than a review
 * finding.
 */
export interface CanonicalContentInertActivationV1 {
  activation: 'disabled';
  quarantined: true;
  requiresReauthorization: true;
  invocable: false;
}

export const CANONICAL_CONTENT_INERT_ACTIVATION_V1: CanonicalContentInertActivationV1 = {
  activation: 'disabled',
  quarantined: true,
  requiresReauthorization: true,
  invocable: false,
};

/** Expected version for a create is explicitly absent, never a guessed zero. */
export type CanonicalContentExpectedTargetVersionV1 =
  | { mode: 'create_if_absent' }
  | { mode: 'expect_version'; targetVersion: string };

export interface CanonicalContentWriteCommandV1 {
  schemaVersion: typeof CANONICAL_CONTENT_PORTS_SCHEMA_VERSION;
  authorization: CanonicalContentObjectAuthorizationV1;
  writeKind: CanonicalContentWriteKindV1;
  domain: CanonicalContentDomainV1;
  /** Source item this command materializes, by reference only. */
  sourceItemRef: string;
  sourceItemDigest: DigestRef;
  classification: CanonicalContentClassificationV1;
  expectedTargetVersion: CanonicalContentExpectedTargetVersionV1;
  /** Required for `skill`, `tool` and `workflow`; forbidden otherwise. */
  inertActivation?: CanonicalContentInertActivationV1;
  idempotencyKey: string;
  requestDigest: DigestRef;
  /** Payload stays opaque here; each owner validates its own domain shape. */
  payloadRef: string;
}

export interface CanonicalContentWriteReceiptV1 {
  schemaVersion: typeof CANONICAL_CONTENT_PORTS_SCHEMA_VERSION;
  receiptDomain: typeof CANONICAL_CONTENT_RECEIPT_DOMAIN;
  receiptId: string;
  operationRef: string;
  domain: CanonicalContentDomainV1;
  writeKind: CanonicalContentWriteKindV1;
  agentId: string;
  agentAccountId: string;
  ownerPrincipalRef: string;
  tenantRef: string;
  environment: CanonicalContentEnvironmentV1;
  idempotencyKey: string;
  /** Must equal the command request digest that produced it. */
  requestDigest: string;
  canonicalId: string;
  /** Version after the write, so a consumer can chain a follow-up CAS. */
  appliedTargetVersion: string;
  classification: CanonicalContentClassificationV1;
  /** Present when the write created an executable object. */
  inertActivation?: CanonicalContentInertActivationV1;
  replayed: boolean;
  reasonCode: CanonicalContentReasonCodeV1;
  recordedAt: string;
  receiptDigest: DigestRef;
}

export type CanonicalContentWriteResultV1 =
  | { status: 'applied'; receipt: CanonicalContentWriteReceiptV1 }
  | CanonicalContentFailureV1;

export interface CanonicalContentWriterPortV1 {
  readonly portId: string;
  readonly domain: CanonicalContentDomainV1;
  readonly available: boolean;
  readonly supportedWriteKinds: readonly CanonicalContentWriteKindV1[];
  apply(command: CanonicalContentWriteCommandV1): Promise<CanonicalContentWriteResultV1>;
}

/**
 * The object a status query is asking about, in the owner's own addressing terms.
 *
 * This is required rather than optional because without it a status port cannot
 * be correct. An idempotency key alone only proves whether a *receipt* exists. If
 * the process died between the canonical mutation and the receipt insert, the
 * receipt is absent while the write is durably present, and a port with nothing
 * but the key must answer "absent" — which invites the caller to issue the write
 * a second time. Carrying the target lets the owner reconcile against its own
 * uniqueness constraint and report the write as unresolved instead.
 */
export interface CanonicalContentStatusTargetV1 {
  writeKind: CanonicalContentWriteKindV1;
  /** Same value the originating command carried, so the owner can re-address it. */
  sourceItemRef: string;
}

export interface CanonicalContentStatusQueryV1 {
  schemaVersion: typeof CANONICAL_CONTENT_PORTS_SCHEMA_VERSION;
  authorization: CanonicalContentObjectAuthorizationV1;
  domain: CanonicalContentDomainV1;
  operationRef: string;
  idempotencyKey: string;
  target: CanonicalContentStatusTargetV1;
  requestDigest: DigestRef;
}

export type CanonicalContentStatusResultV1
  =
  | { status: 'applied'; receipt: CanonicalContentWriteReceiptV1 }
  | { status: 'in_progress'; operationRef: string; reasonCode: 'write_outcome_unknown' }
  /**
   * The canonical mutation is durably present but no sealed receipt exists. This
   * is the crash-after-persist case and it is deliberately neither `applied` nor
   * `not_found`: there is no receipt to trust, and reporting absence would cause a
   * duplicate write. It requires reconciliation, never a blind retry.
   */
  | {
      status: 'orphaned';
      operationRef: string;
      canonicalId: string;
      appliedTargetVersion: string;
      reasonCode: 'manual_resolution_required';
    }
  | CanonicalContentFailureV1;

/**
 * Durable status lookup for a previously issued write. Query-only: it exists so a
 * consumer can resolve an unknown outcome without re-issuing the mutation.
 */
export interface CanonicalContentStatusPortV1 {
  readonly portId: string;
  readonly domain: CanonicalContentDomainV1;
  readonly available: boolean;
  readonly repairsState: false;
  query(request: CanonicalContentStatusQueryV1): Promise<CanonicalContentStatusResultV1>;
}

/**
 * What a consumer is allowed to do next after a non-success outcome.
 *
 * Published as a function rather than left to each caller because the failure
 * modes are easy to conflate in exactly the expensive direction: retrying a
 * terminal refusal loops forever, and abandoning an unknown outcome loses a write
 * that may have committed.
 */
export const CANONICAL_CONTENT_WRITE_FOLLOW_UPS_V1 = ['retry', 'reconcile', 'abandon'] as const;
export type CanonicalContentWriteFollowUpV1 =
  (typeof CANONICAL_CONTENT_WRITE_FOLLOW_UPS_V1)[number];

export function canonicalContentWriteFollowUpV1(
  outcome: CanonicalContentFailureV1 | { status: 'orphaned' },
): CanonicalContentWriteFollowUpV1 {
  if (outcome.status === 'orphaned') return 'reconcile';
  switch (outcome.disposition) {
    case 'outage':
      // Reachable but not answering authoritatively; the same call can succeed later.
      return 'retry';
    case 'unknown':
      return 'reconcile';
    case 'not_found':
    case 'unavailable':
      // Includes every terminal refusal: a denied payload, a version conflict, an
      // idempotency conflict and an unwired port. None of these repair by retrying.
      return 'abandon';
    default:
      return 'abandon';
  }
}

/**
 * Cross-checks that a stored receipt actually belongs to the caller asking for it.
 *
 * A status port looks receipts up by idempotency key. Keys are supplied by
 * callers, so without this a caller could learn another tenant's receipt content
 * by guessing or replaying a key. Returns the offending reason code, or undefined
 * when every binding matches.
 */
export function canonicalContentReceiptBindingMismatchV1(
  receipt: CanonicalContentWriteReceiptV1,
  authorization: CanonicalContentObjectAuthorizationV1,
  target?: CanonicalContentStatusTargetV1,
): CanonicalContentReasonCodeV1 | undefined {
  if (receipt.tenantRef !== authorization.tenantRef) return 'wrong_tenant';
  if (receipt.ownerPrincipalRef !== authorization.ownerPrincipalRef) return 'wrong_owner';
  if (receipt.agentId !== authorization.agentId) return 'wrong_agent';
  if (receipt.agentAccountId !== authorization.agentAccountId) return 'wrong_agent';
  if (receipt.environment !== authorization.environment) return 'wrong_environment';
  if (target && receipt.writeKind !== target.writeKind) return 'idempotency_conflict';
  return undefined;
}

export function computeCanonicalContentDigestV1(domain: string, value: unknown): DigestRef {
  return computeDigest({ domain, payload: value });
}

export function computeCanonicalContentRequestDigestV1(value: unknown): DigestRef {
  return computeCanonicalContentDigestV1(CANONICAL_CONTENT_CHECKPOINT_DOMAIN, value);
}

/** Seals a receipt the way `validateCanonicalContentWriteReceiptV1` recomputes it. */
export function sealCanonicalContentWriteReceiptV1(
  unsigned: Omit<CanonicalContentWriteReceiptV1, 'receiptDigest'>,
): CanonicalContentWriteReceiptV1 {
  return { ...unsigned, receiptDigest: computeDigest(unsigned) };
}

export interface CanonicalContentValidationResultV1 {
  valid: boolean;
  errors: string[];
}

const DECIMAL = /^(0|[1-9][0-9]*)$/;
const HEX64 = /^[0-9a-f]{64}$/;
const IDEMPOTENCY = /^[A-Za-z0-9][A-Za-z0-9:._/-]{7,159}$/;
const OPAQUE = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,191}$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validDigest(value: unknown): value is DigestRef {
  return (
    isObject(value) &&
    value.algorithm === 'sha-256' &&
    typeof value.canonicalization === 'string' &&
    typeof value.value === 'string' &&
    HEX64.test(value.value)
  );
}

export function validateCanonicalContentObjectAuthorizationV1(
  input: unknown,
): CanonicalContentValidationResultV1 {
  const errors: string[] = [];
  if (!isObject(input)) return { valid: false, errors: ['authorization must be an object'] };
  if (input.schemaVersion !== CANONICAL_CONTENT_PORTS_SCHEMA_VERSION) {
    errors.push('authorization.schemaVersion is unsupported');
  }
  for (const key of [
    'agentId',
    'agentAccountId',
    'soulCoreId',
    'ownerPrincipalRef',
    'authorizationEvidenceRef',
  ] as const) {
    if (typeof input[key] !== 'string' || !OPAQUE.test(input[key] as string)) {
      errors.push(`authorization.${key} is invalid`);
    }
  }
  if (!isCanonicalTenantIdV1(input.tenantRef)) {
    errors.push('authorization.tenantRef is not a canonical Tenant Authority id');
  }
  if (
    !(CANONICAL_CONTENT_ENVIRONMENTS_V1 as readonly unknown[]).includes(input.environment)
  ) {
    errors.push('authorization.environment is unsupported');
  }
  if (
    typeof input.expectedOwnershipEpoch !== 'string' ||
    !DECIMAL.test(input.expectedOwnershipEpoch)
  ) {
    errors.push('authorization.expectedOwnershipEpoch must be a decimal string');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Structural validation for a write command. The executable rule is enforced
 * here as well as in the type system, because a JavaScript caller can bypass
 * types.
 */
export function validateCanonicalContentWriteCommandV1(
  input: unknown,
): CanonicalContentValidationResultV1 {
  const errors: string[] = [];
  if (!isObject(input)) return { valid: false, errors: ['command must be an object'] };
  if (input.schemaVersion !== CANONICAL_CONTENT_PORTS_SCHEMA_VERSION) {
    errors.push('command.schemaVersion is unsupported');
  }

  const authorization = validateCanonicalContentObjectAuthorizationV1(input.authorization);
  errors.push(...authorization.errors);

  if (!(CANONICAL_CONTENT_WRITE_KINDS_V1 as readonly unknown[]).includes(input.writeKind)) {
    errors.push('command.writeKind is unsupported');
    return { valid: false, errors };
  }
  const writeKind = input.writeKind as CanonicalContentWriteKindV1;
  const itemType = CANONICAL_CONTENT_WRITE_KIND_ITEM_TYPE_V1[writeKind];

  if (input.domain !== CANONICAL_CONTENT_ITEM_DOMAIN_V1[itemType]) {
    errors.push('command.domain does not own this writeKind');
  }
  if (
    !(CANONICAL_CONTENT_CLASSIFICATIONS_V1 as readonly unknown[]).includes(input.classification)
  ) {
    errors.push('command.classification is unsupported');
  }
  for (const key of ['sourceItemRef', 'payloadRef'] as const) {
    if (typeof input[key] !== 'string' || !OPAQUE.test(input[key] as string)) {
      errors.push(`command.${key} is invalid`);
    }
  }
  if (typeof input.idempotencyKey !== 'string' || !IDEMPOTENCY.test(input.idempotencyKey)) {
    errors.push('command.idempotencyKey is malformed');
  }
  if (!validDigest(input.requestDigest)) errors.push('command.requestDigest is malformed');
  if (!validDigest(input.sourceItemDigest)) errors.push('command.sourceItemDigest is malformed');

  const expected = input.expectedTargetVersion;
  if (!isObject(expected)) {
    errors.push('command.expectedTargetVersion is required');
  } else if (expected.mode === 'expect_version') {
    if (typeof expected.targetVersion !== 'string' || !OPAQUE.test(expected.targetVersion)) {
      errors.push('command.expectedTargetVersion.targetVersion is invalid');
    }
  } else if (expected.mode !== 'create_if_absent') {
    errors.push('command.expectedTargetVersion.mode is unsupported');
  }

  const executable = isCanonicalContentExecutableItemTypeV1(itemType);
  if (executable) {
    const inert = input.inertActivation;
    if (!isObject(inert)) {
      errors.push('an executable item requires inertActivation');
    } else if (
      inert.activation !== 'disabled' ||
      inert.quarantined !== true ||
      inert.requiresReauthorization !== true ||
      inert.invocable !== false
    ) {
      errors.push('an executable item must be disabled, quarantined and non-invocable');
    }
  } else if (input.inertActivation !== undefined) {
    errors.push('inertActivation is only valid for skill, tool and workflow writes');
  }

  return { valid: errors.length === 0, errors };
}

export function validateCanonicalContentWriteReceiptV1(
  input: unknown,
): CanonicalContentValidationResultV1 {
  const errors: string[] = [];
  if (!isObject(input)) return { valid: false, errors: ['receipt must be an object'] };
  if (input.schemaVersion !== CANONICAL_CONTENT_PORTS_SCHEMA_VERSION) {
    errors.push('receipt.schemaVersion is unsupported');
  }
  if (input.receiptDomain !== CANONICAL_CONTENT_RECEIPT_DOMAIN) {
    errors.push('receipt.receiptDomain is unsupported');
  }
  for (const key of [
    'receiptId',
    'operationRef',
    'agentId',
    'agentAccountId',
    'ownerPrincipalRef',
    'tenantRef',
    'canonicalId',
    'appliedTargetVersion',
  ] as const) {
    if (typeof input[key] !== 'string' || !OPAQUE.test(input[key] as string)) {
      errors.push(`receipt.${key} is invalid`);
    }
  }
  if (typeof input.idempotencyKey !== 'string' || !IDEMPOTENCY.test(input.idempotencyKey)) {
    errors.push('receipt.idempotencyKey is malformed');
  }
  if (typeof input.requestDigest !== 'string' || !HEX64.test(input.requestDigest)) {
    errors.push('receipt.requestDigest is malformed');
  }
  if (!(CANONICAL_CONTENT_WRITE_KINDS_V1 as readonly unknown[]).includes(input.writeKind)) {
    errors.push('receipt.writeKind is unsupported');
  }
  if (!(CANONICAL_CONTENT_DOMAINS_V1 as readonly unknown[]).includes(input.domain)) {
    errors.push('receipt.domain is unsupported');
  }
  if (
    !(CANONICAL_CONTENT_ENVIRONMENTS_V1 as readonly unknown[]).includes(input.environment)
  ) {
    errors.push('receipt.environment is unsupported');
  }
  if (
    !(CANONICAL_CONTENT_CLASSIFICATIONS_V1 as readonly unknown[]).includes(input.classification)
  ) {
    errors.push('receipt.classification is unsupported');
  }
  if (
    !(CANONICAL_CONTENT_REASON_CODES_V1 as readonly unknown[]).includes(input.reasonCode)
  ) {
    errors.push('receipt.reasonCode is unsupported');
  }
  if (typeof input.replayed !== 'boolean') errors.push('receipt.replayed must be a boolean');
  if (typeof input.recordedAt !== 'string' || !Number.isFinite(Date.parse(input.recordedAt))) {
    errors.push('receipt.recordedAt must be an ISO timestamp');
  }
  if (!validDigest(input.receiptDigest)) errors.push('receipt.receiptDigest is malformed');

  if (
    (CANONICAL_CONTENT_WRITE_KINDS_V1 as readonly unknown[]).includes(input.writeKind)
  ) {
    const itemType =
      CANONICAL_CONTENT_WRITE_KIND_ITEM_TYPE_V1[input.writeKind as CanonicalContentWriteKindV1];
    if (isCanonicalContentExecutableItemTypeV1(itemType)) {
      const inert = input.inertActivation;
      if (
        !isObject(inert) ||
        inert.activation !== 'disabled' ||
        inert.quarantined !== true ||
        inert.requiresReauthorization !== true ||
        inert.invocable !== false
      ) {
        errors.push('an executable receipt must report a disabled, quarantined object');
      }
    }
  }

  if (errors.length === 0) {
    const { receiptDigest, ...unsigned } = input;
    if (computeDigest(unsigned).value !== (receiptDigest as DigestRef).value) {
      errors.push('receipt.receiptDigest does not match canonical receipt content');
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Structural validation for a status query. Enforced separately from the type
 * system because a JavaScript caller, a queue payload or a rehydrated JSON record
 * can all present a query that never passed through a TypeScript compiler.
 */
export function validateCanonicalContentStatusQueryV1(
  input: unknown,
): CanonicalContentValidationResultV1 {
  const errors: string[] = [];
  if (!isObject(input)) return { valid: false, errors: ['query must be an object'] };
  if (input.schemaVersion !== CANONICAL_CONTENT_PORTS_SCHEMA_VERSION) {
    errors.push('query.schemaVersion is unsupported');
  }

  errors.push(...validateCanonicalContentObjectAuthorizationV1(input.authorization).errors);

  if (!(CANONICAL_CONTENT_DOMAINS_V1 as readonly unknown[]).includes(input.domain)) {
    errors.push('query.domain is unsupported');
  }
  if (typeof input.operationRef !== 'string' || !OPAQUE.test(input.operationRef)) {
    errors.push('query.operationRef is invalid');
  }
  if (typeof input.idempotencyKey !== 'string' || !IDEMPOTENCY.test(input.idempotencyKey)) {
    errors.push('query.idempotencyKey is malformed');
  }
  if (!validDigest(input.requestDigest)) errors.push('query.requestDigest is malformed');

  const target = input.target;
  if (!isObject(target)) {
    // Without a target the port cannot tell a write that never happened from one
    // whose receipt was lost, so an absent target is a hard error.
    errors.push('query.target is required to reconcile an unresolved write');
  } else {
    if (!(CANONICAL_CONTENT_WRITE_KINDS_V1 as readonly unknown[]).includes(target.writeKind)) {
      errors.push('query.target.writeKind is unsupported');
    } else if (
      input.domain !==
      CANONICAL_CONTENT_ITEM_DOMAIN_V1[
        CANONICAL_CONTENT_WRITE_KIND_ITEM_TYPE_V1[target.writeKind as CanonicalContentWriteKindV1]
      ]
    ) {
      errors.push('query.domain does not own query.target.writeKind');
    }
    if (typeof target.sourceItemRef !== 'string' || !OPAQUE.test(target.sourceItemRef)) {
      errors.push('query.target.sourceItemRef is invalid');
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Verifies a page is internally consistent and totally ordered. */
export function validateCanonicalContentCheckpointPageV1(
  page: unknown,
  request?: CanonicalContentCheckpointReadRequestV1,
): CanonicalContentValidationResultV1 {
  const errors: string[] = [];
  if (!isObject(page)) return { valid: false, errors: ['page must be an object'] };
  if (page.schemaVersion !== CANONICAL_CONTENT_PORTS_SCHEMA_VERSION) {
    errors.push('page.schemaVersion is unsupported');
  }
  if (!(CANONICAL_CONTENT_DOMAINS_V1 as readonly unknown[]).includes(page.domain)) {
    errors.push('page.domain is unsupported');
  }
  if (!isObject(page.ordering) || page.ordering.field !== 'sortKey' || page.ordering.direction !== 'asc') {
    errors.push('page.ordering must be sortKey ascending');
  }
  if (!Array.isArray(page.items)) {
    errors.push('page.items must be an array');
    return { valid: false, errors };
  }
  const items = page.items as CanonicalContentItemRefV1[];

  const sortKeys = items.map((item) => item?.sortKey);
  if (sortKeys.some((key) => typeof key !== 'string' || key.length === 0)) {
    errors.push('every item requires a sortKey');
  } else {
    if (new Set(sortKeys).size !== sortKeys.length) {
      errors.push('sortKey values must be unique to keep pagination total');
    }
    const sorted = [...sortKeys].sort();
    if (sorted.some((key, index) => key !== sortKeys[index])) {
      errors.push('items must be returned in ascending sortKey order');
    }
  }
  for (const item of items) {
    if (!isObject(item)) {
      errors.push('page.items contains a non-object entry');
      continue;
    }
    if (!(CANONICAL_CONTENT_ITEM_TYPES_V1 as readonly unknown[]).includes(item.itemType)) {
      errors.push('page.items contains an unsupported itemType');
    }
    if (typeof item.targetVersion !== 'string' || !OPAQUE.test(item.targetVersion)) {
      errors.push('page.items requires a targetVersion for every item');
    }
    if (!validDigest(item.contentDigest)) errors.push('page.items requires a contentDigest');
    if (
      request &&
      (CANONICAL_CONTENT_ITEM_TYPES_V1 as readonly unknown[]).includes(item.itemType) &&
      !request.itemTypes.includes(item.itemType as CanonicalContentItemTypeV1)
    ) {
      errors.push('page.items returned an itemType the request did not ask for');
    }
    if (
      request &&
      (CANONICAL_CONTENT_ITEM_TYPES_V1 as readonly unknown[]).includes(item.itemType) &&
      CANONICAL_CONTENT_ITEM_DOMAIN_V1[item.itemType as CanonicalContentItemTypeV1] !==
        request.domain
    ) {
      errors.push('page.items returned an itemType outside the requested domain');
    }
  }

  if (request && items.length > request.limit) {
    errors.push('page.items exceeds the requested limit');
  }
  if (!isObject(page.checkpoint) || !validDigest(page.checkpoint.checkpointDigest)) {
    errors.push('page.checkpoint requires a digest');
  }
  if (!isObject(page.freshness)) {
    errors.push('page.freshness is required');
  } else {
    if (typeof page.freshness.authoritative !== 'boolean') {
      errors.push('page.freshness.authoritative must be a boolean');
    }
    if (
      typeof page.freshness.maxStalenessSeconds !== 'number' ||
      !Number.isFinite(page.freshness.maxStalenessSeconds) ||
      page.freshness.maxStalenessSeconds < 0
    ) {
      errors.push('page.freshness.maxStalenessSeconds must be a non-negative number');
    }
  }
  if (!Array.isArray(page.omissions)) errors.push('page.omissions must be an array');
  if (!validDigest(page.pageDigest)) errors.push('page.pageDigest is malformed');
  if (page.nextCursor !== null && typeof page.nextCursor !== 'string') {
    errors.push('page.nextCursor must be a string or null');
  }
  return { valid: errors.length === 0, errors };
}
