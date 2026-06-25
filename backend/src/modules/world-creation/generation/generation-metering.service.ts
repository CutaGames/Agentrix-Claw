import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AgentCostRecord } from '../../../entities/agent-cost-record.entity';
import { QuotaService } from '../../world-engine/services/quota.service';
import { ProviderRegistry } from '../../world-engine/reconstruction/provider-registry';
import type {
  ReconstructionJobInput,
  ReconstructionJobOutput,
} from '../../world-engine/reconstruction/provider-registry';
import type { FailoverResult } from '../../pet-generation/provider-failover';

import type {
  GenerationKind,
  GenerationQuotaResult,
} from '../../../../shared/types/world-creation';
import { buildQuotaWarning } from './quota-warning.mapper';

/**
 * Daily-quota event types tracked by the v5 world-engine {@link QuotaService}.
 * A generation `checkQuota` call may forward one of these to additionally gate
 * on the per-tier daily counter; any other value only gates on the monthly
 * cost ceiling.
 */
const KNOWN_DAILY_QUOTA_EVENTS = new Set([
  'quickScan',
  'detailScan',
  'roomScan',
  'characterRegens',
]);

/** Parameters for recording a single metered generation operation (R12.1). */
export interface RecordGenerationCostParams {
  /** Generation kind → scene_graph / dsl / model_3d / video. */
  kind: GenerationKind;
  /** Monetary cost of the operation in USD (server-computed, never sandbox). */
  costUsd: number;
  /** Provider that performed the work (e.g. hunyuan3d / meshy / bedrock). */
  provider?: string | null;
  /** Optional plot the generation belongs to (drives the audit sessionId). */
  plotId?: string | null;
  /** Optional explicit session id; defaults to `plot:{plotId}` or `gen:{kind}`. */
  sessionId?: string | null;
  /** Optional model label override; defaults to `world-creation.generate.{kind}`. */
  model?: string | null;
}

/**
 * Input for a 3D model generation routed through the pluggable provider
 * strategy (Hunyuan3D primary + Meshy backup + provider-failover).
 */
export interface Generate3dModelInput {
  userId: string;
  sessionId: string;
  imageUrls: string[];
  mode?: 'quick' | 'detail' | 'room';
  style?: string;
  /** Optional plot association for the cost-record audit trail. */
  plotId?: string | null;
}

/**
 * GenerationMeteringService — generation metering & quota gating (task 15.1,
 * R12.1/R12.4/R12.5).
 *
 * Responsibilities:
 *  1. {@link checkQuota} — validate available quota BEFORE a generation op,
 *     reusing the v5 world-engine {@link QuotaService} (monthly FREE $5 cost
 *     ceiling + optional per-event daily quota). Never re-implements quota.
 *  2. {@link recordGenerationCost} — write every generation op (scene_graph /
 *     dsl / model_3d / video) to `agent_cost_records` (R12.1), reusing the v5
 *     cost-audit table.
 *  3. {@link generate3dModel} — delegate 3D model generation to the pluggable
 *     {@link ProviderRegistry} (Hunyuan3D primary + Meshy backup + failover);
 *     the platform is an orchestration layer and does NOT self-build 3D
 *     generation (R12.5). Cost is metered on success.
 *
 * Reuses v5 infrastructure (AGENTS.md hard rule, design §13): QuotaService,
 * ProviderRegistry (and via it pet-generation's Hunyuan3DProvider / MeshyProvider
 * + runWithFailover), and the `agent_cost_records` table. Nothing is rebuilt.
 *
 * All entity attributes are camelCase; column names derive from the global
 * SnakeNamingStrategy.
 */
@Injectable()
export class GenerationMeteringService {
  private readonly logger = new Logger(GenerationMeteringService.name);

  constructor(
    @InjectRepository(AgentCostRecord)
    private readonly costRecordRepo: Repository<AgentCostRecord>,
    private readonly quotaService: QuotaService,
    private readonly providerRegistry: ProviderRegistry,
  ) {}

  // ============================================================
  // R12.4 — pre-generation quota validation (reuse v5 QuotaService)
  // ============================================================

