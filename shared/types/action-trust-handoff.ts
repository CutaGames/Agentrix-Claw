import {
  ACTION_RUNTIME_SCHEMA_VERSION,
  ACTION_TOOL_NAMES_V1,
  ACTION_TOOL_SCOPES_V1,
  type ActionAuthorizationPreviewV1,
  type ActionOutcomeV1,
  type ActionToolNameV1,
  type ActionTypeV1,
} from './action-runtime';
import {
  decodeActionAttributionV1,
  isRecordRefV1,
  type ActionAttributionV1,
} from './agent-attribution';
import {
  computeDigest,
  type DigestRef,
  type PartyRef,
  type RecordRef,
} from './trust-loop-primitives';

/** TC-05 additive contract. TaskProofV1 and its digest domain remain unchanged. */
export const ACTION_TRUST_HANDOFF_SCHEMA_VERSION = 1 as const;
export const ACTION_RECEIPT_DOMAIN_V1 = 'AGENTRIX_ACTION_RECEIPT_V1' as const;
export const ACTION_TRUST_HANDOFF_EVENT_TYPE_V1 = 'action.trust-handoff.v1' as const;

export const ACTION_CAPABILITY_CLASSES_V1 = [
  'read_only',
  'internal_side_effect',
  'external_side_effect',
] as const;
export type ActionCapabilityClassV1 = (typeof ACTION_CAPABILITY_CLASSES_V1)[number];

export interface ActionExecutionControlRequirementsV1 {
  journal: boolean;
  revocationFence: boolean;
  downstreamIdempotency: boolean;
  unknownOutcomeReconciliation: boolean;
}

export interface ActionCapabilityPolicyV1 {
  classification: ActionCapabilityClassV1;
  scope: string;
  zeroCost: boolean;
  classificationSource: 'static_allowlist-v1';
  requiredControls: ActionExecutionControlRequirementsV1;
}

const READ_ONLY_CONTROLS: ActionExecutionControlRequirementsV1 = {
  journal: false,
  revocationFence: false,
  downstreamIdempotency: false,
  unknownOutcomeReconciliation: false,
};

/**
 * Closed, server-owned capability matrix. The only currently executable tools
 * are read-only and zero-cost; unknown tools fail closed instead of inheriting
 * a permissive default.
 */
export const ACTION_TOOL_CAPABILITY_MATRIX_V1: Record<ActionToolNameV1, ActionCapabilityPolicyV1> = {
  'authority.inspect': {
    classification: 'read_only',
    scope: ACTION_TOOL_SCOPES_V1['authority.inspect'],
    zeroCost: true,
    classificationSource: 'static_allowlist-v1',
    requiredControls: READ_ONLY_CONTROLS,
  },
  'economy.discover': {
    classification: 'read_only',
    scope: ACTION_TOOL_SCOPES_V1['economy.discover'],
    zeroCost: true,
    classificationSource: 'static_allowlist-v1',
    requiredControls: READ_ONLY_CONTROLS,
  },
  // DRW: executed only by ActionRuntimeDeveloperRemoteService; the chat path rejects it.
  'developer.remote_execute': {
    classification: 'external_side_effect',
    scope: ACTION_TOOL_SCOPES_V1['developer.remote_execute'],
    zeroCost: true,
    classificationSource: 'static_allowlist-v1',
    requiredControls: {
      journal: true,
      revocationFence: true,
      downstreamIdempotency: true,
      unknownOutcomeReconciliation: true,
    },
  },
};

export interface ActionExecutionControlsV1 {
  journalRef: RecordRef | null;
  downstreamIdempotencyRef: RecordRef | null;
  fenceTokenRef: RecordRef | null;
  unknownOutcomeReconciliationRef: RecordRef | null;
}

export interface ActionResponsibilityLineageV1 {
  attribution: ActionAttributionV1;
  controllerRef: PartyRef;
  providerRef: PartyRef;
  executorRef: PartyRef;
  verifierRefs: PartyRef[];
  settlementAuthorityRefs: PartyRef[];
  remedyAuthorityRefs: PartyRef[];
  shellMode: 'none' | 'bound';
  /** Required, active and versioned when shellMode=bound; forbidden for none. */
  shellSessionRef?: RecordRef;
}

