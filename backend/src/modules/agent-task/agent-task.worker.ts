import { Inject, Injectable, Logger, Optional, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentTaskEntity } from '../../entities/agent-task.entity';
import { LivingPet } from '../../entities/living-pet.entity';
import { AgentTaskService } from './agent-task.service';
import { BedrockIntegrationService } from '../ai-integration/bedrock/bedrock-integration.service';
import { NotificationService } from '../notification/notification.service';
import { CostTrackerService } from '../cost-tracker/cost-tracker.service';
import { MultiAgentMarketplaceService } from '../multi-agent/multi-agent-marketplace.service';
import { AgentHireEscrowService } from '../multi-agent/agent-hire-escrow.service';
import { WorkerLlmRouterService } from './worker-llm-router.service';
import { SubscriptionUsageService } from '../multi-agent-summary/subscription-usage.service';
import {
  emitSubTaskCompleted,
  emitBudgetWarning,
} from '../desktop-sync/companion-presence.helpers';

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
    @InjectRepository(LivingPet)
    private readonly livingPetRepo: Repository<LivingPet>,
    private readonly tasks: AgentTaskService,
    @Optional() @Inject(BedrockIntegrationService)
    private readonly bedrock: BedrockIntegrationService | null,
    @Optional() @Inject(NotificationService)
    private readonly notifications: NotificationService | null,
    @Optional() @Inject(CostTrackerService)
    private readonly costTracker: CostTrackerService | null,
    @Optional() @Inject(MultiAgentMarketplaceService)
    private readonly marketplace: MultiAgentMarketplaceService | null,
    @Optional() @Inject(AgentHireEscrowService)
    private readonly hireEscrow: AgentHireEscrowService | null,
    @Optional() @Inject(WorkerLlmRouterService)
    private readonly llmRouter: WorkerLlmRouterService | null,
    @Optional() @Inject(SubscriptionUsageService)
    private readonly subscriptionUsage: SubscriptionUsageService | null,
  ) {}

  async onModuleInit() {
    if (process.env.AGENT_TASK_WORKER_DISABLED === '1') {
      this.logger.log('AgentTaskWorker disabled by env');
      return;
    }

    // v0.7.19 — Recover orphaned tasks from previous interrupted runs.
    // Tasks marked 'running' for >30 min with no heartbeat are dead workers
    // (process killed mid-execution by SIGINT, OOM, etc.). Reset them so
    // the UI shows accurate state instead of phantom "running" cards
    // that never terminate. Top-level tasks reset to 'failed' (so the
    // user knows it stopped); sub-tasks also failed (so the leader's
    // agent_run wait cycle gets unstuck on next call).
    try {
      const result = await this.taskRepo.query(
        `UPDATE agent_tasks
            SET status = 'failed',
                error_message = COALESCE(error_message, 'task interrupted by backend restart'),
                completed_at = COALESCE(completed_at, now()),
                updated_at = now()
          WHERE status IN ('running','queued')
            AND updated_at < now() - INTERVAL '30 minutes'
          RETURNING id`,
      );
      const reaped = Array.isArray(result) ? result.length : 0;
      if (reaped > 0) {
        this.logger.warn(`reaped ${reaped} orphan task(s) on startup (>30min stuck in running/queued)`);
      }
    } catch (e: any) {
      this.logger.warn(`orphan task reaper failed: ${e?.message || e}`);
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

    // Multi-Agent v1 W5.2 — wrap entire run in AsyncLocalStorage so
    // any nested cost-record carries `parent_task_id`. For top-level
    // tasks (no parent), still wrap with the task's own id so cost
    // events still link to the task graph.
    const alsKey = task.parentTaskId ?? task.id;
    if (this.costTracker) {
      return this.costTracker.runWithSubTaskContext(alsKey, () => this.runOneInner(id, task));
    }
    return this.runOneInner(id, task);
  }

  private async runOneInner(id: string, task: AgentTaskEntity): Promise<void> {
    await this.tasks.appendLog(id, 'status', 'worker picked up task', {
      pid: process.pid,
      hostname: process.env.HOSTNAME || 'unknown',
    });

    // Multi-Agent v1 W2.4 — track wall-clock duration + per-task cost
    // for `agent_result` event.
    const startedAtMs = Date.now();
    let totalCostUsd = 0; // cost-tracker (W5.2) will populate via AsyncLocalStorage; placeholder for now

    try {
      const result = await this.executeWithTimeout(task);
      totalCostUsd = result.costUsd ?? 0;

      // Multi-Agent v1 W5.3 — write the sub_task_complete summary row
      // BEFORE setStatus, so totalCostUsd reflects the rolled-up sum
      // when the agent_result event fires. Best-effort — falls back to
      // executor-reported cost on DB outage (R10.4).
      if (this.costTracker && task.parentTaskId) {
        try {
          const summary = await this.costTracker.writeSubTaskCompleteRow({
            userId: task.userId,
            sessionId: task.instanceId ?? task.id,
            agentId: task.agentId,
            parentTaskId: task.id,
            durationMs: Date.now() - startedAtMs,
            fallbackCostUsd: totalCostUsd,
          });
          totalCostUsd = summary.totalCostUsd;
        } catch (e) {
          this.logger.warn(
            `W5.3 cost summary write failed task=${id}: ${e instanceof Error ? e.message : String(e)}`,
          );
          // Continue — task itself does NOT fail (R10.4).
        }
      }

      await this.tasks.appendLog(id, 'output', 'task completed', {
        kind: 'text',
        text: result.text.slice(0, 8000),
      });
      // Multi-Agent v1 W2.4 — emit `agent_result` so the timeline
      // collapses tool-call noise and shows a single completion row.
      // R2.4 / design.md §4.1
      if (task.parentTaskId) {
        await this.tasks.appendLog(id, 'agent_result', 'sub-task succeeded', {
          taskId: id,
          parentTaskId: task.parentTaskId,
          status: 'succeeded',
          durationMs: Date.now() - startedAtMs,
          totalCostUsd,
          resultSummary: result.text.slice(0, 200),
          completedAt: Date.now(),
        });
      }
      await this.tasks.setStatus(id, 'succeeded', {
        resultSummary: result.text.slice(0, 2000),
        progress: 100,
        costUsd: totalCostUsd,
      });

      // W5.4 — budget warning + 100% refusal
      await this.checkBudgetWarning(task.userId, totalCostUsd).catch((e) =>
        this.logger.debug(`budget check failed: ${e?.message || e}`),
      );

      // Multi-Agent v1 W3.3 + W4.2 + W4.5 hooks (only for sub-tasks
      // dispatched via spawn, i.e. parent_task_id non-null)
      if (task.parentTaskId) {
        await this.runMultiAgentSuccessHooks(task, {
          summary: result.text.slice(0, 200),
          costUsd: totalCostUsd,
          durationMs: Date.now() - startedAtMs,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`task ${id} failed: ${message}`);
      await this.tasks.appendLog(id, 'error', message);
      // Multi-Agent v1 W2.4 — `agent_result` for failures too (R2.4)
      if (task.parentTaskId) {
        await this.tasks.appendLog(id, 'agent_result', 'sub-task failed', {
          taskId: id,
          parentTaskId: task.parentTaskId,
          status: 'failed',
          durationMs: Date.now() - startedAtMs,
          totalCostUsd,
          resultSummary: message.slice(0, 200),
          errorMessage: message,
          completedAt: Date.now(),
        });
      }
      await this.tasks.setStatus(id, 'failed', { errorMessage: message, costUsd: totalCostUsd });

      // Multi-Agent v1 W4.2 + W4.5 — emit completion event + push on
      // failure so the user is still notified (R9.3, R9.4)
      if (task.parentTaskId) {
        await this.runMultiAgentFailureHooks(task, {
          summary: message.slice(0, 200),
          costUsd: totalCostUsd,
          durationMs: Date.now() - startedAtMs,
        });
      }
    }
  }

  /**
   * Multi-Agent v1 W3.3 + W4.2 + W4.5 — success hooks for sub-tasks.
   *
   *   1. Bump LivingPet intimacyXp + lastInteractionAt (R7.6)
   *   2. Emit `presence:multi-agent.sub-task-completed` for ball / lock-screen pulse
   *   3. Send mobile push notification (skipped if user disabled push)
   */
  private async runMultiAgentSuccessHooks(
    task: AgentTaskEntity,
    info: { summary: string; costUsd: number; durationMs: number },
  ): Promise<void> {
    try {
      // 1. Bump pet XP if this task ran on a pet-bound AgentAccount
      if (task.targetKind === 'team-member' && task.agentId) {
        const pet = await this.livingPetRepo.findOne({
          where: { boundAgentAccountId: task.agentId },
        });
        if (pet) {
          pet.intimacyXp = (pet.intimacyXp || 0) + 1;
          pet.lastInteractionAt = String(Date.now());
          await this.livingPetRepo.save(pet);
        }
      }

      // v2 W7 — marketplace-hire seller earnings hook
      if (
        task.targetKind === 'marketplace-hire' &&
        task.hiredFromUserId &&
        task.agentId &&
        this.marketplace
      ) {
        // Seller earns 70% of cost (30% platform fee, simplification for v2)
        const sellerShare = info.costUsd * 0.7;
        await this.marketplace
          .recordHireEarning(task.hiredFromUserId, task.agentId, sellerShare)
          .catch((e) =>
            this.logger.debug(
              `marketplace earning record failed task=${task.id}: ${e instanceof Error ? e.message : String(e)}`,
            ),
          );

        // v2.2 W7.3 — release escrow to seller now that the hired pet
        // has delivered. Hirer still has 24h to dispute via the
        // /escrows/:taskId/dispute endpoint.
        if (this.hireEscrow) {
          await this.hireEscrow
            .releaseOnSuccess(task.id, info.costUsd)
            .catch((e) =>
              this.logger.debug(
                `escrow release failed task=${task.id}: ${e instanceof Error ? e.message : String(e)}`,
              ),
            );
        }
      }

      // 2. Companion-ball / lock-screen-pet pulse event
      emitSubTaskCompleted({
        userId: task.userId,
        subTaskId: task.id,
        parentTaskId: task.parentTaskId,
        ok: true,
        summary: info.summary,
        totalCostUsd: info.costUsd,
        durationMs: info.durationMs,
      });

      // 3. Mobile push (best-effort; never throws into worker hot path)
      if (this.notifications) {
        try {
          await this.notifications.sendPushNotification(task.userId, {
            title: '🦊 sub-task 完成',
            body: info.summary.slice(0, 100),
            data: {
              deeplink: `agentrix://multi-agent/sub-task/${task.id}`,
              subTaskId: task.id,
              parentTaskId: task.parentTaskId,
            },
          });
        } catch (e) {
          this.logger.debug(
            `push notify failed for task ${task.id}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }

      // 4. v2.1 — bump user_subscription_usage live counter so the next
      // spawn dispatch's quota check sees the latest count without waiting
      // for the 02:30 cron. Reconciliation cron still corrects any drift.
      if (this.subscriptionUsage) {
        try {
          await this.subscriptionUsage.recordSubTaskCompletion(task.userId, info.costUsd);
        } catch (e) {
          this.logger.debug(
            `subscription-usage bump failed task=${task.id}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    } catch (e) {
      // Never let hooks fail the worker — log and continue.
      this.logger.warn(
        `multi-agent success hooks failed task=${task.id}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /**
   * Multi-Agent v1 W4.2 + W4.5 — failure hooks for sub-tasks.
   * Emits red pulse + failure push. No XP penalty in v1 (Property: pet
   * never punished for sub-task failures).
   */
  private async runMultiAgentFailureHooks(
    task: AgentTaskEntity,
    info: { summary: string; costUsd: number; durationMs: number },
  ): Promise<void> {
    try {
      // v2.2 W7.3 — refund hire escrow on failure so the hirer doesn't
      // pay for a sub-task the seller's pet couldn't deliver.
      if (
        task.targetKind === 'marketplace-hire' &&
        this.hireEscrow
      ) {
        await this.hireEscrow
          .refundOnFailure(task.id, info.summary || 'task failed')
          .catch((e) =>
            this.logger.debug(
              `escrow refund failed task=${task.id}: ${e instanceof Error ? e.message : String(e)}`,
            ),
          );
      }

      emitSubTaskCompleted({
        userId: task.userId,
        subTaskId: task.id,
        parentTaskId: task.parentTaskId,
        ok: false,
        summary: info.summary,
        totalCostUsd: info.costUsd,
        durationMs: info.durationMs,
      });

      if (this.notifications) {
        try {
          await this.notifications.sendPushNotification(task.userId, {
            title: '⚠️ sub-task 出错',
            body: info.summary.slice(0, 100),
            data: {
              deeplink: `agentrix://multi-agent/sub-task/${task.id}`,
              subTaskId: task.id,
              parentTaskId: task.parentTaskId,
              failed: true,
            },
          });
        } catch (e) {
          this.logger.debug(
            `push notify (fail) failed for task ${task.id}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    } catch (e) {
      this.logger.warn(
        `multi-agent failure hooks failed task=${task.id}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // W5.4 — daily budget gate (80% warning + 100% refusal)
  // ─────────────────────────────────────────────────────────────────────

  /**
   * v1 daily caps per subscription tier. Resolved from env or hard-coded
   * fallback. W5.5 will resolve real workspace.plan; for v1 we use the
   * env-tunable defaults to keep PR boundaries crisp.
   */
  private dailyCapForUser(_userId: string): number {
    return Number(process.env.AGENTRIX_DAILY_BUDGET_USD || '5');
  }

  /** When user crosses 80%/100% of daily cap, emit warning. Idempotent
   *  per-day per-user using an in-memory set keyed by `${userId}:YYYY-MM-DD:${level}`. */
  private readonly _budgetWarnedKeys = new Set<string>();

  private async checkBudgetWarning(userId: string, justAddedUsd: number): Promise<void> {
    if (!userId || !this.costTracker) return;
    const cap = this.dailyCapForUser(userId);
    if (cap <= 0) return;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const usage = await this.costTracker.getUserCostInRange(userId, todayStart);
    const used = Number(usage?.totalUsd ?? 0);
    const pct = (used / cap) * 100;

    const dateKey = todayStart.toISOString().slice(0, 10);
    const k80 = `${userId}:${dateKey}:80`;
    const k100 = `${userId}:${dateKey}:100`;

    if (pct >= 100 && !this._budgetWarnedKeys.has(k100)) {
      this._budgetWarnedKeys.add(k100);
      try {
        emitBudgetWarning({
          userId,
          level: 100,
          usedUsd: used,
          budgetUsd: cap,
        });
      } catch {
        /* never fail worker */
      }
      return;
    }
    if (pct >= 80 && !this._budgetWarnedKeys.has(k80)) {
      this._budgetWarnedKeys.add(k80);
      try {
        emitBudgetWarning({
          userId,
          level: 80,
          usedUsd: used,
          budgetUsd: cap,
        });
      } catch {
        /* never fail worker */
      }
    }

    // Garbage-collect old keys (drop yesterday's entries)
    if (this._budgetWarnedKeys.size > 256) {
      for (const k of this._budgetWarnedKeys) {
        if (!k.includes(dateKey)) this._budgetWarnedKeys.delete(k);
      }
    }
  }

  private async executeWithTimeout(task: AgentTaskEntity): Promise<{ text: string; costUsd?: number }> {
    const exec = this.execute(task);
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`task timed out after ${this.TASK_TIMEOUT_MS}ms`)),
        this.TASK_TIMEOUT_MS,
      ),
    );
    return Promise.race([exec, timeout]);
  }

  private async execute(task: AgentTaskEntity): Promise<{ text: string; costUsd?: number }> {
    if (!this.bedrock) {
      // Bedrock not provisioned (test/dev) — return a stub so the loop is still
      // observable in CI and frontends do not block on it.
      const stub = `[stub] ${task.title}\n\n(BedrockIntegrationService not provisioned in this environment.)`;
      return { text: stub, costUsd: 0 };
    }

    // Multi-Agent v2.1 — resolve LLM route (model + provider + BYO creds)
    // via WorkerLlmRouterService instead of hard-coding bedrock+haiku.
    // Falls back to platform Haiku 4.5 on any error to keep workers making
    // progress.
    const route = this.llmRouter
      ? await this.llmRouter.resolveForTask(task).catch((e) => {
          this.logger.warn(`llm-router resolve failed (${e?.message}); falling back to platform haiku`);
          return null;
        })
      : null;

    const modelId = route?.modelId;
    const friendlyModel = route?.friendlyModelId || 'claude-haiku-4-5';
    const userCreds = route?.userCredentials;

    // Multi-Agent v1 W2.4 — emit `agent_invoke` so the timeline can
    // show a folded "🔧 N tool calls" row instead of bare tool_call/
    // tool_result spam. (R2.3 / design.md §4.1)
    const toolCallId = `bedrock-${task.id}-${Date.now()}`;
    if (task.parentTaskId) {
      await this.tasks.appendLog(task.id, 'agent_invoke', 'invoking bedrock', {
        taskId: task.id,
        toolName: 'bedrock.invokeModel',
        toolCallId,
        argsPreview: `tier=${task.tier ?? 'auto'} model=${friendlyModel}${route?.forced ? ` forced=${route.forced}` : ''}${userCreds ? ' byo=1' : ''}`,
        invokedAt: Date.now(),
      });
    }

    await this.tasks.appendLog(task.id, 'tool_call', 'invoking bedrock', {
      tier: task.tier ?? 'auto',
      model: friendlyModel,
      forced: route?.forced ?? null,
      byo: !!userCreds,
      toolCallId,
    });

    const prompt = this.buildPrompt(task);
    const text = await this.bedrock.invokeModel(prompt, modelId, userCreds);
    await this.tasks.appendLog(task.id, 'tool_result', 'bedrock returned', {
      chars: text.length,
      model: friendlyModel,
      toolCallId,
    });
    // Cost is tracked via cost-tracker AsyncLocalStorage (W5.2 will populate).
    // For now return 0 so the agent_result event has a numeric placeholder.
    return { text, costUsd: 0 };
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
