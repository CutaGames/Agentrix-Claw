import type { DeviceEpochFenceV1 } from './device-lifecycle';
import type { ShellCommandSignatureAlgorithmV1 } from './soul-core-embedded';

export const DEVICE_SIGNING_CREDENTIAL_SCHEMA_VERSION = 1 as const;
export const DEVICE_SIGNING_PURPOSES_V1 = ['device-auth', 'session-auth'] as const;
export type DeviceSigningPurposeV1 = (typeof DEVICE_SIGNING_PURPOSES_V1)[number];

/**
 * Additive Personal Machine Mesh purposes. Published by the Device Signing
 * owner for wrapper/verifier only. These do not enlarge `device-auth` or
 * `session-auth`, and the credential table CHECK still persists only the
 * legacy pair until a later Device Registry schema decision. Registration and
 * rotation keep accepting `DEVICE_SIGNING_PURPOSES_V1` only.
 * (From docs/drw-home-devices/drw-wiring-20260915.patch; PMM port, REQ-release-046.)
 */
export const DEVICE_SIGNING_PERSONAL_MACHINE_PURPOSES_V1 = [
  'personal-machine-capability',
  'personal-machine-terminal-result',
] as const;
export type DeviceSigningPersonalMachinePurposeV1 =
  (typeof DEVICE_SIGNING_PERSONAL_MACHINE_PURPOSES_V1)[number];

export function isDeviceSigningPersonalMachinePurposeV1(
  purpose: unknown,
): purpose is DeviceSigningPersonalMachinePurposeV1 {
  return (DEVICE_SIGNING_PERSONAL_MACHINE_PURPOSES_V1 as readonly unknown[]).includes(purpose);
}
export const DEVICE_SIGNING_CREDENTIAL_STATUSES_V1 = [
  'active',
  'superseded',
  'revoked',
  'expired',
] as const;
export type DeviceSigningCredentialStatusV1 =
  (typeof DEVICE_SIGNING_CREDENTIAL_STATUSES_V1)[number];

export interface DeviceSigningPublicJwkV1 {
  kty: 'EC';
  crv: 'P-256' | 'secp256k1';
  x: string;
  y: string;
}

export interface DeviceSigningCredentialV1 {
  schemaVersion: typeof DEVICE_SIGNING_CREDENTIAL_SCHEMA_VERSION;
  credentialRef: string;
  deviceId: string;
  keyVersion: number;
  algorithm: ShellCommandSignatureAlgorithmV1;
  purpose: DeviceSigningPurposeV1;
  publicJwk: DeviceSigningPublicJwkV1;
  publicKeyThumbprint: string;
  status: DeviceSigningCredentialStatusV1;
  credentialRevocationEpoch: string;
  optimisticVersion: string;
  capturedDeviceFence: DeviceEpochFenceV1;
  supersedesCredentialRef?: string;
  successorCredentialRef?: string;
  registeredAt: string;
  expiresAt?: string;
  revokedAt?: string;
  revocationReason?: string;
}

/**
 * Proof of possession (E32, REQ-desktop-018): an ECDSA-SHA256 signature, IEEE P1363
 * (r||s), base64url without padding (64 bytes → 86 chars), by the key being
 * registered over `deviceSigningCredentialRegisterProofMessageV1`. A user JWT alone
 * can no longer attach an arbitrary public key to a device.
 */
export interface DeviceSigningKeyProofV1 {
  signature: string;
}

export const DEVICE_SIGNING_CREDENTIAL_REGISTER_PROOF_DOMAIN_V1 = 'agentrix.device.signing-credential.register.v1' as const;
export const DEVICE_SIGNING_CREDENTIAL_ROTATE_PROOF_DOMAIN_V1 = 'agentrix.device.signing-credential.rotate.v1' as const;
export const DEVICE_SIGNING_PROOF_INVALID_CODE = 'DEVICE_SIGNING_PROOF_INVALID' as const;

/** Four lines, `\n`-separated, no trailing newline. `publicKeyThumbprint` = canonical JWK sha256 hex. */
export function deviceSigningCredentialRegisterProofMessageV1(input: {
  deviceId: string;
  requestId: string;
  publicKeyThumbprint: string;
}): string {
  return [DEVICE_SIGNING_CREDENTIAL_REGISTER_PROOF_DOMAIN_V1, input.deviceId, input.requestId, input.publicKeyThumbprint].join('\n');
}

