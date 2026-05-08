import { Inject, Injectable, Logger, Optional, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentTaskEntity } from '../../entities/agent-task.entity';
import { AgentTaskService } from './agent-task.service';
import { BedrockIntegrationService } from '../ai-integration/bedrock/bedrock-integration.service';

/**
 * AgentTaskWorker — autonomous loop that drains the `queued` AgentTask backlog.
 *
 * Minimal v1 design:
 *   - Single-process poller (setInterval), multi-instance safe via FOR UPDATE SKIP LOCKED
 *   - Concurrency cap = MAX_PARALLEL (default 2) to bound LLM spend
 *   - One LLM round per task: prompt -> text -> resultSummary
 *   - Writes structured `output` log entries the Sparkpage UI can render
 *   - On unrecoverable error: status=failed, errorMessage set
 *
 * Out of scope for v1:
 *   - Multi-step plan execution (delegate to PlanRunner in v2)
 *   - Tool calling / Computer Use loop (v3)
 *   - Priority queue, retries, dead-letter (v2)
 *   - Per-task cost tracking (wire CostTrackerService later)
 */
@Injectable()
export class AgentTaskWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentTaskWorker.name);
  private readonly POLL_INTERVAL_MS = 5_000;
  private readonly MAX_PARALLEL = parseInt(process.env.AGENT_TASK_MAX_PARALLEL || '2', 10);
  private readonly TASK_TIMEOUT_MS = 5 * 60_000;

  private timer: NodeJS.Timeout | null = null;
  private readonly inFlight = new Set<string>();
  private stopped = false;

  constructor(
    @InjectRepository(AgentTaskEntity)
    private readonly taskRepo: Repository<AgentTaskEntity>,
    private readonly tasks: AgentTaskService,
    @Optional() @Inject(BedrockIntegrationService)
    private readonly bedrock: BedrockIntegrationService | null,
  ) {}

  onModuleInit() {
    if (process.env.AGENT_TASK_WORKER_DISABLED === '1') {
      this.logger.log('AgentTaskWorker disabled by env');
      return;
    }
    this.timer = setInterval(() => {
      this.tick().catch((e) => this.logger.error(`tick error: ${e?.message}`));
    }, this.POLL_INTERVAL_MS);
    this.logger.log(`AgentTaskWorker started (max_parallel=${this.MAX_PARALLEL})`);
  }

  onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
  }

  /** One poll cycle — claim and execute up to (MAX_PARALLEL - inFlight) tasks. */
  private async tick(): Promise<void> {
    if (this.stopped) return;
    const slots = this.MAX_PARALLEL - this.inFlight.size;
    if (slots <= 0) return;

    // Atomic claim: status=queued -> running. FOR UPDATE SKIP LOCKED keeps
    // multi-instance deployments safe without an external broker.
    const claimed: Array<{ id: string }> = await this.taskRepo.query(
      `UPDATE agent_tasks
         SET status = 'running', started_at = COALESCE(started_at, now()), updated_at = now()
       WHERE id IN (
         SELECT id FROM agent_tasks
         WHERE status = 'queued'
         ORDER BY created_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id`,
      [slots],
    );

    for (const row of claimed) {
      this.inFlight.add(row.id);
      this.runOne(row.id).finally(() => this.inFlight.delete(row.id));
    }
  }

  private async runOne(id: string): Promise<void> {
    const task = await this.tasks.get(id);
    if (!task) return;

    await this.tasks.appendLog(id, 'status', 'worker picked up task', {
      pid: process.pid,
      hostname: process.env.HOSTNAME || 'unknown',
    });

    try {
      const result = await this.executeWithTimeout(task);
      await this.tasks.appendLog(id, 'output', 'task completed', {
        kind: 'text',
        text: result.text.slice(0, 8000),
      });
      await this.tasks.setStatus(id, 'succeeded', {
        resultSummary: result.text.slice(0, 2000),
        progress: 100,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`task ${id} failed: ${message}`);
      await this.tasks.appendLog(id, 'error', message);
      await this.tasks.setStatus(id, 'failed', { errorMessage: message });
    }
  }

  private async executeWithTimeout(task: AgentTaskEntity): Promise<{ text: string }> {
    const exec = this.execute(task);
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`task timed out after ${this.TASK_TIMEOUT_MS}ms`)),
        this.TASK_TIMEOUT_MS,
      ),
    );
    return Promise.race([exec, timeout]);
  }

  private async execute(task: AgentTaskEntity): Promise<{ text: string }> {
    if (!this.bedrock) {
      // Bedrock not provisioned (test/dev) — return a stub so the loop is still
      // observable in CI and frontends do not block on it.
      const stub = `[stub] ${task.title}\n\n(BedrockIntegrationService not provisioned in this environment.)`;
      return { text: stub };
    }

    await this.tasks.appendLog(task.id, 'tool_call', 'invoking bedrock', {
      tier: task.tier ?? 'auto',
    });

    const prompt = this.buildPrompt(task);
    const text = await this.bedrock.invokeModel(prompt);
    await this.tasks.appendLog(task.id, 'tool_result', 'bedrock returned', {
      chars: text.length,
    });
    return { text };
  }

  private buildPrompt(task: AgentTaskEntity): string {
    return [
      'You are an Agentrix autonomous agent executing a long-running task.',
      `Task title: ${task.title}`,
      '',
      'Task instructions:',
      task.prompt,
      '',
      'Produce a clear, well-structured response. Keep it under 1500 words.',
    ].join('\n');
  }
}
