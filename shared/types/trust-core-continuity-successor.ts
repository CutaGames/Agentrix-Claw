import type {
  TrustCoreChallengeTerminalReceiptV1,
  TrustCoreContinuityReasonCodeV1,
  TrustCoreEvidenceEnvironmentV1,
} from './trust-core-continuity-exit';
import type { RecordRef } from './trust-loop-primitives';

export interface TrustCoreSuccessorBindingCommandV1 {
  schemaVersion: 1;
  agentId: string;
  agentAccountId: string;
  ownerUserId: string;
  tenantId: string;
  environment: TrustCoreEvidenceEnvironmentV1;
  expectedOwnershipEpoch: string;
  predecessorBindingRef: RecordRef;
  predecessorAuthorityGrantRef: string;
  successorAuthorityGrantRef: string;
  successorRuntimeRef: RecordRef;
  successorShell: string;
  successorShellId: string;
  successorDeviceId?: string;
  successorSignerRef?: string;
  capabilities: { wallet: boolean };
  ttlSeconds?: number;
  idempotencyKey: string;
}

export interface TrustCoreSuccessorBindingLineageV1
  extends Record<string, unknown> {
  predecessor: {
    runtimeRef: RecordRef;
    authorityGrantRef: string;
    shellBindingRef: RecordRef;
  };
  successor: {
    runtimeRef: RecordRef;
    authorityGrantRef: string;
    shellBindingRef: RecordRef;
  };
  shellSupersedeReceiptRef: string;
  newAuthorizationRequired: true;
  transferredMaterial: {
    signerSecret: false;
    sessionMaterial: false;
    deviceCredentials: false;
  };
}

export interface TrustCoreSuccessorBindingReceiptV1
  extends TrustCoreChallengeTerminalReceiptV1 {
  operationKind: 'successor_binding';
  resultSnapshot: TrustCoreSuccessorBindingLineageV1;
}

export type TrustCoreSuccessorBindingResultV1 =
  | {
      status: 'bound';
      lineage: TrustCoreSuccessorBindingLineageV1;
      receipt: TrustCoreSuccessorBindingReceiptV1;
    }
  | {
      status: 'denied' | 'conflict' | 'unavailable';
      reasonCode: TrustCoreContinuityReasonCodeV1;
      receipt: TrustCoreChallengeTerminalReceiptV1;
    }
  | {
      status: 'unknown';
      reasonCode:
        | 'challenge_in_progress'
        | 'challenge_unknown_outcome'
        | 'successor_binding_unknown_outcome';
      journalRef: string;
      requestDigest: string;
    };

export interface TrustCoreSuccessorContractValidationResultV1 {
  valid: boolean;
  errors: string[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECIMAL = /^(0|[1-9][0-9]*)$/;
const OPAQUE = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,159}$/;
const IDEMPOTENCY = /^[A-Za-z0-9][A-Za-z0-9:._/-]{7,159}$/;

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function recordRef(
  value: unknown,
  expectedType: 'runtime' | 'shell_session_binding',
): boolean {
  return (
    object(value) &&
    exact(value, ['type', 'id', 'version']) &&
    value.type === expectedType &&
    typeof value.id === 'string' &&
    OPAQUE.test(value.id) &&
    Number.isInteger(value.version) &&
    Number(value.version) > 0
  );
}

export function validateTrustCoreSuccessorBindingCommandV1(
  value: unknown,
): TrustCoreSuccessorContractValidationResultV1 {
  const errors: string[] = [];
  if (!object(value)) return { valid: false, errors: ['command must be an object'] };
  if (
    !exact(value, [
      'schemaVersion',
      'agentId',
      'agentAccountId',
      'ownerUserId',
      'tenantId',
      'environment',
      'expectedOwnershipEpoch',
      'predecessorBindingRef',
      'predecessorAuthorityGrantRef',
      'successorAuthorityGrantRef',
      'successorRuntimeRef',
      'successorShell',
      'successorShellId',
      'successorDeviceId',
      'successorSignerRef',
      'capabilities',
      'ttlSeconds',
      'idempotencyKey',
    ])
  ) {
    errors.push('command contains unknown fields');
  }
  if (value.schemaVersion !== 1) errors.push('schemaVersion is unsupported');
  for (const key of ['agentId', 'tenantId', 'successorShell', 'successorShellId'] as const) {
    if (typeof value[key] !== 'string' || !OPAQUE.test(value[key] as string)) {
      errors.push(`${key} is invalid`);
    }
  }
  for (const key of ['agentAccountId', 'ownerUserId'] as const) {
    if (typeof value[key] !== 'string' || !UUID.test(value[key] as string)) {
      errors.push(`${key} must be a UUID`);
    }
  }
  if (!['local', 'test', 'staging', 'production'].includes(String(value.environment))) {
    errors.push('environment is unsupported');
  }
  if (
    typeof value.expectedOwnershipEpoch !== 'string' ||
    !DECIMAL.test(value.expectedOwnershipEpoch)
  ) {
    errors.push('expectedOwnershipEpoch must be a decimal string');
  }
  if (!recordRef(value.predecessorBindingRef, 'shell_session_binding')) {
    errors.push('predecessorBindingRef is invalid');
  }
  if (!recordRef(value.successorRuntimeRef, 'runtime')) {
    errors.push('successorRuntimeRef is invalid');
  }
  for (const key of [
    'predecessorAuthorityGrantRef',
    'successorAuthorityGrantRef',
  ] as const) {
    if (typeof value[key] !== 'string' || !OPAQUE.test(value[key] as string)) {
      errors.push(`${key} is invalid`);
    }
  }
  if (
    value.predecessorAuthorityGrantRef === value.successorAuthorityGrantRef
  ) {
    errors.push('successor Authority grant must be distinct');
  }
  if (
    !object(value.capabilities) ||
    !exact(value.capabilities, ['wallet']) ||
    typeof value.capabilities.wallet !== 'boolean'
  ) {
    errors.push('capabilities must contain only wallet:boolean');
  }
  for (const key of ['successorDeviceId', 'successorSignerRef'] as const) {
    if (value[key] !== undefined && (typeof value[key] !== 'string' || !OPAQUE.test(value[key] as string))) {
      errors.push(`${key} is invalid when present`);
    }
  }
  if (
    object(value.capabilities) &&
    value.capabilities.wallet === true &&
    (value.successorDeviceId === undefined || value.successorSignerRef === undefined)
  ) {
    errors.push('wallet capability requires a new Device/signer authorization');
  }
  if (
    value.ttlSeconds !== undefined &&
    (!Number.isInteger(value.ttlSeconds) ||
      Number(value.ttlSeconds) < 60 ||
      Number(value.ttlSeconds) > 86_400)
  ) {
    errors.push('ttlSeconds must be an integer between 60 and 86400');
  }
  if (typeof value.idempotencyKey !== 'string' || !IDEMPOTENCY.test(value.idempotencyKey)) {
    errors.push('idempotencyKey is malformed');
  }
  return { valid: errors.length === 0, errors };
}
