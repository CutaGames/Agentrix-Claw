/**
 * Canonical Tenant Authority V1 — query-only tenant resolution.
 *
 * Owner: the Workspace domain (`backend/src/modules/workspace`). `workspaces` +
 * `workspace_members` is the only real multi-tenant boundary in this repository:
 * it carries owner, personal/team/organization/enterprise kind, plan, status and
 * accepted membership. Trust, Authority, Portability and Continuity are
 * consumers, never producers, of tenant identity.
 *
 * Hard rules encoded here:
 *   - resolution is QUERY-ONLY; no write, no read-repair, no lazy assignment;
 *   - a tenant is NEVER inferred from an owner id, agent id or any string shape;
 *   - there is NO `global` fallback: absence is `not_found`, not a default bucket;
 *   - exactly four outcomes: found / not_found / ambiguous / unavailable;
 *   - every `found` result is bound to environment, authoritative principal and
 *     object facts, and a version/epoch/digest triple.
 */
import { computeDigest, type DigestRef } from './trust-loop-primitives';

export const CANONICAL_TENANT_AUTHORITY_SCHEMA_VERSION = 1 as const;
export const CANONICAL_TENANT_AUTHORITY_DOMAIN =
  'AGENTRIX_CANONICAL_TENANT_AUTHORITY_V1' as const;

/**
 * A `global` tenant is explicitly not representable. Authority's historical
 * `tenant_key DEFAULT 'global'` is a storage default, never a resolved tenant.
 */
export const CANONICAL_TENANT_FORBIDDEN_IDS_V1 = [
  'global',
  'default',
  'all',
  '',
] as const;

/**
 * Canonical deployment environments for tenancy.
 *
 * Deliberately identical to Trust's evidence environments so the first consumer
 * needs no translation. This axis is NOT the same as migration 1887's Partner
 * `sandbox | staging | production` deployment fence; equating them implicitly is
 * forbidden. Any Partner mapping must be an explicit, recorded decision.
 */
export const CANONICAL_TENANT_ENVIRONMENTS_V1 = [
  'local',
  'test',
  'staging',
  'production',
] as const;
export type CanonicalTenantEnvironmentV1 =
  (typeof CANONICAL_TENANT_ENVIRONMENTS_V1)[number];

/** Mirrors `workspaces.type`. The tenant kind is a fact, not a privilege. */
export const CANONICAL_TENANT_KINDS_V1 = [
  'personal',
  'team',
  'organization',
  'enterprise',
] as const;
export type CanonicalTenantKindV1 = (typeof CANONICAL_TENANT_KINDS_V1)[number];

/** Mirrors `workspace_members.role`. Only accepted members are authoritative. */
export const CANONICAL_TENANT_PRINCIPAL_ROLES_V1 = [
  'owner',
  'admin',
  'member',
  'viewer',
  'guest',
] as const;
export type CanonicalTenantPrincipalRoleV1 =
  (typeof CANONICAL_TENANT_PRINCIPAL_ROLES_V1)[number];

export const CANONICAL_TENANT_ASSIGNMENT_STATES_V1 = [
  'active',
  'superseded',
  'revoked',
] as const;
export type CanonicalTenantAssignmentStateV1 =
  (typeof CANONICAL_TENANT_ASSIGNMENT_STATES_V1)[number];

export const CANONICAL_TENANT_RESOLUTION_STATUSES_V1 = [
  'found',
  'not_found',
  'ambiguous',
  'unavailable',
] as const;
export type CanonicalTenantResolutionStatusV1 =
  (typeof CANONICAL_TENANT_RESOLUTION_STATUSES_V1)[number];

/** Exact, closed reason codes. Each belongs to exactly one status. */
export const CANONICAL_TENANT_NOT_FOUND_REASONS_V1 = [
  'assignment_absent',
  'assignment_not_active',
  'assignment_epoch_stale',
  'agent_unknown',
  'agent_id_mismatch',
  'owner_mismatch',
  'principal_not_in_tenant',
  'tenant_inactive',
] as const;
export type CanonicalTenantNotFoundReasonV1 =
  (typeof CANONICAL_TENANT_NOT_FOUND_REASONS_V1)[number];

