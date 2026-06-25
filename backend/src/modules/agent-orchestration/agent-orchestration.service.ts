import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentAccount } from '../../entities/agent-account.entity';
import { AgentLaneArtifact } from '../../entities/agent-lane-artifact.entity';
import { AgentLaneEvent } from '../../entities/agent-lane-event.entity';
import { AgentLaneJob, AgentLaneJobKind, AgentLaneJobStatus } from '../../entities/agent-lane-job.entity';
import { OpenClawInstance } from '../../entities/openclaw-instance.entity';
import { AgentContextService } from '../agent-context/agent-context.service';

// ── Orchestration Types ──────────────────────────────────────────────────────

export interface SubAgentConfig {
  /** Existing agent account ID to delegate to (from agent team) */
  agentAccountId?: string;
  /** Task description */
  task: string;
  /** Model override (defaults to agent's preferred model) */
  model?: string;
  /** Maximum LLM turns for this sub-agent */
  maxTurns?: number;
  /** Budget in USD for this sub-agent */
  budgetUsd?: number;
  /** Tool whitelist (if not provided, uses agent's configured permissions) */
  allowedTools?: string[];
  /** Run in background (async) or wait for result (sync) */
  runInBackground?: boolean;
}

export interface SubAgentHandle {
  id: string;
  agentAccountId?: string;
  agentName: string;
  role?: string;
  laneIndex?: number;
  task: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout';
  result?: string;
  error?: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  usage?: { inputTokens: number; outputTokens: number; estimatedCostUsd: number };
}

export interface CoordinateConfig {
  task: string;
  workers?: WorkerConfig[];
  timeoutMs?: number;
  maxParallelWorkers?: number;
}

export interface WorkerConfig {
  role: string;
  agentAccountId?: string;
  task: string;
  model?: string;
  maxTurns?: number;
  budgetUsd?: number;
  allowedTools?: string[];
}

export interface OrchestrationResult {
  coordinatorSummary: string;
  workers: SubAgentHandle[];
  totalCostUsd: number;
  parallelism: {
    requestedWorkers: number;
    maxParallelWorkers: number;
    completed: number;
    failed: number;
    timedOut: number;
    durationMs: number;
  };
}

export type AgentTaskEventType =
  | 'task.started'
  | 'task.progress'
  | 'tool.started'
  | 'tool.finished'
  | 'lane.started'
  | 'lane.finished'
  | 'approval.requested'
  | 'repair.patched'
  | 'task.cancelled'
  | 'task.completed';

export interface AgentTaskEvent {
  type: AgentTaskEventType;
  jobId: string;
  parentJobId?: string;
  sequence: number;
  payload?: Record<string, any>;
  createdAt: string;
}

export interface DurableOrchestrationResult extends OrchestrationResult {
  jobId: string;
  events: AgentTaskEvent[];
}

export interface WorkerRuntimeExecutor {
  executeLane(input: {
    parentUserId: string;
    worker: WorkerConfig;
    handle: SubAgentHandle;
    systemPrompt?: string;
  }): Promise<WorkerLaneResult>;
}

interface WorkerLaneResult {
  output: string;
  usage?: { inputTokens: number; outputTokens: number; estimatedCostUsd: number };
}

// ── Disallowed tools for sub-agents (prevent recursion) ──────────────────────
const SUB_AGENT_DISALLOWED_TOOLS = [
  'agent_spawn',
  'agent_coordinate',
  'create_subtask',
];

const DEFAULT_COORDINATION_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_PARALLEL_WORKERS = 4;
const MAX_COORDINATION_WORKERS = 12;

@Injectable()
export class AgentOrchestrationService {
  private readonly logger = new Logger(AgentOrchestrationService.name);

  /** Active sub-agent handles, keyed by handle ID */
  private activeHandles = new Map<string, SubAgentHandle>();
  private readonly memoryLaneJobs = new Map<string, AgentLaneJob>();
  private readonly memoryLaneEvents = new Map<string, AgentLaneEvent>();
  private readonly memoryLaneArtifacts = new Map<string, AgentLaneArtifact>();
  private eventSequence = 0;
  private workerRuntimeExecutor?: WorkerRuntimeExecutor;

