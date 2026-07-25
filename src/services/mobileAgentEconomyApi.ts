/**
 * Mobile Agent Economy workflow API.
 *
 * Thin surface wrapper over the shared, transport-agnostic
 * {@link createAgentEconomyClient}. It injects only the Mobile transport,
 * base URL, bearer token and surface tag — endpoint paths, request shapes,
 * the Idempotency-Key header, canonical response validation, cross-Soul-Core /
 * lineage binding and the mutation error vocabulary stay owned by
 * `shared/client` so Mobile never diverges from Web/Backend.
 *
 * Phase 2 scope: real Goal → discovery → select → quote → authorize on a
 * non-paid (0-amount) Action. Payment/refund/reversal remain gated for Phase 3.
 */
import {
  createAgentEconomyClient,
  createEconomyIdempotencyKey,
  describeEconomyClientError,
  type AgentEconomyClientLike,
  type AgentEconomyMutationResult,
  type AgentEconomyWorkflowView,
  type CreateEconomyGoalInput,
  type DiscoverEconomyCandidatesInput,
} from '../../shared/client';
import { getApiConfig } from './api';
import { isMobileV6FeatureEnabled } from './mobileV6FeatureFlags';
import { mobileV6HttpTransport } from './mobileV6Runtime';

export type {
  AgentEconomyClientLike,
  AgentEconomyMutationResult,
  AgentEconomyWorkflowView,
  CreateEconomyGoalInput,
  DiscoverEconomyCandidatesInput,
};
export { describeEconomyClientError };

/** Live Agent Economy submission gate. Disabled builds stay draft/read-only. */
export function isMobileAgentEconomyEnabled(): boolean {
  return isMobileV6FeatureEnabled('mobile.agent_economy_v1');
}

/**
 * Build a Mobile-scoped economy client bound to the current auth config. No
 * token or account data is retained here; the token provider reads config per
 * request, matching the read facade in mobileV6Runtime.
 */
export function createMobileAgentEconomyClient(): AgentEconomyClientLike {
  const config = getApiConfig();
  return createAgentEconomyClient({
    transport: mobileV6HttpTransport,
    baseUrl: config.baseUrl ?? '',
    getAuthToken: () => getApiConfig().token,
    defaultHeaders: { 'X-Agentrix-Surface': 'mobile' },
  });
}

/** Mobile idempotency keys are namespaced so the Backend can attribute retries. */
export function createMobileEconomyIdempotencyKey(scope: string): string {
  return createEconomyIdempotencyKey(scope, 'mobile-economy');
}

type MobileEconomyQuote = NonNullable<AgentEconomyWorkflowView['quote']>;
type MobileEconomyMandate = NonNullable<AgentEconomyWorkflowView['mandate']>;

/** Both the payable amount and its canonical ceiling must be zero. */
export function isMobileZeroUsdQuote(
  quote?: Pick<MobileEconomyQuote, 'amount' | 'maximumAmount'>,
): boolean {
  if (!quote || !/^0+$/.test(quote.amount.amountMinor)) return false;
  return quote.maximumAmount === undefined || /^0+$/.test(quote.maximumAmount.amountMinor);
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
