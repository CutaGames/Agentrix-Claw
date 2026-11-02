import type { DigestRef, RecordRef } from './trust-loop-primitives';
import type {
  TrustCoreCombinedRevocationReceiptV1,
  TrustCoreRevocationOperationTypeV1,
} from './trust-core-revocation';

export const TRUST_CORE_PROJECTION_SCHEMA_VERSION = 1 as const;
export const TRUST_CORE_PROJECTOR_VERSION_V1 = 'trust-core-projector.v1' as const;

export type TrustCoreProjectionFreshnessV1 = 'fresh' | 'stale' | 'unknown';
export type TrustCoreProjectionCompletenessV1 = 'complete' | 'partial' | 'redacted';

export interface TrustCoreProjectionSourceRefV1 {
  kind:
    | 'agent_account'
    | 'soul_core_mapping'
    | 'authority_grant'
    | 'device'
    | 'shell_binding'
    | 'action_receipt'
    | 'revocation_operation';
  id: string;
  version: string;
}

export interface TrustCoreAgentIdentityProjectionV1 {
  agentAccountId: string;
  agentId: string;
  soulCoreId?: string;
  agentStatus: string;
  identityEpoch?: string;
  ownershipEpoch: string;
  ownershipRef: string;
}

export interface TrustCoreAuthorityProjectionItemV1 {
  grantRef: string;
  status: string;
  revocationEpoch: string;
  optimisticVersion: string;
}

export interface TrustCoreDeviceProjectionItemV1 {
  deviceId: string;
  registrationStatus: string;
  riskStatus: string;
  credentialStatus: string;
  deviceRevocationEpoch: string;
  credentialRevocationEpoch: string;
  optimisticVersion: string;
}

export interface TrustCoreShellProjectionItemV1 {
  bindingRef: RecordRef;
  status: string;
  revocationEpoch: string;
  optimisticVersion: string;
  deviceId?: string;
  supersedesBindingId?: string;
}

export interface TrustCoreActionProjectionItemV1 {
  actionReceiptId: string;
  taskId: string;
  receiptDigest: string;
  capabilityClass: string;
  createdAt: string;
}

export interface TrustCoreContinuityProjectionItemV1 {
  operationId: string;
  operationType: TrustCoreRevocationOperationTypeV1;
  state: string;
  applicableSetDigest: DigestRef;
  combinedReceipt?: TrustCoreCombinedRevocationReceiptV1;
  updatedAt: string;
}

export interface TrustCoreAgentProjectionDataV1 {
  identity: TrustCoreAgentIdentityProjectionV1;
  authority: TrustCoreAuthorityProjectionItemV1[];
  devices: TrustCoreDeviceProjectionItemV1[];
  shells: TrustCoreShellProjectionItemV1[];
  activity: TrustCoreActionProjectionItemV1[];
  continuity: TrustCoreContinuityProjectionItemV1[];
}

export interface TrustCoreProjectionAllowedActionV1 {
  action: 'refresh' | 'revoke_relationship' | 'mark_device_lost' | 'start_recovery';
  enabled: boolean;
  reasonCode: string;
}

export interface TrustCoreAgentProjectionEnvelopeV1 {
  schemaVersion: typeof TRUST_CORE_PROJECTION_SCHEMA_VERSION;
  projectorVersion: typeof TRUST_CORE_PROJECTOR_VERSION_V1;
  projectionId: string;
  projectionVersion: string;
  generatedAt: string;
  freshness: TrustCoreProjectionFreshnessV1;
  completeness: TrustCoreProjectionCompletenessV1;
  sourceRefs: TrustCoreProjectionSourceRefV1[];
  sourceDigest: DigestRef;
  data: TrustCoreAgentProjectionDataV1;
  unavailableReasons: string[];
  allowedActions: TrustCoreProjectionAllowedActionV1[];
}

