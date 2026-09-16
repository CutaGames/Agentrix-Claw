import {
  validateDeviceEpochFenceV1,
  type DeviceEpochFenceV1,
  type DeviceLifecycleReceiptV1,
} from './device-lifecycle';
import type {
  ShellBindingFenceCompanionV1,
  ShellBindingRevocationReceiptV1,
} from './shell-revocation-journal';
import { computeDigest, type DigestRef, type RecordRef } from './trust-loop-primitives';

export const TRUST_CORE_REVOCATION_SCHEMA_VERSION = 1 as const;
export const TRUST_CORE_APPLICABLE_SET_POLICY_V1 =
  'agentrix.trust-core.revocation.applicable-set.v1' as const;

export const TRUST_CORE_REVOCATION_OPERATION_TYPES_V1 = [
  'relationship_revoke',
  'authority_revoke',
  'device_lost',
  'device_stolen',
  'ownership_transfer',
  'ownership_recovery',
  'continuity_exit',
] as const;
export type TrustCoreRevocationOperationTypeV1 =
  (typeof TRUST_CORE_REVOCATION_OPERATION_TYPES_V1)[number];

export interface TrustCoreRuntimeExitSelectorV1 {
  kind: 'runtime_exit';
  tenantRef: RecordRef;
  runtimeRef: RecordRef;
}

export type TrustCoreRevocationSelectorV1 = TrustCoreRuntimeExitSelectorV1;

export const TRUST_CORE_REVOCATION_TARGET_KINDS_V1 = [
  'shell_binding',
  'device',
  'authority_grant',
  'ownership_control',
] as const;
export type TrustCoreRevocationTargetKindV1 =
  (typeof TRUST_CORE_REVOCATION_TARGET_KINDS_V1)[number];

export const TRUST_CORE_REVOCATION_WRITERS_V1 = [
  'soul_shell_binding_v1',
  'device_registry_lifecycle_v1',
  'authority_grant_command_v1',
  'agent_account_ownership_v1',
] as const;
export type TrustCoreRevocationWriterV1 =
  (typeof TRUST_CORE_REVOCATION_WRITERS_V1)[number];

export const TRUST_CORE_REVOCATION_EPOCH_KINDS_V1 = [
  'binding_revocation',
  'binding_optimistic',
  'device_revocation',
  'credential_revocation',
  'device_optimistic',
  'credential_version',
  'grant_revocation',
  'grant_optimistic',
  'ownership_control',
] as const;
export type TrustCoreRevocationEpochKindV1 =
  (typeof TRUST_CORE_REVOCATION_EPOCH_KINDS_V1)[number];

export type TrustCoreRevocationTargetRefV1 =
  | { kind: 'shell_binding'; bindingRef: RecordRef }
  | { kind: 'device'; deviceId: string }
  | { kind: 'authority_grant'; grantRef: string }
  | { kind: 'ownership_control'; agentAccountId: string };

export const AUTHORITY_GRANT_REVOCATION_SCHEMA_VERSION = 1 as const;

export interface AuthorityGrantRevocationTargetV1 {
  kind: 'authority_grant';
  grantRef: string;
  agentAccountId: string;
}

/** Canonical Authority-owned fence captured before coordinator execution. */
export interface AuthorityGrantRevocationFenceV1 {
  schemaVersion: typeof AUTHORITY_GRANT_REVOCATION_SCHEMA_VERSION;
  target: AuthorityGrantRevocationTargetV1;
  grantRevocationEpoch: string;
  grantOptimisticVersion: string;
  capturedAt: string;
}

export interface AuthorityGrantRevokeCommandV1 {
  schemaVersion: typeof AUTHORITY_GRANT_REVOCATION_SCHEMA_VERSION;
  requestId: string;
  expectedFence: AuthorityGrantRevocationFenceV1;
  reasonCode: string;
}

/** Durable result emitted only by AuthorityGrantCommandService. */
export interface AuthorityGrantRevocationReceiptV1 {
  schemaVersion: typeof AUTHORITY_GRANT_REVOCATION_SCHEMA_VERSION;
  receiptId: string;
  operation: 'revoke';
  target: AuthorityGrantRevocationTargetV1;
  requestId: string;
  requestDigest: string;
  reasonCode: string;
  preFence: AuthorityGrantRevocationFenceV1;
  postFence: AuthorityGrantRevocationFenceV1;
  status: 'revoked';
  state: 'state_and_outbox_reserved';
  acceptedAt: string;
}

/**
 * The caller supplies typed candidate refs only. Mandatory/applicable status,
 * writer identity and every epoch/version are resolved server-side and frozen
 * before execution; clients cannot attest those facts.
 */
export interface TrustCoreRevocationStartCommandV1 {
  schemaVersion: typeof TRUST_CORE_REVOCATION_SCHEMA_VERSION;
  idempotencyKey: string;
  operationType: TrustCoreRevocationOperationTypeV1;
  agentAccountId: string;
  reasonCode: string;
  selector?: TrustCoreRevocationSelectorV1;
  targets: TrustCoreRevocationTargetRefV1[];
}

