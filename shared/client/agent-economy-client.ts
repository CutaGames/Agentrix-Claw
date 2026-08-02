/**
 * Shared Agent Economy workflow client — transport-agnostic.
 *
 * Web / Mobile / Desktop inject only their own {@link HttpTransportV1} and
 * {@link ClientContextV1}. Endpoint paths, request shapes, the Idempotency-Key
 * header, canonical response validation, cross-Soul-Core / lineage binding and
 * the mutation error vocabulary are defined once here so no surface reimplements
 * a divergent Agent Economy stack. This does not create a second marketplace,
 * ledger, settlement, Remedy or reputation writer; it only correlates the
 * canonical Backend workflow response.
 */
import { SoulCoreClientError } from './errors';
import {
  requestJson,
  type ClientContextV1,
  type HttpTransportV1,
} from './transport';
import {
  AGENT_ECONOMY_SCHEMA_VERSION,
  DISCOVERABLE_KINDS_V1,
  DISCOVERY_EXECUTION_STATES_V1,
  validateCanonicalDiscoveryItemV1,
  validateExecutionMandateV1,
  validateGoalIntentV1,
  type ActionPlanV1,
  type ActionQuoteV1,
  type BudgetReservationV1,
  type CanonicalDiscoveryQueryV1,
  type CanonicalDiscoveryResultV1,
  type DiscoveryCandidateV1,
  type ExecutionMandateV1,
  type GoalConstraintsV1,
  type GoalIntentV1,
  type PaymentAttemptV1,
  type SettlementEventV1,
} from '../types/agent-economy';
import { isRecordRefV1 } from '../types/agent-attribution';
import { PARTY_KINDS, type RecordRef } from '../types/trust-loop-primitives';

/**
 * Owner-scoped read model mirroring the Backend workflow response. It is a view
 * adapter, not a second canonical DTO.
 */
export interface AgentEconomyWorkflowView {
  schemaVersion: 1;
  soulCoreId: string;
  actionId: string;
  workflowVersion: number;
  workflowStatus: string;
  goal: GoalIntentV1;
  plan: ActionPlanV1;
  candidates: DiscoveryCandidateV1[];
  quote?: ActionQuoteV1;
  mandate?: ExecutionMandateV1;
  reservation?: BudgetReservationV1;
  paymentAttempts: PaymentAttemptV1[];
  settlementEvents: SettlementEventV1[];
}

export interface AgentEconomyMutationResult {
  schemaVersion: 1;
  workflow: AgentEconomyWorkflowView;
  replayed: boolean;
}

export interface CreateEconomyGoalInput {
  intent: string;
  constraints?: GoalConstraintsV1;
}

export interface DiscoverEconomyCandidatesInput {
  query?: string;
  kinds?: CanonicalDiscoveryQueryV1['kinds'];
  limit?: number;
}

export interface ExecuteEconomyPaymentInput {
  proof: {
    txHash?: string;
    paymentPayload?: string;
    paidAmount?: number;
    network?: string;
    asset?: string;
  };
}

export interface CreateAgentEconomyClientOptions {
  transport: HttpTransportV1;
  baseUrl: string;
  getAuthToken?: ClientContextV1['getAuthToken'];
  /** Optional per-request extra headers (e.g. surface tag). */
  defaultHeaders?: Record<string, string>;
}

export interface AgentEconomyClientLike {
  discover(input: DiscoverEconomyCandidatesInput): Promise<CanonicalDiscoveryResultV1>;
  createGoal(soulCoreId: string, input: CreateEconomyGoalInput, idempotencyKey: string): Promise<AgentEconomyMutationResult>;
  discoverCandidates(soulCoreId: string, workflow: AgentEconomyWorkflowView, input: DiscoverEconomyCandidatesInput, idempotencyKey: string): Promise<AgentEconomyMutationResult>;
  selectCandidate(soulCoreId: string, workflow: AgentEconomyWorkflowView, candidateId: string, idempotencyKey: string): Promise<AgentEconomyMutationResult>;
  issueQuote(soulCoreId: string, workflow: AgentEconomyWorkflowView, idempotencyKey: string): Promise<AgentEconomyMutationResult>;
  authorize(soulCoreId: string, workflow: AgentEconomyWorkflowView, idempotencyKey: string): Promise<AgentEconomyMutationResult>;
  executePayment(soulCoreId: string, workflow: AgentEconomyWorkflowView, input: ExecuteEconomyPaymentInput, idempotencyKey: string): Promise<AgentEconomyMutationResult>;
  revoke(soulCoreId: string, workflow: AgentEconomyWorkflowView, idempotencyKey: string, reason?: string): Promise<AgentEconomyMutationResult>;
  reconcile(soulCoreId: string, workflow: AgentEconomyWorkflowView, idempotencyKey: string, outcome?: 'timeout_release' | 'manual_release' | 'unknown_outcome'): Promise<AgentEconomyMutationResult>;
  requestRefund(soulCoreId: string, workflow: AgentEconomyWorkflowView, authorityReceiptId: string, idempotencyKey: string, reason?: string): Promise<AgentEconomyMutationResult>;
  requestReversal(soulCoreId: string, workflow: AgentEconomyWorkflowView, authorityReceiptId: string, idempotencyKey: string, reason?: string): Promise<AgentEconomyMutationResult>;
  getWorkflow(soulCoreId: string, actionId: string): Promise<AgentEconomyWorkflowView>;
}

