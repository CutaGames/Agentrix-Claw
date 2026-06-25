import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { PetLlmUsageEvent } from '../../entities/pet-llm-usage-event.entity';
import { PetA2ADispatch } from '../../entities/pet-a2a-dispatch.entity';
import { PetEnergyState } from '../../entities/pet-energy-state.entity';

export interface PetDailyReport {
  userId: string;
  petSkinId: string;
  windowStart: string;
  windowEnd: string;
  llmCalls: number;
  llmCostCents: number;
  dispatches: number;
  dispatchesCompleted: number;
  dispatchesFailed: number;
  rewardEarnedCents: number;
  energyAtEnd: number;
  paused: boolean;
}

/**
 * PetReportService — BE-T4.8 / Exit Gate #6 (≥95% delivery on daily reports).
 *
 * Aggregates per-(user, pet) activity for a daily window. Pure aggregation,
 * delivery is handled by an external pusher (notification module).
 */
@Injectable()
export class PetReportService {
  private readonly logger = new Logger(PetReportService.name);

  constructor(
    @InjectRepository(PetLlmUsageEvent)
    private readonly usage: Repository<PetLlmUsageEvent>,
    @InjectRepository(PetA2ADispatch)
    private readonly dispatches: Repository<PetA2ADispatch>,
    @InjectRepository(PetEnergyState)
    private readonly energy: Repository<PetEnergyState>,
  ) {}

  async generateDailyReport(
    userId: string,
    petSkinId: string,
    now: Date = new Date(),
  ): Promise<PetDailyReport> {
    const end = new Date(now);
    const start = new Date(end.getTime() - 24 * 3_600_000);

    const usageEvents = await this.usage.find({
      where: { userId, petSkinId, createdAt: Between(start, end) },
    });
    const dispatchesAll = await this.dispatches.find({
      where: { userId, petSkinId, createdAt: Between(start, end) },
    });
    const state = await this.energy.findOne({ where: { userId, petSkinId } });

    const llmCalls = usageEvents.length;
    const llmCostCents = usageEvents.reduce((s, e) => s + (e.costCents || 0), 0);
    const dispatchesCompleted = dispatchesAll.filter((d) => d.status === 'completed').length;
    const dispatchesFailed = dispatchesAll.filter((d) => d.status === 'failed').length;
    const rewardEarnedCents = dispatchesAll
      .filter((d) => d.status === 'completed')
      .reduce((s, d) => s + (d.rewardCents || 0), 0);

    return {
      userId,
      petSkinId,
      windowStart: start.toISOString(),
      windowEnd: end.toISOString(),
      llmCalls,
      llmCostCents,
      dispatches: dispatchesAll.length,
      dispatchesCompleted,
      dispatchesFailed,
      rewardEarnedCents,
      energyAtEnd: state?.energy ?? 0,
      paused: state?.paused ?? false,
    };
  }
}
