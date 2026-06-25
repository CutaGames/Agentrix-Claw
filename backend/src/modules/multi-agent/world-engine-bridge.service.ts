import { Injectable, Logger, Optional } from '@nestjs/common';

import { AgentTaskService } from '../agent-task/agent-task.service';

/**
 * Multi-Agent v1 W6 — World Engine integration bridge.
 *
 * Wraps the 4-stage World Engine pipeline (reconstruction →
 * ai-interpretation → character-generation → battle-prep) so each
 * stage emits an `agent_tasks` row with `parent_task_id` chained to
 * the previous stage. AgentTeamPanel "Task Graph" section then
 * renders the chain as a tree.
 *
 * **OPTIONAL** — gated by feature flag
 * `multi_agent_world_engine_visualization` (default OFF). When the
 * flag is OFF this service is a no-op and World Engine code paths
 * are 100% unchanged.
 *
 * Spec: design.md §14.1; tasks.md W6.1
 */
export type WorldEngineStage =
  | 'reconstruction'
  | 'ai-interpretation'
  | 'character-generation'
  | 'battle-prep';

export interface StageStartArgs {
  userId: string;
  /** Root run id (e.g. world-engine scan id) — used as the chain anchor. */
  rootRunId: string;
  stage: WorldEngineStage;
  /** Previous stage's agent_task id, if any. */
  prevTaskId?: string | null;
  title?: string;
  prompt?: string;
}

@Injectable()
export class WorldEngineBridgeService {
  private readonly logger = new Logger(WorldEngineBridgeService.name);

  /** Default OFF — explicit env override or admin_config flag flips on. */
  private get enabled(): boolean {
    return process.env.MULTI_AGENT_WORLD_ENGINE_VIZ === '1';
  }

  constructor(
    @Optional()
    private readonly agentTaskService?: AgentTaskService,
  ) {}

  /**
   * Open a stage: create an agent_tasks row with parent_task_id chained
   * to the previous stage. Returns the created task id (or null if flag
   * disabled or service injection failed).
   */
  async openStage(args: StageStartArgs): Promise<string | null> {
    if (!this.enabled || !this.agentTaskService) return null;
    try {
      const task = await this.agentTaskService.create({
        userId: args.userId,
        title: args.title || `World Engine: ${args.stage}`,
        prompt: args.prompt || `${args.stage} stage of run ${args.rootRunId}`,
        tier: 'cloud',
        parentTaskId: args.prevTaskId ?? undefined,
        targetKind: 'leader-direct',
      });
      // Spawn-style audit log
      await this.agentTaskService.appendLog(task.id, 'agent_spawn', `world-engine ${args.stage}`, {
        taskId: task.id,
        parentTaskId: args.prevTaskId ?? null,
        role: `world-engine.${args.stage}`,
        actorAgentId: null,
        target_kind: 'leader-direct',
        promptPreview: (args.prompt ?? '').slice(0, 80),
        rootRunId: args.rootRunId,
        spawnedAt: Date.now(),
      });
      return task.id;
    } catch (e) {
      this.logger.warn(
        `openStage failed user=${args.userId} stage=${args.stage}: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
  }

  /**
   * Close a stage: write `agent_result` log + setStatus succeeded/failed.
   * No-op when flag disabled or `taskId` is null.
   */
  async closeStage(
    taskId: string | null,
    result: { ok: boolean; durationMs: number; costUsd?: number; summary?: string },
  ): Promise<void> {
    if (!this.enabled || !taskId || !this.agentTaskService) return;
    try {
      await this.agentTaskService.appendLog(taskId, 'agent_result', result.ok ? 'stage succeeded' : 'stage failed', {
        taskId,
        status: result.ok ? 'succeeded' : 'failed',
        durationMs: result.durationMs,
        totalCostUsd: result.costUsd ?? 0,
        resultSummary: (result.summary ?? '').slice(0, 200),
        completedAt: Date.now(),
      });
      await this.agentTaskService.setStatus(taskId, result.ok ? 'succeeded' : 'failed', {
        resultSummary: (result.summary ?? '').slice(0, 2000),
        progress: result.ok ? 100 : -1,
        costUsd: result.costUsd ?? 0,
      });
    } catch (e) {
      this.logger.warn(
        `closeStage failed taskId=${taskId}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