export interface TrustCoreRevocationEpochV1 {
  kind: TrustCoreRevocationEpochKindV1;
  value: string;
}

export interface TrustCoreFrozenRevocationTargetV1 {
  targetKey: string;
  ordinal: number;
  target: TrustCoreRevocationTargetRefV1;
  mandatory: true;
  writer: TrustCoreRevocationWriterV1;
  preEpochs: TrustCoreRevocationEpochV1[];
  expectedVersion: string;
  sourceFenceSnapshot:
    | DeviceEpochFenceV1
    | ShellBindingFenceCompanionV1
    | AuthorityGrantRevocationFenceV1;
  sourceFenceDigest: DigestRef;
  offlinePolicy:
    | 'not_applicable'
    | 'next_protected_ingress_must_refresh_epoch'
    | 'next_protected_ingress_must_reject';
}

export interface TrustCoreFrozenApplicableSetV1 {
  schemaVersion: typeof TRUST_CORE_REVOCATION_SCHEMA_VERSION;
  policyVersion: typeof TRUST_CORE_APPLICABLE_SET_POLICY_V1;
  operationType: TrustCoreRevocationOperationTypeV1;
  selector?: TrustCoreRevocationSelectorV1;
  targets: TrustCoreFrozenRevocationTargetV1[];
  frozenAt: string;
  digest: DigestRef;
}

export type TrustCoreWriterReceiptSnapshotV1 =
  | DeviceLifecycleReceiptV1
  | ShellBindingRevocationReceiptV1
  | AuthorityGrantRevocationReceiptV1;

export interface TrustCoreWriterReceiptEvidenceV1 {
  receiptType:
    | 'device_lifecycle_v1'
    | 'shell_binding_revocation_v1'
    | 'authority_grant_revocation_v1';
  receiptRef: string;
  receiptDigest: DigestRef;
  acceptedAt: string;
  snapshot: TrustCoreWriterReceiptSnapshotV1;
}

export interface TrustCoreRevocationDrainFenceV1 {
  state:
    | 'writer_state_and_outbox_reserved'
    | 'reservations_drained'
    | 'downstream_fence_confirmed'
    | 'unknown';
  fenceRef?: string;
  confirmedAt?: string;
}

export interface TrustCoreRevocationConvergenceV1 {
  durable: 'pending' | 'accepted' | 'failed' | 'unknown';
  online: 'not_applicable' | 'pending' | 'enforced' | 'unknown';
  offline:
    | 'not_applicable'
    | 'pending'
    | 'next_ingress_fenced'
    | 'unknown';
  fullyConvergedAt?: string;
}

export interface TrustCoreRevocationTargetResultV1 {
  targetKey: string;
  ordinal: number;
  target: TrustCoreRevocationTargetRefV1;
  mandatory: true;
  writer: TrustCoreRevocationWriterV1;
  state: 'pending' | 'executing' | 'durable_accepted' | 'failed' | 'unknown';
  preEpochs: TrustCoreRevocationEpochV1[];
  postEpochs?: TrustCoreRevocationEpochV1[];
  writerReceipt?: TrustCoreWriterReceiptEvidenceV1;
  drainFence: TrustCoreRevocationDrainFenceV1;
  convergence: TrustCoreRevocationConvergenceV1;
  failureCode?: string;
  updatedAt: string;
}

export interface TrustCoreCombinedRevocationReceiptV1 {
  schemaVersion: typeof TRUST_CORE_REVOCATION_SCHEMA_VERSION;
  receiptDomain: 'AGENTRIX_TRUST_CORE_COMBINED_REVOCATION_V1';
  receiptId: string;
  operationId: string;
  operationType: TrustCoreRevocationOperationTypeV1;
  agentAccountId: string;
  reasonCode: string;
  applicableSetDigest: DigestRef;
  targets: TrustCoreRevocationTargetResultV1[];
  convergenceCapability: 'durable_only';
  overallState:
    | 'pending'
    | 'partial'
    | 'durable_accepted'
    | 'failed'
    | 'unknown';
  allMandatoryDurableAccepted: boolean;
  allMandatoryFullyConverged: boolean;
  acceptedAt?: string;
  fullyConvergedAt?: string;
  recordedAt: string;
  receiptDigest: DigestRef;
}

