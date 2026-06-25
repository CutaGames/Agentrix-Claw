import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AgentCostRecord } from '../../entities/agent-cost-record.entity';
import { AgentTaskEntity } from '../../entities/agent-task.entity';
import { PetTeamMember } from '../../entities/pet-team-member.entity';
import { LivingPet } from '../../entities/living-pet.entity';
import { PetProductivitySnapshot } from '../../entities/pet-productivity-snapshot.entity';

/**
 * MultiAgentSummaryService — weekly + per-pet aggregation for v1 W5.5.
 *
 * Spec: design.md §12.5, §12.6; tasks.md W5.5
 */

export interface WeeklySummary {
  weekStart: string;          // ISO date (Mon 00:00 UTC+8)
  weekEnd: string;            // ISO date (today)
  totalSubTasks: number;
  succeededCount: number;
  failedCount: number;
  totalCostUsd: number;
  topPets: Array<{
    livingPetId: string | null;
    petName: string;
    avatarUrl?: string;
    subTaskCount: number;
    totalCostUsd: number;
  }>;
  topExpensiveSubTasks: Array<{
    taskId: string;
    title: string;
    role: string | null;
    totalCostUsd: number;
    completedAt: string | null;
  }>;
}

export interface CsvRow {
  date: string;
  subTaskId: string;
  parentTaskId: string | null;
  role: string | null;
  petName: string | null;
  status: string;
  durationMs: number | null;
  costUsd: number;
}

@Injectable()
export class MultiAgentSummaryService {
  private readonly logger = new Logger(MultiAgentSummaryService.name);

  constructor(
    @InjectRepository(AgentCostRecord)
    private readonly costRepo: Repository<AgentCostRecord>,
    @InjectRepository(AgentTaskEntity)
    private readonly taskRepo: Repository<AgentTaskEntity>,
    @InjectRepository(PetTeamMember)
    private readonly memberRepo: Repository<PetTeamMember>,
    @InjectRepository(LivingPet)
    private readonly livingPetRepo: Repository<LivingPet>,
    @InjectRepository(PetProductivitySnapshot)
    private readonly snapshotRepo: Repository<PetProductivitySnapshot>,
  ) {}

  /**
   * Aggregate the past 7 days of `sub_task_complete` cost rows for a user.
   * Returns an empty-but-shaped result for users with no activity.
   */
  async computeWeeklySummary(userId: string): Promise<WeeklySummary> {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);

    // 1. Total + per-status sub-task counts (read sub_task_complete rows)
    const totals = await this.costRepo
      .createQueryBuilder('c')
      .select('COUNT(*)', 'cnt')
      .addSelect('COALESCE(SUM(c.cost_usd), 0)', 'total_cost')
      .where('c.user_id = :userId', { userId })
      .andWhere('c.event_type = :ev', { ev: 'sub_task_complete' })
      .andWhere('c.created_at >= :start', { start: weekStart })
      .getRawOne<{ cnt: string | number; total_cost: string | number }>();

    const totalSubTasks = Number(totals?.cnt ?? 0);
    const totalCostUsd = Number(totals?.total_cost ?? 0);

    // 2. Per-pet breakdown (top 3 by sub-task count)
    const perPetRows = await this.costRepo
      .createQueryBuilder('c')
      .select('c.agent_id', 'agent_id')
      .addSelect('COUNT(*)', 'cnt')
      .addSelect('COALESCE(SUM(c.cost_usd), 0)', 'total_cost')
      .where('c.user_id = :userId', { userId })
      .andWhere('c.event_type = :ev', { ev: 'sub_task_complete' })
      .andWhere('c.created_at >= :start', { start: weekStart })
      .andWhere('c.agent_id IS NOT NULL')
      .groupBy('c.agent_id')
      .orderBy('cnt', 'DESC')
      .limit(8)
      .getRawMany<{ agent_id: string; cnt: string | number; total_cost: string | number }>();

