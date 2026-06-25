import { Inject, Injectable, Logger, Optional, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AgentTaskEntity } from '../../entities/agent-task.entity';
import { AgentAccount } from '../../entities/agent-account.entity';
import { User } from '../../entities/user.entity';
import { BedrockUserCredentials } from '../ai-integration/bedrock/bedrock-integration.service';
import { AiProviderService } from '../ai-provider/ai-provider.service';

/**
 * Multi-Agent v2.1 — WorkerLlmRouter
 *
 * Replaces the v1 worker's direct `bedrock.invokeModel(prompt)` call. This
 * service resolves (provider, model, credentials) for a given AgentTask by
 * combining four signals (highest priority first):
 *
 *   1. `target_kind === 'marketplace-hire'` → **forced platform Bedrock**
 *      (privacy boundary per spec §13.3)
 *   2. `users.metadata.preferences.byoProvider` (set when user fills BYO key
 *      via /api/ai-providers) → BYO credentials via AiProviderService
 *   3. `agent_accounts.preferred_model / preferred_provider` (Pro Mode editor
 *      in MemberSettingsModal)
 *   4. `users.metadata.preferences.subscriptionTier` ladder default
 *      - free → claude-haiku-4-5 (only)
 *      - pro → claude-sonnet-4-6 (default; opus 4.7 on-demand)
 *      - business → claude-sonnet-4-6 (default; opus 4.7 on-demand)
 *      - enterprise → user choice
 *
 * For now the service supports the **Anthropic-on-Bedrock** path only (haiku /
 * sonnet / opus). BYO Anthropic-direct, OpenAI, Gemini, Groq fall back to
 * platform Bedrock until v2.2 wires the matching providers in
 * `executeWithProvider`. This is the pragmatic v2.1 ship — see
 * MULTI_AGENT_V2_1_PRODUCT_DECISIONS.md §8 Task #1-2.
 *
 * Free tier is enforced via `enforceFreeTierBudget()` which short-circuits
 * model resolution to haiku-4-5 regardless of upstream preferences.
 *
 * NOTE: this service is intentionally read-only — no DB writes. Cost rows
 * are still emitted by `cost-tracker.service.ts` via AsyncLocalStorage.
 */

export type SubscriptionTier = 'free' | 'pro' | 'business' | 'enterprise';

export interface WorkerLlmRouteResult {
  /** Final Bedrock model id (full ARN form like `us.anthropic.claude-sonnet-4-...`) */
  modelId: string;
  /** Human-friendly id used in logs / cost rows (e.g. `claude-sonnet-4-6`) */
  friendlyModelId: string;
  /** 'bedrock' | 'anthropic-direct' | 'openai' | ... — current ship: only 'bedrock' is wired */
  provider: 'bedrock' | 'anthropic-direct' | 'openai' | 'gemini' | 'groq' | 'deepseek';
  /** Optional BYO credentials passed to bedrock.invokeModel as 3rd arg */
  userCredentials?: BedrockUserCredentials;
  /** Where this decision came from */
  reason: string;
  /** User's resolved subscription tier */
  subscriptionTier: SubscriptionTier;
  /** Whether the resolution was forced by privacy or budget rules */
  forced: 'marketplace-hire' | 'free-tier-cap' | 'no-byo-fallback' | null;
}

const PLATFORM_HAIKU_FRIENDLY = 'claude-haiku-4-5';
const PLATFORM_SONNET_FRIENDLY = 'claude-sonnet-4-6';
const PLATFORM_OPUS_FRIENDLY = 'claude-opus-4-7';

const PLATFORM_HAIKU_BEDROCK = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
const PLATFORM_SONNET_BEDROCK = 'us.anthropic.claude-sonnet-4-6-v1:0';
const PLATFORM_OPUS_BEDROCK = 'us.anthropic.claude-opus-4-7-20260401-v1:0';

const FRIENDLY_TO_BEDROCK: Record<string, string> = {
  [PLATFORM_HAIKU_FRIENDLY]: PLATFORM_HAIKU_BEDROCK,
  [PLATFORM_SONNET_FRIENDLY]: PLATFORM_SONNET_BEDROCK,
  [PLATFORM_OPUS_FRIENDLY]: PLATFORM_OPUS_BEDROCK,
};

@Injectable()
export class WorkerLlmRouterService {
  private readonly logger = new Logger(WorkerLlmRouterService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(AgentAccount)
    private readonly agentRepo: Repository<AgentAccount>,
    @Optional() @Inject(forwardRef(() => AiProviderService))
    private readonly aiProvider: AiProviderService | null,
  ) {}

