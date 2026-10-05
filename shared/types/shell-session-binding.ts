import {
  ACTION_ATTRIBUTION_SCHEMA_VERSION,
  isAuthorityRootRefV1,
  isRecordRefV1,
  type AgentSoulContractValidationResultV1,
  type AuthorityRootRefV1,
} from './agent-attribution';
import type { RecordRef } from './trust-loop-primitives';

/** ADR-SOUL-002 versioned Shell binding and command-journal contract. */
export const SHELL_SESSION_BINDING_SCHEMA_VERSION = 1 as const;
export const SHELL_COMMAND_SCHEMA_VERSION = 1 as const;
export const SHELL_COMMAND_JOURNAL_SCHEMA_VERSION = 1 as const;

export const SHELL_BINDING_STATUSES_V1 = [
  'active',
  'expired',
  'revoked',
  'superseded',
] as const;
export type ShellSessionBindingStatusV1 = (typeof SHELL_BINDING_STATUSES_V1)[number];

export const SHELL_KEY_PURPOSES_V1 = [
  'device-auth',
  'attestation',
  'session-auth',
  'local-encryption',
] as const;
export type ShellKeyPurposeV1 = (typeof SHELL_KEY_PURPOSES_V1)[number];

export interface ShellSessionBindingV1 {
  schemaVersion: typeof SHELL_SESSION_BINDING_SCHEMA_VERSION;
  bindingId: string;
  bindingVersion: number;
  agentId: string;
  accountableAgentId: string;
  authorityRootRef: AuthorityRootRefV1;
  principalRef: RecordRef;
  tenantRef?: RecordRef;
  shellId: string;
  deviceId?: string;
  runtimeRef: RecordRef;
  keyRef?: string;
  keyPurpose?: ShellKeyPurposeV1;
  audience: string[];
  capabilities: string[];
  nonceDomain: string;
  issuedAt: string;
  expiresAt: string;
  status: ShellSessionBindingStatusV1;
  supersedesBindingId?: string;
  revokedAt?: string;
  revocationReason?: string;
}

export interface ShellCommandEnvelopeV1 {
  schemaVersion: typeof SHELL_COMMAND_SCHEMA_VERSION;
  bindingId: string;
  bindingVersion: number;
  nonceDomain: string;
  /** At least 128-bit random material or a trusted executor's strict monotonic counter. */
  nonce: string;
  idempotencyKey: string;
  requestDigest: string;
  issuedAt: string;
  expiresAt: string;
}

export const SHELL_COMMAND_JOURNAL_STATES_V1 = [
  'reserved',
  'executing',
  'succeeded',
  'rejected',
  'unknown-outcome',
] as const;
export type ShellCommandJournalStateV1 = (typeof SHELL_COMMAND_JOURNAL_STATES_V1)[number];

/** The two tuples below are independent atomic unique-claim scopes. */
export interface ShellCommandClaimKeysV1 {
  nonceKey: readonly [bindingId: string, bindingVersion: number, nonceDomain: string, nonce: string];
  idempotencyKey: readonly [
    bindingId: string,
    bindingVersion: number,
    nonceDomain: string,
    idempotencyKey: string,
  ];
}

export interface ShellCommandJournalEntryV1 {
  schemaVersion: typeof SHELL_COMMAND_JOURNAL_SCHEMA_VERSION;
  bindingId: string;
  bindingVersion: number;
  nonceDomain: string;
  nonce: string;
  idempotencyKey: string;
  requestDigest: string;
  state: ShellCommandJournalStateV1;
  resultRef?: RecordRef;
  downstreamIdempotencyRef?: RecordRef;
  reservedAt: string;
  updatedAt: string;
}

export type ShellCommandRetryDispositionV1 =
  | 'in-progress'
  | 'return-terminal-result'
  | 'conflict'
  | 'reconciliation-required';