function objectValue(input: unknown, label: string): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error(`${label}: expected object`);
  }
  return input as Record<string, unknown>;
}

function unwrapData(input: unknown): unknown {
  if (input && typeof input === 'object' && !Array.isArray(input) && 'data' in input) {
    return (input as { data: unknown }).data;
  }
  return input;
}

function isNonEmptyString(input: unknown): input is string {
  return typeof input === 'string' && input.trim().length > 0;
}

function hasCanonicalIntegrity(input: unknown): boolean {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const integrity = input as Record<string, unknown>;
  if (integrity.type !== 'digest' && integrity.type !== 'signature') return false;
  if (!integrity.payloadDigest || typeof integrity.payloadDigest !== 'object' || Array.isArray(integrity.payloadDigest)) return false;
  const digest = integrity.payloadDigest as Record<string, unknown>;
  return digest.algorithm === 'sha-256'
    && isNonEmptyString(digest.canonicalization)
    && typeof digest.value === 'string'
    && /^[0-9a-f]{64}$/.test(digest.value);
}

function isPartyRefShape(input: unknown): boolean {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const value = input as Record<string, unknown>;
  return isNonEmptyString(value.id)
    && isNonEmptyString(value.kind)
    && (PARTY_KINDS as readonly unknown[]).includes(value.kind);
}

function isNonEmptyPartyRefArrayShape(input: unknown): boolean {
  return Array.isArray(input) && input.length > 0 && input.every(isPartyRefShape);
}

function isRemedyAuthorityRefShape(input: unknown): boolean {
  return isPartyRefShape(input)
    && (input as Record<string, unknown>).kind === 'remedy_authority';
}

function isMoneyShape(input: unknown): boolean {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const value = input as Record<string, unknown>;
  return typeof value.amountMinor === 'string'
    && /^(0|[1-9][0-9]*)$/.test(value.amountMinor)
    && isNonEmptyString(value.currency)
    && Number.isInteger(value.decimals)
    && Number(value.decimals) >= 0;
}

function areRecordRefs(input: unknown): boolean {
  return Array.isArray(input) && input.every(isRecordRefV1);
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function validatePaymentRequirements(
  input: unknown,
  amount: unknown,
): ValidationResult {
  const errors: string[] = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, errors: ['expected object'] };
  }
  const value = input as Record<string, unknown>;
  const money = amount && typeof amount === 'object' && !Array.isArray(amount)
    ? amount as Record<string, unknown>
    : {};
  if (value.x402Version !== 1 || value.error !== null) errors.push('envelope: invalid');
  if (!Array.isArray(value.accepts) || value.accepts.length !== 1) {
    errors.push('accepts: exactly one authority option required');
    return { valid: false, errors };
  }
  const accept = value.accepts[0];
  if (!accept || typeof accept !== 'object' || Array.isArray(accept)) {
    errors.push('accepts[0]: invalid');
    return { valid: false, errors };
  }
  const option = accept as Record<string, unknown>;
  if (option.scheme !== 'exact') errors.push('scheme: unsupported');
  if (!isNonEmptyString(option.network) || !isNonEmptyString(option.resource)
    || !isNonEmptyString(option.description) || !isNonEmptyString(option.payTo)
    || !isNonEmptyString(option.asset)) errors.push('routing fields: required');
  if (!Number.isInteger(option.maxTimeoutSeconds) || Number(option.maxTimeoutSeconds) <= 0) {
    errors.push('maxTimeoutSeconds: invalid');
  }
  if (typeof option.maxAmountRequired !== 'string'
    || !/^(0|[1-9][0-9]*)$/.test(option.maxAmountRequired)
    || option.maxAmountRequired !== money.amountMinor) errors.push('amount: quote mismatch');
  if (String(option.asset).trim().toUpperCase()
    !== String(money.currency ?? '').trim().toUpperCase()) errors.push('asset: quote mismatch');
  if (option.extra !== undefined
    && (!option.extra || typeof option.extra !== 'object' || Array.isArray(option.extra))) {
    errors.push('extra: invalid');
  }
  return { valid: errors.length === 0, errors };
}

