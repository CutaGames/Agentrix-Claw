import { Injectable, Logger } from '@nestjs/common';

/**
 * Task complexity tiers for model routing.
 *
 * LOCAL  – trivial queries handled by on-device/edge models (端侧 Gemma Nano 2B)
 * LIGHT  – simple Q&A, classification, extraction, formatting, greetings
 * MEDIUM – multi-step reasoning, code generation, analysis, summarization
 * HEAVY  – complex chain-of-thought, creative writing, tool-use chains, agentic planning
 * ULTRA  – frontier-level tasks: deep research, multi-agent orchestration, 100k+ context
 */
export enum TaskTier {
  LOCAL = 'local',
  LIGHT = 'light',
  MEDIUM = 'medium',
  HEAVY = 'heavy',
  ULTRA = 'ultra',
}

/**
 * Model definition with pricing metadata.
 * Costs are in USD per 1M tokens.
 */
export interface ModelConfig {
  id: string;
  /** Provider key used for API routing */
  provider: 'bedrock' | 'deepseek' | 'alibaba' | 'openai' | 'anthropic' | 'google' | 'local';
  /** Display name */
  name: string;
  /** Cost per 1M input tokens (USD) — 0 for local models */
  inputCostPer1M: number;
  /** Cost per 1M output tokens (USD) — 0 for local models */
  outputCostPer1M: number;
  /** Max context window */
  maxTokens: number;
  /** Which task tiers this model can handle */
  tiers: TaskTier[];
  /** Whether this model supports image/multimodal input */
  supportsVision?: boolean;
}

/**
 * Result of routing a request to the optimal model.
 */
export interface RoutingResult {
  model: ModelConfig;
  tier: TaskTier;
  reason: string;
}

/**
 * Smart LLM Router — classifies tasks and routes to the cheapest adequate model.
 *
 * Architecture:
 *   OpenClaw instance → Agentrix LLM Gateway (/api/llm/v1/chat/completions)
 *                                  ↓
 *                         LlmRouterService.route(prompt)
 *                                  ↓
 *                 ┌──────────┬─────────────┬───────────────┐
 *                LIGHT      MEDIUM        HEAVY
 *            Nova Micro   Qwen 3 Plus   Claude Haiku 4.5
 *            $0.035/$0.14  ~$0.15/$0.60   ~$1.00/$5.00
 *
 * Each OpenClaw container connects to our gateway as its "LLM provider" so we
 * can transparently route without the user knowing which model is used.
 */
@Injectable()
export class LlmRouterService {
  private readonly logger = new Logger(LlmRouterService.name);

