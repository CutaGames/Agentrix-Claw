import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PetEnergyState } from '../../entities/pet-energy-state.entity';
import { emitDesktopSyncEvent } from '../desktop-sync/desktop-sync.events';

export const ENERGY_MAX = 100;
export const ENERGY_REGEN_PER_HOUR = 10;
export const ENERGY_TASK_COST_DEFAULT = 5;
/** Default daily LLM USD budget per pet, in cents. */
export const DEFAULT_DAILY_BUDGET_CENTS = 500; // $5

export class EnergyExhaustedError extends BadRequestException {
  constructor(public readonly energy: number) {
    super({ code: 'energy_exhausted', message: 'pet energy exhausted', energy });
  }
}

export class DailyBudgetExceededError extends BadRequestException {
  constructor(public readonly spentCents: number, public readonly budgetCents: number) {
    super({
      code: 'daily_budget_exceeded',
      message: 'pet daily LLM budget exceeded',
      spentCents,
      budgetCents,
    });
  }
}

export class PetPausedError extends BadRequestException {
  constructor(public readonly reason: string) {
    super({ code: 'pet_paused', message: `pet paused: ${reason}`, reason });
  }
}

/**
 * PetEnergyService — BE-T4.6 / BE-T4.5 / Exit Gate #4
 *
 * Energy regenerates linearly at +10/hour up to a cap of 100. Computed lazily
 * on read so we never run a per-pet ticker.
 */
@Injectable()
export class PetEnergyService {
  private readonly logger = new Logger(PetEnergyService.name);

  constructor(
    @InjectRepository(PetEnergyState)
    private readonly repo: Repository<PetEnergyState>,
  ) {}

  /** Idempotent get-or-create. Regenerates energy based on elapsed time. */
  async getState(userId: string, petSkinId: string, now: Date = new Date()): Promise<PetEnergyState> {
    let state = await this.repo.findOne({ where: { userId, petSkinId } });
    if (!state) {
      state = this.repo.create({ userId, petSkinId, energy: ENERGY_MAX });
      state = await this.repo.save(state);
    } else {
      const regen = this.computeRegen(state, now);
      if (regen > 0) {
        state.energy = Math.min(ENERGY_MAX, state.energy + regen);
        state = await this.repo.save(state);
      }
    }
    return state;
  }

  /**
   * Try to consume energy + budget for an Auto-Earn task.
   * Throws EnergyExhaustedError / DailyBudgetExceededError / PetPausedError when blocked.
   */
  async consume(
    userId: string,
    petSkinId: string,
    opts: { energyCost?: number; estCostCents?: number; budgetCents?: number; now?: Date } = {},
  ): Promise<PetEnergyState> {
    const cost = opts.energyCost ?? ENERGY_TASK_COST_DEFAULT;
    const estCost = opts.estCostCents ?? 0;
    const budget = opts.budgetCents ?? DEFAULT_DAILY_BUDGET_CENTS;
    const now = opts.now ?? new Date();

    const state = await this.getState(userId, petSkinId, now);

    if (state.paused) {
      throw new PetPausedError(state.pausedReason || 'unknown');
    }
    if (state.energy <= 0 || state.energy < cost) {
      throw new EnergyExhaustedError(state.energy);
    }
    if (state.dailySpendCents + estCost > budget) {
      throw new DailyBudgetExceededError(state.dailySpendCents + estCost, budget);
    }

    state.energy = Math.max(0, state.energy - cost);
    state.dailySpendCents = state.dailySpendCents + estCost;
    const saved = await this.repo.save(state);
    this.broadcast(saved);
    return saved;
  }

  async pause(userId: string, petSkinId: string, reason: string): Promise<PetEnergyState> {
    const state = await this.getState(userId, petSkinId);
    state.paused = true;
    state.pausedReason = reason;
    this.logger.warn(`Pet paused user=${userId} pet=${petSkinId} reason=${reason}`);
    const saved = await this.repo.save(state);
    this.broadcast(saved);
    return saved;
  }

  async resume(userId: string, petSkinId: string): Promise<PetEnergyState> {
    const state = await this.getState(userId, petSkinId);
    state.paused = false;
    state.pausedReason = null;
    const saved = await this.repo.save(state);
    this.broadcast(saved);
    return saved;
  }

  /** S3 cross-device sync: broadcast energy changes to all user devices. */
  private broadcast(state: PetEnergyState) {
    try {
      emitDesktopSyncEvent(state.userId, 'presence:pet.energy', {
        pet_skin_id: state.petSkinId,
        energy: state.energy,
        energy_max: ENERGY_MAX,
        daily_spend_cents: state.dailySpendCents,
        paused: state.paused,
        paused_reason: state.pausedReason ?? null,
        updated_at: Date.now(),
      });
    } catch (e) {
      this.logger.warn(`broadcast pet.energy failed: ${(e as Error).message}`);
    }
  }

  /** Reset rolling counters — called daily by scheduler at UTC midnight. */
  async resetDailyCounters(): Promise<number> {
    const result = await this.repo.update({}, { dailyLlmCalls: 0, dailySpendCents: 0 });
    return result.affected ?? 0;
  }

  private computeRegen(state: PetEnergyState, now: Date): number {
    const elapsedMs = now.getTime() - state.updatedAt.getTime();
    if (elapsedMs <= 0) return 0;
    const hours = elapsedMs / 3_600_000;
    return Math.floor(hours * ENERGY_REGEN_PER_HOUR);
  }
}
