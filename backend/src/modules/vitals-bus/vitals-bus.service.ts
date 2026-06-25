import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VitalEventEntity } from '../../entities/vital-event.entity';
import { LivingPetService } from '../living-pet/living-pet.service';

/**
 * 顿领 §3.4.2 + §6.1 Vitals Bus
 *
 * P1-9 — 把任意来源（手表/手机/桌面）的生理 / 状态指标推到统一总线，
 *         由 Living Agent 反应器决定是否触发主宠情绪变化。
 *
 * 默认规则：
 *   metric=hr value>100  → concerned (intensity 2)
 *   metric=hr value<50   → tired     (intensity 1)
 *   metric=stress value>=80 → concerned
 *   metric=focus value>=80  → focused
 *   metric=joy   value>=80  → happy
 *   metric=sleep value>=80  → sleepy
 */
export type VitalsMetric =
  | 'hr'
  | 'stress'
  | 'focus'
  | 'joy'
  | 'sleep'
  | 'spo2'
  | 'temp';

export interface VitalsEventInput {
  metric: VitalsMetric;
  value: number;
  source_device_id?: string;
  source_surface?: 'mobile' | 'desktop' | 'web' | 'watch' | 'glass';
  ts?: number;
}

export interface VitalsReaction {
  emotion?: string;
  intensity?: 0 | 1 | 2 | 3;
  reason: string;
}

@Injectable()
export class VitalsBusService {
  private readonly logger = new Logger(VitalsBusService.name);

  constructor(
    @InjectRepository(VitalEventEntity)
    private readonly vitalRepo: Repository<VitalEventEntity>,
    private readonly pet: LivingPetService,
  ) {}

  async ingest(userId: string, event: VitalsEventInput): Promise<{ ok: true; reaction?: VitalsReaction; pet?: any }> {
    const reaction = this.evaluate(event);
    const eventTs = event.ts ?? Date.now();

    const row = this.vitalRepo.create({
      userId,
      metric: event.metric,
      value: event.value,
      sourceDeviceId: event.source_device_id ?? null,
      sourceSurface: event.source_surface ?? null,
      eventTsMs: String(eventTs),
      reaction: reaction ?? null,
    });
    await this.vitalRepo.save(row);

    let petDto: any;
    if (reaction?.emotion) {
      try {
        const updated = await this.pet.setEmotion(userId, {
          emotion: reaction.emotion as any,
          intensity: reaction.intensity ?? 1,
        });
        petDto = this.pet.toDto(updated);
        this.logger.log(
          `vitals reactor: user=${userId} ${event.metric}=${event.value} → pet.${reaction.emotion}(${reaction.intensity})`,
        );
      } catch (e) {
        this.logger.warn(`vitals reactor failed: ${(e as Error).message}`);
      }
    }
    return { ok: true, reaction, pet: petDto };
  }

  async list(userId: string, limit = 50) {
    const rows = await this.vitalRepo.find({
      where: { userId },
      order: { eventTsMs: 'DESC' },
      take: limit,
    });

    return rows.map((row) => ({
      metric: row.metric as VitalsMetric,
      value: row.value,
      source_device_id: row.sourceDeviceId ?? null,
      source_surface: (row.sourceSurface as VitalsEventInput['source_surface']) ?? null,
      ts: Number(row.eventTsMs),
      reaction: row.reaction ?? null,
    }));
  }

  private evaluate(e: VitalsEventInput): VitalsReaction | undefined {
    switch (e.metric) {
      case 'hr':
        if (e.value > 100) return { emotion: 'concerned', intensity: 2, reason: `hr=${e.value} > 100` };
        if (e.value < 50) return { emotion: 'tired', intensity: 1, reason: `hr=${e.value} < 50` };
        return undefined;
      case 'stress':
        if (e.value >= 80) return { emotion: 'concerned', intensity: 2, reason: `stress=${e.value}` };
        return undefined;
      case 'focus':
        if (e.value >= 80) return { emotion: 'focused', intensity: 2, reason: `focus=${e.value}` };
        return undefined;
      case 'joy':
        if (e.value >= 80) return { emotion: 'happy', intensity: 2, reason: `joy=${e.value}` };
        return undefined;
      case 'sleep':
        if (e.value >= 80) return { emotion: 'sleepy', intensity: 2, reason: `sleep=${e.value}` };
        return undefined;
      case 'spo2':
        if (e.value < 92) return { emotion: 'concerned', intensity: 3, reason: `spo2=${e.value} < 92` };
        return undefined;
      default:
        return undefined;
    }
  }
}
