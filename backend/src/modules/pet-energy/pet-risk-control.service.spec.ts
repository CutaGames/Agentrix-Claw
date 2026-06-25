import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PetLlmUsageEvent } from '../../entities/pet-llm-usage-event.entity';
import { PetEnergyState } from '../../entities/pet-energy-state.entity';
import { PetRiskControlService, RISK_CALL_THRESHOLD } from './pet-risk-control.service';
import { PetEnergyService, ENERGY_MAX } from './pet-energy.service';

/**
 * BE-T4.9 / PF-4.3 — 1h LLM call rate threshold → pause + alert.
 */
describe('PetRiskControlService', () => {
  let svc: PetRiskControlService;
  let energySvc: PetEnergyService;
  let events: any[] = [];
  let energyStore: Map<string, PetEnergyState>;

  beforeEach(async () => {
    events = [];
    energyStore = new Map();
    const eventsRepo: any = {
      create: (p: any) => ({ ...p, id: `e${events.length}`, createdAt: new Date() }),
      save: async (e: any) => {
        events.push(e);
        return e;
      },
      count: async ({ where }: any) => {
        const since = where.createdAt._value as Date; // MoreThan stores via _value? fallback below
        return events.filter(
          (e) =>
            e.userId === where.userId &&
            e.petSkinId === where.petSkinId &&
            e.createdAt > (since instanceof Date ? since : new Date()),
        ).length;
      },
    };
    // typeorm MoreThan returns FindOperator; emulate by using e.createdAt > now-1h
    eventsRepo.count = async ({ where }: any) => {
      const op = where.createdAt;
      const value = op?.value ?? op?._value ?? new Date(Date.now() - 3_600_000);
      return events.filter(
        (e) => e.userId === where.userId && e.petSkinId === where.petSkinId && e.createdAt > value,
      ).length;
    };
    const energyRepo: any = {
      findOne: async ({ where }: any) =>
        energyStore.get(`${where.userId}:${where.petSkinId}`) ?? null,
      save: async (s: any) => {
        s.updatedAt = new Date();
        energyStore.set(`${s.userId}:${s.petSkinId}`, s);
        return s;
      },
      create: (p: any) => ({
        userId: p.userId,
        petSkinId: p.petSkinId,
        energy: ENERGY_MAX,
        dailyLlmCalls: 0,
        dailySpendCents: 0,
        paused: false,
        pausedReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      update: async () => ({ affected: 0 }),
    };
    const mod = await Test.createTestingModule({
      providers: [
        PetRiskControlService,
        PetEnergyService,
        { provide: getRepositoryToken(PetLlmUsageEvent), useValue: eventsRepo },
        { provide: getRepositoryToken(PetEnergyState), useValue: energyRepo },
      ],
    }).compile();
    svc = mod.get(PetRiskControlService);
    energySvc = mod.get(PetEnergyService);
  });

  it('does not trigger when calls below threshold', async () => {
    const a = await svc.recordCall('u1', 'p1', 'gpt', 1);
    expect(a.triggered).toBe(false);
    expect(a.threshold).toBe(RISK_CALL_THRESHOLD);
    const state = await energySvc.getState('u1', 'p1');
    expect(state.paused).toBe(false);
  });

  it('triggers + pauses pet when ≥100 calls in last hour (BE-T4.9)', async () => {
    for (let i = 0; i < 99; i++) {
      events.push({
        userId: 'u1', petSkinId: 'p1', model: 'm', costCents: 1, createdAt: new Date(),
      });
    }
    const a = await svc.recordCall('u1', 'p1', 'm', 1);
    expect(a.callsLastHour).toBeGreaterThanOrEqual(100);
    expect(a.triggered).toBe(true);
    const state = await energySvc.getState('u1', 'p1');
    expect(state.paused).toBe(true);
    expect(state.pausedReason).toMatch(/llm_rate_/);
  });

  it('ignores events outside the 1-hour window', async () => {
    for (let i = 0; i < 200; i++) {
      events.push({
        userId: 'u1', petSkinId: 'p1', model: 'm', costCents: 1,
        createdAt: new Date(Date.now() - 2 * 3_600_000), // 2h old
      });
    }
    const a = await svc.recordCall('u1', 'p1', 'm', 1);
    expect(a.callsLastHour).toBe(1);
    expect(a.triggered).toBe(false);
  });
});