export interface ActionExecutionReceiptV1 {
  executionId: string;
  status: 'succeeded' | 'failed' | 'cancelled' | 'unknown-outcome';
  startedAt: string;
  completedAt: string | null;
  inputDigest: string;
  outputDigest: string | null;
  controls: ActionExecutionControlsV1;
}

export interface ActionOutcomeReceiptRefV1 {
  outcomeId: string;
  result: ActionOutcomeV1['result'];
  resultDigest: string;
  recordedAt: string;
}

export interface ActionProofRefsV1 {
  taskProofV1: RecordRef;
  taskProofV2: RecordRef;
  /** V1 compatibility metadata is derived, not covered by the V1 proof digest. */
  compatibilityAttributionCryptographicallyBound: false;
}

export interface ActionReceiptUnsignedV1 {
  schemaVersion: typeof ACTION_TRUST_HANDOFF_SCHEMA_VERSION;
  receiptDomain: typeof ACTION_RECEIPT_DOMAIN_V1;
  receiptId: string;
  actionId: string;
  taskId: string;
  soulCoreId: string;
  agentAccountId: string;
  ownerId: string;
  requestId: string;
  actionType: ActionTypeV1;
  toolName: ActionToolNameV1;
  intentDigest: string;
  /** Action lifecycle version at which the execution outcome was frozen. */
  outcomeVersion: number;
  capability: ActionCapabilityPolicyV1;
  authoritySnapshot: ActionAuthorizationPreviewV1;
  responsibility: ActionResponsibilityLineageV1;
  execution: ActionExecutionReceiptV1;
  outcome: ActionOutcomeReceiptRefV1;
  proofRefs: ActionProofRefsV1;
  environment: 'local' | 'test' | 'staging' | 'production' | 'unknown';
  recordedAt: string;
}

export interface TrustCoreActionReceiptV1 extends ActionReceiptUnsignedV1 {
  receiptDigest: DigestRef;
}

export interface ActionTrustHandoffEventV1 {
  schemaVersion: typeof ACTION_TRUST_HANDOFF_SCHEMA_VERSION;
  eventId: string;
  eventType: typeof ACTION_TRUST_HANDOFF_EVENT_TYPE_V1;
  eventVersion: 1;
  actionId: string;
  taskId: string;
  actionReceiptId: string;
  receiptDigest: DigestRef;
  receipt: TrustCoreActionReceiptV1;
  requestId: string;
  correlationId: string;
  causationId: string;
  occurredAt: string;
}

export interface ActionTrustContractValidationResultV1 {
  valid: boolean;
  errors: string[];
}

export class ActionTrustContractValidationError extends Error {
  readonly code = 'action_trust_contract_invalid';

