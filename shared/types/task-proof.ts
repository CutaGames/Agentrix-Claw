import {
  validateActionAttributionV1,
  isActorRefV1,
  isRecordRefV1,
  type ActionAttributionV1,
  type ActionAttributionValidationContextV1,
  type ActorRefV1,
  type AgentSoulContractValidationResultV1,
} from './agent-attribution';
import type { RecordRef } from './trust-loop-primitives';

/** TaskProof v1 — references across request-to-outcome execution lineage. */
export const TASK_PROOF_SCHEMA_VERSION = 1 as const;

export interface TaskRequestRefV1 {
  requestId: string;
  requestedBy: string;
  requestedAt: string;
  intentDigest: string;
}

export interface TaskAuthorizationRefV1 {
  authorizationId: string;
  decision: 'approved' | 'denied' | 'expired' | 'revoked';
  authorityPolicyIds: string[];
  decidedAt: string;
  decidedBy: string;
  expiresAt?: string;
}

export interface TaskExecutionRefV1 {
  executionId: string;
  runtimeId: string;
  shellSessionId?: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  startedAt?: string;
  completedAt?: string;
  inputDigest: string;
  outputDigest?: string;
}

export interface TaskSettlementRefV1 {
  settlementId: string;
  status: 'not_required' | 'pending' | 'settled' | 'failed' | 'reversed';
  amount?: string;
  asset?: string;
  transactionRef?: string;
  settledAt?: string;
}

export interface TaskOutcomeRefV1 {
  outcomeId: string;
  result: 'success' | 'partial' | 'failure' | 'cancelled';
  resultDigest: string;
  recordedAt: string;
}

export interface TaskEvidenceRefV1 {
  evidenceId: string;
  kind: 'log' | 'artifact' | 'attestation' | 'receipt' | 'signature' | 'anchor';
  digest: string;
  uri?: string;
  issuer?: string;
  createdAt: string;
}

export interface TaskProofV1 {
  schemaVersion: typeof TASK_PROOF_SCHEMA_VERSION;
  taskProofId: string;
  soulCoreId: string;
  request: TaskRequestRefV1;
  authorization: TaskAuthorizationRefV1;
  execution: TaskExecutionRefV1;
  settlement: TaskSettlementRefV1;
  outcome: TaskOutcomeRefV1;
  evidence: TaskEvidenceRefV1[];
  proofDigest: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// ADR-SOUL-002 additive TaskProof V2. V1 above is intentionally unchanged.
// ---------------------------------------------------------------------------

export const TASK_PROOF_V2_SCHEMA_VERSION = 2 as const;
export const TASK_PROOF_V2_DOMAIN = 'AGENTRIX_TASK_PROOF_V2' as const;

export interface TaskProofAttributionV2 extends ActionAttributionV1 {}

/**
 * Strict additive V2 envelope: every V1 lineage field remains explicit while
 * the new digest domain also binds typed attribution. `soulCoreId` is retained
 * as a compatibility/provenance field and must match a Soul Core authority root.
 */
export interface TaskProofV2 extends Omit<TaskProofV1, 'schemaVersion'> {
  schemaVersion: typeof TASK_PROOF_V2_SCHEMA_VERSION;
  proofDomain: typeof TASK_PROOF_V2_DOMAIN;
  attribution: TaskProofAttributionV2;
}

/** Derived metadata for V1 only. It is never inserted into or covered by V1 proofDigest. */
export interface CompatibilityAttributionV1 {
  sourceProofVersion: 1;
  actorRef?: ActorRefV1;
  accountableAgentId?: string;
  derivationSourceRef: RecordRef;
  derivedAt: string;
  cryptographicallyBound: false;
  confidence: 'deterministic-mapping' | 'ambiguous' | 'unknown';
}

export type TaskProofEnvelopeV1V2 = TaskProofV1 | TaskProofV2;
export type DecodedTaskProofEnvelopeV1V2 =
  | { version: 1; proof: TaskProofV1 }
  | { version: 2; proof: TaskProofV2 };

export class TaskProofValidationError extends Error {
  readonly code = 'task_proof_invalid';
  readonly errors: string[];

