/**
 * Mobile Agent Economy workflow API.
 *
 * Thin surface wrapper over the shared, transport-agnostic clients. Mobile
 * exposes only Goal → discovery → select → quote → 0 USD authorize/revoke/
 * reconcile plus a separate receipt-only reader. Payment, refund and reversal
 * methods are deliberately removed from the returned runtime object.
 */
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

export type MobileAgentEconomyClientLike = Pick<
  AgentEconomyClientLike,
  | 'discover'
  | 'createGoal'
  | 'discoverCandidates'
  | 'selectCandidate'
  | 'issueQuote'
  | 'authorize'
  | 'revoke'
  | 'reconcile'
  | 'getWorkflow'
>;

/** Live Agent Economy submission gate. Disabled builds stay draft/read-only. */
export function isMobileAgentEconomyEnabled(): boolean {
  return isMobileV6FeatureEnabled('mobile.agent_economy_v1');
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
      if (!isMobileZeroUsdQuote(workflow.quote)) {
        return Promise.reject(new Error('mobile_paid_execution_disabled'));
      }
      return client.authorize(soulCoreId, workflow, idempotencyKey);
    },
    revoke: (soulCoreId, workflow, idempotencyKey, reason) =>
      client.revoke(soulCoreId, workflow, idempotencyKey, reason),
    reconcile: (soulCoreId, workflow, idempotencyKey, outcome) =>
      client.reconcile(soulCoreId, workflow, idempotencyKey, outcome),
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
