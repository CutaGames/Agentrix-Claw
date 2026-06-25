import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';

import { AgentTaskEntity } from '../../entities/agent-task.entity';
import { emitSubTaskStalled } from '../desktop-sync/companion-presence.helpers';

/**
 * Multi-Agent v1 W4.2 — sub-task stalled detector.
 *
 * Every 5 minutes, scan `agent_tasks` rows where status='running' AND
 * `now() - started_at > 60min`,emit `presence:multi-agent.sub-task-stalled`
 * for each (CompanionBall amber pulse + 3-button UI).
 *
 * Spec: design.md §7.2, §7.3; tasks.md W4.2; R9.5
 */
@Injectable()
export class SubTaskStalledScheduler {
  private readonly logger = new Logger(SubTaskStalledScheduler.name);

  /** Avoid re-emitting for the same task within this window. */
  private readonly EMIT_COOLDOWN_MS = 30 * 60_000;

  /** Stalled threshold (per spec). */
  private readonly STALLED_THRESHOLD_MS = 60 * 60_000;

  /** task.id → last emit ts. */
  private readonly lastEmittedAt = new Map<string, number>();

  constructor(
    @InjectRepository(AgentTaskEntity)
    private readonly taskRepo: Repository<AgentTaskEntity>,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'multi-agent-sub-task-stalled' })
  async detectStalled(): Promise<void> {
    if (process.env.MULTI_AGENT_STALLED_SCHEDULER_DISABLED === '1') return;

    const cutoff = new Date(Date.now() - this.STALLED_THRESHOLD_MS);

    // Only sub-tasks (parent_task_id non-null) can be 'stalled' for
    // multi-agent purposes. Top-level tasks have other UX paths.
    const candidates = await this.taskRepo
      .createQueryBuilder('t')
      .where('t.status = :running', { running: 'running' })
      .andWhere('t.parent_task_id IS NOT NULL')
      .andWhere('t.started_at IS NOT NULL')
      .andWhere('t.started_at < :cutoff', { cutoff })
      .limit(100)
      .getMany();

    if (candidates.length === 0) return;

    const now = Date.now();
    let emitted = 0;
    for (const task of candidates) {
      const last = this.lastEmittedAt.get(task.id) ?? 0;
      if (now - last < this.EMIT_COOLDOWN_MS) continue;

      const startedAt = task.startedAt?.getTime() ?? now;
      emitSubTaskStalled({
        userId: task.userId,
        subTaskId: task.id,
        durationMs: now - startedAt,
        title: task.title,
      });
      this.lastEmittedAt.set(task.id, now);
      emitted += 1;
    }

    if (emitted > 0) {
      this.logger.log(
        `multi-agent stalled detector — ${emitted} stalled sub-task(s) emitted (of ${candidates.length} candidates)`,
      );
    }

    // Garbage-collect cooldown map for tasks that no longer match
    if (this.lastEmittedAt.size > 1000) {
      const stillRunningIds = new Set(candidates.map((t) => t.id));
      for (const id of this.lastEmittedAt.keys()) {
        if (!stillRunningIds.has(id)) this.lastEmittedAt.delete(id);
      }
    }
  }
}