  constructor(errors: string[]) {
    super(`TaskProof validation failed: ${errors.join('; ')}`);
    this.name = 'TaskProofValidationError';
    this.errors = errors;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function validateTaskProofLineage(
  input: Record<string, unknown>,
  expectedSchemaVersion: 1 | 2,
): string[] {
  const errors: string[] = [];
  if (input.schemaVersion !== expectedSchemaVersion) {
    errors.push(`proof.schemaVersion: expected ${expectedSchemaVersion}`);
  }
  for (const key of ['taskProofId', 'soulCoreId', 'proofDigest', 'createdAt'] as const) {
    if (!isNonEmptyString(input[key])) errors.push(`proof.${key}: expected non-empty string`);
  }

  const request = isObject(input.request) ? input.request : undefined;
  if (!request) errors.push('proof.request: expected object');
  else {
    for (const key of ['requestId', 'requestedBy', 'requestedAt', 'intentDigest'] as const) {
      if (!isNonEmptyString(request[key])) errors.push(`proof.request.${key}: expected non-empty string`);
    }
  }

  const authorization = isObject(input.authorization) ? input.authorization : undefined;
  if (!authorization) errors.push('proof.authorization: expected object');
  else {
    for (const key of ['authorizationId', 'decidedAt', 'decidedBy'] as const) {
      if (!isNonEmptyString(authorization[key])) {
        errors.push(`proof.authorization.${key}: expected non-empty string`);
      }
    }
    if (!['approved', 'denied', 'expired', 'revoked'].includes(String(authorization.decision))) {
      errors.push('proof.authorization.decision: unknown value');
    }
    if (
      !Array.isArray(authorization.authorityPolicyIds) ||
      !authorization.authorityPolicyIds.every(isNonEmptyString)
    ) {
      errors.push('proof.authorization.authorityPolicyIds: expected string array');
    }
  }

  const execution = isObject(input.execution) ? input.execution : undefined;
  if (!execution) errors.push('proof.execution: expected object');
  else {
    for (const key of ['executionId', 'runtimeId', 'inputDigest'] as const) {
      if (!isNonEmptyString(execution[key])) errors.push(`proof.execution.${key}: expected non-empty string`);
    }
    if (!['queued', 'running', 'succeeded', 'failed', 'cancelled'].includes(String(execution.status))) {
      errors.push('proof.execution.status: unknown value');
    }
  }

  const settlement = isObject(input.settlement) ? input.settlement : undefined;
  if (!settlement) errors.push('proof.settlement: expected object');
  else {
    if (!isNonEmptyString(settlement.settlementId)) {
      errors.push('proof.settlement.settlementId: expected non-empty string');
    }
    if (!['not_required', 'pending', 'settled', 'failed', 'reversed'].includes(String(settlement.status))) {
      errors.push('proof.settlement.status: unknown value');
    }
  }

  const outcome = isObject(input.outcome) ? input.outcome : undefined;
  if (!outcome) errors.push('proof.outcome: expected object');
  else {
    for (const key of ['outcomeId', 'resultDigest', 'recordedAt'] as const) {
      if (!isNonEmptyString(outcome[key])) errors.push(`proof.outcome.${key}: expected non-empty string`);
    }
    if (!['success', 'partial', 'failure', 'cancelled'].includes(String(outcome.result))) {
      errors.push('proof.outcome.result: unknown value');
    }
  }

  if (!Array.isArray(input.evidence)) errors.push('proof.evidence: expected array');
  else {
    input.evidence.forEach((entry, index) => {
      if (!isObject(entry)) {
        errors.push(`proof.evidence[${index}]: expected object`);
        return;
      }
      for (const key of ['evidenceId', 'digest', 'createdAt'] as const) {
        if (!isNonEmptyString(entry[key])) {
          errors.push(`proof.evidence[${index}].${key}: expected non-empty string`);
        }
      }
      if (!['log', 'artifact', 'attestation', 'receipt', 'signature', 'anchor'].includes(String(entry.kind))) {
        errors.push(`proof.evidence[${index}].kind: unknown value`);
      }
    });
  }
  return errors;
}

export function validateTaskProofV1Envelope(
  input: unknown,
): AgentSoulContractValidationResultV1 {
  if (!isObject(input)) return { valid: false, errors: ['proof: expected object'] };
  const errors = validateTaskProofLineage(input, TASK_PROOF_SCHEMA_VERSION);
  return { valid: errors.length === 0, errors };
}

export function validateTaskProofV2(
  input: unknown,
  context: ActionAttributionValidationContextV1 = {},
): AgentSoulContractValidationResultV1 {
  if (!isObject(input)) return { valid: false, errors: ['proof: expected object'] };
  const errors = validateTaskProofLineage(input, TASK_PROOF_V2_SCHEMA_VERSION);
  if (input.proofDomain !== TASK_PROOF_V2_DOMAIN) {
    errors.push('proof.proofDomain: unsupported or missing V2 domain');
  }
  const attribution = validateActionAttributionV1(input.attribution, context);
  errors.push(...attribution.errors.map((error) => `proof.${error}`));

  if (isObject(input.attribution)) {
    const root = input.attribution.authorityRootRef;
    if (
      isObject(root) &&
      root.kind === 'soul_core' &&
      isNonEmptyString(root.soulCoreId) &&
      input.soulCoreId !== root.soulCoreId
    ) {
      errors.push('proof.soulCoreId: must match attribution Soul Core authority root');
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validateCompatibilityAttributionV1(
  input: unknown,
): AgentSoulContractValidationResultV1 {
  const errors: string[] = [];
  if (!isObject(input)) return { valid: false, errors: ['compatibility: expected object'] };
  if (input.sourceProofVersion !== 1) {
    errors.push('compatibility.sourceProofVersion: only V1 source proofs are supported');
  }
  if (input.cryptographicallyBound !== false) {
    errors.push('compatibility.cryptographicallyBound: must be literal false');
  }
  if (!['deterministic-mapping', 'ambiguous', 'unknown'].includes(String(input.confidence))) {
    errors.push('compatibility.confidence: unknown value');
  }
  if (!isRecordRefV1(input.derivationSourceRef)) {
    errors.push('compatibility.derivationSourceRef: expected known RecordRef');
  }
  if (!isNonEmptyString(input.derivedAt)) {
    errors.push('compatibility.derivedAt: expected non-empty string');
  }
  if (input.actorRef !== undefined && !isActorRefV1(input.actorRef)) {
    errors.push('compatibility.actorRef: unknown kind or malformed reference');
  }
  if (input.accountableAgentId !== undefined && !isNonEmptyString(input.accountableAgentId)) {
    errors.push('compatibility.accountableAgentId: expected non-empty string when present');
  }
  const actorRef = input.actorRef !== undefined && isActorRefV1(input.actorRef)
    ? input.actorRef
    : undefined;
  const accountableAgentId = isNonEmptyString(input.accountableAgentId)
    ? input.accountableAgentId
    : undefined;
  if (
    actorRef?.kind === 'agent' &&
    accountableAgentId !== undefined &&
    accountableAgentId !== actorRef.agentId
  ) {
    errors.push('compatibility.accountableAgentId: Agent actor must account to its own agentId');
  }
  if (input.confidence === 'deterministic-mapping') {
    if (actorRef === undefined) {
      errors.push('compatibility.actorRef: required for deterministic mapping');
    }
    if (accountableAgentId === undefined) {
      errors.push('compatibility.accountableAgentId: required for deterministic mapping');
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Version dispatch never downgrades: malformed V2 is rejected as V2 and is not
 * retried under V1 semantics. Unknown versions also fail closed.
 */
export function decodeTaskProofEnvelopeV1V2(
  input: unknown,
  context: ActionAttributionValidationContextV1 = {},
): DecodedTaskProofEnvelopeV1V2 {
  if (!isObject(input)) throw new TaskProofValidationError(['proof: expected object']);
  if (input.schemaVersion === TASK_PROOF_SCHEMA_VERSION) {
    const validation = validateTaskProofV1Envelope(input);
    if (!validation.valid) throw new TaskProofValidationError(validation.errors);
    return { version: 1, proof: input as unknown as TaskProofV1 };
  }
  if (input.schemaVersion === TASK_PROOF_V2_SCHEMA_VERSION) {
    const validation = validateTaskProofV2(input, context);
    if (!validation.valid) throw new TaskProofValidationError(validation.errors);
    return { version: 2, proof: input as unknown as TaskProofV2 };
  }
  throw new TaskProofValidationError([
    `proof.schemaVersion: unsupported version ${JSON.stringify(input.schemaVersion)}`,
  ]);
}