  constructor(readonly errors: string[]) {
    super(`Action/Trust contract validation failed: ${errors.join('; ')}`);
    this.name = 'ActionTrustContractValidationError';
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isDigestRef(value: unknown): value is DigestRef {
  return (
    isObject(value) &&
    value.algorithm === 'sha-256' &&
    isNonEmptyString(value.canonicalization) &&
    typeof value.value === 'string' &&
    /^[0-9a-f]{64}$/.test(value.value)
  );
}

function isIsoInstant(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function partyRefValid(value: unknown, expectedKind?: PartyRef['kind']): value is PartyRef {
  return (
    isObject(value) &&
    isNonEmptyString(value.kind) &&
    isNonEmptyString(value.id) &&
    (expectedKind === undefined || value.kind === expectedKind)
  );
}

function refsEqual(left: RecordRef | undefined, right: RecordRef | undefined): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export function resolveActionCapabilityPolicyV1(toolName: string): ActionCapabilityPolicyV1 {
  if (!(ACTION_TOOL_NAMES_V1 as readonly string[]).includes(toolName)) {
    throw new ActionTrustContractValidationError([`toolName: unclassified tool ${JSON.stringify(toolName)}`]);
  }
  const policy = ACTION_TOOL_CAPABILITY_MATRIX_V1[toolName as ActionToolNameV1];
  return {
    ...policy,
    requiredControls: { ...policy.requiredControls },
  };
}

export function validateActionExecutionControlsV1(
  capability: ActionCapabilityPolicyV1,
  controls: ActionExecutionControlsV1,
): ActionTrustContractValidationResultV1 {
  const errors: string[] = [];
  const requirements: Array<[
    keyof ActionExecutionControlRequirementsV1,
    keyof ActionExecutionControlsV1,
  ]> = [
    ['journal', 'journalRef'],
    ['downstreamIdempotency', 'downstreamIdempotencyRef'],
    ['revocationFence', 'fenceTokenRef'],
    ['unknownOutcomeReconciliation', 'unknownOutcomeReconciliationRef'],
  ];
  for (const [requirement, refField] of requirements) {
    const ref = controls[refField];
    if (capability.requiredControls[requirement]) {
      if (!isRecordRefV1(ref)) errors.push(`execution.controls.${refField}: required known RecordRef`);
    } else if (ref !== null) {
      errors.push(`execution.controls.${refField}: must be null when control is not required`);
    }
  }
  if (
    capability.classification === 'external_side_effect' &&
    requirements.some(([requirement]) => capability.requiredControls[requirement] !== true)
  ) {
    errors.push('capability.requiredControls: external_side_effect requires every durable control');
  }
  return { valid: errors.length === 0, errors };
}

export function sealTrustCoreActionReceiptV1(input: ActionReceiptUnsignedV1): TrustCoreActionReceiptV1 {
  const receipt: TrustCoreActionReceiptV1 = {
    ...input,
    receiptDigest: computeDigest(input),
  };
  const validation = validateTrustCoreActionReceiptV1(receipt);
  if (!validation.valid) throw new ActionTrustContractValidationError(validation.errors);
  return receipt;
}

export function validateTrustCoreActionReceiptV1(input: unknown): ActionTrustContractValidationResultV1 {
  const errors: string[] = [];
  if (!isObject(input)) return { valid: false, errors: ['receipt: expected object'] };
  if (input.schemaVersion !== ACTION_TRUST_HANDOFF_SCHEMA_VERSION) {
    errors.push(`receipt.schemaVersion: unsupported version ${JSON.stringify(input.schemaVersion)}`);
  }
  if (input.receiptDomain !== ACTION_RECEIPT_DOMAIN_V1) errors.push('receipt.receiptDomain: unsupported domain');
  for (const key of [
    'receiptId',
    'actionId',
    'taskId',
    'soulCoreId',
    'agentAccountId',
    'ownerId',
    'requestId',
    'intentDigest',
  ] as const) {
    if (!isNonEmptyString(input[key])) errors.push(`receipt.${key}: expected non-empty string`);
  }
  if (input.actionId !== input.taskId) errors.push('receipt.actionId: current Action Runtime requires actionId=taskId');
  if (!Number.isInteger(input.outcomeVersion) || Number(input.outcomeVersion) < 1) {
    errors.push('receipt.outcomeVersion: expected positive integer');
  }
  if (!(ACTION_TOOL_NAMES_V1 as readonly unknown[]).includes(input.toolName)) {
    errors.push('receipt.toolName: unknown or unclassified tool');
  }
  if (!isIsoInstant(input.recordedAt)) errors.push('receipt.recordedAt: expected RFC3339 instant');
  if (!['local', 'test', 'staging', 'production', 'unknown'].includes(String(input.environment))) {
    errors.push('receipt.environment: unknown value');
  }

  const capability = isObject(input.capability) ? input.capability : undefined;
  if (!capability) {
    errors.push('receipt.capability: expected object');
  } else if ((ACTION_TOOL_NAMES_V1 as readonly unknown[]).includes(input.toolName)) {
    const expected = resolveActionCapabilityPolicyV1(String(input.toolName));
    if (JSON.stringify(capability) !== JSON.stringify(expected)) {
      errors.push('receipt.capability: does not match the closed server capability matrix');
    }
  }

  const authority = isObject(input.authoritySnapshot) ? input.authoritySnapshot : undefined;
  if (!authority) {
    errors.push('receipt.authoritySnapshot: expected object');
  } else {
    if (authority.schemaVersion !== ACTION_RUNTIME_SCHEMA_VERSION) errors.push('receipt.authoritySnapshot.schemaVersion: unsupported');
    if (authority.decision !== 'approved') errors.push('receipt.authoritySnapshot.decision: execution requires approved');
    if (authority.taskId !== input.taskId) errors.push('receipt.authoritySnapshot.taskId: mismatch');
    if (authority.soulCoreId !== input.soulCoreId) errors.push('receipt.authoritySnapshot.soulCoreId: mismatch');
    if (!isIsoInstant(authority.decidedAt)) errors.push('receipt.authoritySnapshot.decidedAt: missing');
    if (!isNonEmptyString(authority.decidedBy)) errors.push('receipt.authoritySnapshot.decidedBy: missing');
  }

  const responsibility = isObject(input.responsibility) ? input.responsibility : undefined;
  let attribution: ActionAttributionV1 | undefined;
  if (!responsibility) {
    errors.push('receipt.responsibility: expected object');
  } else {
    try {
      attribution = decodeActionAttributionV1(responsibility.attribution, {
        directAuthorityRootRef: { kind: 'soul_core', soulCoreId: String(input.soulCoreId ?? '') },
      });
    } catch (error) {
      errors.push(`receipt.responsibility.attribution: ${(error as Error).message}`);
    }
    if (!partyRefValid(responsibility.controllerRef, 'principal')) errors.push('receipt.responsibility.controllerRef: invalid principal');
    if (!partyRefValid(responsibility.providerRef, 'provider')) errors.push('receipt.responsibility.providerRef: invalid provider');
    if (!partyRefValid(responsibility.executorRef, 'executor')) errors.push('receipt.responsibility.executorRef: invalid executor');
    for (const field of ['verifierRefs', 'settlementAuthorityRefs', 'remedyAuthorityRefs'] as const) {
      if (!Array.isArray(responsibility[field]) || !responsibility[field].every((entry) => partyRefValid(entry))) {
        errors.push(`receipt.responsibility.${field}: expected PartyRef array`);
      }
    }
    if (responsibility.shellMode === 'none') {
      if (responsibility.shellSessionRef !== undefined) errors.push('receipt.responsibility.shellSessionRef: forbidden for shellMode=none');
      if (attribution?.shellSessionRef !== undefined) errors.push('receipt.responsibility.shellMode: attribution is Shell-bound');
    } else if (responsibility.shellMode === 'bound') {
      if (
        !isRecordRefV1(responsibility.shellSessionRef) ||
        responsibility.shellSessionRef.type !== 'shell_session_binding' ||
        !Number.isInteger(responsibility.shellSessionRef.version) ||
        Number(responsibility.shellSessionRef.version) < 1
      ) {
        errors.push('receipt.responsibility.shellSessionRef: active versioned Shell binding ref required');
      }
      if (!refsEqual(attribution?.shellSessionRef, responsibility.shellSessionRef as RecordRef | undefined)) {
        errors.push('receipt.responsibility.shellSessionRef: attribution mismatch');
      }
    } else {
      errors.push('receipt.responsibility.shellMode: unknown value');
    }
    if (attribution && !refsEqual(attribution.runtimeRef, { type: 'runtime', id: responsibility.executorRef && isObject(responsibility.executorRef) ? String(responsibility.executorRef.id) : '' , version: 1 })) {
      errors.push('receipt.responsibility.executorRef: must identify the attributed runtime executor');
    }
  }

  const execution = isObject(input.execution) ? input.execution : undefined;
  if (!execution) {
    errors.push('receipt.execution: expected object');
  } else {
    if (!isNonEmptyString(execution.executionId)) errors.push('receipt.execution.executionId: missing');
    if (!['succeeded', 'failed', 'cancelled', 'unknown-outcome'].includes(String(execution.status))) {
      errors.push('receipt.execution.status: unknown value');
    }
    if (!isIsoInstant(execution.startedAt)) errors.push('receipt.execution.startedAt: invalid');
    if (execution.completedAt !== null && !isIsoInstant(execution.completedAt)) errors.push('receipt.execution.completedAt: invalid');
    if (execution.status === 'unknown-outcome' && execution.completedAt !== null) errors.push('receipt.execution.completedAt: unknown-outcome cannot claim completion');
    if (!isNonEmptyString(execution.inputDigest)) errors.push('receipt.execution.inputDigest: missing');
    if (execution.outputDigest !== null && !isNonEmptyString(execution.outputDigest)) errors.push('receipt.execution.outputDigest: invalid');
    if (!isObject(execution.controls)) {
      errors.push('receipt.execution.controls: expected object');
    } else if (capability) {
      errors.push(...validateActionExecutionControlsV1(capability as unknown as ActionCapabilityPolicyV1, execution.controls as unknown as ActionExecutionControlsV1).errors);
    }
  }

  const outcome = isObject(input.outcome) ? input.outcome : undefined;
  if (!outcome) errors.push('receipt.outcome: expected object');
  else {
    if (!isNonEmptyString(outcome.outcomeId)) errors.push('receipt.outcome.outcomeId: missing');
    if (!['success', 'partial', 'failure', 'cancelled'].includes(String(outcome.result))) errors.push('receipt.outcome.result: unknown');
    if (!isNonEmptyString(outcome.resultDigest)) errors.push('receipt.outcome.resultDigest: missing');
    if (!isIsoInstant(outcome.recordedAt)) errors.push('receipt.outcome.recordedAt: invalid');
  }

  const proofRefs = isObject(input.proofRefs) ? input.proofRefs : undefined;
  if (!proofRefs) errors.push('receipt.proofRefs: expected object');
  else {
    for (const field of ['taskProofV1', 'taskProofV2'] as const) {
      const ref = proofRefs[field];
      if (!isRecordRefV1(ref) || ref.type !== 'task_proof' || !isDigestRef(ref.digest)) {
        errors.push(`receipt.proofRefs.${field}: digest-bound task_proof ref required`);
      }
    }
    if (proofRefs.compatibilityAttributionCryptographicallyBound !== false) {
      errors.push('receipt.proofRefs.compatibilityAttributionCryptographicallyBound: must be false');
    }
  }

  if (!isDigestRef(input.receiptDigest)) {
    errors.push('receipt.receiptDigest: invalid');
  } else {
    const { receiptDigest: _ignored, ...unsigned } = input;
    if (computeDigest(unsigned).value !== input.receiptDigest.value || input.receiptDigest.canonicalization !== 'jcs/1') {
      errors.push('receipt.receiptDigest: mismatch');
    }
  }
  return { valid: errors.length === 0, errors };
}

export function decodeTrustCoreActionReceiptV1(input: unknown): TrustCoreActionReceiptV1 {
  const validation = validateTrustCoreActionReceiptV1(input);
  if (!validation.valid) throw new ActionTrustContractValidationError(validation.errors);
  return input as TrustCoreActionReceiptV1;
}

export function validateActionTrustHandoffEventV1(input: unknown): ActionTrustContractValidationResultV1 {
  const errors: string[] = [];
  if (!isObject(input)) return { valid: false, errors: ['handoff: expected object'] };
  if (input.schemaVersion !== ACTION_TRUST_HANDOFF_SCHEMA_VERSION) errors.push('handoff.schemaVersion: unsupported');
  if (input.eventType !== ACTION_TRUST_HANDOFF_EVENT_TYPE_V1 || input.eventVersion !== 1) errors.push('handoff.eventType: unsupported');
  for (const key of ['eventId', 'actionId', 'taskId', 'actionReceiptId', 'requestId', 'correlationId', 'causationId'] as const) {
    if (!isNonEmptyString(input[key])) errors.push(`handoff.${key}: expected non-empty string`);
  }
  if (!isIsoInstant(input.occurredAt)) errors.push('handoff.occurredAt: expected RFC3339 instant');
  const receiptValidation = validateTrustCoreActionReceiptV1(input.receipt);
  errors.push(...receiptValidation.errors.map((error) => `handoff.${error}`));
  if (isObject(input.receipt)) {
    if (input.receipt.receiptId !== input.actionReceiptId) errors.push('handoff.actionReceiptId: receipt mismatch');
    if (input.receipt.actionId !== input.actionId || input.receipt.taskId !== input.taskId) errors.push('handoff.action/task: receipt mismatch');
    if (!isDigestRef(input.receiptDigest) || JSON.stringify(input.receipt.receiptDigest) !== JSON.stringify(input.receiptDigest)) {
      errors.push('handoff.receiptDigest: receipt mismatch');
    }
  }
  return { valid: errors.length === 0, errors };
}

export function decodeActionTrustHandoffEventV1(input: unknown): ActionTrustHandoffEventV1 {
  const validation = validateActionTrustHandoffEventV1(input);
  if (!validation.valid) throw new ActionTrustContractValidationError(validation.errors);
  return input as ActionTrustHandoffEventV1;
}