  /**
   * Model catalog — ordered cheapest-first within each tier.
   * Prices as of early 2026 (Bedrock / Alibaba Cloud / API pricing).
   */
  private readonly models: ModelConfig[] = [
    // ── LOCAL tier (on-device, zero cost) ──────────────────────
    {
      id: 'gemma-nano-2b',
      provider: 'local',
      name: 'Gemma Nano 2B',
      inputCostPer1M: 0,
      outputCostPer1M: 0,
      maxTokens: 8_192,
      tiers: [TaskTier.LOCAL],
    },
    // ── LIGHT tier (cheapest, simple tasks) ───────────────────────
    {
      id: 'amazon.nova-micro-v1',
      provider: 'bedrock',
      name: 'Amazon Nova Micro',
      inputCostPer1M: 0.035,
      outputCostPer1M: 0.14,
      maxTokens: 128_000,
      tiers: [TaskTier.LIGHT],
    },
    {
      id: 'amazon.nova-lite-v1',
      provider: 'bedrock',
      name: 'Amazon Nova Lite',
      inputCostPer1M: 0.06,
      outputCostPer1M: 0.24,
      maxTokens: 300_000,
      tiers: [TaskTier.LIGHT, TaskTier.MEDIUM],
      supportsVision: true,
    },
    // ── MEDIUM tier ──────────────────────────────────────────────
    {
      id: 'gemma-4-27b',
      provider: 'local',
      name: 'Gemma 4 27B (GPU)',
      inputCostPer1M: 0,
      outputCostPer1M: 0,
      maxTokens: 128_000,
      tiers: [TaskTier.MEDIUM],
      supportsVision: true,
    },
    {
      id: 'qwen-plus',
      provider: 'alibaba',
      name: 'Qwen 3.5 Plus',
      inputCostPer1M: 0.15,
      outputCostPer1M: 0.60,
      maxTokens: 131_072,
      tiers: [TaskTier.MEDIUM],
    },
    {
      id: 'deepseek-chat',
      provider: 'deepseek',
      name: 'DeepSeek V3',
      inputCostPer1M: 0.27,
      outputCostPer1M: 1.10,
      maxTokens: 128_000,
      tiers: [TaskTier.MEDIUM, TaskTier.HEAVY],
    },
    {
      id: 'amazon.nova-pro-v1',
      provider: 'bedrock',
      name: 'Amazon Nova Pro',
      inputCostPer1M: 0.80,
      outputCostPer1M: 3.20,
      maxTokens: 300_000,
      tiers: [TaskTier.MEDIUM, TaskTier.HEAVY],
    },
    // ── HEAVY tier ───────────────────────────────────────────────
    {
      id: 'anthropic.claude-3-5-haiku-20241022-v1:0',
      provider: 'bedrock',
      name: 'Claude 3.5 Haiku',
      inputCostPer1M: 0.80,
      outputCostPer1M: 4.00,
      maxTokens: 200_000,
      tiers: [TaskTier.HEAVY],
    },
    {
      id: 'anthropic.claude-haiku-4-5-v1:0',
      provider: 'bedrock',
      name: 'Claude Haiku 4.5',
      inputCostPer1M: 1.00,
      outputCostPer1M: 5.00,
      maxTokens: 200_000,
      tiers: [TaskTier.HEAVY],
    },
    // ── ULTRA tier (frontier, highest capability) ────────────────
    {
      id: 'anthropic.claude-opus-4-6-v1:0',
      provider: 'anthropic',
      name: 'Claude Opus 4.6',
      inputCostPer1M: 15.00,
      outputCostPer1M: 75.00,
      maxTokens: 200_000,
      tiers: [TaskTier.ULTRA],
      supportsVision: true,
    },
    {
      id: 'anthropic.claude-sonnet-4-6-v1:0',
      provider: 'anthropic',
      name: 'Claude Sonnet 4.6',
      inputCostPer1M: 3.00,
      outputCostPer1M: 15.00,
      maxTokens: 200_000,
      tiers: [TaskTier.HEAVY, TaskTier.ULTRA],
      supportsVision: true,
    },
    {
      id: 'gpt-5.4',
      provider: 'openai',
      name: 'GPT-5.4',
      inputCostPer1M: 10.00,
      outputCostPer1M: 30.00,
      maxTokens: 256_000,
      tiers: [TaskTier.ULTRA],
      supportsVision: true,
    },
    {
      id: 'google.gemini-3.1-pro',
      provider: 'google',
      name: 'Gemini 3.1 Pro',
      inputCostPer1M: 1.25,
      outputCostPer1M: 5.00,
      maxTokens: 2_000_000,
      tiers: [TaskTier.HEAVY, TaskTier.ULTRA],
      supportsVision: true,
    },
  ];