  /**
   * Validate the user's available quota before a generation operation, using
   * the existing world-engine quota infrastructure (R12.4).
   *
   * Always evaluates the FREE monthly cost ceiling (R12.2/12.3: soft reminder
   * at 80%, hard block at 100%). When `eventType` names a known daily-quota
   * bucket, the per-tier daily counter is additionally evaluated and the
   * generation is blocked if either gate denies it.
   *
   * @param userId    Authenticated user requesting the generation.
   * @param eventType Optional world-engine daily-quota event type
   *                  (quickScan / detailScan / roomScan / characterRegens).
   * @returns Structured {@link GenerationQuotaResult}; `allowed=false` carries a
   *          QUOTA_EXCEEDED error and blocks the operation.
   */
  async checkQuota(
    userId: string,
    eventType?: string,
  ): Promise<GenerationQuotaResult> {
    // 1. Monthly cost ceiling (FREE $5/mo). Always relevant for generation.
    const ceiling = await this.quotaService.checkMonthlyCostCeiling(userId);

    // 2. Optional per-event daily quota.
    let daily: GenerationQuotaResult['daily'];
    if (eventType && KNOWN_DAILY_QUOTA_EVENTS.has(eventType)) {
      const d = await this.quotaService.checkDailyQuota(userId, eventType);
      daily = {
        allowed: d.allowed,
        remaining: d.remaining,
        limit: d.limit,
        resetTime: d.resetTime,
      };
    }

    const allowed = ceiling.allowed && (daily?.allowed ?? true);

    const result: GenerationQuotaResult = {
      allowed,
      warningLevel: ceiling.warningLevel,
      currentCost: ceiling.currentCost,
      ceiling: ceiling.ceiling,
      daily,
    };

    // R12.2/12.3 — surface the FREE cost-ceiling soft reminder (≥80%) / hard
    // block (≥100%) notice to the caller so it can be shown verbatim.
    const warning = buildQuotaWarning(ceiling);
    if (warning) {
      result.warning = warning;
    }

    if (!allowed) {
      result.error = {
        error: 'QUOTA_EXCEEDED',
        detail: !ceiling.allowed
          ? `Monthly cost ceiling reached ($${ceiling.currentCost.toFixed(2)} / $${ceiling.ceiling}). ` +
            `Generation blocked until the next billing cycle or an upgrade.`
          : `Daily limit reached for ${eventType}. Resets at ${daily?.resetTime ?? 'next UTC midnight'}.`,
      };
    }

    return result;
  }

  // ============================================================
  // R12.1 — record every generation op in agent_cost_records
  // ============================================================

  /**
   * Record a single generation operation's cost in `agent_cost_records` (R12.1).
   *
   * Reuses the v5 cost-audit table; `eventType` is namespaced as
   * `generation_{kind}` so monthly-ceiling aggregation (which sums `cost_usd`
   * by user/month) naturally includes generation spend.
   *
   * Cost-record persistence failures are logged but never thrown — a metering
   * write must not fail the user-visible generation it audits.
   */
  async recordGenerationCost(
    userId: string,
    params: RecordGenerationCostParams,
  ): Promise<AgentCostRecord | null> {
    const sessionId =
      params.sessionId ??
      (params.plotId ? `plot:${params.plotId}` : `gen:${params.kind}`);

    try {
      const record = this.costRecordRepo.create({
        userId,
        sessionId,
        model: params.model ?? `world-creation.generate.${params.kind}`,
        provider: params.provider ?? 'world-creation-generation',
        costUsd: Number.isFinite(params.costUsd) ? Math.max(0, params.costUsd) : 0,
        eventType: `generation_${params.kind}`,
      });
      return await this.costRecordRepo.save(record);
    } catch (err) {
      this.logger.error(
        `Failed to write agent_cost_records for generation ${params.kind} ` +
          `(user=${userId}, session=${sessionId}): ${this.toDetail(err)}`,
      );
      return null;
    }
  }

  // ============================================================
  // R12.5 — 3D model generation via pluggable provider strategy
  // ============================================================

  /**
   * Generate a 3D model by delegating to the pluggable {@link ProviderRegistry}
   * (Hunyuan3D primary + Meshy backup + provider-failover, reused from
   * pet-generation). The platform does NOT self-build 3D generation (R12.5);
   * it only orchestrates the provider strategy and meters the cost.
   *
   * On success the operation is metered to `agent_cost_records` with
   * `kind='model_3d'` and the provider actually used (after any failover).
   *
   * @returns The provider failover result (mesh URL, provider used, latency,
   *          estimated cost).
   */
  async generate3dModel(
    input: Generate3dModelInput,
  ): Promise<FailoverResult<ReconstructionJobOutput>> {
    const job: ReconstructionJobInput = {
      imageUrls: input.imageUrls,
      mode: input.mode ?? 'quick',
      style: input.style,
      userId: input.userId,
      sessionId: input.sessionId,
    };

    // Delegate to the reused pluggable provider strategy (Hunyuan3D → Meshy).
    const failover = await this.providerRegistry.executeReconstruction(job);

    // Meter the actual cost against the provider that produced the result.
    await this.recordGenerationCost(input.userId, {
      kind: 'model_3d',
      costUsd: failover.result.estimatedCostUsd,
      provider: failover.providerUsed,
      plotId: input.plotId ?? null,
      sessionId: input.sessionId,
    });

    return failover;
  }

  // ============================================================
  // Helpers
  // ============================================================

  private toDetail(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    return 'unknown error';
  }
}