/** Five lines; signed once by the new key (`proof`) and once by the current key (`currentKeyProof`). */
export function deviceSigningCredentialRotateProofMessageV1(input: {
  deviceId: string;
  requestId: string;
  currentCredentialRef: string;
  publicKeyThumbprint: string;
}): string {
  return [
    DEVICE_SIGNING_CREDENTIAL_ROTATE_PROOF_DOMAIN_V1,
    input.deviceId,
    input.requestId,
    input.currentCredentialRef,
    input.publicKeyThumbprint,
  ].join('\n');
}

export interface DeviceSigningCredentialRegisterCommandV1 {
  schemaVersion: typeof DEVICE_SIGNING_CREDENTIAL_SCHEMA_VERSION;
  requestId: string;
  expectedDeviceFence: DeviceEpochFenceV1;
  algorithm: ShellCommandSignatureAlgorithmV1;
  purpose: DeviceSigningPurposeV1;
  publicJwk: DeviceSigningPublicJwkV1;
  expiresAt?: string;
  /** Required. Register: signed over the register message; rotate: over the rotate message. */
  proof: DeviceSigningKeyProofV1;
}

export interface DeviceSigningCredentialRotateCommandV1
  extends DeviceSigningCredentialRegisterCommandV1 {
  currentCredentialRef: string;
  expectedCredentialRevocationEpoch: string;
  expectedCredentialOptimisticVersion: string;
  /** Required: the current credential's key signs the same rotate message. */
  currentKeyProof: DeviceSigningKeyProofV1;
}

export interface DeviceSigningCredentialRevokeCommandV1 {
  schemaVersion: typeof DEVICE_SIGNING_CREDENTIAL_SCHEMA_VERSION;
  requestId: string;
  credentialRef: string;
  expectedDeviceFence: DeviceEpochFenceV1;
  expectedCredentialRevocationEpoch: string;
  expectedCredentialOptimisticVersion: string;
  reasonCode: 'owner_revoke' | 'device_lost' | 'device_stolen' | 'compromised' | 'retired';
}

export interface DeviceSigningCredentialReceiptV1 {
  schemaVersion: typeof DEVICE_SIGNING_CREDENTIAL_SCHEMA_VERSION;
  receiptId: string;
  operation: 'register' | 'rotate' | 'revoke' | 'expire';
  requestId: string;
  requestDigest: string;
  credential: DeviceSigningCredentialV1;
  predecessorCredentialRef: string | null;
  /**
   * Post-transition state of the retired credential, present for `rotate`.
   *
   * Rotate advances the predecessor (superseded, epoch and optimistic version incremented)
   * in the same transaction. Without this, a receipt consumer only sees the successor's
   * fresh 0/0 fence and cannot fence on the key that was just retired.
   */
  predecessorPostCredential?: DeviceSigningCredentialV1;
  state: 'state_and_outbox_reserved';
  acceptedAt: string;
}

export interface DeviceSigningCredentialValidationResultV1 {
  valid: boolean;
  errors: string[];
}

const OPAQUE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;
const BASE64URL_32 = /^[A-Za-z0-9_-]{43}$/;
const ALGORITHMS = ['ecdsa-secp256k1-sha256', 'ecdsa-p256-sha256'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  errors: string[],
): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`${key}: unknown field`);
  for (const key of required) if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(`${key}: required`);
}

export function validateDeviceSigningPublicJwkV1(
  value: unknown,
  algorithm?: ShellCommandSignatureAlgorithmV1,
): DeviceSigningCredentialValidationResultV1 {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['publicJwk: expected object'] };
  hasOnlyKeys(value, ['kty', 'crv', 'x', 'y'], [], errors);
  if (value.kty !== 'EC') errors.push('publicJwk.kty: EC required');
  if (value.crv !== 'P-256' && value.crv !== 'secp256k1') errors.push('publicJwk.crv: unsupported curve');
  if (typeof value.x !== 'string' || !BASE64URL_32.test(value.x)) errors.push('publicJwk.x: canonical 32-byte base64url required');
  if (typeof value.y !== 'string' || !BASE64URL_32.test(value.y)) errors.push('publicJwk.y: canonical 32-byte base64url required');
  if (algorithm === 'ecdsa-p256-sha256' && value.crv !== 'P-256') errors.push('publicJwk.crv: algorithm mismatch');
  if (algorithm === 'ecdsa-secp256k1-sha256' && value.crv !== 'secp256k1') errors.push('publicJwk.crv: algorithm mismatch');
  return { valid: errors.length === 0, errors };
}