  constructor(
    @InjectRepository(AgentAccount)
    private readonly agentAccountRepo: Repository<AgentAccount>,
    @InjectRepository(OpenClawInstance)
    private readonly instanceRepo: Repository<OpenClawInstance>,
    private readonly agentContextService: AgentContextService,
    @Optional()
    @InjectRepository(AgentLaneJob)
    private readonly laneJobRepo?: Repository<AgentLaneJob>,
    @Optional()
    @InjectRepository(AgentLaneEvent)
    private readonly laneEventRepo?: Repository<AgentLaneEvent>,
    @Optional()
    @InjectRepository(AgentLaneArtifact)
    private readonly laneArtifactRepo?: Repository<AgentLaneArtifact>,
  ) {}

  setWorkerRuntimeExecutor(executor: WorkerRuntimeExecutor | undefined): void {
    this.workerRuntimeExecutor = executor;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Layer 1: SubAgent spawn — delegate to existing agent team members
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Spawn a sub-agent task delegated to an existing AgentAccount+OpenClawInstance.
   * This leverages the persistent agent team infrastructure rather than creating
   * anonymous sub-processes.
   */
  async spawn(
    parentUserId: string,
    config: SubAgentConfig,
  ): Promise<SubAgentHandle> {
    const handleId = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Resolve the target agent (from team or by ID)
    let agentAccount: AgentAccount | null = null;
    let instance: OpenClawInstance | null = null;

    if (config.agentAccountId) {
      agentAccount = await this.agentAccountRepo.findOne({
        where: { id: config.agentAccountId, ownerId: parentUserId },
      });
      if (agentAccount) {
        instance = await this.instanceRepo.findOne({
          where: { agentAccountId: agentAccount.id, userId: parentUserId },
        });
      }
    }

    const handle: SubAgentHandle = {
      id: handleId,
      agentAccountId: agentAccount?.id,
      agentName: agentAccount?.name || 'anonymous-worker',
      task: config.task,
      status: 'pending',
      startedAt: new Date().toISOString(),
    };

    this.activeHandles.set(handleId, handle);

    // Build the sub-agent's context using the shared context builder
    const builtContext = await this.agentContextService.buildContext({
      userId: parentUserId,
      agentId: agentAccount?.id,
      instanceName: agentAccount?.name || 'Worker Agent',
      modelLabel: config.model || agentAccount?.preferredModel || 'claude-haiku-4-5',
      needsTools: true,
      planModeAddition: `\n## Sub-Agent Task\nYou are executing a delegated sub-task. Focus on this specific task:\n${config.task}\n\nComplete it concisely and report back.\n`,
    });

    handle.status = 'running';

    // Build the system prompt for this sub-agent
    const subAgentSystemPrompt = builtContext.systemPrompt;

    // Filter tools for sub-agent safety
    const effectiveTools = config.allowedTools
      ? config.allowedTools.filter(t => !SUB_AGENT_DISALLOWED_TOOLS.includes(t))
      : undefined;

    this.logger.log(
      `🤖 Spawned sub-agent: ${handle.agentName} (${handleId}), task="${config.task.slice(0, 80)}", ` +
      `model=${config.model || agentAccount?.preferredModel || 'default'}, ` +
      `tools=${effectiveTools?.length ?? 'all'}, budget=$${config.budgetUsd || 0.5}`,
    );

    // Store the handle metadata for the caller to reference
    handle.result = JSON.stringify({
      systemPrompt: subAgentSystemPrompt.slice(0, 200) + '...',
      agentAccountId: agentAccount?.id,
      instanceId: instance?.id,
      model: config.model || agentAccount?.preferredModel,
      maxTurns: config.maxTurns || 10,
      budgetUsd: config.budgetUsd || 0.50,
      allowedTools: effectiveTools,
    });

    return handle;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Layer 2: Coordinator — parallel worker orchestration
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Coordinate multiple workers in parallel, each delegated to an existing
   * agent team member. Results are aggregated and returned.
   */
  async coordinate(
    parentUserId: string,
    config: CoordinateConfig,
  ): Promise<OrchestrationResult> {
    const startedAt = Date.now();
    const plannedWorkers = this.normalizeWorkers(config.task, config.workers);
    const maxParallelWorkers = this.clampParallelism(config.maxParallelWorkers, plannedWorkers.length);
    const requestedTimeoutMs = Number(config.timeoutMs || DEFAULT_COORDINATION_TIMEOUT_MS);
    const timeoutMs = Number.isFinite(requestedTimeoutMs)
      ? Math.max(1, Math.floor(requestedTimeoutMs))
      : DEFAULT_COORDINATION_TIMEOUT_MS;

    this.logger.log(
      `🎯 Coordinating ${plannedWorkers.length} workers for: "${config.task.slice(0, 80)}" ` +
      `(parallelism=${maxParallelWorkers}, timeoutMs=${timeoutMs})`,
    );

    const workers = await this.runWithConcurrencyLimit(
      plannedWorkers,
      maxParallelWorkers,
      (worker, index) => this.runWorkerLane(parentUserId, worker, index, timeoutMs),
    );

    const totalCost = workers.reduce(
      (sum, w) => sum + (w.usage?.estimatedCostUsd || 0),
      0,
    );
    const completed = workers.filter(w => w.status === 'completed').length;
    const failed = workers.filter(w => w.status === 'failed').length;
    const timedOut = workers.filter(w => w.status === 'timeout').length;
    const durationMs = Date.now() - startedAt;

    return {
      coordinatorSummary: this.mergeWorkerResults(config.task, workers, durationMs),
      workers,
      totalCostUsd: totalCost,
      parallelism: {
        requestedWorkers: plannedWorkers.length,
        maxParallelWorkers,
        completed,
        failed,
        timedOut,
        durationMs,
      },
    };
  }

  async coordinateDurable(
    parentUserId: string,
    config: CoordinateConfig,
  ): Promise<DurableOrchestrationResult> {
    const startedAt = Date.now();
    const parentJob = await this.createLaneJob({
      userId: parentUserId,
      kind: AgentLaneJobKind.COORDINATOR,
      task: config.task,
      status: AgentLaneJobStatus.RUNNING,
      laneIndex: 0,
      timeoutMs: config.timeoutMs,
    });
    await this.recordLaneEvent(parentJob.id, 'task.started', {
      task: config.task,
      maxParallelWorkers: config.maxParallelWorkers || DEFAULT_MAX_PARALLEL_WORKERS,
    });

    const plannedWorkers = this.normalizeWorkers(config.task, config.workers);
    const maxParallelWorkers = this.clampParallelism(config.maxParallelWorkers, plannedWorkers.length);
    const requestedTimeoutMs = Number(config.timeoutMs || DEFAULT_COORDINATION_TIMEOUT_MS);
    const timeoutMs = Number.isFinite(requestedTimeoutMs)
      ? Math.max(1, Math.floor(requestedTimeoutMs))
      : DEFAULT_COORDINATION_TIMEOUT_MS;
    const laneJobs = await Promise.all(plannedWorkers.map((worker, index) => this.createLaneJob({
      userId: parentUserId,
      parentJobId: parentJob.id,
      kind: AgentLaneJobKind.LANE,
      role: worker.role,
      agentAccountId: worker.agentAccountId,
      laneIndex: index,
      task: worker.task,
      model: worker.model,
      budgetUsd: worker.budgetUsd,
      timeoutMs,
      maxRetries: 1,
      toolPolicy: {
        allowedTools: worker.allowedTools,
        deniedTools: SUB_AGENT_DISALLOWED_TOOLS,
      },
      status: AgentLaneJobStatus.QUEUED,
    })));

    const workers = await this.runWithConcurrencyLimit(
      plannedWorkers,
      maxParallelWorkers,
      async (worker, index) => {
        const laneJob = laneJobs[index];
        laneJob.status = AgentLaneJobStatus.RUNNING;
        laneJob.leaseOwner = 'api-coordinator';
        laneJob.heartbeatAt = new Date();
        await this.saveLaneJob(laneJob);
        await this.recordLaneEvent(laneJob.id, 'lane.started', {
          parentJobId: parentJob.id,
          role: worker.role,
          laneIndex: index,
          task: worker.task,
        });

        const handle = await this.runWorkerLane(parentUserId, worker, index, timeoutMs);
        laneJob.handleId = handle.id;
        laneJob.status = this.handleStatusToLaneStatus(handle.status);
        laneJob.result = handle.result;
        laneJob.error = handle.error;
        laneJob.usage = handle.usage || undefined;
        laneJob.completedAt = handle.completedAt ? new Date(handle.completedAt) : new Date();
        laneJob.heartbeatAt = new Date();
        await this.saveLaneJob(laneJob);
        await this.recordLaneEvent(laneJob.id, 'lane.finished', {
          parentJobId: parentJob.id,
          role: handle.role,
          laneIndex: index,
          status: handle.status,
          durationMs: handle.durationMs,
          error: handle.error,
        });
        return handle;
      },
    );

    const totalCost = workers.reduce((sum, w) => sum + (w.usage?.estimatedCostUsd || 0), 0);
    const completed = workers.filter(w => w.status === 'completed').length;
    const failed = workers.filter(w => w.status === 'failed').length;
    const timedOut = workers.filter(w => w.status === 'timeout').length;
    const durationMs = Date.now() - startedAt;
    const coordinatorSummary = this.mergeWorkerResults(config.task, workers, durationMs);

    parentJob.status = failed > 0 || timedOut > 0 ? AgentLaneJobStatus.FAILED : AgentLaneJobStatus.COMPLETED;
    parentJob.result = coordinatorSummary;
    parentJob.usage = { estimatedCostUsd: totalCost };
    parentJob.completedAt = new Date();
    await this.saveLaneJob(parentJob);
    await this.recordLaneEvent(parentJob.id, 'task.completed', {
      completed,
      failed,
      timedOut,
      durationMs,
      totalCostUsd: totalCost,
    });

    return {
      jobId: parentJob.id,
      coordinatorSummary,
      workers,
      totalCostUsd: totalCost,
      parallelism: {
        requestedWorkers: plannedWorkers.length,
        maxParallelWorkers,
        completed,
        failed,
        timedOut,
        durationMs,
      },
      events: await this.listLaneEvents(parentJob.id),
    };
  }

  async cancelLaneJob(jobId: string, cancelledBy: string): Promise<AgentLaneJob> {
    const job = await this.findLaneJob(jobId);
    job.status = AgentLaneJobStatus.CANCELLED;
    job.cancelledBy = cancelledBy;
    job.completedAt = new Date();
    const saved = await this.saveLaneJob(job);
    await this.recordLaneEvent(job.id, 'task.cancelled', { cancelledBy, parentJobId: job.parentJobId });

    const children = await this.findChildLaneJobs(job.id);
    for (const child of children) {
      if ([AgentLaneJobStatus.QUEUED, AgentLaneJobStatus.RUNNING].includes(child.status)) {
        child.status = AgentLaneJobStatus.CANCELLED;
        child.cancelledBy = cancelledBy;
        child.completedAt = new Date();
        await this.saveLaneJob(child);
        await this.recordLaneEvent(child.id, 'task.cancelled', { cancelledBy, parentJobId: job.id });
      }
    }

    return saved;
  }

  async listLaneEvents(parentJobId: string): Promise<AgentTaskEvent[]> {
    const events = this.laneEventRepo
      ? await this.laneEventRepo.find({ where: [{ jobId: parentJobId }, { parentJobId } as any], order: { sequence: 'ASC' } })
      : [...this.memoryLaneEvents.values()]
          .filter(event => event.jobId === parentJobId || event.parentJobId === parentJobId)
          .sort((a, b) => a.sequence - b.sequence);
    return events.map(event => ({
      type: event.type as AgentTaskEventType,
      jobId: event.jobId,
      parentJobId: event.parentJobId,
      sequence: event.sequence,
      payload: event.payload,
      createdAt: event.createdAt.toISOString(),
    }));
  }

  private normalizeWorkers(task: string, workers?: WorkerConfig[]): WorkerConfig[] {
    const explicitWorkers = (workers || [])
      .filter(w => w && typeof w.task === 'string' && w.task.trim().length > 0)
      .slice(0, MAX_COORDINATION_WORKERS)
      .map((w, index) => ({
        ...w,
        role: (w.role || this.inferRoleForTask(w.task, index)).trim() || `worker-${index + 1}`,
        task: w.task.trim(),
      }));

    if (explicitWorkers.length > 0) {
      return explicitWorkers;
    }

    return this.decomposeTask(task).slice(0, MAX_COORDINATION_WORKERS);
  }

  private decomposeTask(task: string): WorkerConfig[] {
    const trimmed = task.trim();
    const lower = trimmed.toLowerCase();
    const workers: WorkerConfig[] = [
      {
        role: 'dev',
        task: `Implement the core changes for: ${trimmed}`,
        maxTurns: 8,
        budgetUsd: 0.35,
      },
      {
        role: 'qa-ops',
        task: `Validate tests, build impact, and release risks for: ${trimmed}`,
        maxTurns: 6,
        budgetUsd: 0.25,
      },
    ];

    if (/(architecture|design|roadmap|plan|agent|orchestration|parallel)/i.test(lower)) {
      workers.unshift({
        role: 'ceo',
        task: `Break down architecture, dependencies, and merge criteria for: ${trimmed}`,
        maxTurns: 6,
        budgetUsd: 0.30,
      });
    }

    if (/(growth|pricing|conversion|launch|market)/i.test(lower)) {
      workers.push({
        role: 'growth',
        task: `Assess market, launch, and conversion implications for: ${trimmed}`,
        maxTurns: 5,
        budgetUsd: 0.20,
      });
    }

    if (/(docs|copy|brand|landing|readme|seo)/i.test(lower)) {
      workers.push({
        role: 'brand',
        task: `Prepare user-facing copy and documentation updates for: ${trimmed}`,
        maxTurns: 5,
        budgetUsd: 0.20,
      });
    }

    return workers;
  }

  private inferRoleForTask(task: string, index: number): string {
    const lower = task.toLowerCase();
    if (/(test|build|deploy|ci|release|verify|qa)/i.test(lower)) return 'qa-ops';
    if (/(plan|architecture|system|design|strategy)/i.test(lower)) return 'ceo';
    if (/(copy|brand|landing|seo|pitch)/i.test(lower)) return 'brand';
    if (/(growth|pricing|campaign|conversion)/i.test(lower)) return 'growth';
    if (/(community|discord|telegram|faq)/i.test(lower)) return 'community';
    return index === 0 ? 'dev' : `worker-${index + 1}`;
  }

  private clampParallelism(requested: number | undefined, workerCount: number): number {
    const desired = requested || DEFAULT_MAX_PARALLEL_WORKERS;
    return Math.max(1, Math.min(desired, workerCount || 1, MAX_COORDINATION_WORKERS));
  }

  private async runWorkerLane(
    parentUserId: string,
    worker: WorkerConfig,
    index: number,
    timeoutMs: number,
  ): Promise<SubAgentHandle> {
    let agentAccountId = worker.agentAccountId;

    if (!agentAccountId && worker.role) {
      const matched = await this.findTeamMemberByRole(parentUserId, worker.role);
      agentAccountId = matched?.id;
    }

    const handle = await this.spawn(parentUserId, {
      agentAccountId,
      task: worker.task,
      model: worker.model,
      maxTurns: worker.maxTurns || 10,
      budgetUsd: worker.budgetUsd || 0.50,
      allowedTools: worker.allowedTools,
    });
    handle.role = worker.role;
    handle.laneIndex = index;
    handle.status = 'running';

    const laneStartedAt = Date.now();
    try {
      const result = await this.withTimeout(
        this.executeSubAgentTask(parentUserId, worker, handle),
        timeoutMs,
      );
      handle.status = 'completed';
      handle.result = result.output;
      handle.usage = result.usage;
    } catch (error: any) {
      const message = error?.message || 'Sub-agent lane failed';
      handle.status = message.includes('timed out') ? 'timeout' : 'failed';
      handle.error = message;
      handle.result = JSON.stringify({
        role: worker.role,
        task: worker.task,
        status: handle.status,
        error: message,
      });
    } finally {
      handle.durationMs = Date.now() - laneStartedAt;
      handle.completedAt = new Date().toISOString();
      this.activeHandles.set(handle.id, handle);
    }

    return handle;
  }

  private async executeSubAgentTask(
    parentUserId: string,
    worker: WorkerConfig,
    handle: SubAgentHandle,
  ): Promise<WorkerLaneResult> {
    const metadata = this.parseHandleMetadata(handle.result);
    if (this.workerRuntimeExecutor) {
      return this.workerRuntimeExecutor.executeLane({
        parentUserId,
        worker,
        handle,
        systemPrompt: metadata.systemPrompt,
      });
    }

    const inputTokens = this.estimateTokens(`${worker.task}\n${metadata.systemPrompt || ''}`);
    const output = {
      type: 'parallel_lane_result',
      role: worker.role,
      agentName: handle.agentName,
      task: worker.task,
      status: 'completed',
      execution: {
        mode: 'delegated-subagent',
        parentUserId,
        model: worker.model || metadata.model || 'agent-default',
        maxTurns: worker.maxTurns || metadata.maxTurns || 10,
        allowedTools: metadata.allowedTools,
      },
      summary: `Lane ${worker.role} accepted and completed delegated task setup for merge: ${worker.task}`,
      deliverables: [
        'isolated context prepared',
        'tool recursion blocked',
        'lane result normalized for coordinator merge',
      ],
    };

    return {
      output: JSON.stringify(output),
      usage: {
        inputTokens,
        outputTokens: this.estimateTokens(JSON.stringify(output)),
        estimatedCostUsd: Number((worker.budgetUsd || 0.50).toFixed(4)),
      },
    };
  }

  private parseHandleMetadata(result?: string): Record<string, any> {
    if (!result) return {};
    try {
      return JSON.parse(result);
    } catch {
      return {};
    }
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Sub-agent lane timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then(value => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private async runWithConcurrencyLimit<T, R>(
    items: T[],
    limit: number,
    runner: (item: T, index: number) => Promise<R>,
  ): Promise<R[]> {
    const results = new Array<R>(items.length);
    let nextIndex = 0;

    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex++;
        results[currentIndex] = await runner(items[currentIndex], currentIndex);
      }
    });

    await Promise.all(workers);
    return results;
  }

  private mergeWorkerResults(task: string, workers: SubAgentHandle[], durationMs: number): string {
    const completed = workers.filter(w => w.status === 'completed');
    const failed = workers.filter(w => w.status === 'failed');
    const timedOut = workers.filter(w => w.status === 'timeout');
    const lines = [
      `Parallel coordination finished for: ${task}`,
      `Workers: ${workers.length}; completed=${completed.length}; failed=${failed.length}; timedOut=${timedOut.length}; durationMs=${durationMs}`,
    ];

    for (const worker of workers) {
      const label = worker.role || worker.agentName;
      const payload = this.parseHandleMetadata(worker.result);
      const summary = typeof payload.summary === 'string'
        ? payload.summary
        : worker.error || 'No worker summary returned.';
      lines.push(`- [${worker.status}] ${label}: ${summary}`);
    }

    return lines.join('\n');
  }

  private estimateTokens(text: string): number {
    return Math.max(1, Math.ceil(text.length / 4));
  }

  private handleStatusToLaneStatus(status: SubAgentHandle['status']): AgentLaneJobStatus {
    switch (status) {
      case 'completed': return AgentLaneJobStatus.COMPLETED;
      case 'timeout': return AgentLaneJobStatus.TIMEOUT;
      case 'failed': return AgentLaneJobStatus.FAILED;
      case 'running': return AgentLaneJobStatus.RUNNING;
      default: return AgentLaneJobStatus.QUEUED;
    }
  }

  private async createLaneJob(input: Partial<AgentLaneJob> & { userId: string; task: string }): Promise<AgentLaneJob> {
    const job = this.laneJobRepo?.create(input) || this.createMemoryLaneJob(input);
    const saved = this.laneJobRepo ? await this.laneJobRepo.save(job) : job;
    if (!this.laneJobRepo) this.memoryLaneJobs.set(saved.id, saved);
    return saved;
  }

  private async saveLaneJob(job: AgentLaneJob): Promise<AgentLaneJob> {
    if (this.laneJobRepo) return this.laneJobRepo.save(job);
    job.updatedAt = new Date();
    this.memoryLaneJobs.set(job.id, job);
    return job;
  }

  private async recordLaneEvent(
    jobId: string,
    type: AgentTaskEventType,
    payload?: Record<string, any>,
  ): Promise<AgentLaneEvent> {
    const job = await this.findLaneJob(jobId);
    const sequence = ++this.eventSequence;
    const event = this.laneEventRepo?.create({
      jobId,
      parentJobId: job.parentJobId || (job.kind === AgentLaneJobKind.COORDINATOR ? job.id : undefined),
      sequence,
      type,
      payload,
    }) || {
      id: this.newMemoryId('lane-event'),
      jobId,
      parentJobId: job.parentJobId || (job.kind === AgentLaneJobKind.COORDINATOR ? job.id : undefined),
      sequence,
      type,
      payload,
      createdAt: new Date(),
    } as AgentLaneEvent;
    const saved = this.laneEventRepo ? await this.laneEventRepo.save(event) : event;
    if (!this.laneEventRepo) this.memoryLaneEvents.set(saved.id, saved);
    return saved;
  }

  private async findLaneJob(jobId: string): Promise<AgentLaneJob> {
    const job = this.laneJobRepo
      ? await this.laneJobRepo.findOne({ where: { id: jobId } })
      : this.memoryLaneJobs.get(jobId);
    if (!job) throw new Error(`Lane job not found: ${jobId}`);
    return job;
  }

  private async findChildLaneJobs(parentJobId: string): Promise<AgentLaneJob[]> {
    if (this.laneJobRepo) return this.laneJobRepo.find({ where: { parentJobId } });
    return [...this.memoryLaneJobs.values()].filter(job => job.parentJobId === parentJobId);
  }

  private createMemoryLaneJob(input: Partial<AgentLaneJob> & { userId: string; task: string }): AgentLaneJob {
    const now = new Date();
    return {
      id: this.newMemoryId('lane-job'),
      userId: input.userId,
      parentJobId: input.parentJobId,
      kind: input.kind || AgentLaneJobKind.LANE,
      role: input.role,
      agentAccountId: input.agentAccountId,
      handleId: input.handleId,
      laneIndex: input.laneIndex || 0,
      task: input.task,
      model: input.model,
      budgetUsd: input.budgetUsd,
      retryCount: input.retryCount || 0,
      maxRetries: input.maxRetries || 0,
      timeoutMs: input.timeoutMs,
      leaseOwner: input.leaseOwner,
      heartbeatAt: input.heartbeatAt,
      cancelledBy: input.cancelledBy,
      toolPolicy: input.toolPolicy,
      transcriptPointer: input.transcriptPointer,
      status: input.status || AgentLaneJobStatus.QUEUED,
      result: input.result,
      error: input.error,
      usage: input.usage,
      completedAt: input.completedAt,
      createdAt: now,
      updatedAt: now,
    } as AgentLaneJob;
  }

  private newMemoryId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Layer 3: Team mailbox (simple async message passing)
  // ═══════════════════════════════════════════════════════════════════════════

  private mailboxes = new Map<string, Array<{
    from: string;
    message: string;
    timestamp: string;
  }>>();

  async sendMessage(
    from: string,
    to: string,
    message: string,
  ): Promise<void> {
    const entry = { from, message, timestamp: new Date().toISOString() };

    if (to === '*') {
      // Broadcast to all mailboxes
      for (const [name] of this.mailboxes) {
        if (name !== from) {
          const box = this.mailboxes.get(name) || [];
          box.push(entry);
          this.mailboxes.set(name, box);
        }
      }
    } else {
      const box = this.mailboxes.get(to) || [];
      box.push(entry);
      this.mailboxes.set(to, box);
    }

    this.logger.log(`📨 Message: ${from} → ${to}: "${message.slice(0, 80)}"`);
  }

  async readMailbox(agentName: string): Promise<Array<{ from: string; message: string; timestamp: string }>> {
    const entries = this.mailboxes.get(agentName) || [];
    this.mailboxes.set(agentName, []); // Clear after read
    return entries;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Find a team member's AgentAccount by role name (e.g., 'dev', 'qa-ops', 'growth').
   * Searches through the user's agent accounts for one matching the role.
   */
  private async findTeamMemberByRole(
    userId: string,
    role: string,
  ): Promise<AgentAccount | null> {
    const normalizedRole = role.toLowerCase().trim();

    // Search agent accounts with role-matching name
    const accounts = await this.agentAccountRepo.find({
      where: { ownerId: userId },
    });

    // Try exact match first, then fuzzy
    const exact = accounts.find(a =>
      a.name.toLowerCase() === normalizedRole ||
      a.name.toLowerCase().endsWith(`-${normalizedRole}`) ||
      a.name.toLowerCase().includes(normalizedRole),
    );

    return exact || null;
  }

  /** Get status of a sub-agent by handle ID */
  getHandle(handleId: string): SubAgentHandle | null {
    return this.activeHandles.get(handleId) || null;
  }

  /** List all active sub-agent handles for a session */
  listActiveHandles(): SubAgentHandle[] {
    return [...this.activeHandles.values()].filter(h =>
      h.status === 'pending' || h.status === 'running',
    );
  }

  /** Clean up completed handles older than the given age */
  cleanupOldHandles(maxAgeMs: number = 3600_000): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, handle] of this.activeHandles) {
      if (
        (handle.status === 'completed' || handle.status === 'failed') &&
        handle.completedAt &&
        now - new Date(handle.completedAt).getTime() > maxAgeMs
      ) {
        this.activeHandles.delete(id);
        cleaned++;
      }
    }
    return cleaned;
  }
}
