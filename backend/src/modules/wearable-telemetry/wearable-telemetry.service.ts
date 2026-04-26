import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import {
  WearableTelemetrySample,
  WearableAutomationRule,
  WearableTriggerEvent,
} from '../../entities/wearable-telemetry.entity';
import {
  CreateAutomationRuleDto,
  QueryTelemetryDto,
  RegisterWearableVerificationDto,
  UpdateAutomationRuleDto,
  UploadTelemetryDto,
} from './dto/wearable-telemetry.dto';

@Injectable()
export class WearableTelemetryService {
  private readonly logger = new Logger(WearableTelemetryService.name);

  constructor(
    @InjectRepository(WearableTelemetrySample)
    private readonly sampleRepo: Repository<WearableTelemetrySample>,
    @InjectRepository(WearableAutomationRule)
    private readonly ruleRepo: Repository<WearableAutomationRule>,
    @InjectRepository(WearableTriggerEvent)
    private readonly triggerRepo: Repository<WearableTriggerEvent>,
  ) {}

  // ── Telemetry Upload ───────────────────────────────────────────────────────

  async uploadSamples(userId: string, dto: UploadTelemetryDto): Promise<{ inserted: number }> {
    const entities = dto.samples.map((s) =>
      this.sampleRepo.create({
        userId,
        deviceId: dto.deviceId,
        deviceName: dto.deviceName,
        channel: s.channel,
        value: s.value,
        unit: s.unit,
        rawBase64: s.rawBase64,
        characteristicUuid: s.characteristicUuid,
        serviceUuid: s.serviceUuid,
        sampleTimestamp: new Date(s.timestamp),
      }),
    );

    const saved = await this.sampleRepo.save(entities, { chunk: 100 });
    this.logger.log(`Uploaded ${saved.length} telemetry samples for device ${dto.deviceId}`);

    // Check automation rules for the latest samples
    await this.evaluateRules(userId, dto.deviceId, dto.samples);

    return { inserted: saved.length };
  }

  async registerVerificationEvent(userId: string, dto: RegisterWearableVerificationDto): Promise<WearableTriggerEvent> {
    const now = new Date();
    const event = this.triggerRepo.create({
      userId,
      ruleId: '00000000-0000-0000-0000-000000000000',
      ruleName: 'Wearable verification',
      deviceId: dto.deviceId,
      channel: 'custom',
      value: 1,
      condition: 'eq',
      threshold: 1,
      action: 'update_context',
      actionPayload: {
        eventType: dto.type,
        source: dto.source ?? 'wearable',
        deviceName: dto.deviceName,
        services: dto.services ?? [],
        firstReadableCharacteristicUuid: dto.firstReadableCharacteristicUuid ?? null,
        payloadPreview: dto.payloadPreview ?? null,
        kind: dto.kind ?? null,
        supportTier: dto.supportTier ?? null,
        receivedAt: now.toISOString(),
      },
      acknowledged: false,
      triggeredAt: now,
    });

    const saved = await this.triggerRepo.save(event);
    this.logger.log(`Registered wearable verification event for device ${dto.deviceId}`);
    return saved;
  }

  // ── Telemetry Query ────────────────────────────────────────────────────────

  async querySamples(userId: string, query: QueryTelemetryDto): Promise<WearableTelemetrySample[]> {
    const qb = this.sampleRepo.createQueryBuilder('s')
      .where('s.userId = :userId', { userId })
      .orderBy('s.sampleTimestamp', 'DESC')
      .take(query.limit || 100);

    if (query.deviceId) {
      qb.andWhere('s.deviceId = :deviceId', { deviceId: query.deviceId });
    }
    if (query.channel) {
      qb.andWhere('s.channel = :channel', { channel: query.channel });
    }
    if (query.from) {
      qb.andWhere('s.sampleTimestamp >= :from', { from: new Date(query.from) });
    }
    if (query.to) {
      qb.andWhere('s.sampleTimestamp <= :to', { to: new Date(query.to) });
    }

    return qb.getMany();
  }