function validateCommonRegister(
  value: unknown,
  optional: readonly string[],
): DeviceSigningCredentialValidationResultV1 {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['command: expected object'] };
  hasOnlyKeys(
    value,
    ['schemaVersion', 'requestId', 'expectedDeviceFence', 'algorithm', 'purpose', 'publicJwk', 'proof'],
    ['expiresAt', ...optional],
    errors,
  );
  if (!isDeviceSigningKeyProofV1(value.proof)) errors.push('proof: 64-byte P1363 signature in base64url required');
  if (value.schemaVersion !== DEVICE_SIGNING_CREDENTIAL_SCHEMA_VERSION) errors.push('schemaVersion: unsupported');
  if (typeof value.requestId !== 'string' || !OPAQUE.test(value.requestId)) errors.push('requestId: invalid');
  if (!(ALGORITHMS as readonly unknown[]).includes(value.algorithm)) errors.push('algorithm: unsupported');
  if (!(DEVICE_SIGNING_PURPOSES_V1 as readonly unknown[]).includes(value.purpose)) errors.push('purpose: unsupported');
  const jwk = validateDeviceSigningPublicJwkV1(
    value.publicJwk,
    (ALGORITHMS as readonly unknown[]).includes(value.algorithm)
      ? (value.algorithm as ShellCommandSignatureAlgorithmV1)
      : undefined,
  );
  errors.push(...jwk.errors);
  if (value.expiresAt !== undefined && (typeof value.expiresAt !== 'string' || !Number.isFinite(Date.parse(value.expiresAt)))) {
    errors.push('expiresAt: invalid timestamp');
  }
  return { valid: errors.length === 0, errors };
}

export function validateDeviceSigningCredentialRegisterCommandV1(
  value: unknown,
): DeviceSigningCredentialValidationResultV1 {
  return validateCommonRegister(value, []);
}

export function validateDeviceSigningCredentialRotateCommandV1(
  value: unknown,
): DeviceSigningCredentialValidationResultV1 {
  const result = validateCommonRegister(value, [
    'currentCredentialRef',
    'expectedCredentialRevocationEpoch',
    'expectedCredentialOptimisticVersion',
    'currentKeyProof',
  ]);
  if (!isRecord(value)) return result;
  if (!isDeviceSigningKeyProofV1(value.currentKeyProof)) {
    result.errors.push('currentKeyProof: 64-byte P1363 signature in base64url required');
  }
  for (const key of ['currentCredentialRef'] as const) {
    if (typeof value[key] !== 'string' || !OPAQUE.test(value[key])) result.errors.push(`${key}: invalid`);
  }
  for (const key of ['expectedCredentialRevocationEpoch', 'expectedCredentialOptimisticVersion'] as const) {
    if (typeof value[key] !== 'string' || !DECIMAL.test(value[key])) result.errors.push(`${key}: decimal string required`);
  }
  result.valid = result.errors.length === 0;
  return result;
}

export function validateDeviceSigningCredentialRevokeCommandV1(
  value: unknown,
): DeviceSigningCredentialValidationResultV1 {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['command: expected object'] };
  hasOnlyKeys(value, [
    'schemaVersion',
    'requestId',
    'credentialRef',
    'expectedDeviceFence',
    'expectedCredentialRevocationEpoch',
    'expectedCredentialOptimisticVersion',
    'reasonCode',
  ], [], errors);
  if (value.schemaVersion !== DEVICE_SIGNING_CREDENTIAL_SCHEMA_VERSION) errors.push('schemaVersion: unsupported');
  if (typeof value.requestId !== 'string' || !OPAQUE.test(value.requestId)) errors.push('requestId: invalid');
  if (typeof value.credentialRef !== 'string' || !OPAQUE.test(value.credentialRef)) errors.push('credentialRef: invalid');
  for (const key of ['expectedCredentialRevocationEpoch', 'expectedCredentialOptimisticVersion'] as const) {
    if (typeof value[key] !== 'string' || !DECIMAL.test(value[key])) errors.push(`${key}: decimal string required`);
  }
  if (!['owner_revoke', 'device_lost', 'device_stolen', 'compromised', 'retired'].includes(String(value.reasonCode))) {
    errors.push('reasonCode: unsupported');
  }
  return { valid: errors.length === 0, errors };
}

export function isDeviceSigningKeyProofV1(value: unknown): value is DeviceSigningKeyProofV1 {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === 'signature' && typeof value.signature === 'string' && /^[A-Za-z0-9_-]{86}$/.test(value.signature);
}
