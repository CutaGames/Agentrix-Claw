import { Injectable, Logger } from '@nestjs/common';
import { LlmRouterService, TaskTier } from './llm-router.service';

/**
 * Tier-routing resolver.
 *
 * Bridges the user-facing 3-tier preference (`local | smart | cloud`) emitted
 * by the desktop / web UI to the existing `LlmRouterService` and the model
 * resolution chain inside `OpenClawProxyService.runPlatformHostedChat()`.
 *
 * Responsibilities:
 *   - For `smart`: classify prompt → pick cheapest adequate model.
 *   - For `local`: keep the local model id intact; if the backend cannot run
 *     it, surface a structured `LocalUnavailableReason` so the UI can decide
 *     whether to upgrade (we never silently fall back to cloud here).
 *   - For `cloud`: keep the user-selected model id; only force a cloud
 *     replacement when the user picked a local-only model by mistake.
 *
 * Design note: this service deliberately returns plain strings and a
 * decision object instead of mutating callers — keeping `runPlatformHostedChat`
 * the single source of truth for the final `resolvedModel` value.
 */

export type TierPreference = 'local' | 'smart' | 'cloud';
export type TaskTierLabel = 'local' | 'light' | 'medium' | 'heavy' | 'ultra';
export type PrivacyScope = 'device-only' | 'network';

export interface TierResolveInput {
  /** User-selected tier (defaults to 'smart' upstream) */
  tier: TierPreference;
  /** Plain prompt text used for classification (current turn) */
  promptText: string;
  /** Hints fed to LlmRouter classifier */
  hints?: {
    hasImageFrame?: boolean;
    requiresCodeGen?: boolean;
    isA2AOrchestration?: boolean;
  };
  /**
   * Model the user/instance/agent originally asked for. For `cloud` tier we
   * pass it through unless it is a local-only id; for `smart` we override it
   * with the LlmRouter pick; for `local` we keep it.
   */
  requestedModel?: string;
}

export interface TierDecision {
  requestedTier: TierPreference;
  classifiedTier: TaskTierLabel;
  /** Final model id to use (platform-friendly, simple form). */
  chosenModel: string;
  reason: string;
  estimatedCostUsd?: number;
  estimatedLatencyMs?: number;
  privacyScope: PrivacyScope;
}

/**
 * Map LlmRouter catalog ids (e.g. `anthropic.claude-haiku-4-5-v1:0`) to the
 * simple ids that `runPlatformHostedChat` resolution chain uses.
 *
 * Anything not listed here is returned as-is.
 */
const SIMPLE_ID_MAP: Record<string, string> = {
  'anthropic.claude-haiku-4-5-v1:0': 'claude-haiku-4-5',
  'anthropic.claude-3-5-haiku-20241022-v1:0': 'claude-haiku-3-5',
  'anthropic.claude-sonnet-4-6-v1:0': 'claude-sonnet-4-6',
  'anthropic.claude-opus-4-7-v1:0': 'claude-opus-4-7',
  'anthropic.claude-opus-4-6-v1:0': 'claude-opus-4-6',
  'amazon.nova-micro-v1': 'nova-micro',
  'amazon.nova-lite-v1': 'nova-lite',
  'amazon.nova-pro-v1': 'nova-pro',
  'google.gemini-3.1-pro': 'gemini-3.1-pro',
};

/** Conservative latency expectation in ms by tier (median first-token). */
const LATENCY_MS_BY_TIER: Record<TaskTier, number> = {
  [TaskTier.LOCAL]: 250,
  [TaskTier.LIGHT]: 600,
  [TaskTier.MEDIUM]: 1000,
  [TaskTier.HEAVY]: 1500,
  [TaskTier.ULTRA]: 2500,
};

@Injectable()
export class TierResolverService {
  private readonly logger = new Logger(TierResolverService.name);

  constructor(private readonly llmRouter: LlmRouterService) {}

  /**
   * Resolve a user-facing tier preference into a concrete TierDecision.
   *
   * Throws nothing — callers may treat any decision as authoritative for the
   * model id. For `local` tier, callers are responsible for verifying the
   * client device actually runs the model.
   */
  resolve(input: TierResolveInput): TierDecision {
    const requestedTier = input.tier;

    if (requestedTier === 'local') {
      const fallbackLocalId = input.requestedModel || 'gemma-nano-2b';
      return {
        requestedTier,
        classifiedTier: 'local',
        chosenModel: fallbackLocalId,
        reason: 'tier=local; user opted into on-device execution',
        estimatedCostUsd: 0,
        estimatedLatencyMs: LATENCY_MS_BY_TIER[TaskTier.LOCAL],
        privacyScope: 'device-only',
      };
    }

    if (requestedTier === 'cloud') {
      // Cloud tier: keep the user/instance choice; downstream resolution chain
      // already handles local-only sanitization. We still produce a decision
      // object so the UI can render a consistent micro-copy.
      const chosen = input.requestedModel || 'claude-haiku-4-5';
      return {
        requestedTier,
        classifiedTier: 'heavy',
        chosenModel: chosen,
        reason: 'tier=cloud; using user-selected cloud model',
        privacyScope: 'network',
      };
    }

    // requestedTier === 'smart' — let the classifier pick.
    let routing;
    try {
      routing = this.llmRouter.route(input.promptText, input.hints);
    } catch (err: any) {
      this.logger.warn(`tier-resolve: classifier failed (${err?.message}); falling back to claude-haiku-4-5`);
      return {
        requestedTier,
        classifiedTier: 'heavy',
        chosenModel: input.requestedModel || 'claude-haiku-4-5',
        reason: 'tier=smart; classifier_error_fallback',
        privacyScope: 'network',
      };
    }

    const simpleId = SIMPLE_ID_MAP[routing.model.id] ?? routing.model.id;
    // Smart-classified LOCAL stays on-device; the desktop/mobile client
    // decides whether it can actually run it. If it cannot, it falls through
    // to a regular cloud model via the existing `localOnlyFallback` path.
    const isLocalPick = routing.tier === TaskTier.LOCAL;
    return {
      requestedTier,
      classifiedTier: routing.tier as TaskTierLabel,
      chosenModel: simpleId,
      reason: `tier=smart; classified=${routing.tier}; ${routing.reason}`,
      estimatedCostUsd: 0,
      estimatedLatencyMs: LATENCY_MS_BY_TIER[routing.tier as TaskTier],
      privacyScope: isLocalPick ? 'device-only' : 'network',
    };
  }
}