function validateActionQuote(input: unknown): ValidationResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { valid: false, errors: ['expected object'] };
  const value = input as Record<string, unknown>;
  const errors: string[] = [];
  if (value.schemaVersion !== AGENT_ECONOMY_SCHEMA_VERSION) errors.push('schemaVersion: unsupported');
  if (!isNonEmptyString(value.quoteId) || !isNonEmptyString(value.actionId)) errors.push('identity: required');
  if (!isRecordRefV1(value.goalRef) || !isRecordRefV1(value.candidateRef)) errors.push('record refs: invalid');
  if (!isPartyRefShape(value.providerRef)) errors.push('providerRef: invalid');
  if (!isMoneyShape(value.amount) || (value.maximumAmount !== undefined && !isMoneyShape(value.maximumAmount))) errors.push('amount: invalid');
  const amountMinor = value.amount && typeof value.amount === 'object' && !Array.isArray(value.amount)
    ? (value.amount as Record<string, unknown>).amountMinor
    : undefined;
  if (typeof amountMinor === 'string' && /^(0|[1-9][0-9]*)$/.test(amountMinor)) {
    if (BigInt(amountMinor) > 0n) {
      const requirements = validatePaymentRequirements(value.paymentRequirements, value.amount);
      errors.push(...requirements.errors.map((error) => `paymentRequirements.${error}`));
    } else if (value.paymentRequirements !== undefined) {
      errors.push('paymentRequirements: forbidden for zero-value quote');
    }
  }
  if (!areRecordRefs(value.termsRefs)) errors.push('termsRefs: invalid');
  if (!['offered', 'accepted', 'expired', 'revoked', 'superseded'].includes(String(value.status))) errors.push('status: unknown');
  if (!isNonEmptyString(value.idempotencyKey) || !isNonEmptyString(value.issuedAt) || !isNonEmptyString(value.expiresAt)) errors.push('lifecycle fields: required');
  if (!hasCanonicalIntegrity(value.integrity)) errors.push('integrity: invalid');
  return { valid: errors.length === 0, errors };
}

function validateBudgetReservation(input: unknown): ValidationResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { valid: false, errors: ['expected object'] };
  const value = input as Record<string, unknown>;
  const errors: string[] = [];
  if (value.schemaVersion !== AGENT_ECONOMY_SCHEMA_VERSION) errors.push('schemaVersion: unsupported');
  if (!isNonEmptyString(value.reservationId) || !isNonEmptyString(value.actionId)) errors.push('identity: required');
  if (!isRecordRefV1(value.mandateRef) || !isRecordRefV1(value.quoteRef)) errors.push('record refs: invalid');
  if (!isMoneyShape(value.amount) || !isPartyRefShape(value.authorityRef)) errors.push('authority or amount: invalid');
  if (!['pending', 'reserved', 'released', 'committed', 'expired', 'reconciliation_required'].includes(String(value.status))) errors.push('status: unknown');
  if (!isNonEmptyString(value.idempotencyKey) || !areRecordRefs(value.sourceReceiptRefs)) errors.push('idempotency or receipts: invalid');
  if (!isNonEmptyString(value.createdAt) || !isNonEmptyString(value.expiresAt) || !isNonEmptyString(value.updatedAt)) errors.push('timestamps: required');
  if (!hasCanonicalIntegrity(value.integrity)) errors.push('integrity: invalid');
  return { valid: errors.length === 0, errors };
}

function validatePaymentAttempt(input: unknown): ValidationResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { valid: false, errors: ['expected object'] };
  const value = input as Record<string, unknown>;
  const errors: string[] = [];
  if (value.schemaVersion !== AGENT_ECONOMY_SCHEMA_VERSION) errors.push('schemaVersion: unsupported');
  if (!isNonEmptyString(value.paymentAttemptId) || !isNonEmptyString(value.actionId)) errors.push('identity: required');
  if (!isRecordRefV1(value.reservationRef) || !isPartyRefShape(value.settlementAuthorityRef)) errors.push('authority refs: invalid');
  if (!isMoneyShape(value.amount) || !isNonEmptyString(value.rail)) errors.push('amount or rail: invalid');
  if (!['not_started', 'pending', 'succeeded', 'failed', 'unknown_outcome'].includes(String(value.status))) errors.push('status: unknown');
  if (!isNonEmptyString(value.idempotencyKey) || !areRecordRefs(value.authorityReceiptRefs)) errors.push('idempotency or receipts: invalid');
  if (!isNonEmptyString(value.createdAt) || !isNonEmptyString(value.updatedAt)) errors.push('timestamps: required');
  if (!hasCanonicalIntegrity(value.integrity)) errors.push('integrity: invalid');
  return { valid: errors.length === 0, errors };
}