export interface TrustCoreProjectionValidationResultV1 {
  valid: boolean;
  errors: string[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECIMAL = /^(0|[1-9][0-9]*)$/;
const OPAQUE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HEX64 = /^[0-9a-f]{64}$/;

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function strict(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function iso(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

function digest(value: unknown): boolean {
  return (
    object(value) &&
    strict(value, ['algorithm', 'canonicalization', 'value']) &&
    value.algorithm === 'sha-256' &&
    typeof value.canonicalization === 'string' &&
    typeof value.value === 'string' &&
    HEX64.test(value.value)
  );
}

function decimal(value: unknown): boolean {
  return typeof value === 'string' && DECIMAL.test(value);
}

export function validateTrustCoreAgentProjectionEnvelopeV1(
  value: unknown,
): TrustCoreProjectionValidationResultV1 {
  const errors: string[] = [];
  if (!object(value)) return { valid: false, errors: ['projection must be an object'] };
  if (
    !strict(value, [
      'schemaVersion',
      'projectorVersion',
      'projectionId',
      'projectionVersion',
      'generatedAt',
      'freshness',
      'completeness',
      'sourceRefs',
      'sourceDigest',
      'data',
      'unavailableReasons',
      'allowedActions',
    ])
  ) {
    errors.push('projection contains unknown fields');
  }
  if (value.schemaVersion !== TRUST_CORE_PROJECTION_SCHEMA_VERSION) {
    errors.push('unsupported schemaVersion');
  }
  if (value.projectorVersion !== TRUST_CORE_PROJECTOR_VERSION_V1) {
    errors.push('unsupported projectorVersion');
  }
  if (typeof value.projectionId !== 'string' || !UUID.test(value.projectionId)) {
    errors.push('projectionId is invalid');
  }
  if (!decimal(value.projectionVersion)) errors.push('projectionVersion is invalid');
  if (!iso(value.generatedAt)) errors.push('generatedAt is invalid');
  if (!['fresh', 'stale', 'unknown'].includes(String(value.freshness))) {
    errors.push('freshness is invalid');
  }
  if (!['complete', 'partial', 'redacted'].includes(String(value.completeness))) {
    errors.push('completeness is invalid');
  }
  if (!digest(value.sourceDigest)) errors.push('sourceDigest is invalid');
  if (!Array.isArray(value.sourceRefs)) {
    errors.push('sourceRefs must be an array');
  } else {
    const keys = new Set<string>();
    value.sourceRefs.forEach((source, index) => {
      if (
        !object(source) ||
        !strict(source, ['kind', 'id', 'version']) ||
        ![
          'agent_account',
          'soul_core_mapping',
          'authority_grant',
          'device',
          'shell_binding',
          'action_receipt',
          'revocation_operation',
        ].includes(String(source.kind)) ||
        typeof source.id !== 'string' ||
        !OPAQUE.test(source.id) ||
        !decimal(source.version)
      ) {
        errors.push(`sourceRefs[${index}] is invalid`);
        return;
      }
      const key = `${String(source.kind)}:${source.id}`;
      if (keys.has(key)) errors.push(`sourceRefs[${index}] is duplicated`);
      keys.add(key);
    });
  }
  if (!object(value.data) || !object(value.data.identity)) {
    errors.push('data.identity is required');
  } else {
    const identity = value.data.identity;
    if (typeof identity.agentAccountId !== 'string' || !UUID.test(identity.agentAccountId)) {
      errors.push('data.identity.agentAccountId is invalid');
    }
    if (typeof identity.agentId !== 'string' || !OPAQUE.test(identity.agentId)) {
      errors.push('data.identity.agentId is invalid');
    }
    if (!decimal(identity.ownershipEpoch)) {
      errors.push('data.identity.ownershipEpoch is invalid');
    }
    for (const family of ['authority', 'devices', 'shells', 'activity', 'continuity']) {
      if (!Array.isArray(value.data[family])) errors.push(`data.${family} must be an array`);
    }
  }
  if (
    !Array.isArray(value.unavailableReasons) ||
    !value.unavailableReasons.every((reason) => typeof reason === 'string' && OPAQUE.test(reason))
  ) {
    errors.push('unavailableReasons is invalid');
  }
  if (!Array.isArray(value.allowedActions)) {
    errors.push('allowedActions must be an array');
  } else {
    value.allowedActions.forEach((action, index) => {
      if (
        !object(action) ||
        !strict(action, ['action', 'enabled', 'reasonCode']) ||
        !['refresh', 'revoke_relationship', 'mark_device_lost', 'start_recovery'].includes(
          String(action.action),
        ) ||
        typeof action.enabled !== 'boolean' ||
        typeof action.reasonCode !== 'string' ||
        !OPAQUE.test(action.reasonCode)
      ) {
        errors.push(`allowedActions[${index}] is invalid`);
      }
    });
  }
  return { valid: errors.length === 0, errors };
}
