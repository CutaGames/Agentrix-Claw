/**
 * Mobile Agent Economy workflow API.
 *
 * Thin surface wrapper over the shared, transport-agnostic clients. Mobile
 * exposes Goal → discovery → select → quote → authorize → optional paid
 * execution/remedy plus a separate receipt reader. Paid and Remedy mutations
 * have independent build gates and remain fail-closed by default.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createAgentEconomyClient,
  createAgentEconomyReceiptClient,
  createEconomyIdempotencyKey,
  describeEconomyClientError,
  type AgentEconomyClientLike,
  type AgentEconomyMutationResult,
  type AgentEconomyReceiptClientLike,
  type AgentEconomyWorkflowView,
  type CreateEconomyGoalInput,
  type DiscoverEconomyCandidatesInput,
} from '../../shared/client';
import { getApiConfig } from './api';
import { isMobileV6FeatureEnabled } from './mobileV6FeatureFlags';
import { mobileV6HttpTransport } from './mobileV6Runtime';
import { useAuthStore } from '../stores/authStore';

export type {
  AgentEconomyClientLike,
  AgentEconomyMutationResult,
  AgentEconomyReceiptClientLike,
  AgentEconomyWorkflowView,
  CreateEconomyGoalInput,
  DiscoverEconomyCandidatesInput,
};
export { describeEconomyClientError };

export interface MobileEconomyPaymentCheckpointScope {
  ownerId: string;
  soulCoreId: string;
  actionId: string;
}

export interface MobileEconomyPaymentCheckpoint
  extends MobileEconomyPaymentCheckpointScope {
  schemaVersion: 1;
  quoteId: string;
  idempotencyKey: string;
  walletInvocationId?: string;
  state: 'intent_persisted' | 'proof_persisted' | 'recovery_blocked';
  proof?: { txHash: string; network: string; asset: string };
  createdAt: string;
  updatedAt: string;
  recoveryError?: string;
}

const MOBILE_ECONOMY_PAYMENT_CHECKPOINT_PREFIX = '@agentrix/economy-payment/v1';

function mobileEconomyPaymentCheckpointKey(
  scope: MobileEconomyPaymentCheckpointScope,
): string {
  return `${MOBILE_ECONOMY_PAYMENT_CHECKPOINT_PREFIX}:${encodeURIComponent(scope.ownerId)}:${encodeURIComponent(scope.soulCoreId)}:${encodeURIComponent(scope.actionId)}`;
}

/**
 * Load a durable wallet-payment fence. Corrupt storage fails closed instead of
 * deleting the record and reopening the wallet side effect.
 */
export async function loadMobileEconomyPaymentCheckpoint(
  scope: MobileEconomyPaymentCheckpointScope,
): Promise<MobileEconomyPaymentCheckpoint | null> {
  const key = mobileEconomyPaymentCheckpointKey(scope);
  const raw = await AsyncStorage.getItem(key);
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as MobileEconomyPaymentCheckpoint;
    if (
      value?.schemaVersion !== 1
      || value.ownerId !== scope.ownerId
      || value.soulCoreId !== scope.soulCoreId
      || value.actionId !== scope.actionId
      || !value.quoteId
      || !value.idempotencyKey
      || !['intent_persisted', 'proof_persisted'].includes(value.state)
      || (value.state === 'proof_persisted' && (
        !value.proof?.txHash || !value.proof.network || !value.proof.asset
      ))
    ) throw new Error('invalid_checkpoint');
    return value;
  } catch {
    const now = new Date().toISOString();
    return {
      schemaVersion: 1,
      ...scope,
      quoteId: '',
      idempotencyKey: '',
      state: 'recovery_blocked',
      createdAt: now,
      updatedAt: now,
      recoveryError: 'checkpoint_corrupt',
    };
  }
}

export async function saveMobileEconomyPaymentCheckpoint(
  checkpoint: MobileEconomyPaymentCheckpoint,
): Promise<void> {
  if (
    checkpoint.schemaVersion !== 1
    || checkpoint.state === 'recovery_blocked'
    || !checkpoint.ownerId
    || !checkpoint.soulCoreId
    || !checkpoint.actionId
    || !checkpoint.quoteId
    || !checkpoint.idempotencyKey
    || (checkpoint.state === 'proof_persisted' && (
      !checkpoint.proof?.txHash
      || !checkpoint.proof.network
      || !checkpoint.proof.asset
    ))
  ) throw new Error('mobile_payment_checkpoint_invalid');
  await AsyncStorage.setItem(
    mobileEconomyPaymentCheckpointKey(checkpoint),
    JSON.stringify(checkpoint),
  );
}

