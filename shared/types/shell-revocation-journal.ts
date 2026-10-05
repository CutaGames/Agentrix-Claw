import type { DeviceEpochFenceV1 } from './device-lifecycle';
import {
  canonicalizeJson,
  sha256Hex,
  utf8Encode,
  type RecordRef,
} from './trust-loop-primitives';

export const SHELL_REVOCATION_JOURNAL_SCHEMA_VERSION = 1 as const;
export const SHELL_BINDING_REVOCATION_REASONS = [
  'owner_revoke',
  'logout',
  'agent_switch',
  'tenant_switch',
  'runtime_switch',
  'device_lost',
  'device_transfer',
  'key_rotation',
  'owner_transfer',
  'replacement',
] as const;

export type ShellBindingRevocationReasonV1 =
  (typeof SHELL_BINDING_REVOCATION_REASONS)[number];

export interface ShellBindingFenceCompanionV1 {
  schemaVersion: typeof SHELL_REVOCATION_JOURNAL_SCHEMA_VERSION;
  bindingRef: RecordRef;
  bindingRevocationEpoch: string;
  bindingOptimisticVersion: string;
  deviceFence: DeviceEpochFenceV1 | null;
  capturedAt: string;
  digest: string;
}

export interface ShellBindingRevokeCommandV1 {
  schemaVersion: typeof SHELL_REVOCATION_JOURNAL_SCHEMA_VERSION;
  requestId: string;
  bindingRef: RecordRef;
  expectedBindingRevocationEpoch: string;
  expectedBindingOptimisticVersion: string;
  reasonCode: ShellBindingRevocationReasonV1;
}

export interface ShellBindingSupersedeCommandV1 {
  schemaVersion: typeof SHELL_REVOCATION_JOURNAL_SCHEMA_VERSION;
  requestId: string;
  predecessorBindingRef: RecordRef;
  successorBindingRef: RecordRef;
  expectedBindingRevocationEpoch: string;
  expectedBindingOptimisticVersion: string;
  reasonCode: 'replacement' | 'agent_switch' | 'tenant_switch' | 'runtime_switch';
}

export interface ShellBindingRevocationReceiptV1 {
  schemaVersion: typeof SHELL_REVOCATION_JOURNAL_SCHEMA_VERSION;
  receiptId: string;
  operation: 'revoke' | 'supersede';
  bindingRef: RecordRef;
  successorBindingRef: RecordRef | null;
  requestId: string;
  requestDigest: string;
  reasonCode: ShellBindingRevocationReasonV1;
  preEpoch: string;
  postEpoch: string;
  preOptimisticVersion: string;
  postOptimisticVersion: string;
  state: 'state_and_outbox_reserved';
  acceptedAt: string;
}

export interface ShellJournalTerminalResultV1 {
  allowed: boolean;
  reason?: string;
  sessionId?: string;
}

export interface ShellJournalReservationReceiptV1 {
  schemaVersion: typeof SHELL_REVOCATION_JOURNAL_SCHEMA_VERSION;
  journalEntryRef: RecordRef;
  state: 'reserved' | 'executing' | 'succeeded' | 'rejected' | 'unknown-outcome';
  bindingFence: ShellBindingFenceCompanionV1;
  downstreamIdempotencyRef: RecordRef;
  resultRef?: RecordRef;
  /** Exact durable downstream response. Present only for succeeded/rejected terminal states. */
  terminalResultSnapshot?: ShellJournalTerminalResultV1;
}

/**
 * Deterministic token that a fenced executor must consume at its side-effect
 * linearization point. Every field is sourced from the immutable journal row.
 */
export interface ShellDownstreamExecutionTokenV1 {
  schemaVersion: typeof SHELL_REVOCATION_JOURNAL_SCHEMA_VERSION;
  journalEntryRef: RecordRef;
  downstreamIdempotencyRef: RecordRef;
  requestDigest: string;
  revocationFence: unknown;
  bindingFence: ShellBindingFenceCompanionV1;
  digest: string;
}

