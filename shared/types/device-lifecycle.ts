export const DEVICE_LIFECYCLE_SCHEMA_VERSION = 1 as const;

export const DEVICE_REGISTRATION_STATUSES = ['active', 'retired'] as const;
export const DEVICE_RISK_STATUSES = [
  'clear',
  'lost',
  'stolen',
  'compromised',
  'recalled',
] as const;
export const DEVICE_CREDENTIAL_STATUSES = [
  'active',
  'suspended',
  'revoked',
  'expired',
] as const;
export const DEVICE_REVOCATION_REASONS = [
  'owner_revoke',
  'lost',
  'stolen',
  'compromised',
  'retired',
] as const;

export type DeviceRegistrationStatusV1 = (typeof DEVICE_REGISTRATION_STATUSES)[number];
export type DeviceRiskStatusV1 = (typeof DEVICE_RISK_STATUSES)[number];
export type DeviceCredentialStatusV1 = (typeof DEVICE_CREDENTIAL_STATUSES)[number];
export type DeviceRevocationReasonV1 = (typeof DEVICE_REVOCATION_REASONS)[number];
export type DeviceLifecycleOperationV1 = 'register' | 'revoke' | 'credential_refresh';

export interface DeviceRegistryRefV1 {
  kind: 'device_registry';
  deviceId: string;
}

/**
 * Canonical DeviceRegistry-owned fence. Epochs are decimal strings so the
 * wire contract never loses bigint precision. Shell may persist this snapshot
 * but must never advance it.
 */
export interface DeviceEpochFenceV1 {
  schemaVersion: typeof DEVICE_LIFECYCLE_SCHEMA_VERSION;
  target: DeviceRegistryRefV1;
  deviceRevocationEpoch: string;
  credentialRevocationEpoch: string;
  optimisticVersion: string;
  credentialVersion: string;
  capturedAt: string;
}

export interface DeviceLifecycleRevokeCommandV1 {
  schemaVersion: typeof DEVICE_LIFECYCLE_SCHEMA_VERSION;
  requestId: string;
  expectedFence: DeviceEpochFenceV1;
  reasonCode: DeviceRevocationReasonV1;
}

export interface DeviceCredentialRefreshCommandV1 {
  schemaVersion: typeof DEVICE_LIFECYCLE_SCHEMA_VERSION;
  requestId: string;
  expectedFence: DeviceEpochFenceV1;
  reasonCode: 'credential_rotation';
}

export interface DeviceLifecycleReceiptV1 {
  schemaVersion: typeof DEVICE_LIFECYCLE_SCHEMA_VERSION;
  receiptId: string;
  operation: DeviceLifecycleOperationV1;
  target: DeviceRegistryRefV1;
  requestId: string;
  requestDigest: string;
  reasonCode: DeviceRevocationReasonV1 | 'initial_registration' | 'credential_rotation';
  preFence: DeviceEpochFenceV1 | null;
  postFence: DeviceEpochFenceV1;
  registrationStatus: DeviceRegistrationStatusV1;
  riskStatus: DeviceRiskStatusV1;
  credentialStatus: DeviceCredentialStatusV1;
  durableState: 'state_and_outbox_reserved';
  acceptedAt: string;
  compatibilityEffects: {
    dstCleared: boolean;
    onlineForcedFalse: boolean;
  };
}

export interface DeviceContractValidationResult {
  valid: boolean;
  errors: string[];
}

const DECIMAL_STRING = /^(0|[1-9][0-9]*)$/;
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isIsoDate(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

export function validateDeviceEpochFenceV1(value: unknown): DeviceContractValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['fence must be an object'] };
  if (
    !hasOnlyKeys(value, [
      'schemaVersion',
      'target',
      'deviceRevocationEpoch',
      'credentialRevocationEpoch',
      'optimisticVersion',
      'credentialVersion',
      'capturedAt',
    ])
  ) {
    errors.push('fence contains unknown fields');
  }
  if (value.schemaVersion !== DEVICE_LIFECYCLE_SCHEMA_VERSION) {
    errors.push('unsupported fence schemaVersion');
  }
  if (!isRecord(value.target) || !hasOnlyKeys(value.target, ['kind', 'deviceId'])) {
    errors.push('target must be a strict DeviceRegistry ref');
  } else if (
    value.target.kind !== 'device_registry' ||
    typeof value.target.deviceId !== 'string' ||
    !OPAQUE_ID.test(value.target.deviceId)
  ) {
    errors.push('target is invalid');
  }
  for (const field of [
    'deviceRevocationEpoch',
    'credentialRevocationEpoch',
    'optimisticVersion',
    'credentialVersion',
  ] as const) {
    if (typeof value[field] !== 'string' || !DECIMAL_STRING.test(value[field] as string)) {
      errors.push(`${field} must be a canonical decimal string`);
    }
  }
  if (!isIsoDate(value.capturedAt)) errors.push('capturedAt must be an ISO timestamp');
  return { valid: errors.length === 0, errors };
}

export function validateDeviceLifecycleRevokeCommandV1(
  value: unknown,
): DeviceContractValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['command must be an object'] };
  if (!hasOnlyKeys(value, ['schemaVersion', 'requestId', 'expectedFence', 'reasonCode'])) {
    errors.push('command contains unknown fields');
  }
  if (value.schemaVersion !== DEVICE_LIFECYCLE_SCHEMA_VERSION) {
    errors.push('unsupported command schemaVersion');
  }
  if (typeof value.requestId !== 'string' || !OPAQUE_ID.test(value.requestId)) {
    errors.push('requestId is invalid');
  }
  if (!DEVICE_REVOCATION_REASONS.includes(value.reasonCode as DeviceRevocationReasonV1)) {
    errors.push('reasonCode is invalid');
  }
  errors.push(...validateDeviceEpochFenceV1(value.expectedFence).errors);
  return { valid: errors.length === 0, errors };
}

export function validateDeviceCredentialRefreshCommandV1(
  value: unknown,
): DeviceContractValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['command must be an object'] };
  if (!hasOnlyKeys(value, ['schemaVersion', 'requestId', 'expectedFence', 'reasonCode'])) {
    errors.push('command contains unknown fields');
  }
  if (value.schemaVersion !== DEVICE_LIFECYCLE_SCHEMA_VERSION) {
    errors.push('unsupported command schemaVersion');
  }
  if (typeof value.requestId !== 'string' || !OPAQUE_ID.test(value.requestId)) {
    errors.push('requestId is invalid');
  }
  if (value.reasonCode !== 'credential_rotation') errors.push('reasonCode is invalid');
  errors.push(...validateDeviceEpochFenceV1(value.expectedFence).errors);
  return { valid: errors.length === 0, errors };
}
