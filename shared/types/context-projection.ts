import {
  CONTEXT_DIGEST_DOMAINS_V1,
  canonicalizeContextJsonV1,
  computeContextDigestV1,
  type ContextDigestV1,
} from './context-gateway-digest';

/** The only supported Context Gateway contract version. */
export const CONTEXT_PROJECTION_SCHEMA_VERSION = 1 as const;
export const CONTEXT_PROJECTION_DOMAIN = CONTEXT_DIGEST_DOMAINS_V1.projection;

export const CONTEXT_ENVIRONMENTS_V1 = ['local', 'test', 'staging', 'production'] as const;
export type ContextEnvironmentV1 = (typeof CONTEXT_ENVIRONMENTS_V1)[number];

export const CONTEXT_PURPOSES_V1 = [
  'answer_user_question',
  'schedule_assistance',
  'task_execution_planning',
  'support_diagnostics',
] as const;
export type ContextPurposeV1 = (typeof CONTEXT_PURPOSES_V1)[number];

export const CONTEXT_DATA_CATEGORIES_V1 = [
  'agent_profile',
  'agent_preferences',
  'schedule_metadata',
  'skill_inventory',
  'relationship_graph',
  'financial_summary',
  'credential_metadata',
] as const;
export type ContextDataCategoryV1 = (typeof CONTEXT_DATA_CATEGORIES_V1)[number];

export const CONTEXT_DEFAULT_DENY_CATEGORIES_V1: readonly ContextDataCategoryV1[] = [
  'relationship_graph',
  'financial_summary',
  'credential_metadata',
] as const;

export const CONTEXT_SCOPES_V1 = ['context.read', 'context.search'] as const;
export type ContextScopeV1 = (typeof CONTEXT_SCOPES_V1)[number];

/** Kept as a source-compatible risk vocabulary; it is not an authority input. */
export const CONTEXT_RISK_LEVELS_V1 = ['low', 'medium', 'high'] as const;
export type ContextRiskLevelV1 = (typeof CONTEXT_RISK_LEVELS_V1)[number];

export interface ContextBudgetV1 {
  maxRecords: number;
  maxBytes: number;
  maxTokens: number;
  maxCategories: number;
  maxProcessingMs: number;
}

export interface ContextBudgetActualV1 {
  records: number;
  bytes: number;
  tokens: number;
  processingMs: number;
}

/** Server-derived runtime and canonical Soul Core ownership binding. */
export interface ContextRuntimeBindingV1 {
  schemaVersion: typeof CONTEXT_PROJECTION_SCHEMA_VERSION;
  bindingId: string;
  runtimeId: string;
  runtimePrincipalRef: string;
  runtimeSessionRef: string;
  ownerRef: string;
  tenantRef: string;
  agentId: string;
  agentAccountId: string;
  soulCoreRef: string;
  environment: ContextEnvironmentV1;
  audience: string;
  allowedScopes: ContextScopeV1[];
  ownershipEpoch: string;
  assignmentEpoch: string;
  revocationEpoch: number;
  authorityEvidenceRefs: string[];
  issuedAt: string;
  expiresAt: string;
  bindingDigest: ContextDigestV1;
}

/**
 * Caller identity values are assertions only. The authoritative identity is in
 * ContextRuntimeBindingV1 and must be compared by the server-side chain guard.
 */
export interface ContextRequestV1 {
  schemaVersion: typeof CONTEXT_PROJECTION_SCHEMA_VERSION;
  requestId: string;
  correlationId: string;
  idempotencyKey: string;
  runtimeBindingRef: string;
  runtimeBindingDigest: ContextDigestV1;
  environment: ContextEnvironmentV1;
  audience: string;
  purpose: ContextPurposeV1;
  categories: ContextDataCategoryV1[];
  scopes: ContextScopeV1[];
  budget: ContextBudgetV1;
  requestedTtlSeconds: number;
  requestedPolicyVersion: string;
  expectedOwnershipEpoch: string;
  expectedPolicyEpoch: number;
  expectedProjectionEpoch: number;
  taskRef?: string;
  query?: string;
  assertedOwnerRef?: string;
  assertedTenantRef?: string;
  assertedAgentId?: string;
  assertedAgentAccountId?: string;
  assertedSoulCoreRef?: string;
  requestDigest: ContextDigestV1;
}

