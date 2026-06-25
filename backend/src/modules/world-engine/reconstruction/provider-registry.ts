import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Hunyuan3DProvider } from '../../pet-generation/hunyuan3d.provider';
import { MeshyProvider } from '../../pet-generation/meshy.provider';
import { AiProviderService } from '../../ai-provider/ai-provider.service';
import {
  runWithFailover,
  defaultIsRetryable,
  FailoverResult,
} from '../../pet-generation/provider-failover';

/**
 * 2026-05-29: retry predicate for reconstruction.
 *
 * NOTE: JobNumExceed / RequestLimitExceeded are deliberately NOT treated as
 * retryable here. Those are now handled *inside* runHunyuan3DGated via the
 * submit gate + busy-backoff (which waits for the single account slot WITHOUT
 * re-submitting a fresh job). Marking them retryable at this layer caused the
 * BullMQ job to be re-run end-to-end, re-submitting a NEW Hunyuan3D job while
 * the prior one was still running — the exact loop that produced repeated
 * JobNumExceed failures. Keep only genuinely transient transport errors here.
 */
function isReconstructionRetryable(err: unknown): boolean {
  if (defaultIsRetryable(err)) return true;
  const e = err as { code?: string };
  // In-process concurrency cap is transient and safe to retry (no submit yet).
  if (e?.code === 'EPROVIDERBUSY') return true;
  return false;
}

// ── Types ──────────────────────────────────────────────────────────────────

export type ReconstructionPipeline = 'fast' | 'precision';

export interface ReconstructionJobInput {
  imageUrls: string[];
  mode: 'quick' | 'detail' | 'room';
  style?: string;
  userId: string;
  sessionId: string;
}

export interface ReconstructionJobOutput {
  meshUrl: string;
  thumbnailUrl?: string;
  provider: string;
  latencyMs: number;
  estimatedCostUsd: number;
}

export interface ProviderHealthStatus {
  name: string;
  healthy: boolean;
  lastCheckedAt: Date;
  errorMessage?: string;
}

interface ProviderConcurrencyState {
  current: number;
  max: number;
}

// ── Per-Provider Concurrency Caps (from design §7) ─────────────────────────

const CONCURRENCY_CAPS: Record<string, number> = {
  // 2026-05-29 fix: Tencent Hunyuan3D account quota is JobNumExceed=1 — only
  // ONE concurrent SubmitHunyuanTo3DJob is allowed. The previous cap of 5 let
  // the worker submit while a prior job still held the single provider slot,
  // producing "RequestLimitExceeded.JobNumExceed — 当前已达到1个任务上限".
  // Cap matched to the real account limit; raise this only after the Tencent
  // quota is increased on the account side.
  hunyuan3d: 1,
  meshy: 5,
  stability: 3,
  triposr: 2,
  instantmesh: 1,
  lgm: 1,
};

// ── Cost thresholds for automatic provider switching (design §7) ───────────

const COST_THRESHOLD_FAST = 0.10; // USD per call
const COST_THRESHOLD_PRECISION = 0.30; // USD per call

// ── Estimated costs per provider (from PROVIDER_COSTS.md) ──────────────────

const ESTIMATED_COSTS: Record<string, number> = {
  hunyuan3d: 0.05,
  meshy: 0.08,
  stability: 0.35,
  triposr: 0.01,
  instantmesh: 0.05,
  lgm: 0.07,
};

// ── Provider poll timeouts ─────────────────────────────────────────────────
//
// 2026-05-29 fix: the previous fast-track timeout was 15s, but Tencent
// Hunyuan3D image-to-3D jobs realistically take 30-90s to reach DONE. A 15s
// ceiling meant Quick Scan jobs *always* timed out, then fell over to the
// Meshy fallback — which hard-fails when MESHY_API_KEY is unset (we only
// have Tencent secrets configured). Net effect: every Quick Scan "failed".
//
// These ceilings are the per-provider polling budgets, NOT the time shown to
// the user. The mobile client polls job status independently and the
// card-before-mesh flow surfaces the character card long before the mesh is
// ready, so a generous ceiling here only affects how long we keep waiting for
// the .glb in the background.
const POLL_TIMEOUT_FAST_MS = 90_000; // was 15_000
const POLL_TIMEOUT_PRECISION_MS = 180_000; // was 90_000

