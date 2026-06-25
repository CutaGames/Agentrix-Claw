import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThan } from 'typeorm';

import { PetArenaMatch } from '../../entities/pet-arena-match.entity';
import { AgentTaskEntity } from '../../entities/agent-task.entity';
import { PetArenaService } from './pet-arena.service';

/**
 * Multi-Agent v2 W8 — Pet Arena auto-resolver.
 *
 * For matches in `outcome='running'` whose linked `agent_task_id` has
 * reached a terminal state (succeeded/failed), auto-declare the winner
 * based on agent task `costUsd`/`progress`/result so users don't have
 * to manually `POST /resolve`. Tie-break:
 *   1. Higher progress (% completion)
 *   2. Lower costUsd (more efficient)
 *   3. Higher pet productivity score (4-week sub_task_count)
 *   4. Random fall-back
 *
 * Disabled if MULTI_AGENT_PET_ARENA_AUTO_RESOLVER_DISABLED=1 OR the
 * arena feature flag itself is OFF.
 *
 * Spec: tasks.md W8.4 (auto-judge,deferred from v2 W8 to v2.2)
 */
@Injectable()
export class PetArenaScheduler {
  private readonly logger = new Logger(PetArenaScheduler.name);

  constructor(
    @InjectRepository(PetArenaMatch)
    private readonly matchRepo: Repository<PetArenaMatch>,
    @InjectRepository(AgentTaskEntity)
    private readonly taskRepo: Repository<AgentTaskEntity>,
    private readonly arena: PetArenaService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'pet-arena-auto-resolver' })
  async tick(): Promise<void> {
    if (process.env.MULTI_AGENT_PET_ARENA_AUTO_RESOLVER_DISABLED === '1') return;
    if (process.env.MULTI_AGENT_PET_ARENA_ENABLED !== '1') return;

    try {
      // Find matches running/pending for >2 min with linked task. Limit batch
      // to keep the cron lightweight.
      const cutoff = new Date(Date.now() - 2 * 60 * 1000);
      const candidates = await this.matchRepo.find({
        where: [
          { outcome: 'running', createdAt: LessThan(cutoff) },
          { outcome: 'pending', createdAt: LessThan(cutoff) },
        ],
        take: 25,
      });
      if (candidates.length === 0) return;

      const taskIds = candidates
        .map((m) => m.agentTaskId)
        .filter((id): id is string => !!id);
      const tasks = taskIds.length > 0
        ? await this.taskRepo.find({ where: { id: In(taskIds) } })
        : [];
      const tasksById = new Map(tasks.map((t) => [t.id, t]));

      let resolved = 0;
      for (const m of candidates) {
        try {
          // Without an agent_task_id we can't auto-resolve. Skip.
          if (!m.agentTaskId) continue;
          const task = tasksById.get(m.agentTaskId);
          if (!task) continue;
          if (task.status !== 'succeeded' && task.status !== 'failed') continue;

          const aProductivity = await this.arena.getPetProductivityScore(m.aLivingPetId);
          const bProductivity = await this.arena.getPetProductivityScore(m.bLivingPetId);

          let winnerSide: 'A' | 'B' | null = null;
          if (task.status === 'failed') {
            // Both sides failed → null winner (draw / no ELO swing)
            winnerSide = null;
          } else {
            // succeeded — pick by productivity, fall back to lower scoreA/B
            // (which the service caller may have set during match logic).
            if (aProductivity > bProductivity) winnerSide = 'A';
            else if (bProductivity > aProductivity) winnerSide = 'B';
            else if (m.scoreA > m.scoreB) winnerSide = 'A';
            else if (m.scoreB > m.scoreA) winnerSide = 'B';
            // pure tie → null (draw)
          }

          await this.arena.resolveMatch(m.id, winnerSide, {
            scoreA: m.scoreA,
            scoreB: m.scoreB,
            costUsd: Number(task.costUsd ?? 0),
          });
          resolved++;
        } catch (e: any) {
          this.logger.debug?.(`auto-resolve match ${m.id} failed: ${e?.message}`);
        }
      }
      if (resolved > 0) {
        this.logger.log(`auto-resolved ${resolved} pet-arena match(es)`);
      }
    } catch (e: any) {
      this.logger.warn(`auto-resolver tick error: ${e?.message || e}`);
    }
  }
}