    const topPets: WeeklySummary['topPets'] = [];
    for (const row of perPetRows.slice(0, 3)) {
      const member = await this.memberRepo.findOne({
        where: { boundAgentAccountId: row.agent_id },
      });
      let petName = member?.displayName || 'Unknown';
      let livingPetId: string | null = null;
      if (member?.parentLivingPetId) {
        const pet = await this.livingPetRepo.findOne({
          where: { id: member.parentLivingPetId },
        });
        if (pet) {
          petName = pet.name || petName;
          livingPetId = pet.id;
        }
      }
      topPets.push({
        livingPetId,
        petName,
        subTaskCount: Number(row.cnt),
        totalCostUsd: Number(row.total_cost),
      });
    }

    // 3. Top 3 most expensive sub-tasks (by sub_task_complete cost)
    const expensive = await this.costRepo
      .createQueryBuilder('c')
      .select('c.parent_task_id', 'parent_task_id')
      .addSelect('c.cost_usd', 'cost_usd')
      .addSelect('c.created_at', 'created_at')
      .where('c.user_id = :userId', { userId })
      .andWhere('c.event_type = :ev', { ev: 'sub_task_complete' })
      .andWhere('c.created_at >= :start', { start: weekStart })
      .andWhere('c.parent_task_id IS NOT NULL')
      .orderBy('c.cost_usd', 'DESC')
      .limit(3)
      .getRawMany<{ parent_task_id: string; cost_usd: string | number; created_at: Date }>();

    const topExpensiveSubTasks: WeeklySummary['topExpensiveSubTasks'] = [];
    for (const row of expensive) {
      const task = await this.taskRepo.findOne({
        where: { id: row.parent_task_id },
        select: ['id', 'title', 'completedAt'],
      });
      const member = task ? await this.memberRepo.findOne({ where: { boundAgentAccountId: task['agentId'] ?? '' } }) : null;
      topExpensiveSubTasks.push({
        taskId: row.parent_task_id,
        title: task?.title || '(deleted)',
        role: member?.role ?? null,
        totalCostUsd: Number(row.cost_usd),
        completedAt: task?.completedAt?.toISOString() ?? null,
      });
    }

    // 4. Status breakdown (succeeded vs failed) from agent_tasks rows
    const statusBreakdown = await this.taskRepo
      .createQueryBuilder('t')
      .select('t.status', 'status')
      .addSelect('COUNT(*)', 'cnt')
      .where('t.user_id = :userId', { userId })
      .andWhere('t.parent_task_id IS NOT NULL')
      .andWhere('t.completed_at >= :start', { start: weekStart })
      .groupBy('t.status')
      .getRawMany<{ status: string; cnt: string | number }>();

    let succeededCount = 0;
    let failedCount = 0;
    for (const r of statusBreakdown) {
      if (r.status === 'succeeded') succeededCount = Number(r.cnt);
      else if (r.status === 'failed' || r.status === 'canceled') failedCount += Number(r.cnt);
    }