export const CONTEXT_POLICY_LAYER_KINDS_V1 = [
  'emergency',
  'revocation',
  'retention',
  'tenant_shutdown',
  'runtime_binding',
  'data_owner_consent',
  'legal',
  'tenant',
  'runtime',
] as const;
export type ContextPolicyLayerKindV1 = (typeof CONTEXT_POLICY_LAYER_KINDS_V1)[number];

export interface ContextPolicyLayerV1 {
  layerId: string;
  kind: ContextPolicyLayerKindV1;
  effect: 'allow' | 'deny';
  reasonCode: string;
  purposes: ContextPurposeV1[];
  categories: ContextDataCategoryV1[];
  scopes: ContextScopeV1[];
  budget: ContextBudgetV1;
  maxTtlSeconds: number;
  redactionRuleRefs: string[];
}

export interface ContextPolicySnapshotV1 {
  schemaVersion: typeof CONTEXT_PROJECTION_SCHEMA_VERSION;
  policyVersion: string;
  policyEpoch: number;
  tenantRef: string;
  environment: ContextEnvironmentV1;
  audience: string;
  issuedAt: string;
  expiresAt: string;
  layers: ContextPolicyLayerV1[];
  policyDigest: ContextDigestV1;
}

interface ContextPolicyDecisionBaseV1 {
  schemaVersion: typeof CONTEXT_PROJECTION_SCHEMA_VERSION;
  decisionId: string;
  requestId: string;
  requestDigest: ContextDigestV1;
  runtimeBindingRef: string;
  decision: 'allow' | 'deny' | 'unavailable';
  reasonCode: string;
  policyVersion: string;
  policyEpoch: number;
  policyDigest: ContextDigestV1;
  matchedRuleRefs: string[];
  evaluatedAt: string;
  evaluatorVersion: string;
  decisionDigest: ContextDigestV1;
}

export interface ContextPolicyAllowDecisionV1 extends ContextPolicyDecisionBaseV1 {
  decision: 'allow';
  effectivePurpose: ContextPurposeV1;
  effectiveCategories: ContextDataCategoryV1[];
  effectiveScopes: ContextScopeV1[];
  effectiveBudget: ContextBudgetV1;
  effectiveTtlSeconds: number;
  redactionRuleRefs: string[];
}

export interface ContextPolicyNonAllowDecisionV1 extends ContextPolicyDecisionBaseV1 {
  decision: 'deny' | 'unavailable';
}

export type ContextPolicyDecisionV1 =
  | ContextPolicyAllowDecisionV1
  | ContextPolicyNonAllowDecisionV1;

export const CONTEXT_SOURCE_DOMAINS_V1 = [
  'agent',
  'memory',
  'conversation',
  'knowledge',
  'skill_registry',
] as const;
export type ContextSourceDomainV1 = (typeof CONTEXT_SOURCE_DOMAINS_V1)[number];

export interface ContextSourceEntryV1 {
  domain: ContextSourceDomainV1;
  sourceRef: string;
  sourceVersion: string;
  sourceDigest: ContextDigestV1;
  readerPortId: string;
  readerEvidenceRef: string;
  observedAt: string;
}

export interface ContextSourceSnapshotV1 {
  schemaVersion: typeof CONTEXT_PROJECTION_SCHEMA_VERSION;
  snapshotId: string;
  entries: ContextSourceEntryV1[];
  omittedOptionalDomains: ContextSourceDomainV1[];
  sourceDigest: ContextDigestV1;
}

export interface ContextProjectionV1 {
  schemaVersion: typeof CONTEXT_PROJECTION_SCHEMA_VERSION;
  projectionId: string;
  requestId: string;
  idempotencyKey: string;
  runtimeBindingRef: string;
  runtimeId: string;
  runtimePrincipalRef: string;
  runtimeSessionRef: string;
  ownerRef: string;
  tenantRef: string;
  agentId: string;
  agentAccountId: string;
  soulCoreRef: string;
  environment: ContextEnvironmentV1;
  audience: string;
  purpose: ContextPurposeV1;
  categories: ContextDataCategoryV1[];
  scopes: ContextScopeV1[];
  dataRef: string;
  payloadDigest: ContextDigestV1;
  disclosedFields: string[];
  redactions: string[];
  omittedSources: ContextSourceDomainV1[];
  budgetActual: ContextBudgetActualV1;
  requestDigest: ContextDigestV1;
  policyVersion: string;
  policyEpoch: number;
  policyDigest: ContextDigestV1;
  decisionDigest: ContextDigestV1;
  sourceDigest: ContextDigestV1;
  projectorVersion: string;
  issuedAt: string;
  expiresAt: string;
  ownershipEpoch: string;
  assignmentEpoch: string;
  revocationEpoch: number;
  projectionEpoch: number;
  projectionDigest: ContextDigestV1;
  disclosureReceiptId: string;
  grantsActionScope: false;
}

