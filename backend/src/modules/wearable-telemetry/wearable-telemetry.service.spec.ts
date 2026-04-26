import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WearableTelemetryService } from './wearable-telemetry.service';
import {
  WearableTelemetrySample,
  WearableAutomationRule,
  WearableTriggerEvent,
} from '../../entities/wearable-telemetry.entity';
import {
  TelemetryChannel,
  TriggerAction,
  TriggerCondition,
} from './dto/wearable-telemetry.dto';

// ── Mock helpers ──────────────────────────────────────────────────────────────

function mockRepo() {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockImplementation((dto) => ({ id: 'mock-id', createdAt: new Date(), updatedAt: new Date(), ...dto })),
    save: jest.fn().mockImplementation((entity) => {
      if (Array.isArray(entity)) {
        return Promise.resolve(entity.map((e, i) => ({ id: `mock-${i}`, ...e })));
      }
      return Promise.resolve({ id: 'mock-id', createdAt: new Date(), updatedAt: new Date(), ...entity });
    }),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getRawMany: jest.fn().mockResolvedValue([]),
    }),
  };
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('WearableTelemetryService', () => {
  let service: WearableTelemetryService;
  let sampleRepo: ReturnType<typeof mockRepo>;
  let ruleRepo: ReturnType<typeof mockRepo>;
  let triggerRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    sampleRepo = mockRepo();
    ruleRepo = mockRepo();
    triggerRepo = mockRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WearableTelemetryService,
        { provide: getRepositoryToken(WearableTelemetrySample), useValue: sampleRepo },
        { provide: getRepositoryToken(WearableAutomationRule), useValue: ruleRepo },
        { provide: getRepositoryToken(WearableTriggerEvent), useValue: triggerRepo },
      ],
    }).compile();

    service = module.get<WearableTelemetryService>(WearableTelemetryService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── Upload Samples ────────────────────────────────────────────────────────

  describe('uploadSamples', () => {
    it('should create and save telemetry samples', async () => {
      ruleRepo.find.mockResolvedValue([]); // no rules to evaluate

      const result = await service.uploadSamples('user-1', {
        deviceId: 'dev-1',
        deviceName: 'My Ring',
        samples: [
          { channel: TelemetryChannel.HEART_RATE, value: 72, unit: 'bpm', timestamp: new Date().toISOString() },
          { channel: TelemetryChannel.SPO2, value: 98, unit: '%', timestamp: new Date().toISOString() },
        ],
      } as any);

      expect(result.inserted).toBe(2);
      expect(sampleRepo.create).toHaveBeenCalledTimes(2);
      expect(sampleRepo.save).toHaveBeenCalled();
    });

    it('should evaluate automation rules after upload', async () => {
      const mockRule = {
        id: 'rule-1',
        userId: 'user-1',
        deviceId: 'dev-1',
        channel: 'heart_rate',
        condition: 'gt',
        threshold: 100,
        cooldownMs: 300000,
        enabled: true,
        triggerCount: 0,
        lastTriggeredAt: null,
        name: 'High HR Alert',
        action: 'notify',
        actionPayload: {},
      };
      ruleRepo.find.mockResolvedValue([mockRule]);

      await service.uploadSamples('user-1', {
        deviceId: 'dev-1',
        deviceName: 'Ring',
        samples: [
          { channel: TelemetryChannel.HEART_RATE, value: 120, unit: 'bpm', timestamp: new Date().toISOString() },
        ],
      } as any);

      // Rule should fire because 120 > 100
      expect(ruleRepo.save).toHaveBeenCalled();
      expect(triggerRepo.create).toHaveBeenCalled();
      expect(triggerRepo.save).toHaveBeenCalled();
    });

    it('should NOT fire rule when condition is not met', async () => {
      const mockRule = {
        id: 'rule-1',
        userId: 'user-1',
        deviceId: 'dev-1',
        channel: 'heart_rate',
        condition: 'gt',
        threshold: 100,
        cooldownMs: 300000,
        enabled: true,
        triggerCount: 0,
        lastTriggeredAt: null,
        name: 'High HR',
        action: 'notify',
        actionPayload: {},
      };
      ruleRepo.find.mockResolvedValue([mockRule]);

      await service.uploadSamples('user-1', {
        deviceId: 'dev-1',
        deviceName: 'Ring',
        samples: [
          { channel: TelemetryChannel.HEART_RATE, value: 70, unit: 'bpm', timestamp: new Date().toISOString() },
        ],
      } as any);

      // Rule should NOT fire because 70 < 100
      expect(triggerRepo.create).not.toHaveBeenCalled();
    });

    it('should respect cooldown period', async () => {
      const mockRule = {
        id: 'rule-1',
        userId: 'user-1',
        deviceId: 'dev-1',
        channel: 'heart_rate',
        condition: 'gt',
        threshold: 100,
        cooldownMs: 300000,
        enabled: true,
        triggerCount: 1,
        lastTriggeredAt: new Date(), // Just triggered
        name: 'High HR',
        action: 'notify',
        actionPayload: {},
      };
      ruleRepo.find.mockResolvedValue([mockRule]);

      await service.uploadSamples('user-1', {
        deviceId: 'dev-1',
        deviceName: 'Ring',
        samples: [
          { channel: TelemetryChannel.HEART_RATE, value: 120, unit: 'bpm', timestamp: new Date().toISOString() },
        ],
      } as any);

      // Rule should NOT fire because cooldown has not elapsed
      expect(triggerRepo.create).not.toHaveBeenCalled();
    });
  });

  // ── Query Samples ─────────────────────────────────────────────────────────

  describe('querySamples', () => {
    it('should build query with filters', async () => {
      const qb = sampleRepo.createQueryBuilder();

      await service.querySamples('user-1', {
        deviceId: 'dev-1',
        channel: TelemetryChannel.HEART_RATE,
        limit: 50,
      });

      expect(sampleRepo.createQueryBuilder).toHaveBeenCalledWith('s');
      expect(qb.where).toHaveBeenCalled();
      expect(qb.andWhere).toHaveBeenCalledTimes(2); // deviceId + channel
      expect(qb.take).toHaveBeenCalledWith(50);
    });

    it('should use default limit of 100', async () => {
      const qb = sampleRepo.createQueryBuilder();

      await service.querySamples('user-1', {});

      expect(qb.take).toHaveBeenCalledWith(100);
    });
  });

  // ── getLatestByDevice ─────────────────────────────────────────────────────

  describe('getLatestByDevice', () => {
    it('should return latest values per channel', async () => {
      sampleRepo.findOne.mockImplementation(async ({ where }) => {
        if (where.channel === 'heart_rate') {
          return { value: 72, unit: 'bpm', sampleTimestamp: new Date() };
        }
        if (where.channel === 'battery') {
          return { value: 85, unit: '%', sampleTimestamp: new Date() };
        }
        return null;
      });

      const result = await service.getLatestByDevice('user-1', 'dev-1');

      expect(result.heart_rate).toBeDefined();
      expect(result.heart_rate.value).toBe(72);
      expect(result.battery).toBeDefined();
      expect(result.battery.value).toBe(85);
      expect(result.spo2).toBeUndefined();
    });
  });

  // ── Stats ─────────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('should return aggregated stats', async () => {
      sampleRepo.count.mockResolvedValue(150);
      sampleRepo.createQueryBuilder().getRawMany.mockResolvedValue([
        { channel: 'heart_rate', count: '100' },
        { channel: 'spo2', count: '50' },
      ]);
      sampleRepo.findOne
        .mockResolvedValueOnce({ sampleTimestamp: new Date('2025-01-01') })
        .mockResolvedValueOnce({ sampleTimestamp: new Date('2025-03-01') });

      const result = await service.getStats('user-1', 'dev-1');

      expect(result.totalSamples).toBe(150);
      expect(result.channelCounts.heart_rate).toBe(100);
      expect(result.channelCounts.spo2).toBe(50);
      expect(result.oldestSample).toEqual(new Date('2025-01-01'));
      expect(result.newestSample).toEqual(new Date('2025-03-01'));
    });
  });

  // ── Automation Rules ──────────────────────────────────────────────────────

  describe('createRule', () => {
    it('should create a new automation rule', async () => {
      const result = await service.createRule('user-1', {
        name: 'High HR Alert',
        deviceId: 'dev-1',
        channel: TelemetryChannel.HEART_RATE,
        condition: TriggerCondition.GT,
        threshold: 100,
        action: TriggerAction.NOTIFY_AGENT,
      });

      expect(result).toBeDefined();
      expect(ruleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          name: 'High HR Alert',
          enabled: true,
          channel: 'heart_rate',
          condition: 'gt',
          threshold: 100,
          triggerCount: 0,
        }),
      );
      expect(ruleRepo.save).toHaveBeenCalled();
    });

    it('should use default cooldownMs of 300000', async () => {
      await service.createRule('user-1', {
        name: 'Test',
        deviceId: 'dev-1',
        channel: TelemetryChannel.TEMPERATURE,
        condition: TriggerCondition.GT,
        threshold: 38,
        action: TriggerAction.NOTIFY_AGENT,
      });

      expect(ruleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ cooldownMs: 300000 }),
      );
    });
  });

  describe('listRules', () => {
    it('should list rules for user', async () => {
      ruleRepo.find.mockResolvedValue([{ id: 'r1', name: 'Test' }]);

      const result = await service.listRules('user-1');

      expect(result).toHaveLength(1);
      expect(ruleRepo.find).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        order: { createdAt: 'DESC' },
      });
    });

    it('should filter by deviceId when provided', async () => {
      await service.listRules('user-1', 'dev-1');

      expect(ruleRepo.find).toHaveBeenCalledWith({
        where: { userId: 'user-1', deviceId: 'dev-1' },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('updateRule', () => {
    it('should update existing rule', async () => {
      ruleRepo.findOne.mockResolvedValue({ id: 'r1', name: 'Old', threshold: 80 });

      const result = await service.updateRule('user-1', 'r1', { threshold: 90 });

      expect(result).toBeDefined();
      expect(ruleRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ threshold: 90 }),
      );
    });

    it('should return null if rule not found', async () => {
      ruleRepo.findOne.mockResolvedValue(null);

      const result = await service.updateRule('user-1', 'nope', { threshold: 90 });

      expect(result).toBeNull();
    });
  });

  describe('deleteRule', () => {
    it('should delete a rule', async () => {
      ruleRepo.delete.mockResolvedValue({ affected: 1 });

      const result = await service.deleteRule('user-1', 'r1');

      expect(result).toBe(true);
      expect(ruleRepo.delete).toHaveBeenCalledWith({ id: 'r1', userId: 'user-1' });
    });

    it('should return false if rule not found', async () => {
      ruleRepo.delete.mockResolvedValue({ affected: 0 });

      const result = await service.deleteRule('user-1', 'nope');

      expect(result).toBe(false);
    });
  });

  describe('toggleRule', () => {
    it('should toggle enabled state', async () => {
      ruleRepo.findOne.mockResolvedValue({ id: 'r1', enabled: true });

      const result = await service.toggleRule('user-1', 'r1');

      expect(ruleRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false }),
      );
    });

    it('should return null if rule not found', async () => {
      ruleRepo.findOne.mockResolvedValue(null);

      const result = await service.toggleRule('user-1', 'nope');

      expect(result).toBeNull();
    });
  });

  // ── Trigger Events ────────────────────────────────────────────────────────

  describe('listTriggerEvents', () => {
    it('should list trigger events', async () => {
      triggerRepo.find.mockResolvedValue([{ id: 'e1' }, { id: 'e2' }]);

      const result = await service.listTriggerEvents('user-1');

      expect(result).toHaveLength(2);
      expect(triggerRepo.find).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        order: { triggeredAt: 'DESC' },
        take: 50,
      });
    });

    it('should respect custom limit', async () => {
      await service.listTriggerEvents('user-1', 10);

      expect(triggerRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 }),
      );
    });
  });

  describe('registerVerificationEvent', () => {
    it('should create an agent-facing trigger event from wearable verification', async () => {
      const result = await service.registerVerificationEvent('user-1', {
        type: 'wearable.phase1_verified',
        source: 'wearable',
        deviceId: 'ring-1',
        deviceName: 'Smart Ring',
        services: ['Battery', 'Heart Rate'],
        firstReadableCharacteristicUuid: '2a19',
        payloadPreview: 'AQID',
        kind: 'ring',
        supportTier: 'ready',
      });

      expect(result).toBeDefined();
      expect(triggerRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          ruleName: 'Wearable verification',
          deviceId: 'ring-1',
          channel: 'custom',
          action: 'update_context',
          actionPayload: expect.objectContaining({
            eventType: 'wearable.phase1_verified',
            deviceName: 'Smart Ring',
            services: ['Battery', 'Heart Rate'],
          }),
        }),
      );
      expect(triggerRepo.save).toHaveBeenCalled();
    });
  });

  describe('acknowledgeTrigger', () => {
    it('should acknowledge a trigger event', async () => {
      triggerRepo.update.mockResolvedValue({ affected: 1 });

      const result = await service.acknowledgeTrigger('user-1', 'e1');

      expect(result).toBe(true);
      expect(triggerRepo.update).toHaveBeenCalledWith(
        { id: 'e1', userId: 'user-1' },
        { acknowledged: true },
      );
    });

    it('should return false if event not found', async () => {
      triggerRepo.update.mockResolvedValue({ affected: 0 });

      const result = await service.acknowledgeTrigger('user-1', 'nope');

      expect(result).toBe(false);
    });
  });

  describe('getUnacknowledgedCount', () => {
    it('should return count of unacknowledged events', async () => {
      triggerRepo.count.mockResolvedValue(3);

      const result = await service.getUnacknowledgedCount('user-1');

      expect(result).toBe(3);
      expect(triggerRepo.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', acknowledged: false },
      });
    });
  });

  // ── Condition Evaluation (via uploadSamples + rule) ───────────────────────

  describe('condition evaluation', () => {
    const makeRule = (condition: string, threshold: number, thresholdHigh?: number) => ({
      id: 'rule-1',
      userId: 'user-1',
      deviceId: 'dev-1',
      channel: 'temperature',
      condition,
      threshold,
      thresholdHigh,
      cooldownMs: 0, // no cooldown for testing
      enabled: true,
      triggerCount: 0,
      lastTriggeredAt: null,
      name: 'Test Rule',
      action: 'notify',
      actionPayload: {},
    });

    const uploadSample = (value: number) =>
      service.uploadSamples('user-1', {
        deviceId: 'dev-1',
        deviceName: 'Sensor',
        samples: [{ channel: TelemetryChannel.TEMPERATURE, value, unit: '°C', timestamp: new Date().toISOString() }],
      } as any);

    it('gt: should fire when value > threshold', async () => {
      ruleRepo.find.mockResolvedValue([makeRule('gt', 37.5)]);
      await uploadSample(38.0);
      expect(triggerRepo.create).toHaveBeenCalled();
    });

    it('lt: should fire when value < threshold', async () => {
      ruleRepo.find.mockResolvedValue([makeRule('lt', 36.0)]);
      await uploadSample(35.5);
      expect(triggerRepo.create).toHaveBeenCalled();
    });

    it('gte: should fire when value >= threshold', async () => {
      ruleRepo.find.mockResolvedValue([makeRule('gte', 37.0)]);
      await uploadSample(37.0);
      expect(triggerRepo.create).toHaveBeenCalled();
    });

    it('lte: should fire when value <= threshold', async () => {
      ruleRepo.find.mockResolvedValue([makeRule('lte', 36.0)]);
      await uploadSample(36.0);
      expect(triggerRepo.create).toHaveBeenCalled();
    });

    it('eq: should fire when value === threshold', async () => {
      ruleRepo.find.mockResolvedValue([makeRule('eq', 37.0)]);
      await uploadSample(37.0);
      expect(triggerRepo.create).toHaveBeenCalled();
    });

    it('between: should fire when value in range', async () => {
      ruleRepo.find.mockResolvedValue([makeRule('between', 36.0, 38.0)]);
      await uploadSample(37.0);
      expect(triggerRepo.create).toHaveBeenCalled();
    });

    it('between: should NOT fire when value out of range', async () => {
      ruleRepo.find.mockResolvedValue([makeRule('between', 36.0, 38.0)]);
      await uploadSample(39.0);
      expect(triggerRepo.create).not.toHaveBeenCalled();
    });

    it('unknown condition should not fire', async () => {
      ruleRepo.find.mockResolvedValue([makeRule('unknown_op', 37.0)]);
      await uploadSample(37.0);
      expect(triggerRepo.create).not.toHaveBeenCalled();
    });
  });
});