export interface ShellBindingValidationContextV1 {
  tenantScoped?: boolean;
  now?: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isStringArray(value: unknown, allowEmpty = false): value is string[] {
  return (
    Array.isArray(value) &&
    (allowEmpty || value.length > 0) &&
    value.every(isNonEmptyString) &&
    new Set(value).size === value.length
  );
}

function result(errors: string[]): AgentSoulContractValidationResultV1 {
  return { valid: errors.length === 0, errors };
}

export function validateShellSessionBindingV1(
  input: unknown,
  context: ShellBindingValidationContextV1 = {},
): AgentSoulContractValidationResultV1 {
  const errors: string[] = [];
  if (!isObject(input)) return result(['binding: expected object']);

  if (input.schemaVersion !== SHELL_SESSION_BINDING_SCHEMA_VERSION) {
    errors.push(`binding.schemaVersion: unsupported version ${JSON.stringify(input.schemaVersion)}`);
  }
  for (const key of [
    'bindingId',
    'agentId',
    'accountableAgentId',
    'shellId',
    'nonceDomain',
  ] as const) {
    if (!isNonEmptyString(input[key])) errors.push(`binding.${key}: expected non-empty string`);
  }
  if (
    typeof input.bindingVersion !== 'number' ||
    !Number.isInteger(input.bindingVersion) ||
    input.bindingVersion < 1
  ) {
    errors.push('binding.bindingVersion: expected positive integer');
  }
  if (!isAuthorityRootRefV1(input.authorityRootRef)) {
    errors.push('binding.authorityRootRef: unknown kind or malformed reference');
  }
  if (!isRecordRefV1(input.principalRef)) {
    errors.push('binding.principalRef: expected known RecordRef');
  }
  if (!isRecordRefV1(input.runtimeRef)) {
    errors.push('binding.runtimeRef: expected known RecordRef');
  }
  if (input.tenantRef !== undefined && !isRecordRefV1(input.tenantRef)) {
    errors.push('binding.tenantRef: expected known RecordRef when present');
  }
  if (context.tenantScoped === true && !isRecordRefV1(input.tenantRef)) {
    errors.push('binding.tenantRef: required for tenant-scoped device, Runtime or data');
  }
  if (input.deviceId !== undefined && !isNonEmptyString(input.deviceId)) {
    errors.push('binding.deviceId: expected non-empty string when present');
  }
  if (!isStringArray(input.audience)) {
    errors.push('binding.audience: expected non-empty unique string array');
  }
  if (!isStringArray(input.capabilities)) {
    errors.push('binding.capabilities: expected non-empty unique string array');
  }
  if (!isTimestamp(input.issuedAt) || !isTimestamp(input.expiresAt)) {
    errors.push('binding.issuedAt/expiresAt: expected valid timestamps');
  } else if (Date.parse(input.issuedAt) >= Date.parse(input.expiresAt)) {
    errors.push('binding.expiresAt: must be after issuedAt');
  }
  if (!(SHELL_BINDING_STATUSES_V1 as readonly unknown[]).includes(input.status)) {
    errors.push('binding.status: unknown status');
  }
  if (isNonEmptyString(input.agentId) && input.accountableAgentId !== input.agentId) {
    errors.push('binding.accountableAgentId: Shell binding must account to its bound Agent');
  }
  if ((input.keyRef === undefined) !== (input.keyPurpose === undefined)) {
    errors.push('binding.keyRef/keyPurpose: both must be present or absent');
  }
  if (input.keyRef !== undefined && !isNonEmptyString(input.keyRef)) {
    errors.push('binding.keyRef: expected non-empty string when present');
  }
  if (
    input.keyPurpose !== undefined &&
    !(SHELL_KEY_PURPOSES_V1 as readonly unknown[]).includes(input.keyPurpose)
  ) {
    errors.push('binding.keyPurpose: unknown purpose');
  }
  if (input.supersedesBindingId !== undefined && !isNonEmptyString(input.supersedesBindingId)) {
    errors.push('binding.supersedesBindingId: expected non-empty string when present');
  }
  if (input.revokedAt !== undefined && !isTimestamp(input.revokedAt)) {
    errors.push('binding.revokedAt: expected valid timestamp when present');
  }
  if (input.revocationReason !== undefined && !isNonEmptyString(input.revocationReason)) {
    errors.push('binding.revocationReason: expected non-empty string when present');
  }
  if (input.status === 'revoked' && !isTimestamp(input.revokedAt)) {
    errors.push('binding.revokedAt: required when status is revoked');
  }
  if (
    context.now !== undefined &&
    (!isTimestamp(context.now) ||
      (input.status === 'active' &&
        isTimestamp(input.expiresAt) &&
        Date.parse(context.now) >= Date.parse(input.expiresAt)))
  ) {
    errors.push('binding: active binding is expired or validation time is invalid');
  }

  return result(errors);
}

export function validateShellCommandEnvelopeV1(
  input: unknown,
): AgentSoulContractValidationResultV1 {
  const errors: string[] = [];
  if (!isObject(input)) return result(['command: expected object']);

  if (input.schemaVersion !== SHELL_COMMAND_SCHEMA_VERSION) {
    errors.push(`command.schemaVersion: unsupported version ${JSON.stringify(input.schemaVersion)}`);
  }
  for (const key of [
    'bindingId',
    'nonceDomain',
    'nonce',
    'idempotencyKey',
    'requestDigest',
  ] as const) {
    if (!isNonEmptyString(input[key])) errors.push(`command.${key}: expected non-empty string`);
  }
  if (
    typeof input.bindingVersion !== 'number' ||
    !Number.isInteger(input.bindingVersion) ||
    input.bindingVersion < 1
  ) {
    errors.push('command.bindingVersion: expected positive integer');
  }
  if (!isTimestamp(input.issuedAt) || !isTimestamp(input.expiresAt)) {
    errors.push('command.issuedAt/expiresAt: expected valid timestamps');
  } else if (Date.parse(input.issuedAt) >= Date.parse(input.expiresAt)) {
    errors.push('command.expiresAt: must be after issuedAt');
  }
  return result(errors);
}

export function validateShellCommandAgainstBindingV1(
  command: unknown,
  binding: unknown,
  now: string,
): AgentSoulContractValidationResultV1 {
  const commandResult = validateShellCommandEnvelopeV1(command);
  const bindingResult = validateShellSessionBindingV1(binding, { now });
  const errors = [...commandResult.errors, ...bindingResult.errors];
  if (!commandResult.valid || !bindingResult.valid || !isObject(command) || !isObject(binding)) {
    return result(errors);
  }

  if (binding.status !== 'active') errors.push('binding.status: command requires active binding');
  if (command.bindingId !== binding.bindingId) errors.push('command.bindingId: binding mismatch');
  if (command.bindingVersion !== binding.bindingVersion) {
    errors.push('command.bindingVersion: binding version mismatch');
  }
  if (command.nonceDomain !== binding.nonceDomain) {
    errors.push('command.nonceDomain: binding nonce domain mismatch');
  }
  if (!isTimestamp(now)) {
    errors.push('command: invalid validation time');
  } else {
    if (isTimestamp(command.issuedAt) && Date.parse(command.issuedAt) > Date.parse(now)) {
      errors.push('command.issuedAt: command is not yet valid');
    }
    if (isTimestamp(command.expiresAt) && Date.parse(command.expiresAt) <= Date.parse(now)) {
      errors.push('command.expiresAt: command expired');
    }
  }
  if (
    isTimestamp(command.issuedAt) &&
    isTimestamp(binding.issuedAt) &&
    Date.parse(command.issuedAt) < Date.parse(binding.issuedAt)
  ) {
    errors.push('command.issuedAt: predates binding');
  }
  if (
    isTimestamp(command.expiresAt) &&
    isTimestamp(binding.expiresAt) &&
    Date.parse(command.expiresAt) > Date.parse(binding.expiresAt)
  ) {
    errors.push('command.expiresAt: exceeds binding expiry');
  }
  return result(errors);
}

export function getShellCommandClaimKeysV1(
  command: ShellCommandEnvelopeV1,
): ShellCommandClaimKeysV1 {
  return {
    nonceKey: [command.bindingId, command.bindingVersion, command.nonceDomain, command.nonce],
    idempotencyKey: [
      command.bindingId,
      command.bindingVersion,
      command.nonceDomain,
      command.idempotencyKey,
    ],
  };
}

/**
 * Retry policy is intentionally fail-closed: unknown outcome never authorizes a
 * replay; only reconciliation using a downstream idempotency reference may
 * resolve it.
 */
export function evaluateShellCommandRetryV1(
  existing: ShellCommandJournalEntryV1,
  incoming: ShellCommandEnvelopeV1,
): ShellCommandRetryDispositionV1 {
  if (
    existing.bindingId !== incoming.bindingId ||
    existing.bindingVersion !== incoming.bindingVersion ||
    existing.nonceDomain !== incoming.nonceDomain ||
    (existing.nonce !== incoming.nonce &&
      existing.idempotencyKey !== incoming.idempotencyKey) ||
    existing.requestDigest !== incoming.requestDigest
  ) {
    return 'conflict';
  }
  if (existing.state === 'unknown-outcome') return 'reconciliation-required';
  if (existing.state === 'reserved' || existing.state === 'executing') return 'in-progress';
  return 'return-terminal-result';
}

/** Shared schema marker kept equal to attribution v1 for cross-contract assertions. */
export const SHELL_ACTION_ATTRIBUTION_SCHEMA_VERSION = ACTION_ATTRIBUTION_SCHEMA_VERSION;