export const CONTEXT_DISCLOSURE_OUTCOMES_V1 = [
  'issued',
  'denied',
  'unavailable',
  'stale',
  'revoked',
  'expired',
  'erased',
] as const;
export type ContextDisclosureOutcomeV1 = (typeof CONTEXT_DISCLOSURE_OUTCOMES_V1)[number];

export interface ContextDisclosureReceiptV1 {
  schemaVersion: typeof CONTEXT_PROJECTION_SCHEMA_VERSION;
  receiptDomain: 'AGENTRIX_CONTEXT_DISCLOSURE_RECEIPT_V1';
  receiptId: string;
  receiptEpoch: number;
  projectionId: string;
  requestId: string;
  idempotencyKey: string;
  runtimeBindingRef: string;
  runtimeId: string;
  runtimePrincipalRef: string;
  runtimeSessionRef: string;
  ownerRef: string;
  tenantRef: string;
  agentId: string;
  agentAccountId: string;
  soulCoreRef: string;
  environment: ContextEnvironmentV1;
  audience: string;
  purpose: ContextPurposeV1;
  categories: ContextDataCategoryV1[];
  scopes: ContextScopeV1[];
  budgetActual: ContextBudgetActualV1;
  redactions: string[];
  requestDigest: ContextDigestV1;
  policyDigest: ContextDigestV1;
  sourceDigest: ContextDigestV1;
  payloadDigest: ContextDigestV1;
  decisionDigest: ContextDigestV1;
  projectionDigest: ContextDigestV1;
  ownershipEpoch: string;
  assignmentEpoch: string;
  policyEpoch: number;
  projectionEpoch: number;
  revocationEpoch: number;
  outcome: ContextDisclosureOutcomeV1;
  reasonCode: string;
  issuedAt: string | null;
  expiresAt: string | null;
  recordedAt: string;
  retentionPolicyRef: string;
  receiptDigest: ContextDigestV1;
}

export interface ContextIngestCandidateV1 {
  schemaVersion: typeof CONTEXT_PROJECTION_SCHEMA_VERSION;
  candidateId: string;
  runtimeBindingRef: string;
  sourceKind: string;
  sourceRef: string;
  sourceDigest: ContextDigestV1;
  proposedCanonicalDomain: string;
  classification: 'untrusted_candidate';
  policyRef: string;
  consentRef: string;
  createdAt: string;
  expiresAt: string;
  candidateDigest: ContextDigestV1;
  canonical: false;
  invocable: false;
}

export const CONTEXT_ACT_CAPABILITY_CLASSES_V1 = [
  'read_only',
  'internal_side_effect',
  'external_side_effect',
] as const;
export type ContextActCapabilityClassV1 = (typeof CONTEXT_ACT_CAPABILITY_CLASSES_V1)[number];

export interface ContextActRequestV1 {
  schemaVersion: typeof CONTEXT_PROJECTION_SCHEMA_VERSION;
  actRequestId: string;
  idempotencyKey: string;
  runtimeBindingRef: string;
  runtimeId: string;
  runtimePrincipalRef: string;
  runtimeSessionRef: string;
  ownerRef: string;
  tenantRef: string;
  agentId: string;
  agentAccountId: string;
  soulCoreRef: string;
  environment: ContextEnvironmentV1;
  audience: string;
  projectionId: string;
  projectionEpoch: number;
  ownershipEpoch: string;
  policyEpoch: number;
  revocationEpoch: number;
  requestDigest: ContextDigestV1;
  policyDigest: ContextDigestV1;
  sourceDigest: ContextDigestV1;
  payloadDigest: ContextDigestV1;
  decisionDigest: ContextDigestV1;
  projectionDigest: ContextDigestV1;
  targetDomain: string;
  targetRef: string;
  intentRef: string;
  intentDigest: ContextDigestV1;
  capabilityClass: ContextActCapabilityClassV1;
  requestedScope: string;
  authorityEvidenceRef: string;
  revocationFenceRef: string;
  createdAt: string;
  expiresAt: string;
  actRequestDigest: ContextDigestV1;
}

