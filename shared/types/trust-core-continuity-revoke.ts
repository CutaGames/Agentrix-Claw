import type {
  TrustCoreChallengeTerminalReceiptV1,
  TrustCoreContinuityReasonCodeV1,
  TrustCoreEvidenceEnvironmentV1,
} from './trust-core-continuity-exit';
import type {
  TrustCoreCombinedRevocationReceiptV1,
  TrustCoreRuntimeExitSelectorV1,
  TrustCoreWriterReceiptEvidenceV1,
} from './trust-core-revocation';
import type { DigestRef, RecordRef } from './trust-loop-primitives';

/** Trust-owned TCR-CE-04 command. Targets are always derived server-side. */
export interface TrustCoreApplicableSetRevokeCommandV1 {
  schemaVersion: 1;
  agentId: string;
  agentAccountId: string;
  ownerUserId: string;
  tenantId: string;
  tenantRef: RecordRef;
  environment: TrustCoreEvidenceEnvironmentV1;
  expectedOwnershipEpoch: string;
  predecessorRuntimeRef: RecordRef;
  idempotencyKey: string;
}

export interface TrustCoreApplicableSetRevokeSnapshotV1
  extends Record<string, unknown> {
  operationId: string;
  selector: TrustCoreRuntimeExitSelectorV1;
  applicableSetDigest: DigestRef;
  targetReceipts: TrustCoreWriterReceiptEvidenceV1[];
  combinedReceipt: TrustCoreCombinedRevocationReceiptV1;
  combinedReceiptDigest: DigestRef;
}

export interface TrustCoreApplicableSetRevokeReceiptV1
  extends TrustCoreChallengeTerminalReceiptV1 {
  operationKind: 'applicable_set_revoke';
  resultSnapshot: TrustCoreApplicableSetRevokeSnapshotV1;
}

export type TrustCoreApplicableSetRevokeResultV1 =
  | {
      status: 'revoked';
      outcome: TrustCoreApplicableSetRevokeSnapshotV1;
      receipt: TrustCoreApplicableSetRevokeReceiptV1;
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
        | 'revocation_outcome_unknown';
      journalRef: string;
      requestDigest: string;
    };

export interface TrustCoreApplicableSetRevokeValidationResultV1 {
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
  expectedType: 'tenant' | 'runtime',
  requireVersion: boolean,
): value is RecordRef {
  return (
    object(value) &&
    exact(value, ['type', 'id', 'version']) &&
    value.type === expectedType &&
    typeof value.id === 'string' &&
    OPAQUE.test(value.id) &&
    (value.version === undefined ||
      (Number.isInteger(value.version) && Number(value.version) > 0)) &&
    (!requireVersion || value.version !== undefined)
  );
}

export function validateTrustCoreApplicableSetRevokeCommandV1(
  value: unknown,
): TrustCoreApplicableSetRevokeValidationResultV1 {
  const errors: string[] = [];
  if (!object(value)) return { valid: false, errors: ['command must be an object'] };
  if (
    !exact(value, [
      'schemaVersion',
      'agentId',
      'agentAccountId',
      'ownerUserId',
      'tenantId',
      'tenantRef',
      'environment',
      'expectedOwnershipEpoch',
      'predecessorRuntimeRef',
      'idempotencyKey',
    ])
  ) {
    errors.push('command contains unknown fields');
  }
  if (value.schemaVersion !== 1) errors.push('schemaVersion is unsupported');
  for (const key of ['agentId', 'tenantId'] as const) {
    if (typeof value[key] !== 'string' || !OPAQUE.test(value[key] as string)) {
      errors.push(`${key} is invalid`);
    }
  }
  for (const key of ['agentAccountId', 'ownerUserId'] as const) {
    if (typeof value[key] !== 'string' || !UUID.test(value[key] as string)) {
      errors.push(`${key} must be a UUID`);
    }
  }
  if (!recordRef(value.tenantRef, 'tenant', false)) {
    errors.push('tenantRef is invalid');
  } else if (value.tenantRef.id !== value.tenantId) {
    errors.push('tenantRef must exactly identify tenantId');
  }
  if (!recordRef(value.predecessorRuntimeRef, 'runtime', true)) {
    errors.push('predecessorRuntimeRef is invalid');
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
  if (typeof value.idempotencyKey !== 'string' || !IDEMPOTENCY.test(value.idempotencyKey)) {
    errors.push('idempotencyKey is malformed');
  }
  return { valid: errors.length === 0, errors };
}