export async function clearMobileEconomyPaymentCheckpoint(
  scope: MobileEconomyPaymentCheckpointScope,
  expectedIdempotencyKey: string,
): Promise<void> {
  const current = await loadMobileEconomyPaymentCheckpoint(scope);
  if (!current) return;
  if (
    current.state === 'recovery_blocked'
    || current.idempotencyKey !== expectedIdempotencyKey
  ) throw new Error('mobile_payment_checkpoint_conflict');
  await AsyncStorage.removeItem(mobileEconomyPaymentCheckpointKey(scope));
}

export type MobileAgentEconomyClientLike = Pick<
  AgentEconomyClientLike,
  | 'discover'
  | 'createGoal'
  | 'discoverCandidates'
  | 'selectCandidate'
  | 'issueQuote'
  | 'authorize'
  | 'executePayment'
  | 'revoke'
  | 'reconcile'
  | 'requestRefund'
  | 'requestReversal'
  | 'getWorkflow'
>;

/** Live Agent Economy submission gate. Disabled builds stay draft/read-only. */
export function isMobileAgentEconomyEnabled(): boolean {
  return isMobileV6FeatureEnabled('mobile.agent_economy_v1');
}

/** User-wallet payment mutation gate. Exact opt-in; unset/other values are false. */
export function isMobileAgentEconomyPaidExecutionEnabled(): boolean {
  return isMobileAgentEconomyEnabled()
    && process.env.EXPO_PUBLIC_MOBILE_AGENT_ECONOMY_PAID_EXECUTION === '1';
}

/** Refund/reversal mutation gate, intentionally independent from paid execution. */
export function isMobileAgentEconomyRemedyExecutionEnabled(): boolean {
  return isMobileAgentEconomyEnabled()
    && process.env.EXPO_PUBLIC_MOBILE_AGENT_ECONOMY_REMEDY_EXECUTION === '1';
}

function mobileClientOptions(expectedOwnerId?: string | null) {
  const config = getApiConfig();
  return {
    transport: mobileV6HttpTransport,
    baseUrl: config.baseUrl ?? '',
    getAuthToken: () => {
      const currentOwnerId = useAuthStore.getState().user?.id ?? null;
      if (expectedOwnerId !== undefined && currentOwnerId !== expectedOwnerId) {
        throw new Error('mobile_owner_scope_changed');
      }
      return getApiConfig().token;
    },
    defaultHeaders: { 'X-Agentrix-Surface': 'mobile' },
  };
}

/**
 * Build a Mobile-scoped non-paid workflow client. The expected opaque owner ID
 * is retained only as a request guard; the bearer token is read per request so
 * a client from an unmounted previous-owner screen cannot use the next token.
 */