export const CONTEXT_GATEWAY_OUTCOMES_V1 = [
  'issued',
  'denied',
  'not_found',
  'unavailable',
  'outage',
  'unknown',
  'stale',
  'revoked',
  'expired',
  'orphaned',
  'erased',
  'idempotency_conflict',
] as const;
export type ContextGatewayOutcomeV1 = (typeof CONTEXT_GATEWAY_OUTCOMES_V1)[number];

export const CONTEXT_REASON_CODES_V1 = [
  'issued',
  'invalid_contract',
  'gateway_disabled',
  'authentication_required',
  'runtime_not_bound',
  'binding_expired',
  'owner_mismatch',
  'tenant_mismatch',
  'agent_mismatch',
  'soul_core_mismatch',
  'environment_mismatch',
  'audience_mismatch',
  'ownership_epoch_mismatch',
  'policy_epoch_mismatch',
  'projection_epoch_mismatch',
  'purpose_denied',
  'category_denied',
  'scope_denied',
  'budget_exceeded',
  'ttl_exceeded',
  'policy_unavailable',
  'policy_conflict',
  'policy_downgrade',
  'policy_digest_mismatch',
  'policy_snapshot_expired',
  'canonical_reader_unavailable',
  'projection_store_unavailable',
  'persistence_unavailable',
  'payload_custody_unavailable',
  'canonical_reader_outage',
  'source_not_found',
  'source_unknown',
  'source_revoked',
  'projection_stale',
  'projection_revoked',
  'projection_expired',
  'projection_erased',
  'digest_mismatch',
  'receipt_tampered',
  'idempotency_conflict',
  'origin_denied',
  'transport_binding_mismatch',
  'projection_digest_mismatch',
  'nonce_replay',
  'rate_limited',
  'backpressure',
  'manual_resolution_required',
  'not_found',
] as const;
export type ContextReasonCodeV1 = (typeof CONTEXT_REASON_CODES_V1)[number];

/** Source-compatible alias retained for callers that previously handled only deny outcomes. */
export const CONTEXT_DENY_REASONS_V1 = CONTEXT_REASON_CODES_V1;
export type ContextDenyReasonV1 = ContextReasonCodeV1;

export interface ContextGatewayEnvelopeV1<TResult = unknown> {
  schemaVersion: typeof CONTEXT_PROJECTION_SCHEMA_VERSION;
  status: ContextGatewayOutcomeV1;
  reasonCode: ContextReasonCodeV1;
  correlationId: string;
  result: TResult | null;
}

export type ContextProjectionResultV1 =
  | { status: 'issued'; projection: ContextProjectionV1 }
  | {
      status: Exclude<ContextGatewayOutcomeV1, 'issued'>;
      reasonCode: ContextReasonCodeV1;
    };

/**
 * Source-compatible helper name. The returned cache key is now a domain-separated
 * SHA-256 digest, never the former ambiguous pipe-delimited canonicalization.
 */
export function contextProjectionCacheKeyV1(input: {
  tenantRef: string;
  ownerRef: string;
  runtimeId: string;
  purpose: ContextPurposeV1;
  environment: string;
  audience: string;
  policyVersion: string;
  sourceVersions: string[];
  revocationEpoch: number;
}): string {
  return computeContextDigestV1(CONTEXT_DIGEST_DOMAINS_V1.projection, {
    cacheKeyVersion: 1,
    ...input,
    sourceVersions: [...input.sourceVersions].sort(),
  }).value;
}

/** Source-compatible name; returns strict canonical JSON rather than pipe text. */
export function canonicalizeContextProjectionV1(
  projection: Omit<ContextProjectionV1, 'projectionDigest'>,
): string {
  return canonicalizeContextJsonV1(projection);
}

export function isContextProjectionUsableV1(
  projection: ContextProjectionV1,
  now: Date,
  currentRevocationEpoch: number,
  currentProjectionEpoch: number = projection?.projectionEpoch,
): boolean {
  if (projection?.schemaVersion !== CONTEXT_PROJECTION_SCHEMA_VERSION) return false;
  if (projection.grantsActionScope !== false) return false;
  if (projection.revocationEpoch !== currentRevocationEpoch) return false;
  if (projection.projectionEpoch !== currentProjectionEpoch) return false;
  const issuedAt = Date.parse(projection.issuedAt);
  const expiresAt = Date.parse(projection.expiresAt);
  return Number.isFinite(issuedAt) && Number.isFinite(expiresAt) &&
    issuedAt < expiresAt && now.getTime() < expiresAt;
}
