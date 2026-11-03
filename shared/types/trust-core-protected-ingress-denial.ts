import {
  computeEmbeddedCanonicalSha256V1,
  validateShellCommandReservationCommandV1,
  type ShellCommandReservationCommandV1,
} from './soul-core-embedded';
import type {
  TrustCoreChallengeTerminalReceiptV1,
  TrustCoreContinuityReasonCodeV1,
  TrustCoreEvidenceEnvironmentV1,
} from './trust-core-continuity-exit';
import type { DigestRef, RecordRef } from './trust-loop-primitives';

export const TRUST_CORE_PROTECTED_INGRESS_KIND_V1 =
  'soul_shell_wallet_session' as const;
export const TRUST_CORE_PROTECTED_INGRESS_ROUTE_V1 =
  'POST /soul-shell/wallet-session' as const;

export const TRUST_CORE_PROTECTED_WALLET_INTENT_KINDS_V1 = [
  'purchase',
  'quickpay',
  'x402',
  'transfer',
] as const;
export type TrustCoreProtectedWalletIntentKindV1 =
  (typeof TRUST_CORE_PROTECTED_WALLET_INTENT_KINDS_V1)[number];

export interface TrustCoreProtectedWalletIntentV1 {
  agentAccountId: string;
  shellSessionRef: RecordRef;
  kind: TrustCoreProtectedWalletIntentKindV1;
  amount: { value: number; currency: string };
  commandReservation: ShellCommandReservationCommandV1;
}

/** Trust-owned TCR-CE-05 probe. It carries no caller-selected evidence outcome. */
export interface TrustCoreProtectedIngressDenialCommandV1 {
  schemaVersion: 1;
  agentId: string;
  agentAccountId: string;
  ownerUserId: string;
  tenantId: string;
  tenantRef: RecordRef;
  environment: TrustCoreEvidenceEnvironmentV1;
  expectedOwnershipEpoch: string;
  predecessorRuntimeRef: RecordRef;
  predecessorBindingRef: RecordRef;
  applicableSetRevokeJournalRef: string;
  intent: TrustCoreProtectedWalletIntentV1;
  idempotencyKey: string;
}

export interface TrustCoreProtectedIngressRevocationEvidenceV1 {
  applicableSetRevokeJournalRef: string;
  revocationOperationId: string;
  applicableSetDigest: DigestRef;
  bindingRef: RecordRef;
  bindingRevocationReceiptRef: string;
  bindingRevocationReceiptDigest: DigestRef;
  postBindingRevocationEpoch: string;
  postBindingOptimisticVersion: string;
  bindingStateDigest: DigestRef;
  observedAt: string;
}

export interface TrustCoreProtectedIngressObservationV1 {
  ingressKind: typeof TRUST_CORE_PROTECTED_INGRESS_KIND_V1;
  route: typeof TRUST_CORE_PROTECTED_INGRESS_ROUTE_V1;
  authentication: 'jwt_principal_bound';
  authenticatedPrincipalRef: RecordRef;
  tenantId: string;
  environment: TrustCoreEvidenceEnvironmentV1;
  ownershipEpoch: string;
  challengeJournalRef: string;
  challengeRequestDigest: string;
  bindingRef: RecordRef;
  runtimeRef: RecordRef;
  requestDigest: string;
  decision: 'denied';
  denialReason: string;
  observedAt: string;
  evidenceDigest: DigestRef;
}

export interface TrustCoreNoSideEffectFenceV1 {
  shellCommandJournal:
    | { disposition: 'absent' }
    | {
        disposition: 'rejected_pre_execution';
        journalEntryRef: RecordRef;
        terminalReason: 'pre_execution_fence_failed';
      };
  downstreamIdempotencyRef: RecordRef;
  walletSessionRow: 'absent';
  finalBusinessSideEffectCommitted: false;
  observedAt: string;
  evidenceDigest: DigestRef;
}

export interface TrustCoreProtectedIngressDenialSnapshotV1
  extends Record<string, unknown> {
  revocation: TrustCoreProtectedIngressRevocationEvidenceV1;
  ingress: TrustCoreProtectedIngressObservationV1;
  sideEffectFence: TrustCoreNoSideEffectFenceV1;
}

export interface TrustCoreProtectedIngressDenialReceiptV1
  extends TrustCoreChallengeTerminalReceiptV1 {
  operationKind: 'protected_ingress_denial';
  resultSnapshot: TrustCoreProtectedIngressDenialSnapshotV1;
}