  /**
   * Keyword-based heuristics for fast task classification.
   * A lightweight classifier that avoids an extra LLM call.
   */
  private readonly heavySignals = [
    /\b(analyze|analyse|debug|refactor|architect|design pattern|trade-?off)\b/i,
    /\b(write (?:a |an )?(?:essay|article|story|report|proposal|plan))\b/i,
    /\b(step[- ]by[- ]step|chain[- ]of[- ]thought|reason(?:ing)?)\b/i,
    /\b(compare (?:and|&) contrast|pros (?:and|&) cons)\b/i,
    /```[\s\S]{200,}/,  // large code blocks → likely code tasks
    /\b(implement|build|create|develop)\b.*\b(function|class|module|service|component|api)\b/i,
  ];

  private readonly ultraSignals = [
    /\b(deep[- ]research|multi[- ]?agent|orchestrat(?:e|ion))\b/i,
    /\b(a2a|agent[- ]to[- ]agent)\b/i,
    /\b(systematic(?:ally)?|comprehensive(?:ly)? (?:review|audit|analysis))\b/i,
    /\b(100k|200k|long[- ]?context|entire (?:codebase|repo))\b/i,
    /\b(publish|deploy to production|critical|security audit)\b/i,
  ];

  private readonly localSignals = [
    /^(hi|hello|hey|ok|yes|no|thanks|bye|good|nice)\s*[!?.]*$/i,
    /^.{1,20}$/,  // very short messages (greetings, acks)
  ];

  private readonly lightSignals = [
    /^(hi|hello|hey|thanks|ok|yes|no|sure)\b/i,
    /\b(what is|who is|when was|where is|define|meaning of)\b/i,
    /\b(translate|convert|format|list|summarize in \d+ words)\b/i,
    /\b(weather|time|date|price of)\b/i,
  ];

  /**
   * Classify a prompt into a task tier.
   * Optional context hints allow vision/code/A2A routing.
   */
  classifyTask(prompt: string, hints?: { hasImageFrame?: boolean; requiresCodeGen?: boolean; isA2AOrchestration?: boolean }): TaskTier {
    // Explicit A2A orchestration → always ULTRA
    if (hints?.isA2AOrchestration) {
      return TaskTier.ULTRA;
    }

    // Ultra signals
    if (this.ultraSignals.some(r => r.test(prompt))) {
      return TaskTier.ULTRA;
    }

    // Very short trivial messages → LOCAL (on-device)
    if (this.localSignals.some(r => r.test(prompt))) {
      return TaskTier.LOCAL;
    }

    // Short prompts (< 50 chars) are almost always simple
    if (prompt.length < 50 && this.lightSignals.some(r => r.test(prompt))) {
      return TaskTier.LIGHT;
    }

    // Check heavy signals
    if (this.heavySignals.some(r => r.test(prompt))) {
      return TaskTier.HEAVY;
    }

    // Check light signals
    if (this.lightSignals.some(r => r.test(prompt))) {
      return TaskTier.LIGHT;
    }

    // Default: medium for anything in between
    return TaskTier.MEDIUM;
  }

  /**
   * Route a prompt to the most cost-effective model that can handle it.
   */
  route(prompt: string, hints?: { hasImageFrame?: boolean; requiresCodeGen?: boolean; isA2AOrchestration?: boolean }): RoutingResult {
    const tier = this.classifyTask(prompt, hints);

    // LOCAL tier: return the on-device model (caller handles local execution)
    if (tier === TaskTier.LOCAL) {
      const localModel = this.models.find(m => m.tiers.includes(TaskTier.LOCAL));
      if (localModel) {
        this.logger.debug(`Routed [${tier}] → ${localModel.name} (on-device)`);
        return { model: localModel, tier, reason: 'on-device-trivial' };
      }
    }

    // Vision hint: prefer models with supportsVision
    if (hints?.hasImageFrame) {
      const visionModels = this.models.filter(m => m.tiers.includes(tier) && m.supportsVision);
      if (visionModels.length > 0) {
        this.logger.debug(`Routed [${tier}+vision] → ${visionModels[0].name}`);
        return { model: visionModels[0], tier, reason: `vision-${tier}` };
      }
    }

    // Find cheapest model that supports this tier (models are pre-sorted by cost)
    const eligible = this.models.filter(m => m.tiers.includes(tier));
    const model = eligible[0]; // already sorted cheapest first

    if (!model) {
      // Fallback to Qwen Plus if no model found (shouldn't happen)
      this.logger.warn(`No model found for tier ${tier}, falling back to qwen-plus`);
      const fallback = this.models.find(m => m.id === 'qwen-plus')!;
      return { model: fallback, tier, reason: 'fallback' };
    }

    this.logger.debug(`Routed [${tier}] → ${model.name} (${model.id})`);
    return { model, tier, reason: `cheapest-for-${tier}` };
  }

  /**
   * Estimate monthly cost for a user given their token allocation.
   *
   * @param totalTokens Total tokens per month (e.g. 10_000_000 for 10M)
   * @param tierDistribution Percentage of requests per tier (should sum to 1.0)
   * @param inputOutputRatio Fraction of tokens that are input (rest = output)
   */
  estimateMonthlyCost(
    totalTokens: number,
    tierDistribution = { local: 0.20, light: 0.35, medium: 0.25, heavy: 0.15, ultra: 0.05 },
    inputOutputRatio = 0.60,
  ): {
    totalCost: number;
    breakdown: Array<{ tier: string; model: string; tokens: number; cost: number }>;
  } {
    const breakdown: Array<{ tier: string; model: string; tokens: number; cost: number }> = [];
    let totalCost = 0;

    for (const [tier, fraction] of Object.entries(tierDistribution)) {
      const tierTokens = totalTokens * fraction;
      const inputTokens = tierTokens * inputOutputRatio;
      const outputTokens = tierTokens * (1 - inputOutputRatio);

      // Get cheapest model for this tier
      const { model } = this.route(
        tier === 'local' ? 'hi' : tier === 'light' ? 'hello' : tier === 'ultra' ? 'deep research orchestration' : tier === 'heavy' ? 'analyze and implement' : 'summarize this',
      );

      const inputCost = (inputTokens / 1_000_000) * model.inputCostPer1M;
      const outputCost = (outputTokens / 1_000_000) * model.outputCostPer1M;
      const cost = inputCost + outputCost;

      breakdown.push({ tier, model: model.name, tokens: tierTokens, cost: +cost.toFixed(4) });
      totalCost += cost;
    }

    return { totalCost: +totalCost.toFixed(2), breakdown };
  }

  /** Return all registered models for admin/debug */
  getModelCatalog(): ModelConfig[] {
    return [...this.models];
  }
}