function validateSettlementEvent(input: unknown): ValidationResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { valid: false, errors: ['expected object'] };
  const value = input as Record<string, unknown>;
  const errors: string[] = [];
  if (value.schemaVersion !== AGENT_ECONOMY_SCHEMA_VERSION) errors.push('schemaVersion: unsupported');
  if (!isNonEmptyString(value.settlementEventId) || !isNonEmptyString(value.actionId)) errors.push('identity: required');
  if (!isRecordRefV1(value.paymentAttemptRef) || !isPartyRefShape(value.settlementAuthorityRef)) errors.push('authority refs: invalid');
  const eventType = String(value.eventType);
  const remedyEvent = ['refund_pending', 'refund_confirmed', 'reversal_pending', 'reversal_confirmed']
    .includes(eventType);
  const remedyReconciliation = eventType === 'reconciliation_required'
    && value.remedyAuthorityRef !== undefined;
  if (!['debit_pending', 'debit_confirmed', 'refund_pending', 'refund_confirmed', 'reversal_pending', 'reversal_confirmed', 'reconciliation_required'].includes(eventType)) errors.push('eventType: unknown');
  if (!['pending', 'confirmed', 'failed', 'unknown'].includes(String(value.status))) errors.push('status: unknown');
  if (!isMoneyShape(value.amount) || !isNonEmptyString(value.occurredAt)) errors.push('amount or timestamp: invalid');
  if (value.sourceReceiptRef !== undefined && !isRecordRefV1(value.sourceReceiptRef)) errors.push('sourceReceiptRef: invalid');
  if (value.settlementParties !== undefined && !isNonEmptyPartyRefArrayShape(value.settlementParties)) {
    errors.push('settlementParties: non-empty PartyRef array required when present');
  }
  if (value.remedyAuthorityRef !== undefined && !isRemedyAuthorityRefShape(value.remedyAuthorityRef)) {
    errors.push('remedyAuthorityRef: remedy_authority PartyRef required when present');
  }
  if (value.remedyParties !== undefined && !isNonEmptyPartyRefArrayShape(value.remedyParties)) {
    errors.push('remedyParties: non-empty PartyRef array required when present');
  }
  if (remedyEvent || remedyReconciliation) {
    if (!isRemedyAuthorityRefShape(value.remedyAuthorityRef)) {
      errors.push('remedyAuthorityRef: required for remedy event');
    }
    if (!isNonEmptyPartyRefArrayShape(value.remedyParties)) {
      errors.push('remedyParties: required for remedy event');
    }
  }
  if (!hasCanonicalIntegrity(value.integrity)) errors.push('integrity: invalid');
  return { valid: errors.length === 0, errors };
}

function validateActionPlan(input: unknown): ValidationResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, errors: ['expected object'] };
  }
  const value = input as Record<string, unknown>;
  const errors: string[] = [];
  if (value.schemaVersion !== AGENT_ECONOMY_SCHEMA_VERSION) errors.push('schemaVersion: unsupported');
  if (!isNonEmptyString(value.planId)) errors.push('planId: required');
  if (!isRecordRefV1(value.goalRef)) errors.push('goalRef: invalid');
  if (!Array.isArray(value.candidateRefs) || !value.candidateRefs.every(isRecordRefV1)) errors.push('candidateRefs: invalid');
  if (!['draft', 'candidates_discovered', 'candidate_selected', 'cancelled', 'superseded'].includes(String(value.status))) errors.push('status: unknown');
  if (!isNonEmptyString(value.createdAt) || !isNonEmptyString(value.updatedAt)) errors.push('timestamps: required');
  if (!hasCanonicalIntegrity(value.integrity)) errors.push('integrity: invalid');
  return { valid: errors.length === 0, errors };
}

function validateDiscoveryCandidate(input: unknown): ValidationResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, errors: ['expected object'] };
  }
  const value = input as Record<string, unknown>;
  const errors: string[] = [];
  if (value.schemaVersion !== AGENT_ECONOMY_SCHEMA_VERSION) errors.push('schemaVersion: unsupported');
  if (!isNonEmptyString(value.candidateId)) errors.push('candidateId: required');
  if (!isRecordRefV1(value.goalRef) || !isRecordRefV1(value.planRef) || !isRecordRefV1(value.discoveryItemRef)) errors.push('record refs: invalid');
  if (!(DISCOVERABLE_KINDS_V1 as readonly unknown[]).includes(value.kind)) errors.push('kind: unknown');
  if (value.title !== undefined && !isNonEmptyString(value.title)) errors.push('title: invalid');
  if (value.description !== undefined && typeof value.description !== 'string') errors.push('description: invalid');
  if (!value.providerRef || typeof value.providerRef !== 'object' || Array.isArray(value.providerRef) || !isNonEmptyString((value.providerRef as Record<string, unknown>).id)) errors.push('providerRef: invalid');
  if (!Array.isArray(value.capabilities) || !value.capabilities.every(isNonEmptyString)) errors.push('capabilities: invalid');
  if (!value.source || typeof value.source !== 'object' || Array.isArray(value.source) || !isNonEmptyString((value.source as Record<string, unknown>).source) || !isNonEmptyString((value.source as Record<string, unknown>).capturedAt)) errors.push('source: invalid');
  if (value.freshness !== undefined) {
    const freshness = value.freshness;
    if (
      typeof freshness !== 'object'
      || freshness === null
      || Array.isArray(freshness)
      || !isNonEmptyString((freshness as Record<string, unknown>).capturedAt)
      || !['fresh', 'stale', 'unknown'].includes(String((freshness as Record<string, unknown>).state))
    ) errors.push('freshness: invalid');
  }
  if (value.trustSummaryRefs !== undefined && !areRecordRefs(value.trustSummaryRefs)) errors.push('trustSummaryRefs: invalid');
  if (!['available', 'limited', 'unavailable', 'unknown'].includes(String(value.availability))) errors.push('availability: unknown');
  if (!(DISCOVERY_EXECUTION_STATES_V1 as readonly unknown[]).includes(value.executionState)) errors.push('executionState: unknown');
  if (!value.priceTerms || typeof value.priceTerms !== 'object' || Array.isArray(value.priceTerms) || typeof (value.priceTerms as Record<string, unknown>).quoteRequired !== 'boolean' || !Array.isArray((value.priceTerms as Record<string, unknown>).termsRefs)) errors.push('priceTerms: invalid');
  if (!['eligible', 'selected', 'rejected', 'stale', 'unavailable'].includes(String(value.status))) errors.push('status: unknown');
  if (!hasCanonicalIntegrity(value.integrity)) errors.push('integrity: invalid');
  return { valid: errors.length === 0, errors };
}