  async getLatestByDevice(userId: string, deviceId: string): Promise<Record<string, any>> {
    const channels = ['heart_rate', 'spo2', 'temperature', 'steps', 'battery', 'accelerometer'];
    const result: Record<string, any> = {};

    for (const channel of channels) {
      const latest = await this.sampleRepo.findOne({
        where: { userId, deviceId, channel },
        order: { sampleTimestamp: 'DESC' },
      });
      if (latest) {
        result[channel] = {
          value: latest.value,
          unit: latest.unit,
          timestamp: latest.sampleTimestamp,
        };
      }
    }

    return result;
  }

  async getStats(userId: string, deviceId: string): Promise<any> {
    const totalSamples = await this.sampleRepo.count({ where: { userId, deviceId } });

    const channelCounts = await this.sampleRepo.createQueryBuilder('s')
      .select('s.channel', 'channel')
      .addSelect('COUNT(*)', 'count')
      .where('s.userId = :userId AND s.deviceId = :deviceId', { userId, deviceId })
      .groupBy('s.channel')
      .getRawMany();

    const oldest = await this.sampleRepo.findOne({
      where: { userId, deviceId },
      order: { sampleTimestamp: 'ASC' },
    });

    const newest = await this.sampleRepo.findOne({
      where: { userId, deviceId },
      order: { sampleTimestamp: 'DESC' },
    });

    return {
      totalSamples,
      channelCounts: channelCounts.reduce((acc, c) => ({ ...acc, [c.channel]: parseInt(c.count) }), {}),
      oldestSample: oldest?.sampleTimestamp || null,
      newestSample: newest?.sampleTimestamp || null,
    };
  }

  // ── Automation Rules ───────────────────────────────────────────────────────

  async createRule(userId: string, dto: CreateAutomationRuleDto): Promise<WearableAutomationRule> {
    const rule = this.ruleRepo.create({
      userId,
      name: dto.name,
      enabled: true,
      deviceId: dto.deviceId,
      channel: dto.channel,
      condition: dto.condition,
      threshold: dto.threshold,
      thresholdHigh: dto.thresholdHigh,
      windowMs: dto.windowMs ?? 0,
      cooldownMs: dto.cooldownMs ?? 300000,
      action: dto.action,
      actionPayload: dto.actionPayload ?? {},
      triggerCount: 0,
    });

    return this.ruleRepo.save(rule);
  }

