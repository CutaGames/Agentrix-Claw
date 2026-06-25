import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { PetLlmUsageEvent } from '../../entities/pet-llm-usage-event.entity';
import { PetEnergyService } from './pet-energy.service';

export const RISK_WINDOW_MS = 60 * 60 * 1000; // 1 hour
export const RISK_CALL_THRESHOLD = 100;

export interface RiskAssessment {
  callsLastHour: number;
  threshold: number;
  triggered: boolean;
}

/**
 * PetRiskControlService — BE-T4.9 / PF-4.3
 *
 * Records every LLM call and, on exceed of 100 calls/hour for a pet, pauses
 * the pet via PetEnergyService and emits a structured warning log so an
 * operator/alert pipeline can pick it up (< 10s of trigger).
 */
@Injectable()
export class PetRiskControlService {
  private readonly logger = new Logger(PetRiskControlService.name);

  constructor(
    @InjectRepository(PetLlmUsageEvent)
    private readonly events: Repository<PetLlmUsageEvent>,
    private readonly energy: PetEnergyService,
  ) {}

  /** Record one LLM call. Returns assessment + may pause pet. */
  async recordCall(
    userId: string,
    petSkinId: string,
    model: string,
    costCents: number,
    now: Date = new Date(),
  ): Promise<RiskAssessment> {
    await this.events.save(
      this.events.create({ userId, petSkinId, model, costCents }),
    );
    const assessment = await this.assess(userId, petSkinId, now);
    if (assessment.triggered) {
      await this.energy.pause(userId, petSkinId, `llm_rate_${assessment.callsLastHour}_per_hour`);
      // Structured log line — alerting pipeline (PM2 + log scrape) can match this.
      this.logger.error(
        `ALERT pet_risk_throttle user=${userId} pet=${petSkinId} calls_1h=${assessment.callsLastHour}`,
      );
    }
    return assessment;
  }

  async assess(userId: string, petSkinId: string, now: Date = new Date()): Promise<RiskAssessment> {
    const since = new Date(now.getTime() - RISK_WINDOW_MS);
    const callsLastHour = await this.events.count({
      where: { userId, petSkinId, createdAt: MoreThan(since) },
    });
    return {
      callsLastHour,
      threshold: RISK_CALL_THRESHOLD,
      triggered: callsLastHour >= RISK_CALL_THRESHOLD,
    };
  }
}