export function createMobileAgentEconomyClient(
  expectedOwnerId?: string | null,
): MobileAgentEconomyClientLike {
  const client = createAgentEconomyClient(mobileClientOptions(expectedOwnerId));
  return {
    discover: (input) => client.discover(input),
    createGoal: (soulCoreId, input, idempotencyKey) =>
      client.createGoal(soulCoreId, input, idempotencyKey),
    discoverCandidates: (soulCoreId, workflow, input, idempotencyKey) =>
      client.discoverCandidates(soulCoreId, workflow, input, idempotencyKey),
    selectCandidate: (soulCoreId, workflow, candidateId, idempotencyKey) =>
      client.selectCandidate(soulCoreId, workflow, candidateId, idempotencyKey),
    issueQuote: (soulCoreId, workflow, idempotencyKey) =>
      client.issueQuote(soulCoreId, workflow, idempotencyKey),
    authorize: (soulCoreId, workflow, idempotencyKey) => {
      const zeroValue = isMobileZeroUsdQuote(workflow.quote);
      const paidReady = isMobilePaidQuote(workflow.quote)
        && isMobileAgentEconomyPaidExecutionEnabled();
      if (!zeroValue && !paidReady) {
        return Promise.reject(new Error('mobile_paid_execution_disabled'));
      }
      return client.authorize(soulCoreId, workflow, idempotencyKey);
    },
    executePayment: (soulCoreId, workflow, input, idempotencyKey) => {
      if (!isMobileAgentEconomyPaidExecutionEnabled() || !isMobilePaidQuote(workflow.quote)) {
        return Promise.reject(new Error('mobile_paid_execution_disabled'));
      }
      return client.executePayment(soulCoreId, workflow, input, idempotencyKey);
    },
    revoke: (soulCoreId, workflow, idempotencyKey, reason) =>
      client.revoke(soulCoreId, workflow, idempotencyKey, reason),
    reconcile: (soulCoreId, workflow, idempotencyKey, outcome) =>
      client.reconcile(soulCoreId, workflow, idempotencyKey, outcome),
    requestRefund: (soulCoreId, workflow, authorityReceiptId, idempotencyKey, reason) => {
      if (!isMobileAgentEconomyRemedyExecutionEnabled()) {
        return Promise.reject(new Error('mobile_remedy_execution_disabled'));
      }
      return client.requestRefund(
        soulCoreId,
        workflow,
        authorityReceiptId,
        idempotencyKey,
        reason,
      );
    },
    requestReversal: (soulCoreId, workflow, authorityReceiptId, idempotencyKey, reason) => {
      if (!isMobileAgentEconomyRemedyExecutionEnabled()) {
        return Promise.reject(new Error('mobile_remedy_execution_disabled'));
      }
      return client.requestReversal(
        soulCoreId,
        workflow,
        authorityReceiptId,
        idempotencyKey,
        reason,
      );
    },
    getWorkflow: (soulCoreId, actionId) => client.getWorkflow(soulCoreId, actionId),
  };
}

/** Receipt-only reader with the same owner-session request guard. */
export function createMobileAgentEconomyReceiptClient(
  expectedOwnerId?: string | null,
): AgentEconomyReceiptClientLike {
  return createAgentEconomyReceiptClient(mobileClientOptions(expectedOwnerId));
}

/** Mobile idempotency keys are namespaced so the Backend can attribute retries. */
export function createMobileEconomyIdempotencyKey(scope: string): string {
  return createEconomyIdempotencyKey(scope, 'mobile-economy');
}

type MobileEconomyQuote = NonNullable<AgentEconomyWorkflowView['quote']>;
type MobileEconomyMandate = NonNullable<AgentEconomyWorkflowView['mandate']>;

/** Both the payable amount and its canonical ceiling must be zero USD. */
export function isMobileZeroUsdQuote(
  quote?: Pick<MobileEconomyQuote, 'amount' | 'maximumAmount'>,
): boolean {
  if (!quote
    || quote.amount.currency.toUpperCase() !== 'USD'
    || !/^0+$/.test(quote.amount.amountMinor)) return false;
  return quote.maximumAmount === undefined || (
    quote.maximumAmount.currency.toUpperCase() === 'USD'
    && /^0+$/.test(quote.maximumAmount.amountMinor)
  );
}

/** Paid quotes are usable only when the authority supplied digest-bound x402 terms. */
export function isMobilePaidQuote(
  quote?: Pick<MobileEconomyQuote, 'amount' | 'paymentRequirements'>,
): boolean {
  return !!quote
    && /[1-9]/.test(quote.amount.amountMinor)
    && quote.paymentRequirements !== undefined;
}

/** Status alone is insufficient: an active mandate must also be unexpired. */
export function isMobileEconomyMandateActive(
  mandate?: Pick<MobileEconomyMandate, 'status' | 'expiresAt'>,
  nowMs = Date.now(),
): boolean {
  return mandate?.status === 'active' && Date.parse(mandate.expiresAt) > nowMs;
}

export type MobileEconomyMutationOutcome =
  | { ok: true; result: AgentEconomyMutationResult }
  | {
      ok: false;
      error: ReturnType<typeof describeEconomyClientError>;
    };

/**
 * Run a workflow mutation and normalize any failure into a describe-able error.
 * `mutationAttempted` is always true here: an unknown/network outcome must be
 * reconciled by reloading the Action, never by blindly re-submitting.
 */
export async function runMobileEconomyMutation(
  run: () => Promise<AgentEconomyMutationResult>,
): Promise<MobileEconomyMutationOutcome> {
  try {
    const result = await run();
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: describeEconomyClientError(error, true) };
  }
}
