import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  AgentTaskEntity,
  AgentTaskLogEntity,
  AgentTaskStatus,
} from '../../entities/agent-task.entity';
import { emitTeamActivityUpdate } from '../desktop-sync/companion-presence.helpers';

export interface CreateAgentTaskDto {
  userId: string;
  title: string;
  prompt: string;
  agentId?: string;
  instanceId?: string;
  tier?: string;
  parentTaskId?: string;
  targetKind?: string;
  /**
   * v2 W7 — set when target_kind = 'marketplace-hire'. Permitted only
   * when env MULTI_AGENT_MARKETPLACE_HIRE_ENABLED=1. Property 6 lint
   * allows this field write on v2 branches.
   */
  hiredFromUserId?: string;
}

/** Per-user throttle for `team-activity-update` emits (R5.6 ≤ 1/3s). */
const _lastEmitAt = new Map<string, number>();
const TEAM_ACTIVITY_THROTTLE_MS = 3000;

@Injectable()
export class AgentTaskService {
  private readonly maLogger = new Logger('AgentTaskService.MultiAgent');
  constructor(
    @InjectRepository(AgentTaskEntity)
    private readonly taskRepo: Repository<AgentTaskEntity>,
    @InjectRepository(AgentTaskLogEntity)
    private readonly logRepo: Repository<AgentTaskLogEntity>,
  ) {}

  async create(dto: CreateAgentTaskDto): Promise<AgentTaskEntity> {
    // Multi-agent v2 W7 — marketplace-hire is feature-flagged.
    // v1 default behavior: reject. v2 with flag ON: accept.
    if (dto.targetKind === 'marketplace-hire') {
      const marketplaceEnabled =
        process.env.MULTI_AGENT_MARKETPLACE_HIRE_ENABLED === '1';
      if (!marketplaceEnabled) {
        throw new Error(
          'not_implemented_in_v1: marketplace-hire target is reserved for v2 W7',
        );
      }
    }
    const task = this.taskRepo.create({
      userId: dto.userId,
      title: dto.title.slice(0, 200),
      prompt: dto.prompt,
      agentId: dto.agentId ?? null,
      instanceId: dto.instanceId ?? null,
      tier: dto.tier ?? null,
      status: 'queued',
      progress: -1,
      costUsd: 0,
      parentTaskId: dto.parentTaskId ?? null,
      targetKind: dto.targetKind ?? 'leader-direct',
      // v2 W7: hiredFromUserId stamped only when marketplace flag is on
      // (above check enforces). Property 6 lint allows on v2 branches.
      hiredFromUserId: dto.hiredFromUserId ?? null,
    });
    const saved = await this.taskRepo.save(task);
    await this.appendLog(saved.id, 'status', 'task created', { status: 'queued' });

    // If this is a sub-task creation, kick the team-activity emit so the
    // CompanionBall badge updates within 3 s (R5.6).
    if (saved.parentTaskId) {
      void this.emitTeamActivityUpdateThrottled(saved.userId).catch(() => {});
    }
    return saved;
  }

  async list(userId: string, limit = 50): Promise<AgentTaskEntity[]> {
    return this.taskRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }

  async get(id: string): Promise<AgentTaskEntity | null> {
    return this.taskRepo.findOne({ where: { id } });
  }

  async listLogs(taskId: string, limit = 200): Promise<AgentTaskLogEntity[]> {
    return this.logRepo.find({
      where: { taskId },
      order: { createdAt: 'ASC' },
      take: Math.min(Math.max(limit, 1), 1000),
    });
  }

  async appendLog(
    taskId: string,
    kind: string,
    message: string,
    payload?: Record<string, unknown>,
  ): Promise<AgentTaskLogEntity> {
    const log = this.logRepo.create({
      taskId,
      kind,
      message: message.slice(0, 4000),
      payload: payload ?? null,
    });
    return this.logRepo.save(log);
  }

  async setStatus(
    id: string,
    status: AgentTaskStatus,
    extra?: Partial<Pick<AgentTaskEntity, 'resultSummary' | 'errorMessage' | 'progress' | 'costUsd'>>,
  ): Promise<AgentTaskEntity | null> {
    const task = await this.taskRepo.findOne({ where: { id } });
    if (!task) return null;
    task.status = status;
    if (status === 'running' && !task.startedAt) task.startedAt = new Date();
    if (
      status === 'succeeded' ||
      status === 'failed' ||
      status === 'canceled'
    ) {
      task.completedAt = new Date();
    }
    if (extra?.resultSummary !== undefined) task.resultSummary = extra.resultSummary;
    if (extra?.errorMessage !== undefined) task.errorMessage = extra.errorMessage;
    if (extra?.progress !== undefined) task.progress = extra.progress;
    if (extra?.costUsd !== undefined) task.costUsd = extra.costUsd;
    const saved = await this.taskRepo.save(task);
    await this.appendLog(id, 'status', `→ ${status}`, { status });

    // Multi-Agent v1 W1.9 (R5.6): emit throttled team-activity-update
    // every status change so the desktop CompanionBall badge tracks
    // active sub-task count within 3 s.
    void this.emitTeamActivityUpdateThrottled(saved.userId).catch((e) =>
      this.maLogger.warn(`emit team-activity-update failed: ${e?.message}`),
    );

    return saved;
  }

  /**
   * Throttled per-user emit of `team-activity-update`. R5.6 — ≤ 1
   * emit per 3 s per user.
   *
   * "Active sub-task count" = count of `agent_tasks` rows for this
   * user where `status IN ('queued','running','awaiting_input')` AND
   * `parent_task_id IS NOT NULL` (only count sub-tasks,not top-level).
   */
  async emitTeamActivityUpdateThrottled(userId: string): Promise<void> {
    if (!userId) return;
    const now = Date.now();
    const last = _lastEmitAt.get(userId) ?? 0;
    if (now - last < TEAM_ACTIVITY_THROTTLE_MS) return;
    _lastEmitAt.set(userId, now);
    const count = await this.countActiveSubTasks(userId);
    emitTeamActivityUpdate({
      userId,
      activeSubTasks: count,
      oneLineSummary: count > 0 ? `${count} sub-task${count > 1 ? 's' : ''} running` : null,
      occurredAt: now,
    });
  }

  /** Active sub-task count = queued/running/awaiting_input where parent_task_id IS NOT NULL. */
  async countActiveSubTasks(userId: string): Promise<number> {
    return this.taskRepo
      .createQueryBuilder('t')
      .where('t.user_id = :userId', { userId })
      .andWhere('t.parent_task_id IS NOT NULL')
      .andWhere('t.status IN (:...statuses)', {
        statuses: ['queued', 'running', 'awaiting_input'],
      })
      .getCount();
  }

  async cancel(id: string): Promise<AgentTaskEntity | null> {
    return this.setStatus(id, 'canceled');
  }
}