export const CANONICAL_TENANT_AMBIGUOUS_REASONS_V1 = [
  'multiple_active_assignments',
  'conflicting_tenant_evidence',
] as const;
export type CanonicalTenantAmbiguousReasonV1 =
  (typeof CANONICAL_TENANT_AMBIGUOUS_REASONS_V1)[number];

export const CANONICAL_TENANT_UNAVAILABLE_REASONS_V1 = [
  'authority_disabled',
  'source_unreadable',
  'assignment_source_unreadable',
  'tenant_source_unreadable',
] as const;
export type CanonicalTenantUnavailableReasonV1 =
  (typeof CANONICAL_TENANT_UNAVAILABLE_REASONS_V1)[number];

/** Canonical evidence the authority actually read to produce a result. */
export interface CanonicalTenantEvidenceRefV1 {
  kind:
    | 'workspace'
    | 'workspace_member'
    | 'agent_account'
    | 'tenant_assignment'
    | 'tenant_assignment_history';
  id: string;
  version: string;
}

/**
 * A resolution query. Every field is an assertion the caller must already hold;
 * the authority verifies them and never repairs or infers a missing one.
 */
export interface CanonicalTenantResolutionQueryV1 {
  schemaVersion: typeof CANONICAL_TENANT_AUTHORITY_SCHEMA_VERSION;
  /** Public Agent identifier, e.g. `agent_accounts.agent_unique_id`. */
  agentId: string;
  /** Canonical `agent_accounts.id`. */
  agentAccountId: string;
  /** Canonical `users.id` the caller believes owns the Agent. */
  ownerUserId: string;
  environment: CanonicalTenantEnvironmentV1;
  /**
   * Optional monotonic fence. When present it must equal the stored assignment
   * epoch, otherwise the result is `not_found` / `assignment_epoch_stale`.
   */
  expectedAssignmentEpoch?: string;
}

/** The authoritative principal fact behind a resolved tenant. */
export interface CanonicalTenantPrincipalFactsV1 {
  ownerUserId: string;
  /** How the owner is authoritative inside the tenant. */
  role: CanonicalTenantPrincipalRoleV1;
  /** True only for `workspaces.owner_id`. */
  isTenantOwner: boolean;
  /** Membership row backing a non-owner role; absent for the tenant owner. */
  membershipRef?: string;
}

/** The authoritative object fact the tenant was resolved for. */
export interface CanonicalTenantObjectFactsV1 {
  agentId: string;
  agentAccountId: string;
  agentStatus: string;
  /** Monotonic owner ABA fence from `agent_accounts.ownership_epoch`. */
  ownershipEpoch: string;
}

/** A resolved tenant assignment, fully bound and digest-sealed. */
export interface CanonicalTenantAssignmentV1 {
  schemaVersion: typeof CANONICAL_TENANT_AUTHORITY_SCHEMA_VERSION;
  authorityDomain: typeof CANONICAL_TENANT_AUTHORITY_DOMAIN;
  /** Opaque, stable tenant identifier. Derived from the workspace UUID. */
  tenantId: string;
  tenantKind: CanonicalTenantKindV1;
  tenantStatus: string;
  workspaceId: string;
  environment: CanonicalTenantEnvironmentV1;
  assignmentRef: string;
  assignmentState: CanonicalTenantAssignmentStateV1;
  /** Monotonic per-assignment fence. */
  assignmentEpoch: string;
  /** Optimistic row version. */
  assignmentVersion: number;
  principal: CanonicalTenantPrincipalFactsV1;
  object: CanonicalTenantObjectFactsV1;
  evidenceRefs: CanonicalTenantEvidenceRefV1[];
  observedAt: string;
  /** Digest over every field above except itself. */
  evidenceDigest: DigestRef;
}

export type CanonicalTenantResolutionResultV1 =
  | {
      status: 'found';
      assignment: CanonicalTenantAssignmentV1;
    }
  | {
      status: 'not_found';
      reasonCode: CanonicalTenantNotFoundReasonV1;
      /** Present only when the authority actually read a stored assignment. */
      observedAssignmentEpoch?: string;
    }
  | {
      status: 'ambiguous';
      reasonCode: CanonicalTenantAmbiguousReasonV1;
      /** Exact conflicting assignment refs; never auto-resolved to a winner. */
      conflictingAssignmentRefs: string[];
    }
  | {
      status: 'unavailable';
      reasonCode: CanonicalTenantUnavailableReasonV1;
    };