// ── Hunyuan3D global submit gate (2026-05-29) ──────────────────────────────
//
// The Tencent Hunyuan3D account allows only ONE concurrent job
// (RequestLimitExceeded.JobNumExceed — "当前已达到1个任务上限"). The previous
// approach (BullMQ attempts:2 + treating JobNumExceed as retryable) made this
// WORSE: a retry re-submitted while the prior job was still running on
// Tencent's side (30-90s), so the resubmit hit JobNumExceed again, looped, and
// failed. The correct model is a process-wide serialization gate: only one
// Hunyuan3D job may be in-flight (submit→poll→done) at a time; new requests
// wait for the gate. If the account is occupied by an *external* caller
// (e.g. pet-generation shares the same account), we back off and re-probe
// rather than hard-failing.
const HUNYUAN_GATE_MAX_WAIT_MS = 120_000; // max time a job waits for the gate before giving up
const HUNYUAN_JOBNUMEXCEED_BACKOFF_MS = 5_000; // wait between re-probes when account is externally busy
const HUNYUAN_JOBNUMEXCEED_MAX_RETRIES = 24; // 24 × 5s ≈ 2 min of external-busy tolerance

// ── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class ProviderRegistry implements OnModuleInit {
  private readonly logger = new Logger(ProviderRegistry.name);

  private readonly concurrency: Map<string, ProviderConcurrencyState> = new Map();
  private readonly healthCache: Map<string, ProviderHealthStatus> = new Map();

  /** 7-day rolling average cost per provider (updated by background job) */
  private rollingAvgCost: Map<string, number> = new Map();

  /**
   * Process-wide serialization gate for Hunyuan3D submissions. A promise that
   * resolves when the currently in-flight Hunyuan3D job (if any) releases the
   * single account slot. Chained so concurrent callers queue FIFO. See the
   * HUNYUAN_GATE_* constants above for the rationale.
   */
  private hunyuanGate: Promise<void> = Promise.resolve();

  constructor(
    private readonly config: ConfigService,
    private readonly hunyuan3d: Hunyuan3DProvider,
    private readonly meshy: MeshyProvider,
    private readonly aiProviderService: AiProviderService,
  ) {}

  onModuleInit() {
    // Initialize concurrency tracking for all known providers
    for (const [name, max] of Object.entries(CONCURRENCY_CAPS)) {
      this.concurrency.set(name, { current: 0, max });
    }
    this.logger.log('ProviderRegistry initialized with concurrency caps');
  }

  // ── Pipeline Routing ───────────────────────────────────────────────────

  /**
   * Determine which pipeline to use based on scan mode.
   * quick → fast pipeline; detail/room → precision pipeline.
   */
  getPipeline(mode: 'quick' | 'detail' | 'room'): ReconstructionPipeline {
    return mode === 'quick' ? 'fast' : 'precision';
  }

  /**
   * Get the preferred provider for a given pipeline, considering:
   * 1. 7-day rolling avg cost (prefer cheaper if threshold exceeded)
   * 2. Concurrency availability
   * 3. Health status
   */
  getPreferredProvider(pipeline: ReconstructionPipeline): string {
    if (pipeline === 'fast') {
      return this.selectFastProvider();
    }
    return this.selectPrecisionProvider();
  }

  private selectFastProvider(): string {
    // Primary: Hunyuan3D (imageUrl mode, single image)
    // Fallback: Meshy (image-to-3D)
    const hunyuanAvg = this.rollingAvgCost.get('hunyuan3d') ?? 0;
    const meshyAvg = this.rollingAvgCost.get('meshy') ?? 0;

    // If Hunyuan3D exceeds cost threshold and Meshy is healthy + available, prefer Meshy
    if (hunyuanAvg > COST_THRESHOLD_FAST && this.isProviderAvailable('meshy')) {
      this.logger.debug(
        `Hunyuan3D 7d avg cost ($${hunyuanAvg.toFixed(3)}) exceeds threshold, routing to Meshy`,
      );
      return 'meshy';
    }

    // If Meshy exceeds cost threshold and Hunyuan3D is healthy + available, prefer Hunyuan3D
    if (meshyAvg > COST_THRESHOLD_FAST && this.isProviderAvailable('hunyuan3d')) {
      return 'hunyuan3d';
    }

    // Default: Hunyuan3D primary
    if (this.isProviderAvailable('hunyuan3d')) {
      return 'hunyuan3d';
    }
    if (this.isProviderAvailable('meshy')) {
      return 'meshy';
    }

    // All providers at capacity — still return primary, let queue handle backpressure
    return 'hunyuan3d';
  }

  private selectPrecisionProvider(): string {
    // Primary: Hunyuan3D (multi-view mode)
    // Phase 1: no self-hosted GPU fallback for precision; Hunyuan3D only
    if (this.isProviderAvailable('hunyuan3d')) {
      return 'hunyuan3d';
    }
    // Fallback deferred to Phase 2
    return 'hunyuan3d';
  }

  // ── Provider Execution ─────────────────────────────────────────────────

  /**
   * Run a Hunyuan3D job through the process-wide submit gate.
   *
   * Guarantees only ONE Hunyuan3D job is in-flight at a time (the account's
   * hard limit). Callers queue FIFO. On JobNumExceed (account occupied by an
   * external caller that doesn't go through this gate, e.g. pet-generation),
   * we back off and re-probe instead of failing — the slot frees within a
   * minute or two and the submit then succeeds.
   *
   * Returns the mesh result; throws only on genuine failure (timeout, provider
   * error other than transient busy, or exhausted external-busy retries).
   */
  private async runHunyuan3DGated(
    secretId: string,
    secretKey: string,
    imageUrl: string,
    pollTimeoutMs: number,
  ): Promise<ReconstructionJobOutput> {
    // Wait for the gate (the previous in-flight Hunyuan3D job), but cap the
    // wait so a stuck predecessor can't block us forever.
    const myTurn = this.hunyuanGate;
    let release!: () => void;
    // Install the next gate link BEFORE awaiting, so subsequent callers queue
    // behind us atomically.
    this.hunyuanGate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const gateWaitStart = Date.now();
    try {
      await Promise.race([
        myTurn,
        this.sleep(HUNYUAN_GATE_MAX_WAIT_MS).then(() => {
          this.logger.warn(
            `Hunyuan3D gate wait exceeded ${HUNYUAN_GATE_MAX_WAIT_MS}ms — proceeding anyway ` +
              `(predecessor likely stuck; account-level JobNumExceed guard still applies).`,
          );
        }),
      ]);
    } catch {
      /* predecessor rejected — ignore, it's not our concern; proceed */
    }
    this.logger.debug(`Hunyuan3D gate acquired after ${Date.now() - gateWaitStart}ms`);

    try {
      const start = Date.now();
      const jobId = await this.submitHunyuanWithBusyBackoff(secretId, secretKey, imageUrl);
      const result = await this.pollHunyuan3DJob(secretId, secretKey, jobId, pollTimeoutMs);
      const latencyMs = Date.now() - start;
      return {
        meshUrl: result.meshUrl,
        thumbnailUrl: result.thumbnailUrl,
        provider: 'hunyuan3d',
        latencyMs,
        estimatedCostUsd: ESTIMATED_COSTS.hunyuan3d,
      };
    } finally {
      // Release the gate so the next queued caller can submit.
      release();
    }
  }

  /**
   * Submit a Hunyuan3D job, tolerating account-level JobNumExceed by backing
   * off and re-probing. This handles the case where another subsystem
   * (pet-generation) holds the single account slot — we wait it out instead
   * of failing the user's generation. Does NOT re-submit on a successful
   * submit; only retries when the submit itself is rejected for being busy.
   */
  private async submitHunyuanWithBusyBackoff(
    secretId: string,
    secretKey: string,
    imageUrl: string,
  ): Promise<string> {
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const { jobId } = await this.hunyuan3d.submit(secretId, secretKey, {
          imageUrl,
          resultFormat: 'GLB',
          enablePBR: true,
        });
        return jobId;
      } catch (err: any) {
        const msg: string = err?.message || '';
        const isBusy = /JobNumExceed|RequestLimitExceeded|任务上限/i.test(msg);
        if (!isBusy || attempt >= HUNYUAN_JOBNUMEXCEED_MAX_RETRIES) {
          throw err;
        }
        attempt++;
        this.logger.warn(
          `Hunyuan3D account busy (JobNumExceed), waiting ${HUNYUAN_JOBNUMEXCEED_BACKOFF_MS}ms ` +
            `before re-submit (attempt ${attempt}/${HUNYUAN_JOBNUMEXCEED_MAX_RETRIES}).`,
        );
        await this.sleep(HUNYUAN_JOBNUMEXCEED_BACKOFF_MS);
      }
    }
  }

  /**
   * Execute reconstruction with failover logic.
   * Uses the existing runWithFailover helper from pet-generation.
   *
   * BYO 3D (2026-06-01): per-user keys take precedence over the platform env
   * credentials. If the user saved a `tencent-3d` (Hunyuan3D) or `meshy` key
   * under their AI-provider settings, we use theirs (their account, their
   * quota, their bill). Platform env keys are the fallback — and on prod the
   * platform 3D path is gated OFF by default (WORLD_ENGINE_3D_ENABLED), so in
   * practice 3D runs only when the user brings their own key.
   */
  async executeReconstruction(
    input: ReconstructionJobInput,
  ): Promise<FailoverResult<ReconstructionJobOutput>> {
    const pipeline = this.getPipeline(input.mode);
    const { secretId, secretKey, meshyApiKey, source } = await this.resolveCredentials(input.userId);

    this.logger.log(
      `Reconstruction credentials resolved for user=${input.userId}: ` +
        `tencent=${secretId ? source.tencent : 'none'}, meshy=${meshyApiKey ? source.meshy : 'none'}`,
    );

    if (pipeline === 'fast') {
      return this.executeFastTrack(input, secretId, secretKey, meshyApiKey);
    }
    return this.executePrecisionTrack(input, secretId, secretKey);
  }

  /**
   * Resolve 3D credentials, preferring the user's BYO keys over platform env.
   * - Tencent Hunyuan3D: providerId `tencent-3d` (apiKey=SecretId, secretKey=SecretKey).
   * - Meshy: providerId `meshy` (apiKey=Meshy key).
   * Failure-safe: any lookup error falls back to env keys.
   */
  private async resolveCredentials(userId: string): Promise<{
    secretId: string;
    secretKey: string;
    meshyApiKey: string;
    source: { tencent: 'byo' | 'platform'; meshy: 'byo' | 'platform' };
  }> {
    let secretId = this.config.get<string>('TC_SecretId', '');
    let secretKey = this.config.get<string>('TC_SecretKey', '');
    let meshyApiKey = this.config.get<string>('MESHY_API_KEY', '');
    const source = { tencent: 'platform' as 'byo' | 'platform', meshy: 'platform' as 'byo' | 'platform' };

    if (!userId) return { secretId, secretKey, meshyApiKey, source };

    try {
      const tencentByo = await this.aiProviderService.getDecryptedKey(userId, 'tencent-3d');
      if (tencentByo?.apiKey && tencentByo?.secretKey) {
        secretId = tencentByo.apiKey;
        secretKey = tencentByo.secretKey;
        source.tencent = 'byo';
      }
    } catch (e) {
      this.logger.warn(`BYO tencent-3d key lookup failed for user ${userId}: ${(e as Error).message}`);
    }

    try {
      const meshyByo = await this.aiProviderService.getDecryptedKey(userId, 'meshy');
      if (meshyByo?.apiKey) {
        meshyApiKey = meshyByo.apiKey;
        source.meshy = 'byo';
      }
    } catch (e) {
      this.logger.warn(`BYO meshy key lookup failed for user ${userId}: ${(e as Error).message}`);
    }

    return { secretId, secretKey, meshyApiKey, source };
  }

  private async executeFastTrack(
    input: ReconstructionJobInput,
    secretId: string,
    secretKey: string,
    meshyApiKey: string,
  ): Promise<FailoverResult<ReconstructionJobOutput>> {
    const imageUrl = input.imageUrls[0]; // Fast track uses single image

    // 2026-05-29 fix: only register Meshy as a fallback when a key is actually
    // configured. Previously, a Hunyuan3D timeout fell over to Meshy
    // unconditionally; with MESHY_API_KEY unset that fallback threw
    // "Missing MESHY_API_KEY", masking the real (timeout) error and turning
    // every Quick Scan into a hard failure. With no key, we now surface the
    // primary Hunyuan3D error directly so the client can show a real message.
    const meshyFallback = meshyApiKey
      ? {
          name: 'meshy',
          exec: async () => {
            this.acquireConcurrency('meshy');
            try {
              const start = Date.now();
              const taskId = await this.meshy.submit(meshyApiKey, {
                mode: 'image',
                imageUrl,
                artStyle: input.style || 'realistic',
                targetPolycount: 10000,
              });

              const result = await this.pollMeshyJob(
                meshyApiKey,
                taskId,
                POLL_TIMEOUT_FAST_MS,
              );
              const latencyMs = Date.now() - start;

              return {
                meshUrl: result.meshUrl,
                thumbnailUrl: result.thumbnailUrl,
                provider: 'meshy',
                latencyMs,
                estimatedCostUsd: ESTIMATED_COSTS.meshy,
              };
            } finally {
              this.releaseConcurrency('meshy');
            }
          },
        }
      : undefined;

    if (!meshyFallback) {
      this.logger.warn(
        'MESHY_API_KEY not configured — Quick Scan will run Hunyuan3D only with no fallback provider.',
      );
    }

    return runWithFailover<ReconstructionJobOutput>({
      primary: {
        name: 'hunyuan3d',
        exec: async () => {
          this.acquireConcurrency('hunyuan3d');
          try {
            // Gated submit: process-wide serialization + JobNumExceed backoff.
            return await this.runHunyuan3DGated(
              secretId,
              secretKey,
              imageUrl,
              POLL_TIMEOUT_FAST_MS,
            );
          } finally {
            this.releaseConcurrency('hunyuan3d');
          }
        },
      },
      fallback: meshyFallback,
      isRetryable: isReconstructionRetryable,
      onAttempt: (info) => {
        this.logger.log(
          `Provider attempt: ${info.providerName} #${info.attempt} ` +
            `success=${info.success} elapsed=${info.elapsedMs}ms`,
        );
      },
    });
  }

  private async executePrecisionTrack(
    input: ReconstructionJobInput,
    secretId: string,
    secretKey: string,
  ): Promise<FailoverResult<ReconstructionJobOutput>> {
    // Precision track: Hunyuan3D with multi-view (multiple images)
    // For multi-view, we submit the first image as imageUrl
    // (Hunyuan3D API currently accepts single imageUrl; for true multi-view,
    // the existing scan service handles stitching — we use the primary image here)
    const imageUrl = input.imageUrls[0];

    return runWithFailover<ReconstructionJobOutput>({
      primary: {
        name: 'hunyuan3d',
        exec: async () => {
          this.acquireConcurrency('hunyuan3d');
          try {
            // Gated submit: process-wide serialization + JobNumExceed backoff.
            return await this.runHunyuan3DGated(
              secretId,
              secretKey,
              imageUrl,
              POLL_TIMEOUT_PRECISION_MS,
            );
          } finally {
            this.releaseConcurrency('hunyuan3d');
          }
        },
      },
      // No fallback for precision track in Phase 1
      isRetryable: isReconstructionRetryable,
      onAttempt: (info) => {
        this.logger.log(
          `Provider attempt (precision): ${info.providerName} #${info.attempt} ` +
            `success=${info.success} elapsed=${info.elapsedMs}ms`,
        );
      },
    });
  }

  // ── Polling Helpers ────────────────────────────────────────────────────

  private async pollHunyuan3DJob(
    secretId: string,
    secretKey: string,
    jobId: string,
    timeoutMs: number,
  ): Promise<{ meshUrl: string; thumbnailUrl?: string }> {
    const deadline = Date.now() + timeoutMs;
    const pollInterval = 2000; // 2s between polls

    while (Date.now() < deadline) {
      const result = await this.hunyuan3d.query(secretId, secretKey, jobId);

      if (result.status === 'DONE') {
        const glbFile = result.resultFile3Ds.find(
          (f) => f.type?.toUpperCase() === 'GLB' || f.url?.endsWith('.glb'),
        );
        const meshUrl = glbFile?.url || result.resultFile3Ds[0]?.url;
        if (!meshUrl) {
          throw new Error('Hunyuan3D job completed but no mesh URL in results');
        }
        return {
          meshUrl,
          thumbnailUrl: result.resultFile3Ds[0]?.previewImageUrl,
        };
      }

      if (result.status === 'FAIL') {
        throw new Error(
          `Hunyuan3D job failed: ${result.errorCode} — ${result.errorMessage}`,
        );
      }

      // WAIT or RUN — continue polling
      await this.sleep(pollInterval);
    }

    throw new Error(
      `Hunyuan3D job ${jobId} timed out after ${timeoutMs}ms`,
    );
  }

  private async pollMeshyJob(
    apiKey: string,
    taskId: string,
    timeoutMs: number,
  ): Promise<{ meshUrl: string; thumbnailUrl?: string }> {
    const deadline = Date.now() + timeoutMs;
    const pollInterval = 2000;

    while (Date.now() < deadline) {
      const status = await this.meshy.getStatus(apiKey, 'image', taskId);

      if (status.status === 'SUCCEEDED') {
        const meshUrl = this.meshy.extractMeshUrl(status);
        if (!meshUrl) {
          throw new Error('Meshy job completed but no mesh URL in results');
        }
        return {
          meshUrl,
          thumbnailUrl: this.meshy.extractThumbnail(status),
        };
      }

      if (status.status === 'FAILED' || status.status === 'CANCELED') {
        throw new Error(
          `Meshy job failed: ${status.task_error?.message || status.status}`,
        );
      }

      await this.sleep(pollInterval);
    }

    throw new Error(`Meshy job ${taskId} timed out after ${timeoutMs}ms`);
  }

  // ── Concurrency Management ─────────────────────────────────────────────

  private acquireConcurrency(provider: string): void {
    const state = this.concurrency.get(provider);
    if (!state) return;
    if (state.current >= state.max) {
      // 2026-05-29: tag as retryable so runWithFailover/BullMQ back off and
      // retry once the in-flight job releases the (single) provider slot,
      // instead of hard-failing the user's generation.
      const err = new Error(
        `Provider ${provider} at concurrency cap (${state.max}). Job will be retried.`,
      ) as Error & { code?: string };
      err.code = 'EPROVIDERBUSY';
      throw err;
    }
    state.current++;
  }

  private releaseConcurrency(provider: string): void {
    const state = this.concurrency.get(provider);
    if (!state) return;
    state.current = Math.max(0, state.current - 1);
  }

  private isProviderAvailable(provider: string): boolean {
    const state = this.concurrency.get(provider);
    if (!state) return false;
    if (state.current >= state.max) return false;

    // Check health cache
    const health = this.healthCache.get(provider);
    if (health && !health.healthy) {
      // If last check was within 60s, consider unhealthy
      const age = Date.now() - health.lastCheckedAt.getTime();
      if (age < 60_000) return false;
    }

    return true;
  }

  // ── Health Check ───────────────────────────────────────────────────────

  /**
   * Run health checks against all registered providers.
   * Called periodically by a background job.
   */
  async healthCheck(): Promise<ProviderHealthStatus[]> {
    const results: ProviderHealthStatus[] = [];
    const secretId = this.config.get<string>('TC_SecretId', '');
    const secretKey = this.config.get<string>('TC_SecretKey', '');
    const meshyApiKey = this.config.get<string>('MESHY_API_KEY', '');

    // Hunyuan3D health check — attempt a lightweight query with a dummy job ID
    const hunyuanHealth = await this.checkHunyuan3DHealth(secretId, secretKey);
    this.healthCache.set('hunyuan3d', hunyuanHealth);
    results.push(hunyuanHealth);

    // Meshy health check — verify API key is valid
    const meshyHealth = await this.checkMeshyHealth(meshyApiKey);
    this.healthCache.set('meshy', meshyHealth);
    results.push(meshyHealth);

    return results;
  }

  private async checkHunyuan3DHealth(
    secretId: string,
    secretKey: string,
  ): Promise<ProviderHealthStatus> {
    try {
      if (!secretId || !secretKey) {
        return {
          name: 'hunyuan3d',
          healthy: false,
          lastCheckedAt: new Date(),
          errorMessage: 'Missing TC_SecretId or TC_SecretKey',
        };
      }
      // A lightweight check: query a non-existent job — if we get a proper error
      // response (not a network error), the provider is reachable
      await this.hunyuan3d.query(secretId, secretKey, 'health-check-probe');
      // If it doesn't throw, something unexpected happened but provider is up
      return { name: 'hunyuan3d', healthy: true, lastCheckedAt: new Date() };
    } catch (err: any) {
      // Expected: job not found error means the API is reachable
      if (
        err.message?.includes('error:') ||
        err.message?.includes('ResourceNotFound') ||
        err.message?.includes('InvalidParameter')
      ) {
        return { name: 'hunyuan3d', healthy: true, lastCheckedAt: new Date() };
      }
      // Network/auth errors mean unhealthy
      return {
        name: 'hunyuan3d',
        healthy: false,
        lastCheckedAt: new Date(),
        errorMessage: err.message?.slice(0, 200),
      };
    }
  }

  private async checkMeshyHealth(apiKey: string): Promise<ProviderHealthStatus> {
    try {
      if (!apiKey) {
        return {
          name: 'meshy',
          healthy: false,
          lastCheckedAt: new Date(),
          errorMessage: 'Missing MESHY_API_KEY',
        };
      }
      // Attempt to get status of a non-existent task — 404 means API is reachable
      await this.meshy.getStatus(apiKey, 'image', 'health-check-probe');
      return { name: 'meshy', healthy: true, lastCheckedAt: new Date() };
    } catch (err: any) {
      // 404 or similar client error means the API is reachable
      if (err.message?.includes('404') || err.message?.includes('not found')) {
        return { name: 'meshy', healthy: true, lastCheckedAt: new Date() };
      }
      return {
        name: 'meshy',
        healthy: false,
        lastCheckedAt: new Date(),
        errorMessage: err.message?.slice(0, 200),
      };
    }
  }

  // ── Rolling Cost Management ────────────────────────────────────────────

  /**
   * Update the 7-day rolling average cost for a provider.
   * Called by the reconstruction processor after each job completes,
   * or by a periodic background job that queries agent_cost_records.
   */
  updateRollingAvgCost(provider: string, avgCost: number): void {
    this.rollingAvgCost.set(provider, avgCost);
    this.logger.debug(
      `Updated 7d rolling avg cost for ${provider}: $${avgCost.toFixed(4)}`,
    );
  }

  /**
   * Get the current rolling average cost for a provider.
   */
  getRollingAvgCost(provider: string): number {
    return this.rollingAvgCost.get(provider) ?? 0;
  }

  /**
   * Get estimated cost for a provider call.
   */
  getEstimatedCost(provider: string): number {
    return ESTIMATED_COSTS[provider] ?? 0.05;
  }

  // ── Utilities ──────────────────────────────────────────────────────────

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