    return {
      weekStart: weekStart.toISOString().slice(0, 10),
      weekEnd: now.toISOString().slice(0, 10),
      totalSubTasks,
      succeededCount,
      failedCount,
      totalCostUsd,
      topPets,
      topExpensiveSubTasks,
    };
  }

  /**
   * CSV export — returns one row per sub-task (last `days` days). Header
   * line first; rows sorted newest first. Caller pipes through res.attach.
   */
  async exportTeamActivityCsv(userId: string, days: number = 30): Promise<string> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const rows = await this.taskRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect(
        AgentCostRecord,
        'cost',
        'cost.parent_task_id = t.id AND cost.event_type = :ev',
        { ev: 'sub_task_complete' },
      )
      .where('t.user_id = :userId', { userId })
      .andWhere('t.parent_task_id IS NOT NULL')
      .andWhere('t.created_at >= :since', { since })
      .orderBy('t.created_at', 'DESC')
      .limit(2000)
      .getRawMany<{
        t_id: string;
        t_title: string;
        t_status: string;
        t_started_at: Date | null;
        t_completed_at: Date | null;
        t_parent_task_id: string | null;
        t_agent_id: string | null;
        cost_cost_usd: string | number | null;
      }>();

    const header = ['date', 'sub_task_id', 'parent_task_id', 'role', 'pet_name', 'status', 'duration_ms', 'cost_usd'];
    const lines: string[] = [header.join(',')];

    for (const r of rows) {
      const member = r.t_agent_id
        ? await this.memberRepo.findOne({ where: { boundAgentAccountId: r.t_agent_id } })
        : null;
      const petName =
        member?.parentLivingPetId
          ? (await this.livingPetRepo.findOne({ where: { id: member.parentLivingPetId } }))?.name ?? ''
          : '';
      const durationMs =
        r.t_started_at && r.t_completed_at
          ? r.t_completed_at.getTime() - r.t_started_at.getTime()
          : '';
      lines.push(
        [
          r.t_completed_at ? r.t_completed_at.toISOString() : '',
          r.t_id,
          r.t_parent_task_id ?? '',
          member?.role ?? '',
          escapeCsv(petName),
          r.t_status,
          durationMs,
          r.cost_cost_usd ?? '',
        ].join(','),
      );
    }
    return lines.join('\n');
  }

  /**
   * Idempotent upsert of the daily pet productivity snapshot. Used by
   * the agent-presence cron at 02:00 UTC+8 (W5.5 second half).
   */
  async upsertDailySnapshot(date: Date = new Date()): Promise<void> {
    const dateKey = date.toISOString().slice(0, 10);
    const since = new Date(date);
    since.setDate(date.getDate() - 7);
    since.setHours(0, 0, 0, 0);

    const rows = await this.taskRepo
      .createQueryBuilder('t')
      .select('t.user_id', 'user_id')
      .addSelect('t.agent_id', 'agent_id')
      .addSelect('COUNT(*)', 'cnt')
      .addSelect(
        "COUNT(*) FILTER (WHERE t.status = 'succeeded')",
        'ok',
      )
      .addSelect(
        "COUNT(*) FILTER (WHERE t.status IN ('failed', 'canceled'))",
        'bad',
      )
      .addSelect('COALESCE(SUM(t.cost_usd), 0)', 'cost')
      .addSelect(
        "COALESCE(AVG(EXTRACT(EPOCH FROM (t.completed_at - t.started_at)) * 1000), 0)",
        'avg_dur_ms',
      )
      .where('t.parent_task_id IS NOT NULL')
      .andWhere('t.completed_at >= :since', { since })
      .andWhere('t.completed_at < :until', { until: date })
      .andWhere('t.agent_id IS NOT NULL')
      .groupBy('t.user_id, t.agent_id')
      .getRawMany<{
        user_id: string;
        agent_id: string;
        cnt: string | number;
        ok: string | number;
        bad: string | number;
        cost: string | number;
        avg_dur_ms: string | number;
      }>();

    let upserted = 0;
    for (const row of rows) {
      const member = await this.memberRepo.findOne({
        where: { boundAgentAccountId: row.agent_id },
      });
      if (!member?.parentLivingPetId) continue;

      await this.snapshotRepo.upsert(
        {
          userId: row.user_id,
          livingPetId: member.parentLivingPetId,
          agentAccountId: row.agent_id,
          snapshotDate: dateKey,
          subTaskCount: Number(row.cnt),
          succeededCount: Number(row.ok),
          failedCount: Number(row.bad),
          totalCostUsd: Number(row.cost),
          avgDurationMs: Math.round(Number(row.avg_dur_ms)),
          xpEarned: Number(row.ok), // 1 XP per success
        },
        ['livingPetId', 'snapshotDate'],
      );
      upserted += 1;
    }
    if (upserted > 0) {
      this.logger.log(`pet productivity snapshot upserted ${upserted} rows for ${dateKey}`);
    }
  }
}

function escapeCsv(value: string): string {
  if (!value) return '';
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