export interface TrustCoreRevocationValidationResultV1 {
  valid: boolean;
  errors: string[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const REASON = /^[a-z][a-z0-9_]{1,79}$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;
const HEX64 = /^[0-9a-f]{64}$/;

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function strict(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function timestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

function validateRecordRef(value: unknown): boolean {
  return (
    object(value) &&
    strict(value, ['type', 'id', 'version']) &&
    typeof value.type === 'string' &&
    OPAQUE.test(value.type) &&
    typeof value.id === 'string' &&
    OPAQUE.test(value.id) &&
    Number.isInteger(value.version) &&
    Number(value.version) > 0
  );
}

function validateSelectorRecordRef(
  value: unknown,
  expectedType: 'tenant' | 'runtime',
  requireVersion: boolean,
): boolean {
  return (
    object(value) &&
    strict(value, ['type', 'id', 'version']) &&
    value.type === expectedType &&
    typeof value.id === 'string' &&
    OPAQUE.test(value.id) &&
    (value.version === undefined ||
      (Number.isInteger(value.version) && Number(value.version) > 0)) &&
    (!requireVersion || value.version !== undefined)
  );
}

export function validateTrustCoreRuntimeExitSelectorV1(
  value: unknown,
): TrustCoreRevocationValidationResultV1 {
  const errors: string[] = [];
  if (!object(value)) return { valid: false, errors: ['selector must be an object'] };
  if (!strict(value, ['kind', 'tenantRef', 'runtimeRef'])) {
    errors.push('selector contains unknown fields');
  }
  if (value.kind !== 'runtime_exit') errors.push('selector kind is invalid');
  if (!validateSelectorRecordRef(value.tenantRef, 'tenant', false)) {
    errors.push('selector tenantRef is invalid');
  }
  if (!validateSelectorRecordRef(value.runtimeRef, 'runtime', true)) {
    errors.push('selector runtimeRef is invalid');
  }
  return { valid: errors.length === 0, errors };
}

function validateDigest(value: unknown): boolean {
  return (
    object(value) &&
    strict(value, ['algorithm', 'canonicalization', 'value']) &&
    value.algorithm === 'sha-256' &&
    typeof value.canonicalization === 'string' &&
    typeof value.value === 'string' &&
    HEX64.test(value.value)
  );
}

function validateAuthorityGrantRevocationTargetV1(value: unknown): boolean {
  return (
    object(value) &&
    strict(value, ['kind', 'grantRef', 'agentAccountId']) &&
    value.kind === 'authority_grant' &&
    typeof value.grantRef === 'string' &&
    OPAQUE.test(value.grantRef) &&
    typeof value.agentAccountId === 'string' &&
    UUID.test(value.agentAccountId)
  );
}

export function validateAuthorityGrantRevocationFenceV1(
  value: unknown,
): TrustCoreRevocationValidationResultV1 {
  const errors: string[] = [];
  if (!object(value)) return { valid: false, errors: ['fence must be an object'] };
  if (
    !strict(value, [
      'schemaVersion',
      'target',
      'grantRevocationEpoch',
      'grantOptimisticVersion',
      'capturedAt',
    ])
  ) {
    errors.push('fence contains unknown fields');
  }
  if (value.schemaVersion !== AUTHORITY_GRANT_REVOCATION_SCHEMA_VERSION) {
    errors.push('unsupported fence schemaVersion');
  }
  if (!validateAuthorityGrantRevocationTargetV1(value.target)) {
    errors.push('fence target is invalid');
  }
  for (const field of ['grantRevocationEpoch', 'grantOptimisticVersion'] as const) {
    if (typeof value[field] !== 'string' || !DECIMAL.test(value[field] as string)) {
      errors.push(`${field} must be a canonical decimal string`);
    }
  }
  if (!timestamp(value.capturedAt)) errors.push('capturedAt is invalid');
  return { valid: errors.length === 0, errors };
}

export function validateAuthorityGrantRevokeCommandV1(
  value: unknown,
): TrustCoreRevocationValidationResultV1 {
  const errors: string[] = [];
  if (!object(value)) return { valid: false, errors: ['command must be an object'] };
  if (!strict(value, ['schemaVersion', 'requestId', 'expectedFence', 'reasonCode'])) {
    errors.push('command contains unknown fields');
  }
  if (value.schemaVersion !== AUTHORITY_GRANT_REVOCATION_SCHEMA_VERSION) {
    errors.push('unsupported command schemaVersion');
  }
  if (typeof value.requestId !== 'string' || !OPAQUE.test(value.requestId)) {
    errors.push('requestId is invalid');
  }
  if (typeof value.reasonCode !== 'string' || !REASON.test(value.reasonCode)) {
    errors.push('reasonCode is invalid');
  }
  errors.push(...validateAuthorityGrantRevocationFenceV1(value.expectedFence).errors);
  return { valid: errors.length === 0, errors };
}

export function validateAuthorityGrantRevocationReceiptV1(
  value: unknown,
): TrustCoreRevocationValidationResultV1 {
  const errors: string[] = [];
  if (!object(value)) return { valid: false, errors: ['receipt must be an object'] };
  if (
    !strict(value, [
      'schemaVersion',
      'receiptId',
      'operation',
      'target',
      'requestId',
      'requestDigest',
      'reasonCode',
      'preFence',
      'postFence',
      'status',
      'state',
      'acceptedAt',
    ])
  ) {
    errors.push('receipt contains unknown fields');
  }
  if (value.schemaVersion !== AUTHORITY_GRANT_REVOCATION_SCHEMA_VERSION) {
    errors.push('unsupported receipt schemaVersion');
  }
  if (typeof value.receiptId !== 'string' || !UUID.test(value.receiptId)) {
    errors.push('receiptId is invalid');
  }
  if (value.operation !== 'revoke') errors.push('operation is invalid');
  if (!validateAuthorityGrantRevocationTargetV1(value.target)) {
    errors.push('receipt target is invalid');
  }
  if (typeof value.requestId !== 'string' || !OPAQUE.test(value.requestId)) {
    errors.push('requestId is invalid');
  }
  if (typeof value.requestDigest !== 'string' || !HEX64.test(value.requestDigest)) {
    errors.push('requestDigest is invalid');
  }
  if (typeof value.reasonCode !== 'string' || !REASON.test(value.reasonCode)) {
    errors.push('reasonCode is invalid');
  }
  const pre = validateAuthorityGrantRevocationFenceV1(value.preFence);
  const post = validateAuthorityGrantRevocationFenceV1(value.postFence);
  errors.push(...pre.errors.map((error) => `preFence.${error}`));
  errors.push(...post.errors.map((error) => `postFence.${error}`));
  if (value.status !== 'revoked') errors.push('status is invalid');
  if (value.state !== 'state_and_outbox_reserved') errors.push('state is invalid');
  if (!timestamp(value.acceptedAt)) errors.push('acceptedAt is invalid');
  if (
    pre.valid &&
    post.valid &&
    validateAuthorityGrantRevocationTargetV1(value.target)
  ) {
    const receiptTarget =
      value.target as unknown as AuthorityGrantRevocationTargetV1;
    const preFence = value.preFence as unknown as AuthorityGrantRevocationFenceV1;
    const postFence = value.postFence as unknown as AuthorityGrantRevocationFenceV1;
    if (
      receiptTarget.kind !== preFence.target.kind ||
      receiptTarget.kind !== postFence.target.kind ||
      receiptTarget.grantRef !== preFence.target.grantRef ||
      receiptTarget.grantRef !== postFence.target.grantRef ||
      receiptTarget.agentAccountId !== preFence.target.agentAccountId ||
      receiptTarget.agentAccountId !== postFence.target.agentAccountId
    ) {
      errors.push('receipt target must match preFence and postFence targets');
    }
    if (
      BigInt(postFence.grantRevocationEpoch) !==
        BigInt(preFence.grantRevocationEpoch) + 1n ||
      BigInt(postFence.grantOptimisticVersion) !==
        BigInt(preFence.grantOptimisticVersion) + 1n ||
      Date.parse(preFence.capturedAt) > Date.parse(value.acceptedAt as string) ||
      postFence.capturedAt !== value.acceptedAt
    ) {
      errors.push(
        'postFence must advance by exactly one and bind acceptedAt',
      );
    }
  }
  return { valid: errors.length === 0, errors };
}

function exactEpochSet(
  value: unknown,
  expected: TrustCoreRevocationEpochV1[],
): boolean {
  return Array.isArray(value) && JSON.stringify(value) === JSON.stringify(expected);
}

function validateWriterReceiptEvidenceV1(
  evidence: unknown,
  entry: Record<string, unknown>,
  agentAccountId: string,
  path: string,
  errors: string[],
): void {
  const target = entry.target;
  if (
    !object(evidence) ||
    !strict(evidence, [
      'receiptType',
      'receiptRef',
      'receiptDigest',
      'acceptedAt',
      'snapshot',
    ]) ||
    typeof evidence.receiptRef !== 'string' ||
    !UUID.test(evidence.receiptRef) ||
    !timestamp(evidence.acceptedAt) ||
    !validateDigest(evidence.receiptDigest) ||
    !object(evidence.snapshot)
  ) {
    errors.push(`${path}: invalid writer receipt evidence`);
    return;
  }
  const snapshot = evidence.snapshot;
  if (
    computeDigest(snapshot).value !==
    (evidence.receiptDigest as { value: string }).value
  ) {
    errors.push(`${path}.receiptDigest: snapshot mismatch`);
  }
  if (
    snapshot.receiptId !== evidence.receiptRef ||
    snapshot.acceptedAt !== evidence.acceptedAt
  ) {
    errors.push(`${path}: receipt identity/time mismatch`);
  }

  const expectedWriter =
    evidence.receiptType === 'authority_grant_revocation_v1'
      ? 'authority_grant_command_v1'
      : evidence.receiptType === 'device_lifecycle_v1'
        ? 'device_registry_lifecycle_v1'
        : evidence.receiptType === 'shell_binding_revocation_v1'
          ? 'soul_shell_binding_v1'
          : null;
  if (expectedWriter === null || entry.writer !== expectedWriter) {
    errors.push(`${path}: receipt type/writer mismatch`);
  }

  if (evidence.receiptType === 'authority_grant_revocation_v1') {
    const validation = validateAuthorityGrantRevocationReceiptV1(snapshot);
    errors.push(...validation.errors.map((error) => `${path}.snapshot.${error}`));
    if (!validation.valid) return;
    if (
      !object(target) ||
      target.kind !== 'authority_grant' ||
      snapshot.target === undefined ||
      !object(snapshot.target) ||
      snapshot.target.grantRef !== target.grantRef ||
      snapshot.target.agentAccountId !== agentAccountId
    ) {
      errors.push(`${path}: Authority target/account mismatch`);
    }
    const authoritySnapshot = snapshot as unknown as AuthorityGrantRevocationReceiptV1;
    if (
      !exactEpochSet(entry.preEpochs, [
        {
          kind: 'grant_revocation',
          value: authoritySnapshot.preFence.grantRevocationEpoch,
        },
        {
          kind: 'grant_optimistic',
          value: authoritySnapshot.preFence.grantOptimisticVersion,
        },
      ]) ||
      !exactEpochSet(entry.postEpochs, [
        {
          kind: 'grant_revocation',
          value: authoritySnapshot.postFence.grantRevocationEpoch,
        },
        {
          kind: 'grant_optimistic',
          value: authoritySnapshot.postFence.grantOptimisticVersion,
        },
      ])
    ) {
      errors.push(`${path}: Authority outer epoch set mismatch`);
    }
    return;
  }

  if (evidence.receiptType === 'device_lifecycle_v1') {
    if (
      !strict(snapshot, [
        'schemaVersion',
        'receiptId',
        'operation',
        'target',
        'requestId',
        'requestDigest',
        'reasonCode',
        'preFence',
        'postFence',
        'registrationStatus',
        'riskStatus',
        'credentialStatus',
        'durableState',
        'acceptedAt',
        'compatibilityEffects',
      ]) ||
      snapshot.schemaVersion !== 1 ||
      snapshot.operation !== 'revoke' ||
      snapshot.durableState !== 'state_and_outbox_reserved' ||
      snapshot.credentialStatus !== 'revoked' ||
      typeof snapshot.requestId !== 'string' ||
      !OPAQUE.test(snapshot.requestId) ||
      typeof snapshot.requestDigest !== 'string' ||
      !HEX64.test(snapshot.requestDigest) ||
      !object(snapshot.target) ||
      snapshot.target.kind !== 'device_registry' ||
      !object(target) ||
      target.kind !== 'device' ||
      snapshot.target.deviceId !== target.deviceId
    ) {
      errors.push(`${path}: invalid Device receipt snapshot`);
      return;
    }
    const pre = validateDeviceEpochFenceV1(snapshot.preFence);
    const post = validateDeviceEpochFenceV1(snapshot.postFence);
    errors.push(...pre.errors.map((error) => `${path}.snapshot.preFence.${error}`));
    errors.push(...post.errors.map((error) => `${path}.snapshot.postFence.${error}`));
    if (pre.valid && post.valid) {
      const preFence = snapshot.preFence as unknown as DeviceEpochFenceV1;
      const postFence = snapshot.postFence as unknown as DeviceEpochFenceV1;
      if (
        postFence.target.deviceId !== preFence.target.deviceId ||
        BigInt(postFence.deviceRevocationEpoch) !==
          BigInt(preFence.deviceRevocationEpoch) + 1n ||
        BigInt(postFence.credentialRevocationEpoch) !==
          BigInt(preFence.credentialRevocationEpoch) + 1n ||
        BigInt(postFence.optimisticVersion) !==
          BigInt(preFence.optimisticVersion) + 1n ||
        BigInt(postFence.credentialVersion) !==
          BigInt(preFence.credentialVersion) + 1n ||
        Date.parse(preFence.capturedAt) > Date.parse(evidence.acceptedAt as string)
      ) {
        errors.push(`${path}: Device post fence is not an exact revocation advance`);
      }
      if (
        !exactEpochSet(entry.preEpochs, [
          { kind: 'device_revocation', value: preFence.deviceRevocationEpoch },
          {
            kind: 'credential_revocation',
            value: preFence.credentialRevocationEpoch,
          },
          { kind: 'device_optimistic', value: preFence.optimisticVersion },
          { kind: 'credential_version', value: preFence.credentialVersion },
        ]) ||
        !exactEpochSet(entry.postEpochs, [
          { kind: 'device_revocation', value: postFence.deviceRevocationEpoch },
          {
            kind: 'credential_revocation',
            value: postFence.credentialRevocationEpoch,
          },
          { kind: 'device_optimistic', value: postFence.optimisticVersion },
          { kind: 'credential_version', value: postFence.credentialVersion },
        ])
      ) {
        errors.push(`${path}: Device outer epoch set mismatch`);
      }
    }
    return;
  }

  if (evidence.receiptType === 'shell_binding_revocation_v1') {
    if (
      !strict(snapshot, [
        'schemaVersion',
        'receiptId',
        'operation',
        'bindingRef',
        'successorBindingRef',
        'requestId',
        'requestDigest',
        'reasonCode',
        'preEpoch',
        'postEpoch',
        'preOptimisticVersion',
        'postOptimisticVersion',
        'state',
        'acceptedAt',
      ]) ||
      snapshot.schemaVersion !== 1 ||
      snapshot.operation !== 'revoke' ||
      snapshot.successorBindingRef !== null ||
      snapshot.state !== 'state_and_outbox_reserved' ||
      typeof snapshot.requestId !== 'string' ||
      !OPAQUE.test(snapshot.requestId) ||
      typeof snapshot.requestDigest !== 'string' ||
      !HEX64.test(snapshot.requestDigest) ||
      !validateRecordRef(snapshot.bindingRef) ||
      !object(target) ||
      target.kind !== 'shell_binding' ||
      computeDigest(snapshot.bindingRef).value !==
        computeDigest(target.bindingRef).value ||
      typeof snapshot.preEpoch !== 'string' ||
      !DECIMAL.test(snapshot.preEpoch) ||
      typeof snapshot.postEpoch !== 'string' ||
      !DECIMAL.test(snapshot.postEpoch) ||
      typeof snapshot.preOptimisticVersion !== 'string' ||
      !DECIMAL.test(snapshot.preOptimisticVersion) ||
      typeof snapshot.postOptimisticVersion !== 'string' ||
      !DECIMAL.test(snapshot.postOptimisticVersion) ||
      BigInt(snapshot.postEpoch) !== BigInt(snapshot.preEpoch) + 1n ||
      BigInt(snapshot.postOptimisticVersion) !==
        BigInt(snapshot.preOptimisticVersion) + 1n
    ) {
      errors.push(`${path}: invalid Shell receipt snapshot`);
      return;
    }
    const shellSnapshot = snapshot as unknown as ShellBindingRevocationReceiptV1;
    if (
      !exactEpochSet(entry.preEpochs, [
        { kind: 'binding_revocation', value: shellSnapshot.preEpoch },
        {
          kind: 'binding_optimistic',
          value: shellSnapshot.preOptimisticVersion,
        },
      ]) ||
      !exactEpochSet(entry.postEpochs, [
        { kind: 'binding_revocation', value: shellSnapshot.postEpoch },
        {
          kind: 'binding_optimistic',
          value: shellSnapshot.postOptimisticVersion,
        },
      ])
    ) {
      errors.push(`${path}: Shell outer epoch set mismatch`);
    }
    return;
  }

  errors.push(`${path}.receiptType: unsupported`);
}

function validateTarget(
  value: unknown,
  path: string,
  errors: string[],
): value is TrustCoreRevocationTargetRefV1 {
  if (!object(value) || typeof value.kind !== 'string') {
    errors.push(`${path}: target must be an object with kind`);
    return false;
  }
  switch (value.kind) {
    case 'shell_binding':
      if (!strict(value, ['kind', 'bindingRef']) || !validateRecordRef(value.bindingRef)) {
        errors.push(`${path}: invalid shell binding target`);
        return false;
      }
      if ((value.bindingRef as Record<string, unknown>).type !== 'shell_session_binding') {
        errors.push(`${path}.bindingRef: unexpected ref type`);
        return false;
      }
      return true;
    case 'device':
      if (
        !strict(value, ['kind', 'deviceId']) ||
        typeof value.deviceId !== 'string' ||
        !OPAQUE.test(value.deviceId)
      ) {
        errors.push(`${path}: invalid device target`);
        return false;
      }
      return true;
    case 'authority_grant':
      if (
        !strict(value, ['kind', 'grantRef']) ||
        typeof value.grantRef !== 'string' ||
        !OPAQUE.test(value.grantRef)
      ) {
        errors.push(`${path}: invalid authority grant target`);
        return false;
      }
      return true;
    case 'ownership_control':
      if (
        !strict(value, ['kind', 'agentAccountId']) ||
        typeof value.agentAccountId !== 'string' ||
        !UUID.test(value.agentAccountId)
      ) {
        errors.push(`${path}: invalid ownership control target`);
        return false;
      }
      return true;
    default:
      errors.push(`${path}: unsupported target kind`);
      return false;
  }
}

function validateEpochs(value: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${path}: expected a non-empty epoch set`);
    return;
  }
  const kinds = new Set<string>();
  value.forEach((entry, index) => {
    if (
      !object(entry) ||
      !strict(entry, ['kind', 'value']) ||
      !TRUST_CORE_REVOCATION_EPOCH_KINDS_V1.includes(
        entry.kind as TrustCoreRevocationEpochKindV1,
      ) ||
      typeof entry.value !== 'string' ||
      !DECIMAL.test(entry.value)
    ) {
      errors.push(`${path}[${index}]: invalid canonical epoch`);
      return;
    }
    if (kinds.has(String(entry.kind))) errors.push(`${path}: duplicate epoch kind`);
    kinds.add(String(entry.kind));
  });
}

export function validateTrustCoreRevocationStartCommandV1(
  value: unknown,
): TrustCoreRevocationValidationResultV1 {
  const errors: string[] = [];
  if (!object(value)) return { valid: false, errors: ['command must be an object'] };
  if (
    !strict(value, [
      'schemaVersion',
      'idempotencyKey',
      'operationType',
      'agentAccountId',
      'reasonCode',
      'selector',
      'targets',
    ])
  ) {
    errors.push('command contains unknown fields');
  }
  if (value.schemaVersion !== TRUST_CORE_REVOCATION_SCHEMA_VERSION) {
    errors.push('unsupported schemaVersion');
  }
  if (typeof value.idempotencyKey !== 'string' || !OPAQUE.test(value.idempotencyKey)) {
    errors.push('idempotencyKey is invalid');
  }
  if (
    !TRUST_CORE_REVOCATION_OPERATION_TYPES_V1.includes(
      value.operationType as TrustCoreRevocationOperationTypeV1,
    )
  ) {
    errors.push('operationType is invalid');
  }
  if (typeof value.agentAccountId !== 'string' || !UUID.test(value.agentAccountId)) {
    errors.push('agentAccountId is invalid');
  }
  if (typeof value.reasonCode !== 'string' || !REASON.test(value.reasonCode)) {
    errors.push('reasonCode is invalid');
  }
  if (value.operationType === 'continuity_exit') {
    const selector = validateTrustCoreRuntimeExitSelectorV1(value.selector);
    errors.push(...selector.errors.map((error) => `selector.${error}`));
  } else if (value.selector !== undefined) {
    errors.push('selector is only supported for continuity_exit');
  }
  if (!Array.isArray(value.targets) || value.targets.length === 0 || value.targets.length > 64) {
    errors.push('targets must contain 1..64 entries');
  } else {
    const targetKeys = new Set<string>();
    value.targets.forEach((target, index) => {
      if (validateTarget(target, `targets[${index}]`, errors)) {
        const key = JSON.stringify(target);
        if (targetKeys.has(key)) errors.push(`targets[${index}]: duplicate target`);
        targetKeys.add(key);
      }
    });
  }
  return { valid: errors.length === 0, errors };
}

export function validateTrustCoreFrozenApplicableSetV1(
  value: unknown,
): TrustCoreRevocationValidationResultV1 {
  const errors: string[] = [];
  if (!object(value)) return { valid: false, errors: ['applicable set must be an object'] };
  if (
    !strict(value, [
      'schemaVersion',
      'policyVersion',
      'operationType',
      'selector',
      'targets',
      'frozenAt',
      'digest',
    ])
  ) {
    errors.push('applicable set contains unknown fields');
  }
  if (value.schemaVersion !== TRUST_CORE_REVOCATION_SCHEMA_VERSION) {
    errors.push('unsupported schemaVersion');
  }
  if (value.policyVersion !== TRUST_CORE_APPLICABLE_SET_POLICY_V1) {
    errors.push('unsupported applicable-set policy');
  }
  if (
    !TRUST_CORE_REVOCATION_OPERATION_TYPES_V1.includes(
      value.operationType as TrustCoreRevocationOperationTypeV1,
    )
  ) {
    errors.push('operationType is invalid');
  }
  if (value.operationType === 'continuity_exit') {
    const selector = validateTrustCoreRuntimeExitSelectorV1(value.selector);
    errors.push(...selector.errors.map((error) => `selector.${error}`));
  } else if (value.selector !== undefined) {
    errors.push('selector is only supported for continuity_exit');
  }
  if (!timestamp(value.frozenAt)) errors.push('frozenAt is invalid');
  if (!validateDigest(value.digest)) errors.push('digest is invalid');
  if (!Array.isArray(value.targets) || value.targets.length === 0) {
    errors.push('targets must be non-empty');
  } else {
    const keys = new Set<string>();
    value.targets.forEach((entry, index) => {
      if (!object(entry)) {
        errors.push(`targets[${index}]: expected object`);
        return;
      }
      if (
        !strict(entry, [
          'targetKey',
          'ordinal',
          'target',
          'mandatory',
          'writer',
          'preEpochs',
          'expectedVersion',
          'sourceFenceSnapshot',
          'sourceFenceDigest',
          'offlinePolicy',
        ])
      ) {
        errors.push(`targets[${index}]: unknown fields`);
      }
      if (typeof entry.targetKey !== 'string' || !OPAQUE.test(entry.targetKey)) {
        errors.push(`targets[${index}].targetKey: invalid`);
      } else if (keys.has(entry.targetKey)) {
        errors.push(`targets[${index}].targetKey: duplicate`);
      } else keys.add(entry.targetKey);
      if (!Number.isInteger(entry.ordinal) || Number(entry.ordinal) !== index) {
        errors.push(`targets[${index}].ordinal: must match canonical order`);
      }
      validateTarget(entry.target, `targets[${index}].target`, errors);
      if (entry.mandatory !== true) errors.push(`targets[${index}].mandatory: v1 requires true`);
      if (
        !TRUST_CORE_REVOCATION_WRITERS_V1.includes(
          entry.writer as TrustCoreRevocationWriterV1,
        )
      ) {
        errors.push(`targets[${index}].writer: invalid`);
      }
      validateEpochs(entry.preEpochs, `targets[${index}].preEpochs`, errors);
      if (typeof entry.expectedVersion !== 'string' || !DECIMAL.test(entry.expectedVersion)) {
        errors.push(`targets[${index}].expectedVersion: invalid`);
      }
      if (!object(entry.sourceFenceSnapshot)) {
        errors.push(`targets[${index}].sourceFenceSnapshot: invalid`);
      }
      if (!validateDigest(entry.sourceFenceDigest)) {
        errors.push(`targets[${index}].sourceFenceDigest: invalid`);
      } else if (
        object(entry.sourceFenceSnapshot) &&
        computeDigest(entry.sourceFenceSnapshot).value !==
          (entry.sourceFenceDigest as { value: string }).value
      ) {
        errors.push(`targets[${index}].sourceFenceDigest: snapshot mismatch`);
      }
      if (
        ![
          'not_applicable',
          'next_protected_ingress_must_refresh_epoch',
          'next_protected_ingress_must_reject',
        ].includes(String(entry.offlinePolicy))
      ) {
        errors.push(`targets[${index}].offlinePolicy: invalid`);
      }
    });
  }
  return { valid: errors.length === 0, errors };
}

export function validateTrustCoreCombinedRevocationReceiptV1(
  value: unknown,
): TrustCoreRevocationValidationResultV1 {
  const errors: string[] = [];
  if (!object(value)) return { valid: false, errors: ['receipt must be an object'] };
  if (
    !strict(value, [
      'schemaVersion',
      'receiptDomain',
      'receiptId',
      'operationId',
      'operationType',
      'agentAccountId',
      'reasonCode',
      'applicableSetDigest',
      'targets',
      'convergenceCapability',
      'overallState',
      'allMandatoryDurableAccepted',
      'allMandatoryFullyConverged',
      'acceptedAt',
      'fullyConvergedAt',
      'recordedAt',
      'receiptDigest',
    ])
  ) {
    errors.push('receipt contains unknown fields');
  }
  if (value.schemaVersion !== TRUST_CORE_REVOCATION_SCHEMA_VERSION) {
    errors.push('unsupported schemaVersion');
  }
  if (value.receiptDomain !== 'AGENTRIX_TRUST_CORE_COMBINED_REVOCATION_V1') {
    errors.push('receiptDomain is invalid');
  }
  for (const key of ['receiptId', 'operationId', 'agentAccountId'] as const) {
    if (typeof value[key] !== 'string' || !UUID.test(value[key] as string)) {
      errors.push(`${key} is invalid`);
    }
  }
  if (!validateDigest(value.applicableSetDigest)) errors.push('applicableSetDigest is invalid');
  if (!validateDigest(value.receiptDigest)) errors.push('receiptDigest is invalid');
  if (!timestamp(value.recordedAt)) errors.push('recordedAt is invalid');
  if (value.acceptedAt !== undefined && !timestamp(value.acceptedAt)) {
    errors.push('acceptedAt is invalid');
  }
  if (value.fullyConvergedAt !== undefined && !timestamp(value.fullyConvergedAt)) {
    errors.push('fullyConvergedAt is invalid');
  }
  if (!Array.isArray(value.targets) || value.targets.length === 0) {
    errors.push('targets must be non-empty');
  } else {
    value.targets.forEach((entry, index) => {
      if (!object(entry)) {
        errors.push(`targets[${index}]: expected object`);
        return;
      }
      validateTarget(entry.target, `targets[${index}].target`, errors);
      validateEpochs(entry.preEpochs, `targets[${index}].preEpochs`, errors);
      if (entry.postEpochs !== undefined) {
        validateEpochs(entry.postEpochs, `targets[${index}].postEpochs`, errors);
      }
      if (entry.writerReceipt !== undefined) {
        validateWriterReceiptEvidenceV1(
          entry.writerReceipt,
          entry,
          String(value.agentAccountId),
          `targets[${index}].writerReceipt`,
          errors,
        );
      }
    });
  }
  if (value.convergenceCapability !== 'durable_only') {
    errors.push('convergenceCapability is invalid');
  }
  if (
    !['pending', 'partial', 'durable_accepted', 'failed', 'unknown'].includes(
      String(value.overallState),
    )
  ) {
    errors.push('overallState is invalid');
  }
  if (typeof value.allMandatoryDurableAccepted !== 'boolean') {
    errors.push('allMandatoryDurableAccepted is invalid');
  }
  if (typeof value.allMandatoryFullyConverged !== 'boolean') {
    errors.push('allMandatoryFullyConverged is invalid');
  }
  if (value.allMandatoryFullyConverged !== false || value.fullyConvergedAt !== undefined) {
    errors.push('v1 durable-only receipt cannot claim convergence');
  }
  return { valid: errors.length === 0, errors };
}
