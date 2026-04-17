/**
 * Cost Tracker Service — Precise Token Cost Calculation
 *
 * Reference: Claude Code's detailed cost tracking per model.
 * Maintains a pricing table for all supported models and calculates
 * costs from actual API usage data.
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentCostRecord } from '../../entities/agent-cost-record.entity';

const logger = new Logger('CostTracker');

/**
 * Optional context attached when persisting a cost record.
 * Populated by the openclaw-proxy and chat entry points so billing / audit
 * can be traced back to (user, instance, agent, provider).
 */
export interface PersistCostContext {
  userId?: string | null;
  agentId?: string | null;
  instanceId?: string | null;
  provider?: string | null;
  routingReason?: string | null;
}

// ============================================================
// Model Pricing (per million tokens, USD)
// ============================================================

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion?: number;
  cacheWritePerMillion?: number;
}

/**
 * Pricing table — updated as of 2026-04.
 * Prices in USD per million tokens.
 */
const MODEL_PRICING: Record<string, ModelPricing> = {
  // Claude models
  'claude-opus-4-7-20260401': { inputPerMillion: 15, outputPerMillion: 75, cacheReadPerMillion: 1.5, cacheWritePerMillion: 18.75 },
  'claude-opus-4-20250514': { inputPerMillion: 15, outputPerMillion: 75, cacheReadPerMillion: 1.5, cacheWritePerMillion: 18.75 },
  'claude-sonnet-4-20250514': { inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.3, cacheWritePerMillion: 3.75 },
  'claude-3-5-haiku-20241022': { inputPerMillion: 0.8, outputPerMillion: 4, cacheReadPerMillion: 0.08, cacheWritePerMillion: 1 },
  'claude-3-haiku-20240307': { inputPerMillion: 0.25, outputPerMillion: 1.25, cacheReadPerMillion: 0.03, cacheWritePerMillion: 0.3 },

  // OpenAI models
  'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 },
  'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  'gpt-4-turbo': { inputPerMillion: 10, outputPerMillion: 30 },
  'o1': { inputPerMillion: 15, outputPerMillion: 60 },
  'o1-mini': { inputPerMillion: 3, outputPerMillion: 12 },
  'o3-mini': { inputPerMillion: 1.1, outputPerMillion: 4.4 },

  // Google Gemini models
  'gemini-2.0-flash': { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  'gemini-2.0-flash-lite': { inputPerMillion: 0.02, outputPerMillion: 0.08 },
  'gemini-1.5-pro': { inputPerMillion: 1.25, outputPerMillion: 5 },
  'gemini-1.5-flash': { inputPerMillion: 0.075, outputPerMillion: 0.3 },

  // Meta Llama (via Bedrock/Groq)
  'llama-3.3-70b': { inputPerMillion: 0.59, outputPerMillion: 0.79 },
  'llama-3.1-8b': { inputPerMillion: 0.05, outputPerMillion: 0.08 },

  // Bedrock cross-region
  'us.anthropic.claude-opus-4-7-20260401-v1:0': { inputPerMillion: 15, outputPerMillion: 75, cacheReadPerMillion: 1.5, cacheWritePerMillion: 18.75 },
  'us.anthropic.claude-sonnet-4-20250514-v1:0': { inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.3, cacheWritePerMillion: 3.75 },
  'us.anthropic.claude-3-5-haiku-20241022-v1:0': { inputPerMillion: 0.8, outputPerMillion: 4, cacheReadPerMillion: 0.08, cacheWritePerMillion: 1 },
  'ap-southeast-1.anthropic.claude-sonnet-4-20250514-v1:0': { inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.3, cacheWritePerMillion: 3.75 },
};

// Fallback pricing for unknown models
const FALLBACK_PRICING: ModelPricing = {
  inputPerMillion: 3,
  outputPerMillion: 15,
};

// ============================================================
// Session Cost Tracking
// ============================================================

export interface SessionCostRecord {
  sessionId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  timestamp: number;
}

// ============================================================
// Cost Tracker Service
// ============================================================

@Injectable()
export class CostTrackerService {
  /** In-memory session cost accumulator (fast path for session totals). */
  private readonly sessionCosts = new Map<string, SessionCostRecord[]>();

  constructor(
    @Optional()
    @InjectRepository(AgentCostRecord)
    private readonly costRepo?: Repository<AgentCostRecord>,
  ) {}

  /**
   * Calculate cost for a single API call.
   *
   * @param model - Model identifier
   * @param inputTokens - Input token count from API response
   * @param outputTokens - Output token count from API response
   * @param cacheReadTokens - Cache read tokens (Claude prompt caching)
   * @param cacheWriteTokens - Cache write tokens
   * @returns Cost in USD
   */
  calculateCost(
    model: string,
    inputTokens: number,
    outputTokens: number,
    cacheReadTokens?: number,
    cacheWriteTokens?: number,
  ): number {
    const pricing = this.getPricing(model);

    const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillion;
    const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion;
    const cacheReadCost = cacheReadTokens && pricing.cacheReadPerMillion
      ? (cacheReadTokens / 1_000_000) * pricing.cacheReadPerMillion
      : 0;
    const cacheWriteCost = cacheWriteTokens && pricing.cacheWritePerMillion
      ? (cacheWriteTokens / 1_000_000) * pricing.cacheWritePerMillion
      : 0;

    return inputCost + outputCost + cacheReadCost + cacheWriteCost;
  }

  /**
   * Record a cost entry for a session.
   *
   * Fast path: updates in-memory accumulator synchronously so downstream
   * `getSessionTotal()` reads are cheap.
   *
   * Slow path: if an `AgentCostRecord` repository is available, persists
   * an audit row in background. Failures are logged but never thrown
   * (cost recording is non-fatal to chat).
   */
  recordCost(
    sessionId: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    cacheReadTokens: number = 0,
    cacheWriteTokens: number = 0,
    context?: PersistCostContext,
  ): SessionCostRecord {
    const costUsd = this.calculateCost(model, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens);

    const record: SessionCostRecord = {
      sessionId,
      model,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      costUsd,
      timestamp: Date.now(),
    };

    if (!this.sessionCosts.has(sessionId)) {
      this.sessionCosts.set(sessionId, []);
    }
    this.sessionCosts.get(sessionId)!.push(record);

    // Fire-and-forget DB persistence — never block the chat path.
    if (this.costRepo) {
      this.costRepo
        .save(
          this.costRepo.create({
            userId: context?.userId ?? null,
            sessionId,
            agentId: context?.agentId ?? null,
            instanceId: context?.instanceId ?? null,
            model,
            provider: context?.provider ?? null,
            inputTokens,
            outputTokens,
            cacheReadTokens,
            cacheWriteTokens,
            costUsd,
            routingReason: context?.routingReason ?? null,
          }),
        )
        .catch((err: any) => {
          logger.warn(`Failed to persist AgentCostRecord (session=${sessionId}): ${err?.message || err}`);
        });
    }

    return record;
  }

  /**
   * Query historical cost for a user within a time range.
   * Returns empty list if persistence is not available (e.g. in unit tests).
   */
  async getUserCostInRange(userId: string, since: Date, until: Date = new Date()): Promise<{
    totalUsd: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    callCount: number;
  }> {
    if (!this.costRepo) {
      return { totalUsd: 0, totalInputTokens: 0, totalOutputTokens: 0, callCount: 0 };
    }
    const qb = this.costRepo
      .createQueryBuilder('c')
      .select('COALESCE(SUM(c.cost_usd), 0)', 'total_usd')
      .addSelect('COALESCE(SUM(c.input_tokens), 0)', 'total_in')
      .addSelect('COALESCE(SUM(c.output_tokens), 0)', 'total_out')
      .addSelect('COUNT(*)', 'calls')
      .where('c.user_id = :userId', { userId })
      .andWhere('c.created_at >= :since AND c.created_at < :until', { since, until });
    const row = await qb.getRawOne();
    return {
      totalUsd: Number(row?.total_usd ?? 0),
      totalInputTokens: Number(row?.total_in ?? 0),
      totalOutputTokens: Number(row?.total_out ?? 0),
      callCount: Number(row?.calls ?? 0),
    };
  }

  /**
   * Get total cost for a session.
   */
  getSessionTotal(sessionId: string): number {
    const records = this.sessionCosts.get(sessionId);
    if (!records) return 0;
    return records.reduce((sum, r) => sum + r.costUsd, 0);
  }

  /**
   * Get all cost records for a session.
   */
  getSessionRecords(sessionId: string): SessionCostRecord[] {
    return this.sessionCosts.get(sessionId) ?? [];
  }

  /**
   * Get pricing for a model. Falls back to default if model is unknown.
   */
  getPricing(model: string): ModelPricing {
    // Direct match
    if (MODEL_PRICING[model]) return MODEL_PRICING[model];

    // Partial match (e.g., 'claude-sonnet-4' matches 'claude-sonnet-4-20250514')
    const normalizedModel = model.toLowerCase();
    for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
      if (normalizedModel.includes(key) || key.includes(normalizedModel)) {
        return pricing;
      }
    }

    logger.warn(`Unknown model pricing: ${model}, using fallback`);
    return FALLBACK_PRICING;
  }

  /**
   * Update pricing for a model (e.g., when prices change).
   */
  updatePricing(model: string, pricing: ModelPricing): void {
    MODEL_PRICING[model] = pricing;
  }

  /**
   * Clear session cost records (for cleanup).
   */
  clearSession(sessionId: string): void {
    this.sessionCosts.delete(sessionId);
  }

  /**
   * Get a formatted cost summary string.
   */
  formatCost(costUsd: number): string {
    if (costUsd < 0.001) return `$${(costUsd * 100).toFixed(4)}¢`;
    if (costUsd < 0.01) return `$${costUsd.toFixed(4)}`;
    return `$${costUsd.toFixed(3)}`;
  }
}
