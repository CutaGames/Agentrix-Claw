import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Worker, Job } from 'bullmq';

import { ScanSession } from '../entities/scan-session.entity';
import { ProviderRegistry, ReconstructionJobInput } from './provider-registry';
import { ReconstructionService } from './reconstruction.service';
import { AssetCreationService } from '../services/asset-creation.service';

// ── Types ──────────────────────────────────────────────────────────────────

interface ReconstructionJobData extends ReconstructionJobInput {
  jobId: string;
}

// ── Processor ──────────────────────────────────────────────────────────────

/**
 * ReconstructionProcessor — BullMQ worker that processes reconstruction jobs.
 *
 * Picks up jobs from the two queues (reconstruction-fast, reconstruction-precision),
 * calls the provider registry to get the appropriate provider, executes
 * reconstruction with failover, and updates ScanSession status on completion/failure.
 */
@Injectable()
export class ReconstructionProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReconstructionProcessor.name);

  private fastWorker: Worker | null = null;
  private precisionWorker: Worker | null = null;

  constructor(
    @InjectRepository(ScanSession)
    private readonly scanSessionRepo: Repository<ScanSession>,
    private readonly providerRegistry: ProviderRegistry,
    private readonly reconstructionService: ReconstructionService,
    private readonly assetCreationService: AssetCreationService,
  ) {}

  onModuleInit() {
    const connection = this.reconstructionService.getRedisConnection();

    // Fast-track worker
    this.fastWorker = new Worker(
      this.reconstructionService.getFastQueueName(),
      async (job: Job<ReconstructionJobData>) => this.processJob(job, 'fast'),
      {
        connection,
        // 2026-05-29 fix: Tencent Hunyuan3D account allows only ONE concurrent
        // job (JobNumExceed=1). Process reconstruction jobs strictly serially
        // so we never submit a second job while one is in flight (which the
        // provider rejects with RequestLimitExceeded.JobNumExceed). Throughput
        // is provider-bound anyway; queueing is the correct backpressure model.
        concurrency: 1, // was 5 — matches hunyuan3d account quota
        limiter: { max: 10, duration: 60_000 }, // Max 10 jobs per minute
        // A single job now polls the provider for up to 90s (fast) — well
        // beyond BullMQ's default 30s lockDuration. Without a longer lock the
        // job is flagged "stalled" mid-flight and re-run, causing duplicate
        // Hunyuan3D submissions (double charge) and racey status updates.
        lockDuration: 120_000,
      },
    );

    this.fastWorker.on('failed', (job, err) => {
      this.logger.error(
        `Fast-track job ${job?.id} failed: ${err.message}`,
      );
    });

    // Precision-track worker
    this.precisionWorker = new Worker(
      this.reconstructionService.getPrecisionQueueName(),
      async (job: Job<ReconstructionJobData>) => this.processJob(job, 'precision'),
      {
        connection,
        // Serial — see fast-worker note. Fast + precision share the SAME
        // Hunyuan3D account (global JobNumExceed=1), so the in-process
        // ProviderRegistry concurrency Map (cap=1) additionally serializes
        // across both workers; a job that still races the cap is retried.
        concurrency: 1,
        limiter: { max: 5, duration: 60_000 },
        // precision polls up to 180s; lock must exceed that + margin to avoid
        // stalled-job re-runs (see fast-track note above).
        lockDuration: 210_000,
      },
    );

    this.precisionWorker.on('failed', (job, err) => {
      this.logger.error(
        `Precision-track job ${job?.id} failed: ${err.message}`,
      );
    });

    this.logger.log('ReconstructionProcessor workers started');
  }

  async onModuleDestroy() {
    await this.fastWorker?.close();
    await this.precisionWorker?.close();
    this.logger.log('ReconstructionProcessor workers stopped');
  }

  // ── Scheduled Background Jobs ────────────────────────────────────────────

  /**
   * Compute 7-day rolling average cost per provider every 10 minutes.
   * Updates the ProviderRegistry so that automatic cost-based switching
   * routes requests to the cheapest healthy provider (per design §7, R13.8).
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleRollingCostUpdate(): Promise<void> {
    this.logger.debug('Running scheduled rolling cost update...');
    await this.reconstructionService.computeRollingAvgCosts();
  }

  /**
   * Run provider health checks every 5 minutes.
   * Marks unhealthy providers so the registry can route around them.
   */
  @Cron('*/5 * * * *')
  async handleProviderHealthCheck(): Promise<void> {
    this.logger.debug('Running scheduled provider health check...');
    try {
      const results = await this.providerRegistry.healthCheck();
      const unhealthy = results.filter((r) => !r.healthy);
      if (unhealthy.length > 0) {
        this.logger.warn(
          `Unhealthy providers: ${unhealthy.map((r) => r.name).join(', ')}`,
        );
      }
    } catch (err: any) {
      this.logger.error(`Provider health check failed: ${err.message}`);
    }
  }

  // ── Job Processing ─────────────────────────────────────────────────────

  private async processJob(
    job: Job<ReconstructionJobData>,
    tier: 'fast' | 'precision',
  ): Promise<{ meshUrl: string; thumbnailUrl?: string; provider: string; latencyMs: number; assetId?: string }> {
    const { jobId, userId, sessionId, imageUrls, mode, style } = job.data;

    this.logger.log(
      `Processing ${tier} job ${jobId} (session=${sessionId}, images=${imageUrls.length})`,
    );

    // Update status to processing
    this.reconstructionService.updateJobStatus(jobId, {
      status: 'processing',
      progress: 10,
    });

    await this.scanSessionRepo.update(sessionId, { status: 'processing' });

    // Report progress
    await job.updateProgress(10);

    try {
      // Execute reconstruction via provider registry (with failover)
      const failoverResult = await this.providerRegistry.executeReconstruction({
        imageUrls,
        mode,
        style,
        userId,
        sessionId,
      });

      const { result, providerUsed, attempts, primaryError } = failoverResult;

      // Update progress
      await job.updateProgress(90);
      this.reconstructionService.updateJobStatus(jobId, {
        status: 'processing',
        progress: 90,
      });

      // Write cost record to agent_cost_records
      await this.reconstructionService.writeCostRecord({
        userId,
        sessionId,
        provider: providerUsed,
        tier,
        estimatedCostUsd: result.estimatedCostUsd,
        latencyMs: result.latencyMs,
        routingReason: primaryError ? 'failover' : 'primary',
      });

      // 方案 B: 把 3D mesh 落库到 WorldAsset。若 generate 阶段已创建 card_ready
      // 资产(通过 session.resultAssetId), 这里把 mesh 填进去并置 complete;
      // 否则兜底创建一个完整资产。无论客户端是否还在轮询, 资产都会入库。
      let resultAssetId: string | undefined;
      try {
        const attach = await this.assetCreationService.attachMeshBySession(
          sessionId,
          result.meshUrl,
          result.thumbnailUrl,
          { ownerId: userId, scanMode: mode, imageUrls },
        );
        resultAssetId = attach.assetId;
      } catch (assetErr: any) {
        // 落库失败不应让整个 job 失败(mesh 已生成成功)。记录并继续。
        this.logger.error(
          `Job ${jobId} mesh generated but asset persistence failed: ${assetErr.message}`,
        );
      }

      // Update scan session to completed
      await this.scanSessionRepo.update(sessionId, { status: 'completed' });

      // Update job status to completed
      const completedResult = {
        meshUrl: result.meshUrl,
        thumbnailUrl: result.thumbnailUrl,
        provider: providerUsed,
        latencyMs: result.latencyMs,
        assetId: resultAssetId,
      };

      this.reconstructionService.updateJobStatus(jobId, {
        status: 'completed',
        progress: 100,
        result: completedResult,
      });

      this.logger.log(
        `Job ${jobId} completed: provider=${providerUsed} attempts=${attempts} latency=${result.latencyMs}ms`,
      );

      return completedResult;
    } catch (err: any) {
      // 2026-05-29 fix: classify the failure so the mobile client can show a
      // real, actionable message instead of a generic "生成失败". The reason
      // code is persisted on the scan session and surfaced via job status.
      const rawMsg: string = err?.message || 'Unknown error';
      let reason: 'timeout' | 'url_illegal' | 'provider_down' | 'provider_busy' | 'no_mesh' | 'failed';
      if (/timed out/i.test(rawMsg)) {
        reason = 'timeout';
      } else if (/JobNumExceed|RequestLimitExceeded|任务上限/i.test(rawMsg)) {
        reason = 'provider_busy';
      } else if (/UrlIllegal|URL格式不合法|InvalidImage/i.test(rawMsg)) {
        reason = 'url_illegal';
      } else if (/Missing .*KEY|fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|HTTP_5\d\d/i.test(rawMsg)) {
        reason = 'provider_down';
      } else if (/no mesh URL/i.test(rawMsg)) {
        reason = 'no_mesh';
      } else {
        reason = 'failed';
      }

      // Update scan session to failed (with classified reason for diagnostics).
      // errorMessage column is varchar(255) → keep the stored string short.
      await this.scanSessionRepo.update(sessionId, {
        status: 'failed',
        errorMessage: `[${reason}] ${rawMsg}`.slice(0, 240),
      });

      // 方案 B: 若 generate 阶段已创建 card_ready 资产, 3D 失败时不删资产, 只标记
      // mesh_failed — 角色卡与 AI 属性仍保留, 用户可在资产库重试 3D。
      try {
        await this.assetCreationService.markMeshFailedBySession(sessionId, reason);
      } catch (markErr: any) {
        this.logger.warn(`Failed to mark asset mesh_failed (session ${sessionId}): ${markErr.message}`);
      }

      // Update job status to failed
      this.reconstructionService.updateJobStatus(jobId, {
        status: reason === 'timeout' ? 'timeout' : 'failed',
        progress: 0,
        error: `[${reason}] ${rawMsg}`,
      });

      this.logger.error(
        `Job ${jobId} failed (reason=${reason}): ${rawMsg}`,
      );

      throw err;
    }
  }
}
