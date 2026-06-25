import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { PetA2ADispatch } from '../../entities/pet-a2a-dispatch.entity';
import { PetEnergyService } from '../pet-energy/pet-energy.service';

export interface DispatchInput {
  userId: string;
  petSkinId: string;
  taskName: string;
  targetAgentId: string;
  payload?: Record<string, unknown>;
  rewardCents?: number;
}

export const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 min

/**
 * PetA2ADispatchService — BE-T4.7
 *
 * Allows a pet to act as a task issuer (A2A: agent-to-agent) and dispatch
 * sub-tasks to worker agents. Energy is consumed up-front (gated by
 * PetEnergyService). Stale "running" dispatches are reclaimed by recover().
 */
@Injectable()
export class PetA2ADispatchService {
  private readonly logger = new Logger(PetA2ADispatchService.name);

  constructor(
    @InjectRepository(PetA2ADispatch)
    private readonly repo: Repository<PetA2ADispatch>,
    private readonly energy: PetEnergyService,
  ) {}

  async dispatch(input: DispatchInput): Promise<PetA2ADispatch> {
    if (!input.taskName || !input.targetAgentId) {
      throw new BadRequestException('taskName and targetAgentId are required');
    }
    // Energy gate (default cost 5; reward fee is informational only here).
    await this.energy.consume(input.userId, input.petSkinId, {
      energyCost: 5,
      estCostCents: input.rewardCents ?? 0,
    });

    const row = this.repo.create({
      userId: input.userId,
      petSkinId: input.petSkinId,
      taskName: input.taskName,
      targetAgentId: input.targetAgentId,
      payload: input.payload ?? {},
      rewardCents: input.rewardCents ?? 0,
      status: 'queued',
    });
    const saved = await this.repo.save(row);
    this.logger.log(
      `A2A dispatched id=${saved.id} pet=${input.petSkinId} -> ${input.targetAgentId} task=${input.taskName}`,
    );
    return saved;
  }

  async markRunning(dispatchId: string, userId: string): Promise<PetA2ADispatch> {
    const d = await this.requireOwned(dispatchId, userId);
    if (d.status !== 'queued') {
      throw new BadRequestException(`cannot start dispatch in status=${d.status}`);
    }
    d.status = 'running';
    return this.repo.save(d);
  }

  async complete(
    dispatchId: string,
    userId: string,
    result: Record<string, unknown>,
  ): Promise<PetA2ADispatch> {
    const d = await this.requireOwned(dispatchId, userId);
    if (d.status === 'completed') return d;
    if (d.status !== 'queued' && d.status !== 'running') {
      throw new BadRequestException(`cannot complete dispatch in status=${d.status}`);
    }
    d.status = 'completed';
    d.result = result;
    return this.repo.save(d);
  }

  async fail(dispatchId: string, userId: string, errorMessage: string): Promise<PetA2ADispatch> {
    const d = await this.requireOwned(dispatchId, userId);
    if (d.status === 'failed') return d;
    if (d.status === 'completed') {
      throw new BadRequestException('dispatch already completed');
    }
    d.status = 'failed';
    d.errorMessage = errorMessage;
    return this.repo.save(d);
  }

  /** Sweep stale running/queued dispatches older than timeoutMs and mark recovered. */
  async recoverStale(timeoutMs: number = DEFAULT_TIMEOUT_MS, now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - timeoutMs);
    const stale = await this.repo.find({
      where: [
        { status: 'queued', updatedAt: LessThan(cutoff) },
        { status: 'running', updatedAt: LessThan(cutoff) },
      ],
    });
    for (const d of stale) {
      d.status = 'recovered';
      d.errorMessage = `auto_recovered_after_${timeoutMs}ms`;
      await this.repo.save(d);
    }
    if (stale.length > 0) {
      this.logger.warn(`A2A recovered ${stale.length} stale dispatches`);
    }
    return stale.length;
  }

  private async requireOwned(id: string, userId: string): Promise<PetA2ADispatch> {
    const d = await this.repo.findOne({ where: { id } });
    if (!d) throw new NotFoundException('dispatch not found');
    if (d.userId !== userId) throw new ForbiddenException('not your dispatch');
    return d;
  }
}