function hexToBase64Url(hex: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let output = '';
  for (let offset = 0; offset < hex.length; offset += 6) {
    const chunk = hex.slice(offset, offset + 6);
    const byteCount = chunk.length / 2;
    const value = Number.parseInt(chunk.padEnd(6, '0'), 16);
    output += alphabet[(value >>> 18) & 63];
    output += alphabet[(value >>> 12) & 63];
    if (byteCount > 1) output += alphabet[(value >>> 6) & 63];
    if (byteCount > 2) output += alphabet[value & 63];
  }
  return output;
}

/**
 * Client-constructible digest over the *stable* fence identity.
 *
 * `ShellBindingFenceCompanionV1.digest` deliberately covers `capturedAt`, which the
 * server stamps when it captures the fence. That makes it tamper-evidence for the
 * stored snapshot, but unusable inside a token the client must produce *before* the
 * server captures anything. This digest covers only the fields that a client can read
 * ahead of signing and that must invalidate the token when they change: the binding
 * identity, its revocation epoch, its optimistic version, and the device fence.
 */
export function computeShellBindingFenceStableDigestV1(input: {
  bindingRef: RecordRef;
  bindingRevocationEpoch: string;
  bindingOptimisticVersion: string;
  deviceFence: DeviceEpochFenceV1 | null;
}): string {
  return sha256Hex(
    utf8Encode(
      canonicalizeJson({
        domain: 'agentrix:shell-binding-fence-stable:v1',
        schemaVersion: SHELL_REVOCATION_JOURNAL_SCHEMA_VERSION,
        bindingRef: input.bindingRef,
        bindingRevocationEpoch: input.bindingRevocationEpoch,
        bindingOptimisticVersion: input.bindingOptimisticVersion,
        deviceFence: input.deviceFence,
      }),
    ),
  );
}

/** Public deterministic binding; this is integrity binding, not an authentication secret. */
export function computeShellDownstreamFenceTokenV1(input: {
  requestDigest: string;
  fenceSetDigest: string;
  bindingRef: RecordRef;
  /** Must come from computeShellBindingFenceStableDigestV1; never the capturedAt-bearing digest. */
  bindingFenceStableDigest: string;
}): string {
  const digest = sha256Hex(
    utf8Encode(
      canonicalizeJson({
        domain: 'agentrix:wallet-session-fence:v1',
        ...input,
      }),
    ),
  );
  return hexToBase64Url(digest);
}

export function computeShellDownstreamExecutionTokenDigestV1(
  input: Omit<ShellDownstreamExecutionTokenV1, 'digest'>,
): string {
  return sha256Hex(utf8Encode(canonicalizeJson(input)));
}

export const SHELL_COMMAND_SIGNATURE_VERIFIER_PORT = Symbol(
  'SHELL_COMMAND_SIGNATURE_VERIFIER_PORT',
);
export const SHELL_REVOCATION_FENCE_VALIDATOR_PORT = Symbol(
  'SHELL_REVOCATION_FENCE_VALIDATOR_PORT',
);

export interface ShellCommandSignatureVerifierPort {
  verify(input: {
    signedCommand: unknown;
    bindingRef: RecordRef;
    principalRef: RecordRef;
    keyRef: string | null;
    keyPurpose: string | null;
  }): Promise<boolean>;
}

export interface ShellCommandRevocationFenceValidatorPort {
  assertCurrent(input: {
    revocationFence: unknown;
    bindingRef: RecordRef;
    bindingFence: ShellBindingFenceCompanionV1;
    requestDigest: string;
  }): Promise<void>;
}

export interface ShellRevocationValidationResult {
  valid: boolean;
  errors: string[];
}

const DECIMAL = /^(0|[1-9][0-9]*)$/;
const OPAQUE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function strictKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const expected = new Set(keys);
  return Object.keys(value).every((key) => expected.has(key));
}