const WORKFLOW_STATUSES = new Set([
  'planning',
  'candidate_selected',
  'quoted',
  'mandated',
  'reserved',
  'payment_pending',
  'settled',
  'remedy_pending',
  'refunded',
  'reversed',
  'released',
  'reconciliation_required',
  'cancelled',
]);

function assertCanonical(label: string, result: ValidationResult): void {
  if (!result.valid) throw new Error(`${label}: ${result.errors.join('; ')}`);
}

interface WorkflowBinding {
  soulCoreId: string;
  actionId?: string;
}

function assertRecordRefTarget(
  ref: RecordRef | undefined,
  expectedType: RecordRef['type'],
  expectedId: string,
  label: string,
): void {
  if (!ref || ref.type !== expectedType || ref.id !== expectedId) {
    throw new Error(`${label}: expected ${expectedType}:${expectedId}`);
  }
}

function assertWorkflowBinding(
  workflow: AgentEconomyWorkflowView,
  expected: WorkflowBinding,
): void {
  if (workflow.soulCoreId !== expected.soulCoreId) {
    throw new Error('economyWorkflow: Soul Core route binding mismatch');
  }
  if (expected.actionId !== undefined && workflow.actionId !== expected.actionId) {
    throw new Error('economyWorkflow: Action route binding mismatch');
  }
  assertRecordRefTarget(workflow.plan.goalRef, 'goal_intent', workflow.goal.goalId, 'economyWorkflow.plan.goalRef');
  const candidateIds = new Set<string>();
  for (const candidate of workflow.candidates) {
    if (candidateIds.has(candidate.candidateId)) {
      throw new Error('economyWorkflow.candidates: duplicate candidateId');
    }
    candidateIds.add(candidate.candidateId);
    assertRecordRefTarget(candidate.goalRef, 'goal_intent', workflow.goal.goalId, 'economyWorkflow.candidate.goalRef');
    assertRecordRefTarget(candidate.planRef, 'action_plan', workflow.plan.planId, 'economyWorkflow.candidate.planRef');
  }
  const planCandidateIds = new Set<string>();
  for (const candidateRef of workflow.plan.candidateRefs) {
    assertRecordRefTarget(candidateRef, 'discovery_candidate', candidateRef.id, 'economyWorkflow.plan.candidateRef');
    if (!candidateIds.has(candidateRef.id) || planCandidateIds.has(candidateRef.id)) {
      throw new Error('economyWorkflow.plan.candidateRefs: lineage mismatch');
    }
    planCandidateIds.add(candidateRef.id);
  }
  if (planCandidateIds.size !== candidateIds.size) {
    throw new Error('economyWorkflow.plan.candidateRefs: incomplete candidate lineage');
  }
  if (workflow.plan.selectedCandidateRef !== undefined) {
    assertRecordRefTarget(
      workflow.plan.selectedCandidateRef,
      'discovery_candidate',
      workflow.plan.selectedCandidateRef.id,
      'economyWorkflow.plan.selectedCandidateRef',
    );
    if (!candidateIds.has(workflow.plan.selectedCandidateRef.id)) {
      throw new Error('economyWorkflow.plan.selectedCandidateRef: unknown candidate');
    }
  }
  if (workflow.quote) {
    if (workflow.quote.actionId !== workflow.actionId) throw new Error('economyWorkflow.quote: Action mismatch');
    assertRecordRefTarget(workflow.quote.goalRef, 'goal_intent', workflow.goal.goalId, 'economyWorkflow.quote.goalRef');
    if (!candidateIds.has(workflow.quote.candidateRef.id)) {
      throw new Error('economyWorkflow.quote.candidateRef: unknown candidate');
    }
    assertRecordRefTarget(
      workflow.quote.candidateRef,
      'discovery_candidate',
      workflow.quote.candidateRef.id,
      'economyWorkflow.quote.candidateRef',
    );
  }
  if (workflow.mandate) {
    if (
      workflow.mandate.actionId !== workflow.actionId
      || workflow.mandate.accountableAgentId !== workflow.goal.accountableAgentId
      || !workflow.quote
    ) {
      throw new Error('economyWorkflow.mandate: Action, Agent, or Quote lineage mismatch');
    }
    assertRecordRefTarget(workflow.mandate.quoteRef, 'action_quote', workflow.quote.quoteId, 'economyWorkflow.mandate.quoteRef');
  }
  if (workflow.reservation) {
    if (workflow.reservation.actionId !== workflow.actionId || !workflow.mandate || !workflow.quote) {
      throw new Error('economyWorkflow.reservation: Action or authority lineage mismatch');
    }
    assertRecordRefTarget(workflow.reservation.mandateRef, 'execution_mandate', workflow.mandate.mandateId, 'economyWorkflow.reservation.mandateRef');
    assertRecordRefTarget(workflow.reservation.quoteRef, 'action_quote', workflow.quote.quoteId, 'economyWorkflow.reservation.quoteRef');
  }
  const paymentIds = new Set<string>();
  for (const attempt of workflow.paymentAttempts) {
    if (attempt.actionId !== workflow.actionId || !workflow.reservation || paymentIds.has(attempt.paymentAttemptId)) {
      throw new Error('economyWorkflow.paymentAttempts: Action or reservation lineage mismatch');
    }
    assertRecordRefTarget(attempt.reservationRef, 'budget_reservation', workflow.reservation.reservationId, 'economyWorkflow.paymentAttempt.reservationRef');
    paymentIds.add(attempt.paymentAttemptId);
  }
  for (const event of workflow.settlementEvents) {
    if (event.actionId !== workflow.actionId || !paymentIds.has(event.paymentAttemptRef.id)) {
      throw new Error('economyWorkflow.settlementEvents: Action or payment lineage mismatch');
    }
    assertRecordRefTarget(event.paymentAttemptRef, 'payment_attempt', event.paymentAttemptRef.id, 'economyWorkflow.settlementEvent.paymentAttemptRef');
  }
}

