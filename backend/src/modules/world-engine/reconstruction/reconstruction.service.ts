import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';

import { ScanSession } from '../entities/scan-session.entity';
import { AgentCostRecord } from '../../../entities/agent-cost-record.entity';
import {
  ProviderRegistry,
  ReconstructionPipeline,
  ReconstructionJobInput,
} from './provider-registry';

// ── Types ──────────────────────────────────────────────────────────────────

export interface SubmitJobInput {
  imageUrls: string[];
  mode: 'quick' | 'detail' | 'room';
  style?: string;
  userId: string;
  sessionId: string;
}

export interface SubmitJobResult {
  jobId: string;
  estimatedSeconds: number;
  pipeline: ReconstructionPipeline;
  queue: string;
}

export interface JobStatusResult {
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'timeout' | 'not_found';
  progress: number;
  result?: {
    meshUrl: string;
    thumbnailUrl?: string;
    provider: string;
    latencyMs: number;
  };
  error?: string;
}

/**
 * ReconstructionJob — represents a tracked job for WebSocket progress events.
 * Used by the JobProgressGateway.
 */
export interface ReconstructionJob {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  result?: Record<string, any>;
  errorMessage?: string;
}

type JobProgressListener = (job: ReconstructionJob) => void;

// ── Constants ──────────────────────────────────────────────────────────────

const QUEUE_FAST = 'reconstruction-fast';
const QUEUE_PRECISION = 'reconstruction-precision';

/** Estimated completion time shown to user (seconds) */
const ESTIMATED_SECONDS_FAST = 12;
const ESTIMATED_SECONDS_PRECISION = 60;

// ── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class ReconstructionService {
  private readonly logger = new Logger(ReconstructionService.name);

  private fastQueue: Queue;
  private precisionQueue: Queue;

  /** In-memory job status cache (production would use Redis) */
  private jobStatuses: Map<string, JobStatusResult> = new Map();

  /** Tracked jobs for WebSocket gateway */
  private jobs: Map<string, ReconstructionJob> = new Map();

  /** Progress listeners per job (for WebSocket gateway) */
  private progressListeners: Map<string, Set<JobProgressListener>> = new Map();

  constructor(
    @InjectRepository(ScanSession)
    private readonly scanSessionRepo: Repository<ScanSession>,
    @InjectRepository(AgentCostRecord)
    private readonly costRecordRepo: Repository<AgentCostRecord>,
    private readonly config: ConfigService,
    private readonly providerRegistry: ProviderRegistry,
  ) {
    const redisHost = this.config.get<string>('REDIS_HOST', 'localhost');
    const redisPort = this.config.get<number>('REDIS_PORT', 6379);

    const connection = { host: redisHost, port: redisPort };

    this.fastQueue = new Queue(QUEUE_FAST, { connection });
    this.precisionQueue = new Queue(QUEUE_PRECISION, { connection });

    this.logger.log(
      `ReconstructionService initialized with queues: ${QUEUE_FAST}, ${QUEUE_PRECISION}`,
    );
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Submit images for 3D reconstruction.
   * Supports both the full SubmitJobInput and the legacy controller signature.
   */
  async submitJob(
    inputOrSessionId: SubmitJobInput | string,
    mode?: 'quick' | 'detail' | 'room',
    config?: { style?: string; userId?: string },
  ): Promise<{ jobId: string; estimatedSeconds: number }> {
    let input: SubmitJobInput;

    if (typeof inputOrSessionId === 'string') {
      // Legacy controller signature: submitJob(sessionId, mode, config)
      // Wave 17 v5 — emit fully-qualified public URLs for each frame so
      // Hunyuan3D can fetch them. We have to enumerate the directory
      // because providers expect per-image URLs, not a folder URL.
      const sessionId = inputOrSessionId;
      const publicBase = (process.env.PUBLIC_URL || 'https://api.agentrix.top').replace(/\/$/, '');
      const sessionDir = `${process.cwd()}/uploads/world-engine/scans/${sessionId}`;
      let imageUrls: string[] = [];
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
        const fs = require('fs');
        if (fs.existsSync(sessionDir)) {
          const files: string[] = fs.readdirSync(sessionDir);
          imageUrls = files
            .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
            .map((f) => `${publicBase}/api/uploads/world-engine/scans/${sessionId}/${f}`);
        }
      } catch {
        // Filesystem read failed — fall back to a single placeholder URL so
        // downstream code logs a clear error instead of crashing here.
        imageUrls = [`${publicBase}/api/uploads/world-engine/scans/${sessionId}`];
      }
      input = {
        imageUrls,
        mode: mode!,
        style: config?.style,
        userId: config?.userId || '',
        sessionId,
      };
    } else {
      input = inputOrSessionId;
    }

    const pipeline = this.providerRegistry.getPipeline(input.mode);
    const queue = pipeline === 'fast' ? QUEUE_FAST : QUEUE_PRECISION;
    const jobId = uuidv4();

    // Update scan session status
    await this.scanSessionRepo.update(input.sessionId, {
      status: 'submitted',
      pipelineUsed: pipeline,
    });

    // Prepare job data
    const jobData: ReconstructionJobInput & { jobId: string } = {
      jobId,
      imageUrls: input.imageUrls,
      mode: input.mode,
      style: input.style,
      userId: input.userId,
      sessionId: input.sessionId,
    };

    // Set initial job status
    this.jobStatuses.set(jobId, { status: 'queued', progress: 0 });

    // Track job for WebSocket gateway
    const trackedJob: ReconstructionJob = { jobId, status: 'queued', progress: 0 };
    this.jobs.set(jobId, trackedJob);

    // Dispatch to appropriate queue
    const targetQueue = pipeline === 'fast' ? this.fastQueue : this.precisionQueue;

    await targetQueue.add('reconstruct', jobData, {
      jobId,
      // 2026-05-29: attempts back to 1. Re-running the whole job re-submits a
      // NEW Hunyuan3D job, which (given the 1-job account limit) collides with
      // the still-running prior submit → JobNumExceed loop. Transient busy is
      // now handled inside runHunyuan3DGated (gate + busy-backoff) WITHOUT
      // re-submitting, so a BullMQ-level retry is both unnecessary and harmful.
      attempts: 1,
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 86400 },
    });

    const estimatedSeconds =
      pipeline === 'fast' ? ESTIMATED_SECONDS_FAST : ESTIMATED_SECONDS_PRECISION;

    this.logger.log(
      `Job ${jobId} submitted to ${queue} (pipeline=${pipeline}, mode=${input.mode})`,
    );

    return { jobId, estimatedSeconds };
  }

  /**
   * Get the current status of a reconstruction job.
   */
  async getJobStatus(jobId: string): Promise<JobStatusResult> {
    const cached = this.jobStatuses.get(jobId);
    if (cached) return cached;

    // Fallback: check both queues
    const fastJob = await this.fastQueue.getJob(jobId);
    const precisionJob = await this.precisionQueue.getJob(jobId);
    const job = fastJob || precisionJob;

    if (!job) {
      return { status: 'not_found', progress: 0, error: 'Job not found' };
    }

    const state = await job.getState();
    switch (state) {
      case 'waiting':
      case 'delayed':
        return { status: 'queued', progress: 0 };
      case 'active':
        return { status: 'processing', progress: (job.progress as number) || 10 };
      case 'completed':
        return { status: 'completed', progress: 100, result: job.returnvalue };
      case 'failed':
        return { status: 'failed', progress: 0, error: job.failedReason || 'Unknown error' };
      default:
        return { status: 'queued', progress: 0 };
    }
  }

  /**
   * Update job status (called by the processor). Also notifies WebSocket listeners.
   */
  updateJobStatus(jobId: string, status: JobStatusResult): void {
    this.jobStatuses.set(jobId, status);

    // Update tracked job and notify listeners
    const tracked = this.jobs.get(jobId);
    if (tracked) {
      tracked.status = status.status === 'timeout' ? 'failed' : status.status as any;
      tracked.progress = status.progress;
      tracked.result = status.result;
      tracked.errorMessage = status.error;
      this.notifyListeners(jobId, tracked);
    }
  }

  // ── WebSocket Gateway Support ──────────────────────────────────────────

  /** Get a tracked job by ID (used by JobProgressGateway). */
  getJob(jobId: string): ReconstructionJob | undefined {
    return this.jobs.get(jobId);
  }

  /** Register a progress listener for a job. Returns an unsubscribe function. */
  onJobProgress(jobId: string, listener: JobProgressListener): () => void {
    if (!this.progressListeners.has(jobId)) {
      this.progressListeners.set(jobId, new Set());
    }
    this.progressListeners.get(jobId)!.add(listener);

    return () => {
      const listeners = this.progressListeners.get(jobId);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) this.progressListeners.delete(jobId);
      }
    };
  }

  private notifyListeners(jobId: string, job: ReconstructionJob): void {
    const listeners = this.progressListeners.get(jobId);
    if (listeners) {
      for (const listener of listeners) {
        try { listener(job); } catch (err) {
          this.logger.warn(`Job progress listener error for ${jobId}: ${err}`);
        }
      }
    }
  }

  // ── Cost Tracking ──────────────────────────────────────────────────────

  /** Write a cost record to agent_cost_records table. */
  async writeCostRecord(params: {
    userId: string;
    sessionId: string;
    provider: string;
    tier: 'fast' | 'precision';
    estimatedCostUsd: number;
    latencyMs: number;
    routingReason?: string;
  }): Promise<void> {
    try {
      const record = this.costRecordRepo.create({
        userId: params.userId,
        sessionId: params.sessionId,
        model: `3d-reconstruction-${params.tier}`,
        provider: params.provider,
        costUsd: params.estimatedCostUsd,
        tier: params.tier,
        routingReason: params.routingReason || 'primary',
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      });
      await this.costRecordRepo.save(record);
      this.logger.debug(
        `Cost record written: provider=${params.provider} cost=$${params.estimatedCostUsd} tier=${params.tier}`,
      );
    } catch (err: any) {
      this.logger.error(`Failed to write cost record: ${err.message}`);
    }
  }

  // ── Provider Cost Switching ────────────────────────────────────────────

  /** Compute 7-day rolling average cost per provider and update the registry. */
  async computeRollingAvgCosts(): Promise<void> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    try {
      const results = await this.costRecordRepo
        .createQueryBuilder('record')
        .select('record.provider', 'provider')
        .addSelect('AVG(record.costUsd)', 'avgCost')
        .where('record.createdAt > :since', { since: sevenDaysAgo })
        .andWhere("record.model LIKE '3d-reconstruction%'")
        .groupBy('record.provider')
        .getRawMany<{ provider: string; avgCost: string }>();

      for (const row of results) {
        if (row.provider) {
          this.providerRegistry.updateRollingAvgCost(
            row.provider,
            parseFloat(row.avgCost) || 0,
          );
        }
      }
      this.logger.debug(`Updated rolling avg costs for ${results.length} providers`);
    } catch (err: any) {
      this.logger.error(`Failed to compute rolling avg costs: ${err.message}`);
    }
  }

  // ── Queue Accessors (for processor) ────────────────────────────────────

  getFastQueueName(): string { return QUEUE_FAST; }
  getPrecisionQueueName(): string { return QUEUE_PRECISION; }

  getRedisConnection(): { host: string; port: number } {
    return {
      host: this.config.get<string>('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
    };
  }
}