export type TrustCoreProtectedIngressDenialResultV1 =
  | {
      status: 'verified';
      evidence: TrustCoreProtectedIngressDenialSnapshotV1;
      receipt: TrustCoreProtectedIngressDenialReceiptV1;
    }
  | {
      status: 'denied' | 'conflict' | 'unavailable';
      reasonCode: TrustCoreContinuityReasonCodeV1;
      receipt: TrustCoreChallengeTerminalReceiptV1;
    }
  | {
      status: 'unknown';
      reasonCode: 'challenge_in_progress' | 'challenge_unknown_outcome';
      journalRef: string;
      requestDigest: string;
    };

export interface TrustCoreProtectedIngressValidationResultV1 {
  valid: boolean;
  errors: string[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECIMAL = /^(0|[1-9][0-9]*)$/;
const DIGEST = /^[0-9a-f]{64}$/;
const OPAQUE = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,191}$/;
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
  expectedType: string,
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

export function computeTrustCoreProtectedWalletIntentDigestV1(
  intent: TrustCoreProtectedWalletIntentV1,
): string {
  return computeEmbeddedCanonicalSha256V1({
    agentAccountId: intent.agentAccountId,
    amount: { currency: intent.amount.currency, value: intent.amount.value },
    kind: intent.kind,
    shellSessionRef: {
      id: intent.shellSessionRef.id,
      type: intent.shellSessionRef.type,
      ...(intent.shellSessionRef.version === undefined
        ? {}
        : { version: intent.shellSessionRef.version }),
    },
  });
}

export function validateTrustCoreProtectedIngressDenialCommandV1(
  value: unknown,
): TrustCoreProtectedIngressValidationResultV1 {
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
      'predecessorBindingRef',
      'applicableSetRevokeJournalRef',
      'intent',
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
  for (const key of ['agentAccountId', 'ownerUserId', 'applicableSetRevokeJournalRef'] as const) {
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
  if (!recordRef(value.predecessorBindingRef, 'shell_session_binding', true)) {
    errors.push('predecessorBindingRef is invalid');
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

  if (!object(value.intent)) {
    errors.push('intent must be an object');
  } else {
    const intent = value.intent;
    if (!exact(intent, ['agentAccountId', 'shellSessionRef', 'kind', 'amount', 'commandReservation'])) {
      errors.push('intent contains unknown fields');
    }
    if (intent.agentAccountId !== value.agentAccountId) {
      errors.push('intent agentAccountId mismatch');
    }
    if (
      !recordRef(intent.shellSessionRef, 'shell_session_binding', true) ||
      !object(value.predecessorBindingRef) ||
      intent.shellSessionRef.id !== value.predecessorBindingRef.id ||
      intent.shellSessionRef.version !== value.predecessorBindingRef.version
    ) {
      errors.push('intent shellSessionRef mismatch');
    }
    if (!(TRUST_CORE_PROTECTED_WALLET_INTENT_KINDS_V1 as readonly unknown[]).includes(intent.kind)) {
      errors.push('intent kind is unsupported');
    }
    if (
      !object(intent.amount) ||
      !exact(intent.amount, ['value', 'currency']) ||
      typeof intent.amount.value !== 'number' ||
      !Number.isFinite(intent.amount.value) ||
      intent.amount.value <= 0 ||
      typeof intent.amount.currency !== 'string' ||
      !/^[A-Za-z0-9]{2,16}$/.test(intent.amount.currency)
    ) {
      errors.push('intent amount is invalid');
    }
    const reservation = validateShellCommandReservationCommandV1(intent.commandReservation);
    errors.push(...reservation.errors.map((error) => `intent.commandReservation.${error}`));
    if (
      object(intent.commandReservation) &&
      object(intent.commandReservation.signedCommand) &&
      object(intent.commandReservation.signedCommand.signingPayload) &&
      object(intent.commandReservation.signedCommand.signingPayload.envelope)
    ) {
      const envelope = intent.commandReservation.signedCommand.signingPayload.envelope;
      if (
        !object(value.predecessorBindingRef) ||
        envelope.bindingId !== value.predecessorBindingRef.id ||
        envelope.bindingVersion !== value.predecessorBindingRef.version
      ) {
        errors.push('signed command binding mismatch');
      }
      if (
        object(intent.amount) &&
        typeof intent.amount.value === 'number' &&
        typeof intent.amount.currency === 'string' &&
        typeof intent.agentAccountId === 'string' &&
        recordRef(intent.shellSessionRef, 'shell_session_binding', true)
      ) {
        const digest = computeTrustCoreProtectedWalletIntentDigestV1(
          intent as unknown as TrustCoreProtectedWalletIntentV1,
        );
        if (envelope.requestDigest !== digest || !DIGEST.test(String(envelope.requestDigest))) {
          errors.push('signed command requestDigest mismatch');
        }
      }
    }
  }
  return { valid: errors.length === 0, errors };
}