function decodeWorkflow(input: unknown, expected: WorkflowBinding): AgentEconomyWorkflowView {
  const value = objectValue(unwrapData(input), 'economyWorkflow');
  if (
    value.schemaVersion !== AGENT_ECONOMY_SCHEMA_VERSION
    || typeof value.soulCoreId !== 'string'
    || value.soulCoreId.length === 0
    || typeof value.actionId !== 'string'
    || value.actionId.length === 0
    || !Number.isInteger(value.workflowVersion)
    || (value.workflowVersion as number) < 0
    || typeof value.workflowStatus !== 'string'
    || !WORKFLOW_STATUSES.has(value.workflowStatus)
    || !Array.isArray(value.candidates)
    || !Array.isArray(value.paymentAttempts)
    || !Array.isArray(value.settlementEvents)
  ) {
    throw new Error('economyWorkflow: missing or unknown canonical lifecycle fields');
  }

  assertCanonical('economyWorkflow.goal', validateGoalIntentV1(value.goal));
  assertCanonical('economyWorkflow.plan', validateActionPlan(value.plan));
  value.candidates.forEach((candidate, index) => {
    assertCanonical(`economyWorkflow.candidates[${index}]`, validateDiscoveryCandidate(candidate));
  });
  if (value.quote !== undefined) {
    assertCanonical('economyWorkflow.quote', validateActionQuote(value.quote));
  }
  if (value.mandate !== undefined) {
    assertCanonical('economyWorkflow.mandate', validateExecutionMandateV1(value.mandate));
  }
  if (value.reservation !== undefined) {
    assertCanonical('economyWorkflow.reservation', validateBudgetReservation(value.reservation));
  }
  value.paymentAttempts.forEach((attempt, index) => {
    assertCanonical(`economyWorkflow.paymentAttempts[${index}]`, validatePaymentAttempt(attempt));
  });
  value.settlementEvents.forEach((event, index) => {
    assertCanonical(`economyWorkflow.settlementEvents[${index}]`, validateSettlementEvent(event));
  });

  const workflow = value as unknown as AgentEconomyWorkflowView;
  assertWorkflowBinding(workflow, expected);
  return workflow;
}