  /**
   * Resolve the final (provider, model, credentials) tuple for a sub-task.
   *
   * Never throws — on error returns the platform Haiku 4.5 fallback so the
   * worker can still make progress.
   */
  async resolveForTask(task: AgentTaskEntity): Promise<WorkerLlmRouteResult> {
    // Rule 1 — Marketplace-hire ALWAYS uses platform token + default haiku.
    // Spec §13.3 privacy boundary: hired pet must not see hirer's BYO key.
    if (task.targetKind === 'marketplace-hire') {
      return {
        modelId: PLATFORM_HAIKU_BEDROCK,
        friendlyModelId: PLATFORM_HAIKU_FRIENDLY,
        provider: 'bedrock',
        reason: 'marketplace-hire forces platform Bedrock + haiku-4-5 (privacy boundary)',
        subscriptionTier: 'free',
        forced: 'marketplace-hire',
      };
    }

    // Resolve user + tier
    const userId = task.userId;
    let user: User | null = null;
    if (userId) {
      user = await this.userRepo.findOne({ where: { id: userId } }).catch(() => null);
    }
    const tier = this.resolveSubscriptionTier(user);

    // Rule 2 — Free tier hard cap: always platform Haiku, no BYO bridge.
    if (tier === 'free') {
      return {
        modelId: PLATFORM_HAIKU_BEDROCK,
        friendlyModelId: PLATFORM_HAIKU_FRIENDLY,
        provider: 'bedrock',
        reason: 'free tier capped to haiku-4-5',
        subscriptionTier: tier,
        forced: 'free-tier-cap',
      };
    }

    // Resolve agent preferred model (Pro Mode setting)
    const actorAgentId = task.agentId;
    let agent: AgentAccount | null = null;
    if (actorAgentId) {
      agent = await this.agentRepo.findOne({ where: { id: actorAgentId } }).catch(() => null);
    }

    // Rule 3 — Try BYO bridge for pro+ tiers
    if (this.aiProvider && (tier === 'pro' || tier === 'business' || tier === 'enterprise')) {
      const byoResult = await this.tryByoBridge(userId, agent, tier);
      if (byoResult) {
        return byoResult;
      }
    }

    // Rule 4 — Subscription tier ladder default (no BYO) → platform Bedrock
    const friendlyId = this.resolveTierLadder(agent, tier);
    return {
      modelId: FRIENDLY_TO_BEDROCK[friendlyId] || PLATFORM_HAIKU_BEDROCK,
      friendlyModelId: friendlyId,
      provider: 'bedrock',
      reason: `${tier} tier ladder default = ${friendlyId}`,
      subscriptionTier: tier,
      forced: null,
    };
  }

  /**
   * Try BYO bridge. Returns null when:
   *   - aiProvider not injected (test env)
   *   - user has no provider config
   *   - configured provider isn't yet wired in v2.1 (only Anthropic-on-Bedrock
   *     via BYO AWS creds is wired today)
   */
  private async tryByoBridge(
    userId: string | undefined,
    agent: AgentAccount | null,
    tier: SubscriptionTier,
  ): Promise<WorkerLlmRouteResult | null> {
    if (!this.aiProvider || !userId) return null;

    // Pick the provider to try: agent.preferred_provider > user default
    const preferredProvider = agent?.preferredProvider;
    let providerId = preferredProvider || null;

    if (!providerId) {
      try {
        const defaultConfig = await this.aiProvider.getDefaultConfig(userId);
        if (defaultConfig) {
          providerId = defaultConfig.providerId;
        }
      } catch {
        return null;
      }
    }
    if (!providerId || providerId === 'platform') return null;

    // Only `aws-bedrock-byok` provider id is wired in v2.1 — other providers
    // (anthropic, openai, gemini) require provider-specific call-site changes
    // in worker.execute. Defer to v2.2.
    if (providerId !== 'aws-bedrock-byok' && providerId !== 'aws-bedrock') {
      this.logger.debug(`BYO provider ${providerId} not wired in v2.1; falling back to platform tier ladder`);
      return null;
    }

    let creds: { apiKey: string; secretKey?: string; region?: string; model: string } | null = null;
    try {
      creds = await this.aiProvider.getDecryptedKey(userId, providerId);
    } catch {
      creds = null;
    }
    if (!creds || !creds.apiKey || !creds.secretKey) return null;

    const friendlyId = agent?.preferredModel || this.resolveTierLadder(agent, tier);
    return {
      modelId: FRIENDLY_TO_BEDROCK[friendlyId] || PLATFORM_HAIKU_BEDROCK,
      friendlyModelId: friendlyId,
      provider: 'bedrock',
      userCredentials: {
        accessKeyId: creds.apiKey,
        secretAccessKey: creds.secretKey,
        region: creds.region || 'us-east-1',
      },
      reason: `BYO Bedrock (${tier} tier, ${friendlyId})`,
      subscriptionTier: tier,
      forced: null,
    };
  }

  /**
   * Per-tier default model ladder per MULTI_AGENT_V2_1_PRODUCT_DECISIONS §2.
   *
   * `agent.preferredModel` is honored when present AND the tier permits it
   * (e.g. free user can't pick opus). Otherwise tier default is used.
   */
  private resolveTierLadder(agent: AgentAccount | null, tier: SubscriptionTier): string {
    const preferred = agent?.preferredModel;
    const tierLadder: Record<SubscriptionTier, { default: string; allowed: string[] }> = {
      free: { default: PLATFORM_HAIKU_FRIENDLY, allowed: [PLATFORM_HAIKU_FRIENDLY] },
      pro: {
        default: PLATFORM_SONNET_FRIENDLY,
        allowed: [PLATFORM_HAIKU_FRIENDLY, PLATFORM_SONNET_FRIENDLY, PLATFORM_OPUS_FRIENDLY],
      },
      business: {
        default: PLATFORM_SONNET_FRIENDLY,
        allowed: [PLATFORM_HAIKU_FRIENDLY, PLATFORM_SONNET_FRIENDLY, PLATFORM_OPUS_FRIENDLY],
      },
      enterprise: {
        default: PLATFORM_SONNET_FRIENDLY,
        allowed: [PLATFORM_HAIKU_FRIENDLY, PLATFORM_SONNET_FRIENDLY, PLATFORM_OPUS_FRIENDLY],
      },
    };

    const cfg = tierLadder[tier];
    if (preferred && cfg.allowed.includes(preferred)) {
      return preferred;
    }
    return cfg.default;
  }

  /**
   * Read subscription tier from `users.metadata.preferences.subscriptionTier`.
   * Defaults to 'free' when missing or unknown.
   */
  private resolveSubscriptionTier(user: User | null): SubscriptionTier {
    if (!user) return 'free';
    const raw = (user.metadata as any)?.preferences?.subscriptionTier;
    if (raw === 'pro' || raw === 'business' || raw === 'enterprise') return raw;
    return 'free';
  }
}