  async listRules(userId: string, deviceId?: string): Promise<WearableAutomationRule[]> {
    const where: any = { userId };
    if (deviceId) {
      where.deviceId = deviceId;
    }
    return this.ruleRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async updateRule(userId: string, ruleId: string, dto: UpdateAutomationRuleDto): Promise<WearableAutomationRule | null> {
    const rule = await this.ruleRepo.findOne({ where: { id: ruleId, userId } });
    if (!rule) {
      return null;
    }
    Object.assign(rule, dto);
    return this.ruleRepo.save(rule);
  }

  async deleteRule(userId: string, ruleId: string): Promise<boolean> {
    const result = await this.ruleRepo.delete({ id: ruleId, userId });
    return (result.affected ?? 0) > 0;
  }

  async toggleRule(userId: string, ruleId: string): Promise<WearableAutomationRule | null> {
    const rule = await this.ruleRepo.findOne({ where: { id: ruleId, userId } });
    if (!rule) {
      return null;
    }
    rule.enabled = !rule.enabled;
    return this.ruleRepo.save(rule);
  }

  // ── Trigger Events ─────────────────────────────────────────────────────────

  async listTriggerEvents(userId: string, limit = 50): Promise<WearableTriggerEvent[]> {
    return this.triggerRepo.find({
      where: { userId },
      order: { triggeredAt: 'DESC' },
      take: limit,
    });
  }

  async acknowledgeTrigger(userId: string, eventId: string): Promise<boolean> {
    const result = await this.triggerRepo.update({ id: eventId, userId }, { acknowledged: true });
    return (result.affected ?? 0) > 0;
  }

  async getUnacknowledgedCount(userId: string): Promise<number> {
    return this.triggerRepo.count({ where: { userId, acknowledged: false } });
  }

  // ── Internal Rule Evaluation ───────────────────────────────────────────────

  private async evaluateRules(
    userId: string,
    deviceId: string,
    samples: Array<{ channel: string; value: number; timestamp: string }>,
  ): Promise<void> {
    const rules = await this.ruleRepo.find({
      where: { userId, deviceId, enabled: true },
    });

    if (rules.length === 0) {
      return;
    }

    for (const rule of rules) {
      const matchingSamples = samples.filter((s) => s.channel === rule.channel);
      if (matchingSamples.length === 0) {
        continue;
      }

      // Check cooldown
      if (rule.lastTriggeredAt) {
        const elapsed = Date.now() - new Date(rule.lastTriggeredAt).getTime();
        if (elapsed < rule.cooldownMs) {
          continue;
        }
      }

      const latestSample = matchingSamples[matchingSamples.length - 1];
      if (this.evaluateCondition(rule.condition, latestSample.value, rule.threshold, rule.thresholdHigh)) {
        await this.fireTrigger(userId, rule, latestSample);
      }
    }
  }

  private evaluateCondition(
    condition: string,
    value: number,
    threshold: number,
    thresholdHigh?: number,
  ): boolean {
    switch (condition) {
      case 'gt': return value > threshold;
      case 'lt': return value < threshold;
      case 'gte': return value >= threshold;
      case 'lte': return value <= threshold;
      case 'eq': return value === threshold;
      case 'between': return thresholdHigh != null && value >= threshold && value <= thresholdHigh;
      case 'change': return true;
      default: return false;
    }
  }

  private async fireTrigger(
    userId: string,
    rule: WearableAutomationRule,
    sample: { channel: string; value: number; timestamp: string },
  ): Promise<void> {
    const now = new Date();

    // Update rule stats
    rule.lastTriggeredAt = now;
    rule.triggerCount += 1;
    await this.ruleRepo.save(rule);

    // Create trigger event
    const event = this.triggerRepo.create({
      userId,
      ruleId: rule.id,
      ruleName: rule.name,
      deviceId: rule.deviceId,
      channel: sample.channel,
      value: sample.value,
      condition: rule.condition,
      threshold: rule.threshold,
      action: rule.action,
      actionPayload: rule.actionPayload,
      acknowledged: false,
      triggeredAt: now,
    });

    await this.triggerRepo.save(event);
    this.logger.log(`Trigger fired: rule="${rule.name}" device=${rule.deviceId} value=${sample.value}`);
  }

  // ── Data Retention ──────────────────────────────────────────────────────────

  /**
   * Delete telemetry samples older than retentionDays.
   * Should be called periodically (e.g. daily cron) to prevent unbounded growth.
   */
  async cleanupOldSamples(retentionDays = 30): Promise<{ deleted: number }> {
    const cutoff = new Date(Date.now() - retentionDays * 86400000);
    const result = await this.sampleRepo
      .createQueryBuilder()
      .delete()
      .where('sampleTimestamp < :cutoff', { cutoff })
      .execute();

    const deleted = result.affected ?? 0;
    if (deleted > 0) {
      this.logger.log(`Cleaned up ${deleted} telemetry samples older than ${retentionDays} days`);
    }
    return { deleted };
  }

  /**
   * Delete acknowledged trigger events older than retentionDays.
   */
  async cleanupOldTriggerEvents(retentionDays = 90): Promise<{ deleted: number }> {
    const cutoff = new Date(Date.now() - retentionDays * 86400000);
    const result = await this.triggerRepo
      .createQueryBuilder()
      .delete()
      .where('acknowledged = true AND triggeredAt < :cutoff', { cutoff })
      .execute();

    const deleted = result.affected ?? 0;
    if (deleted > 0) {
      this.logger.log(`Cleaned up ${deleted} trigger events older than ${retentionDays} days`);
    }
    return { deleted };
  }
}