function decodeMutation(input: unknown, expected: WorkflowBinding): AgentEconomyMutationResult {
  const value = objectValue(unwrapData(input), 'economyMutation');
  if (value.schemaVersion !== AGENT_ECONOMY_SCHEMA_VERSION || typeof value.replayed !== 'boolean') {
    throw new Error('economyMutation: invalid response envelope');
  }
  return {
    schemaVersion: 1,
    replayed: value.replayed,
    workflow: decodeWorkflow(value.workflow, expected),
  };
}

function decodeDiscovery(input: unknown): CanonicalDiscoveryResultV1 {
  const value = objectValue(unwrapData(input), 'economyDiscovery');
  if (
    value.schemaVersion !== AGENT_ECONOMY_SCHEMA_VERSION
    || typeof value.queryId !== 'string'
    || !Array.isArray(value.items)
    || !Array.isArray(value.failures)
    || typeof value.partial !== 'boolean'
    || typeof value.generatedAt !== 'string'
  ) {
    throw new Error('economyDiscovery: invalid response envelope');
  }
  const errors = value.items.flatMap((item, index) => {
    const result = validateCanonicalDiscoveryItemV1(item);
    return result.valid ? [] : result.errors.map((error) => `items[${index}].${error}`);
  });
  if (errors.length > 0) throw new Error(`economyDiscovery: ${errors.join('; ')}`);
  return value as unknown as CanonicalDiscoveryResultV1;
}

function workflowRoot(soulCoreId: string): string {
  return `/v1/soul-cores/${encodeURIComponent(soulCoreId)}/economy`;
}

/**
 * Build a bounded, single-use idempotency key. The same key must never be
 * regenerated while a mutation outcome is unknown; callers reuse it across
 * retries of the same intent.
 */