function isBindingRef(value: unknown): value is RecordRef {
  return (
    isRecord(value) &&
    strictKeys(value, ['type', 'id', 'version']) &&
    value.type === 'shell_session_binding' &&
    typeof value.id === 'string' &&
    OPAQUE.test(value.id) &&
    typeof value.version === 'number' &&
    Number.isInteger(value.version) &&
    value.version > 0
  );
}

export function validateShellBindingRevokeCommandV1(
  value: unknown,
): ShellRevocationValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['command must be an object'] };
  if (
    !strictKeys(value, [
      'schemaVersion',
      'requestId',
      'bindingRef',
      'expectedBindingRevocationEpoch',
      'expectedBindingOptimisticVersion',
      'reasonCode',
    ])
  ) {
    errors.push('command contains unknown fields');
  }
  if (value.schemaVersion !== SHELL_REVOCATION_JOURNAL_SCHEMA_VERSION) {
    errors.push('unsupported schemaVersion');
  }
  if (typeof value.requestId !== 'string' || !OPAQUE.test(value.requestId)) {
    errors.push('requestId is invalid');
  }
  if (!isBindingRef(value.bindingRef)) errors.push('bindingRef is invalid');
  if (
    typeof value.expectedBindingRevocationEpoch !== 'string' ||
    !DECIMAL.test(value.expectedBindingRevocationEpoch)
  ) {
    errors.push('expectedBindingRevocationEpoch must be a decimal string');
  }
  if (
    typeof value.expectedBindingOptimisticVersion !== 'string' ||
    !DECIMAL.test(value.expectedBindingOptimisticVersion)
  ) {
    errors.push('expectedBindingOptimisticVersion must be a decimal string');
  }
  if (!SHELL_BINDING_REVOCATION_REASONS.includes(value.reasonCode as ShellBindingRevocationReasonV1)) {
    errors.push('reasonCode is invalid');
  }
  return { valid: errors.length === 0, errors };
}

export function validateShellBindingSupersedeCommandV1(
  value: unknown,
): ShellRevocationValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['command must be an object'] };
  if (
    !strictKeys(value, [
      'schemaVersion',
      'requestId',
      'predecessorBindingRef',
      'successorBindingRef',
      'expectedBindingRevocationEpoch',
      'expectedBindingOptimisticVersion',
      'reasonCode',
    ])
  ) {
    errors.push('command contains unknown fields');
  }
  if (value.schemaVersion !== SHELL_REVOCATION_JOURNAL_SCHEMA_VERSION) {
    errors.push('unsupported schemaVersion');
  }
  if (typeof value.requestId !== 'string' || !OPAQUE.test(value.requestId)) {
    errors.push('requestId is invalid');
  }
  if (!isBindingRef(value.predecessorBindingRef)) errors.push('predecessorBindingRef is invalid');
  if (!isBindingRef(value.successorBindingRef)) errors.push('successorBindingRef is invalid');
  if (
    isBindingRef(value.predecessorBindingRef) &&
    isBindingRef(value.successorBindingRef) &&
    value.predecessorBindingRef.id === value.successorBindingRef.id &&
    value.predecessorBindingRef.version === value.successorBindingRef.version
  ) {
    errors.push('successor must differ from predecessor');
  }
  if (
    typeof value.expectedBindingRevocationEpoch !== 'string' ||
    !DECIMAL.test(value.expectedBindingRevocationEpoch)
  ) {
    errors.push('expectedBindingRevocationEpoch must be a decimal string');
  }
  if (
    typeof value.expectedBindingOptimisticVersion !== 'string' ||
    !DECIMAL.test(value.expectedBindingOptimisticVersion)
  ) {
    errors.push('expectedBindingOptimisticVersion must be a decimal string');
  }
  if (!['replacement', 'agent_switch', 'tenant_switch', 'runtime_switch'].includes(String(value.reasonCode))) {
    errors.push('reasonCode is invalid');
  }
  return { valid: errors.length === 0, errors };
}