/** The versioned, query-only port. Implementations must not write. */
export interface CanonicalTenantResolutionPortV1 {
  resolve(
    query: CanonicalTenantResolutionQueryV1,
  ): Promise<CanonicalTenantResolutionResultV1>;
}

/** Stable tenant id derivation. Slug/name are mutable and must never be used. */
export const CANONICAL_TENANT_ID_PREFIX_V1 = 'wst_' as const;

export function canonicalTenantIdForWorkspace(workspaceId: string): string {
  const trimmed = String(workspaceId ?? '').trim();
  if (!trimmed) throw new Error('workspaceId is required to derive a tenantId');
  return `${CANONICAL_TENANT_ID_PREFIX_V1}${trimmed}`;
}

export function isCanonicalTenantIdV1(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (!value.startsWith(CANONICAL_TENANT_ID_PREFIX_V1)) return false;
  const suffix = value.slice(CANONICAL_TENANT_ID_PREFIX_V1.length);
  if (!suffix) return false;
  return !(CANONICAL_TENANT_FORBIDDEN_IDS_V1 as readonly string[]).includes(
    suffix.toLowerCase(),
  );
}

export interface CanonicalTenantValidationResultV1 {
  valid: boolean;
  errors: string[];
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECIMAL_PATTERN = /^(0|[1-9][0-9]*)$/;

/** Closed validation: unknown fields are rejected so callers cannot smuggle hints. */
export function validateCanonicalTenantResolutionQueryV1(
  value: unknown,
): CanonicalTenantValidationResultV1 {
  const errors: string[] = [];
  if (typeof value !== 'object' || value === null) {
    return { valid: false, errors: ['query must be an object'] };
  }
  const query = value as Record<string, unknown>;
  const allowed = new Set([
    'schemaVersion',
    'agentId',
    'agentAccountId',
    'ownerUserId',
    'environment',
    'expectedAssignmentEpoch',
  ]);
  for (const key of Object.keys(query)) {
    if (!allowed.has(key)) errors.push('query contains unknown fields');
  }
  if (query.schemaVersion !== CANONICAL_TENANT_AUTHORITY_SCHEMA_VERSION) {
    errors.push('schemaVersion must be 1');
  }
  if (typeof query.agentId !== 'string' || !query.agentId.trim()) {
    errors.push('agentId is required');
  }
  if (typeof query.agentAccountId !== 'string' || !UUID_PATTERN.test(query.agentAccountId)) {
    errors.push('agentAccountId must be a uuid');
  }
  if (typeof query.ownerUserId !== 'string' || !UUID_PATTERN.test(query.ownerUserId)) {
    errors.push('ownerUserId must be a uuid');
  }
  if (
    typeof query.environment !== 'string' ||
    !(CANONICAL_TENANT_ENVIRONMENTS_V1 as readonly string[]).includes(query.environment)
  ) {
    errors.push('environment must be a canonical tenant environment');
  }
  if (
    query.expectedAssignmentEpoch !== undefined &&
    (typeof query.expectedAssignmentEpoch !== 'string' ||
      !DECIMAL_PATTERN.test(query.expectedAssignmentEpoch))
  ) {
    errors.push('expectedAssignmentEpoch must be a decimal string');
  }
  // A tenant may never be supplied by the caller: that is the whole point.
  if ('tenantId' in query || 'workspaceId' in query) {
    errors.push('caller may not supply tenant identity');
  }
  return { valid: errors.length === 0, errors: Array.from(new Set(errors)) };
}

/** Recomputes the assignment digest over every field except the digest itself. */
export function computeCanonicalTenantAssignmentDigestV1(
  assignment: Omit<CanonicalTenantAssignmentV1, 'evidenceDigest'>,
): DigestRef {
  return computeDigest(assignment);
}

export function validateCanonicalTenantAssignmentV1(
  value: unknown,
): CanonicalTenantValidationResultV1 {
  const errors: string[] = [];
  if (typeof value !== 'object' || value === null) {
    return { valid: false, errors: ['assignment must be an object'] };
  }
  const assignment = value as Record<string, unknown>;
  if (assignment.schemaVersion !== CANONICAL_TENANT_AUTHORITY_SCHEMA_VERSION) {
    errors.push('schemaVersion must be 1');
  }
  if (assignment.authorityDomain !== CANONICAL_TENANT_AUTHORITY_DOMAIN) {
    errors.push('authorityDomain must be the canonical tenant authority domain');
  }
  if (!isCanonicalTenantIdV1(assignment.tenantId)) {
    errors.push('tenantId must be a canonical, non-global tenant id');
  }
  if (
    typeof assignment.workspaceId !== 'string' ||
    !UUID_PATTERN.test(assignment.workspaceId)
  ) {
    errors.push('workspaceId must be a uuid');
  }
  if (
    typeof assignment.tenantId === 'string' &&
    typeof assignment.workspaceId === 'string' &&
    assignment.tenantId !== canonicalTenantIdForWorkspace(assignment.workspaceId)
  ) {
    errors.push('tenantId must be derived from workspaceId');
  }
  if (
    typeof assignment.tenantKind !== 'string' ||
    !(CANONICAL_TENANT_KINDS_V1 as readonly string[]).includes(assignment.tenantKind)
  ) {
    errors.push('tenantKind must be a canonical tenant kind');
  }
  if (
    typeof assignment.environment !== 'string' ||
    !(CANONICAL_TENANT_ENVIRONMENTS_V1 as readonly string[]).includes(
      assignment.environment,
    )
  ) {
    errors.push('environment must be a canonical tenant environment');
  }
  if (assignment.assignmentState !== 'active') {
    errors.push('a returned assignment must be active');
  }
  if (
    typeof assignment.assignmentEpoch !== 'string' ||
    !DECIMAL_PATTERN.test(assignment.assignmentEpoch)
  ) {
    errors.push('assignmentEpoch must be a decimal string');
  }
  if (
    typeof assignment.assignmentVersion !== 'number' ||
    !Number.isInteger(assignment.assignmentVersion) ||
    assignment.assignmentVersion < 0
  ) {
    errors.push('assignmentVersion must be a non-negative integer');
  }
  const principal = assignment.principal as Record<string, unknown> | undefined;
  if (!principal || typeof principal !== 'object') {
    errors.push('principal facts are required');
  } else {
    if (typeof principal.ownerUserId !== 'string' || !UUID_PATTERN.test(principal.ownerUserId)) {
      errors.push('principal.ownerUserId must be a uuid');
    }
    if (
      typeof principal.role !== 'string' ||
      !(CANONICAL_TENANT_PRINCIPAL_ROLES_V1 as readonly string[]).includes(principal.role)
    ) {
      errors.push('principal.role must be a canonical role');
    }
    if (typeof principal.isTenantOwner !== 'boolean') {
      errors.push('principal.isTenantOwner must be a boolean');
    }
    if (principal.isTenantOwner === false && typeof principal.membershipRef !== 'string') {
      errors.push('a non-owner principal requires a membershipRef');
    }
  }
  const object = assignment.object as Record<string, unknown> | undefined;
  if (!object || typeof object !== 'object') {
    errors.push('object facts are required');
  } else {
    if (typeof object.agentId !== 'string' || !object.agentId.trim()) {
      errors.push('object.agentId is required');
    }
    if (
      typeof object.agentAccountId !== 'string' ||
      !UUID_PATTERN.test(object.agentAccountId)
    ) {
      errors.push('object.agentAccountId must be a uuid');
    }
    if (
      typeof object.ownershipEpoch !== 'string' ||
      !DECIMAL_PATTERN.test(object.ownershipEpoch)
    ) {
      errors.push('object.ownershipEpoch must be a decimal string');
    }
  }
  if (!Array.isArray(assignment.evidenceRefs) || assignment.evidenceRefs.length === 0) {
    errors.push('evidenceRefs must record what was actually read');
  }
  const digest = assignment.evidenceDigest as Record<string, unknown> | undefined;
  if (!digest || typeof digest.value !== 'string' || !/^[0-9a-f]{64}$/.test(String(digest.value))) {
    errors.push('evidenceDigest must be a sha-256 digest');
  } else {
    const { evidenceDigest: _ignored, ...rest } = assignment as Record<string, unknown> & {
      evidenceDigest: unknown;
    };
    const recomputed = computeDigest(rest);
    if (recomputed.value !== digest.value) {
      errors.push('evidenceDigest does not match the assignment facts');
    }
  }
  return { valid: errors.length === 0, errors: Array.from(new Set(errors)) };
}

/** True only for a `found` result whose assignment passes full validation. */
export function isResolvedCanonicalTenantV1(
  result: CanonicalTenantResolutionResultV1,
): boolean {
  if (result.status !== 'found') return false;
  return validateCanonicalTenantAssignmentV1(result.assignment).valid;
}

/* ------------------------------------------------------------------------- *
 * Provisioning (write side).
 *
 * Resolution above stays query-only. These commands are the ONLY way a tenant
 * assignment comes into existence, and they are Workspace-owned: no consumer may
 * invoke them, and no migration may bulk-create assignments by joining
 * `agent_accounts.owner_id`.
 * ------------------------------------------------------------------------- */

export const CANONICAL_TENANT_PROVISIONING_OPERATIONS_V1 = [
  'assign',
  'supersede',
  'revoke',
] as const;
export type CanonicalTenantProvisioningOperationV1 =
  (typeof CANONICAL_TENANT_PROVISIONING_OPERATIONS_V1)[number];

/** Roles permitted to change tenancy. Viewer/guest/member may never provision. */
export const CANONICAL_TENANT_PROVISIONING_ROLES_V1 = ['owner', 'admin'] as const;

export const CANONICAL_TENANT_PROVISIONING_REJECTIONS_V1 = [
  'authority_disabled',
  'agent_unknown',
  'agent_id_mismatch',
  'owner_mismatch',
  'tenant_unknown',
  'tenant_inactive',
  'actor_not_permitted',
  'agent_owner_not_in_tenant',
  'assignment_already_active',
  'active_assignment_absent',
  'assignment_not_active',
  'assignment_epoch_stale',
  'idempotency_conflict',
  'concurrent_assignment_conflict',
  'source_unreadable',
] as const;
export type CanonicalTenantProvisioningRejectionV1 =
  (typeof CANONICAL_TENANT_PROVISIONING_REJECTIONS_V1)[number];

/** Shared preamble for every provisioning command. */
export interface CanonicalTenantProvisioningBaseV1 {
  schemaVersion: typeof CANONICAL_TENANT_AUTHORITY_SCHEMA_VERSION;
  /** Caller-namespaced idempotency key. Same key + different digest = conflict. */
  idempotencyKey: string;
  /** The workspace member performing the change; must be owner or admin. */
  actorUserId: string;
  agentId: string;
  agentAccountId: string;
  /** The Agent's current owner, verified against `agent_accounts.owner_id`. */
  ownerUserId: string;
  environment: CanonicalTenantEnvironmentV1;
}

/** Bind an Agent to a tenant for the first time in this environment. */
export interface CanonicalTenantAssignCommandV1
  extends CanonicalTenantProvisioningBaseV1 {
  operation: 'assign';
  workspaceId: string;
}

/** Move an Agent to a different tenant, superseding the current active row. */
export interface CanonicalTenantSupersedeCommandV1
  extends CanonicalTenantProvisioningBaseV1 {
  operation: 'supersede';
  workspaceId: string;
  /** Exact fence against the assignment being replaced. */
  expectedAssignmentEpoch: string;
  expectedAssignmentRef: string;
}

/** Remove an Agent's tenancy without electing a successor. */
export interface CanonicalTenantRevokeCommandV1
  extends CanonicalTenantProvisioningBaseV1 {
  operation: 'revoke';
  expectedAssignmentEpoch: string;
  expectedAssignmentRef: string;
  reasonCode: string;
}

export type CanonicalTenantProvisioningCommandV1 =
  | CanonicalTenantAssignCommandV1
  | CanonicalTenantSupersedeCommandV1
  | CanonicalTenantRevokeCommandV1;

/** Durable, digest-sealed record of one accepted provisioning transition. */
export interface CanonicalTenantProvisioningReceiptV1 {
  schemaVersion: typeof CANONICAL_TENANT_AUTHORITY_SCHEMA_VERSION;
  authorityDomain: typeof CANONICAL_TENANT_AUTHORITY_DOMAIN;
  operation: CanonicalTenantProvisioningOperationV1;
  idempotencyKey: string;
  requestDigest: string;
  actorUserId: string;
  /** The assignment this operation produced or terminated. */
  assignmentRef: string;
  assignmentState: CanonicalTenantAssignmentStateV1;
  assignmentEpoch: string;
  assignmentVersion: number;
  tenantId: string;
  workspaceId: string;
  agentAccountId: string;
  agentId: string;
  environment: CanonicalTenantEnvironmentV1;
  /** Present for supersede/revoke: the row that left `active`. */
  predecessorAssignmentRef?: string;
  predecessorAssignmentEpoch?: string;
  historyVersion: string;
  recordedAt: string;
  receiptDigest: DigestRef;
}

export type CanonicalTenantProvisioningResultV1 =
  | {
      status: 'applied' | 'replayed';
      receipt: CanonicalTenantProvisioningReceiptV1;
    }
  | {
      status: 'rejected';
      reasonCode: CanonicalTenantProvisioningRejectionV1;
      observedAssignmentEpoch?: string;
    };

/** Workspace-owned write port. Deliberately separate from the read port. */
export interface CanonicalTenantProvisioningPortV1 {
  provision(
    command: CanonicalTenantProvisioningCommandV1,
  ): Promise<CanonicalTenantProvisioningResultV1>;
}

export function computeCanonicalTenantProvisioningReceiptDigestV1(
  receipt: Omit<CanonicalTenantProvisioningReceiptV1, 'receiptDigest'>,
): DigestRef {
  return computeDigest(receipt);
}

const PROVISIONING_ALLOWED_FIELDS_V1: Record<
  CanonicalTenantProvisioningOperationV1,
  ReadonlySet<string>
> = {
  assign: new Set([
    'schemaVersion',
    'idempotencyKey',
    'actorUserId',
    'agentId',
    'agentAccountId',
    'ownerUserId',
    'environment',
    'operation',
    'workspaceId',
  ]),
  supersede: new Set([
    'schemaVersion',
    'idempotencyKey',
    'actorUserId',
    'agentId',
    'agentAccountId',
    'ownerUserId',
    'environment',
    'operation',
    'workspaceId',
    'expectedAssignmentEpoch',
    'expectedAssignmentRef',
  ]),
  revoke: new Set([
    'schemaVersion',
    'idempotencyKey',
    'actorUserId',
    'agentId',
    'agentAccountId',
    'ownerUserId',
    'environment',
    'operation',
    'expectedAssignmentEpoch',
    'expectedAssignmentRef',
    'reasonCode',
  ]),
};

/** Closed validation. Unknown fields and caller-supplied tenantId are rejected. */
export function validateCanonicalTenantProvisioningCommandV1(
  value: unknown,
): CanonicalTenantValidationResultV1 {
  const errors: string[] = [];
  if (typeof value !== 'object' || value === null) {
    return { valid: false, errors: ['command must be an object'] };
  }
  const command = value as Record<string, unknown>;
  const operation = command.operation;
  if (
    typeof operation !== 'string' ||
    !(CANONICAL_TENANT_PROVISIONING_OPERATIONS_V1 as readonly string[]).includes(
      operation,
    )
  ) {
    return { valid: false, errors: ['operation must be assign, supersede or revoke'] };
  }
  const allowed =
    PROVISIONING_ALLOWED_FIELDS_V1[operation as CanonicalTenantProvisioningOperationV1];
  for (const key of Object.keys(command)) {
    if (!allowed.has(key)) errors.push('command contains unknown fields');
  }
  if (command.schemaVersion !== CANONICAL_TENANT_AUTHORITY_SCHEMA_VERSION) {
    errors.push('schemaVersion must be 1');
  }
  if (typeof command.idempotencyKey !== 'string' || !command.idempotencyKey.trim()) {
    errors.push('idempotencyKey is required');
  }
  for (const field of ['actorUserId', 'agentAccountId', 'ownerUserId'] as const) {
    if (typeof command[field] !== 'string' || !UUID_PATTERN.test(String(command[field]))) {
      errors.push(`${field} must be a uuid`);
    }
  }
  if (typeof command.agentId !== 'string' || !command.agentId.trim()) {
    errors.push('agentId is required');
  }
  if (
    typeof command.environment !== 'string' ||
    !(CANONICAL_TENANT_ENVIRONMENTS_V1 as readonly string[]).includes(command.environment)
  ) {
    errors.push('environment must be a canonical tenant environment');
  }
  // The tenant is named by workspaceId only; a tenantId may never be supplied.
  if ('tenantId' in command) errors.push('caller may not supply tenantId');
  if (operation === 'assign' || operation === 'supersede') {
    if (
      typeof command.workspaceId !== 'string' ||
      !UUID_PATTERN.test(String(command.workspaceId))
    ) {
      errors.push('workspaceId must be a uuid');
    }
  }
  if (operation === 'supersede' || operation === 'revoke') {
    if (
      typeof command.expectedAssignmentEpoch !== 'string' ||
      !DECIMAL_PATTERN.test(String(command.expectedAssignmentEpoch))
    ) {
      errors.push('expectedAssignmentEpoch must be a decimal string');
    }
    if (
      typeof command.expectedAssignmentRef !== 'string' ||
      !UUID_PATTERN.test(String(command.expectedAssignmentRef))
    ) {
      errors.push('expectedAssignmentRef must be a uuid');
    }
  }
  if (operation === 'revoke') {
    if (
      typeof command.reasonCode !== 'string' ||
      !/^[a-z][a-z0-9_]{1,79}$/.test(String(command.reasonCode))
    ) {
      errors.push('reasonCode must be a lower_snake reason code');
    }
  }
  return { valid: errors.length === 0, errors: Array.from(new Set(errors)) };
}

export function validateCanonicalTenantProvisioningReceiptV1(
  value: unknown,
): CanonicalTenantValidationResultV1 {
  const errors: string[] = [];
  if (typeof value !== 'object' || value === null) {
    return { valid: false, errors: ['receipt must be an object'] };
  }
  const receipt = value as Record<string, unknown>;
  if (receipt.schemaVersion !== CANONICAL_TENANT_AUTHORITY_SCHEMA_VERSION) {
    errors.push('schemaVersion must be 1');
  }
  if (receipt.authorityDomain !== CANONICAL_TENANT_AUTHORITY_DOMAIN) {
    errors.push('authorityDomain must be the canonical tenant authority domain');
  }
  if (!isCanonicalTenantIdV1(receipt.tenantId)) {
    errors.push('tenantId must be a canonical, non-global tenant id');
  }
  if (
    typeof receipt.requestDigest !== 'string' ||
    !/^[0-9a-f]{64}$/.test(String(receipt.requestDigest))
  ) {
    errors.push('requestDigest must be a sha-256 digest');
  }
  if (
    typeof receipt.assignmentEpoch !== 'string' ||
    !DECIMAL_PATTERN.test(String(receipt.assignmentEpoch))
  ) {
    errors.push('assignmentEpoch must be a decimal string');
  }
  // A revoke receipt must not claim an active assignment, and vice versa.
  if (receipt.operation === 'revoke' && receipt.assignmentState !== 'revoked') {
    errors.push('a revoke receipt must report the revoked state');
  }
  if (
    (receipt.operation === 'assign' || receipt.operation === 'supersede') &&
    receipt.assignmentState !== 'active'
  ) {
    errors.push('an assign/supersede receipt must report the active state');
  }
  if (receipt.operation === 'supersede' && typeof receipt.predecessorAssignmentRef !== 'string') {
    errors.push('a supersede receipt must name its predecessor');
  }
  const digest = receipt.receiptDigest as Record<string, unknown> | undefined;
  if (
    !digest ||
    typeof digest.value !== 'string' ||
    !/^[0-9a-f]{64}$/.test(String(digest.value))
  ) {
    errors.push('receiptDigest must be a sha-256 digest');
  } else {
    const { receiptDigest: _ignored, ...rest } = receipt as Record<string, unknown> & {
      receiptDigest: unknown;
    };
    if (computeDigest(rest).value !== digest.value) {
      errors.push('receiptDigest does not match the receipt facts');
    }
  }
  return { valid: errors.length === 0, errors: Array.from(new Set(errors)) };
}