export function createEconomyIdempotencyKey(scope: string, prefix = 'economy'): string {
  const nonce = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}:${scope}:${nonce}`.slice(0, 160);
}

export function createAgentEconomyClient(
  options: CreateAgentEconomyClientOptions,
): AgentEconomyClientLike {
  const { transport } = options;
  const context: ClientContextV1 = {
    baseUrl: options.baseUrl,
    getAuthToken: options.getAuthToken,
    schemaVersion: AGENT_ECONOMY_SCHEMA_VERSION,
    defaultHeaders: options.defaultHeaders,
  };

  const bindingFor = (
    soulCoreId: string,
    workflow?: AgentEconomyWorkflowView,
  ): WorkflowBinding => {
    if (workflow && workflow.soulCoreId !== soulCoreId) {
      throw new Error('economyWorkflow: refusing a cross-Soul-Core request');
    }
    return {
      soulCoreId,
      ...(workflow ? { actionId: workflow.actionId } : {}),
    };
  };

  const mutate = (
    path: string,
    body: unknown,
    idempotencyKey: string,
    expected: WorkflowBinding,
  ): Promise<AgentEconomyMutationResult> => requestJson(
    transport,
    context,
    {
      method: 'POST',
      path,
      headers: { 'Idempotency-Key': idempotencyKey },
      body,
    },
    (input) => decodeMutation(input, expected),
  );

  return {
    discover: (input) => requestJson(
      transport,
      context,
      {
        method: 'GET',
        path: '/v1/agent-economy/discovery',
        query: {
          schemaVersion: 1,
          query: input.query,
          kinds: input.kinds?.join(','),
          limit: input.limit,
        },
      },
      decodeDiscovery,
    ),

    createGoal: (soulCoreId, input, idempotencyKey) => mutate(
      `${workflowRoot(soulCoreId)}/goals`,
      { schemaVersion: 1, intent: input.intent, constraints: input.constraints },
      idempotencyKey,
      bindingFor(soulCoreId),
    ),

    discoverCandidates: (soulCoreId, workflow, input, idempotencyKey) => mutate(
      `${workflowRoot(soulCoreId)}/goals/${encodeURIComponent(workflow.goal.goalId)}/candidates/discover`,
      {
        schemaVersion: 1,
        expectedVersion: workflow.workflowVersion,
        query: input.query,
        kinds: input.kinds,
        limit: input.limit,
      },
      idempotencyKey,
      bindingFor(soulCoreId, workflow),
    ),

    selectCandidate: (soulCoreId, workflow, candidateId, idempotencyKey) => mutate(
      `${workflowRoot(soulCoreId)}/plans/${encodeURIComponent(workflow.plan.planId)}/candidates/${encodeURIComponent(candidateId)}/select`,
      { schemaVersion: 1, expectedVersion: workflow.workflowVersion },
      idempotencyKey,
      bindingFor(soulCoreId, workflow),
    ),

    issueQuote: (soulCoreId, workflow, idempotencyKey) => mutate(
      `${workflowRoot(soulCoreId)}/actions/${encodeURIComponent(workflow.actionId)}/quote`,
      { schemaVersion: 1, expectedVersion: workflow.workflowVersion, expiresInSeconds: 900 },
      idempotencyKey,
      bindingFor(soulCoreId, workflow),
    ),

    authorize: (soulCoreId, workflow, idempotencyKey) => mutate(
      `${workflowRoot(soulCoreId)}/actions/${encodeURIComponent(workflow.actionId)}/authorize`,
      { schemaVersion: 1, expectedVersion: workflow.workflowVersion, expiresInSeconds: 900 },
      idempotencyKey,
      bindingFor(soulCoreId, workflow),
    ),

    executePayment: (soulCoreId, workflow, input, idempotencyKey) => mutate(
      `${workflowRoot(soulCoreId)}/actions/${encodeURIComponent(workflow.actionId)}/payment/execute`,
      {
        schemaVersion: 1,
        expectedVersion: workflow.workflowVersion,
        proof: input.proof,
      },
      idempotencyKey,
      bindingFor(soulCoreId, workflow),
    ),

    revoke: (soulCoreId, workflow, idempotencyKey, reason) => mutate(
      `${workflowRoot(soulCoreId)}/actions/${encodeURIComponent(workflow.actionId)}/revoke`,
      { schemaVersion: 1, expectedVersion: workflow.workflowVersion, reason },
      idempotencyKey,
      bindingFor(soulCoreId, workflow),
    ),

    reconcile: (soulCoreId, workflow, idempotencyKey, outcome = 'unknown_outcome') => mutate(
      `${workflowRoot(soulCoreId)}/actions/${encodeURIComponent(workflow.actionId)}/reservation/reconcile`,
      { schemaVersion: 1, expectedVersion: workflow.workflowVersion, outcome },
      idempotencyKey,
      bindingFor(soulCoreId, workflow),
    ),

    requestRefund: (soulCoreId, workflow, authorityReceiptId, idempotencyKey, reason) => mutate(
      `${workflowRoot(soulCoreId)}/actions/${encodeURIComponent(workflow.actionId)}/refund`,
      { schemaVersion: 1, expectedVersion: workflow.workflowVersion, authorityReceiptId, reason },
      idempotencyKey,
      bindingFor(soulCoreId, workflow),
    ),

    requestReversal: (soulCoreId, workflow, authorityReceiptId, idempotencyKey, reason) => mutate(
      `${workflowRoot(soulCoreId)}/actions/${encodeURIComponent(workflow.actionId)}/reversal`,
      { schemaVersion: 1, expectedVersion: workflow.workflowVersion, authorityReceiptId, reason },
      idempotencyKey,
      bindingFor(soulCoreId, workflow),
    ),

    getWorkflow: (soulCoreId, actionId) => requestJson(
      transport,
      context,
      {
        method: 'GET',
        path: `${workflowRoot(soulCoreId)}/actions/${encodeURIComponent(actionId)}`,
      },
      (input) => decodeWorkflow(input, { soulCoreId, actionId }),
    ),
  };
}

export function describeEconomyClientError(
  error: unknown,
  mutationAttempted = false,
): {
  kind: string;
  title: string;
  detail: string;
  uncertain: boolean;
} {
  if (!(error instanceof SoulCoreClientError)) {
    return {
      kind: 'unknown',
      title: mutationAttempted ? 'Mutation outcome unknown' : 'Response unavailable',
      detail: mutationAttempted
        ? 'No verifiable canonical mutation response arrived. Do not submit a new idempotency key; reload the Action first.'
        : 'The response could not be verified. No success state was inferred.',
      uncertain: mutationAttempted,
    };
  }
  if (
    error.kind === 'version_mismatch'
    || error.code === 'ECONOMY_WORKFLOW_VERSION_CONFLICT'
  ) {
    return {
      kind: 'version_mismatch',
      title: 'Action changed elsewhere',
      detail: 'The latest canonical version must be reloaded before you confirm again.',
      uncertain: false,
    };
  }
  if (
    error.kind === 'network'
    || (mutationAttempted && ['unavailable', 'unknown'].includes(error.kind))
  ) {
    return {
      kind: error.kind,
      title: 'Request outcome unknown',
      detail: 'No verifiable canonical mutation response arrived. Do not repeat the side effect or generate a new idempotency key; reload the Action first.',
      uncertain: true,
    };
  }
  if (error.kind === 'revoked' || error.kind === 'stale') {
    return {
      kind: error.kind,
      title: 'Authority is no longer usable',
      detail: 'The current state is revoked, expired, stale, or superseded. The action remains blocked.',
      uncertain: false,
    };
  }
  if (['unauthorized', 'forbidden', 'not_found', 'redacted'].includes(error.kind)) {
    return {
      kind: error.kind,
      title: 'Action unavailable',
      detail: 'The owner-scoped record is unavailable. Existence and authorization are intentionally not distinguished.',
      uncertain: false,
    };
  }
  return {
    kind: error.kind,
    title: 'Action unavailable',
    detail: 'The canonical service did not confirm this operation. No success state was inferred.',
    uncertain: false,
  };
}
