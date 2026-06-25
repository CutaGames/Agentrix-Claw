import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PetEnergyState } from '../../entities/pet-energy-state.entity';
import {
  PetEnergyService,
  EnergyExhaustedError,
  DailyBudgetExceededError,
  PetPausedError,
  ENERGY_MAX,
} from './pet-energy.service';

/**
 * BE-T4.6 — energy regen + exhaustion + pause + daily budget gate.
 */
describe('PetEnergyService', () => {
  let service: PetEnergyService;
  let repo: jest.Mocked<Pick<Repository<PetEnergyState>, 'findOne' | 'save' | 'create' | 'update'>>;
  let store: Map<string, PetEnergyState>;

  const key = (u: string, p: string) => `${u}:${p}`;

  beforeEach(async () => {
    store = new Map();
    repo = {
      findOne: jest.fn(async ({ where }: any) => store.get(key(where.userId, where.petSkinId)) ?? null) as any,
      save: jest.fn(async (s: any) => {
        s.updatedAt = s.updatedAt ?? new Date();
        store.set(key(s.userId, s.petSkinId), s);
        return s;
      }) as any,
      create: jest.fn((p: any) => ({
        userId: p.userId,
        petSkinId: p.petSkinId,
        energy: p.energy ?? ENERGY_MAX,
        dailyLlmCalls: 0,
        dailySpendCents: 0,
        paused: false,
        pausedReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })) as any,
      update: jest.fn(async (_filter: any, patch: any) => {
        let n = 0;
        for (const v of store.values()) {
          Object.assign(v, patch);
          n++;
        }
        return { affected: n } as any;
      }) as any,
    };

    const mod = await Test.createTestingModule({
      providers: [
        PetEnergyService,
        { provide: getRepositoryToken(PetEnergyState), useValue: repo },
      ],
    }).compile();
    service = mod.get(PetEnergyService);
  });

  it('initializes new pet at full energy', async () => {
    const s = await service.getState('u1', 'p1');
    expect(s.energy).toBe(100);
    expect(s.paused).toBe(false);
  });

  it('regenerates +10/hour up to max', async () => {
    const s = await service.getState('u1', 'p1');
    s.energy = 30;
    s.updatedAt = new Date(Date.now() - 3 * 3_600_000); // 3 hours ago
    await repo.save(s);
    const after = await service.getState('u1', 'p1');
    expect(after.energy).toBe(60); // 30 + 30
  });

  it('caps regen at MAX', async () => {
    const s = await service.getState('u1', 'p1');
    s.energy = 90;
    s.updatedAt = new Date(Date.now() - 24 * 3_600_000);
    await repo.save(s);
    const after = await service.getState('u1', 'p1');
    expect(after.energy).toBe(100);
  });

  it('consume reduces energy by cost (default 5)', async () => {
    await service.getState('u1', 'p1');
    const after = await service.consume('u1', 'p1');
    expect(after.energy).toBe(95);
  });

  it('throws EnergyExhaustedError when energy below cost (BE-T4.6 / E2E-4.4)', async () => {
    const s = await service.getState('u1', 'p1');
    s.energy = 2;
    await repo.save(s);
    await expect(service.consume('u1', 'p1', { energyCost: 5 })).rejects.toBeInstanceOf(
      EnergyExhaustedError,
    );
  });

  it('throws DailyBudgetExceededError when est cost exceeds budget (BE-T4.5)', async () => {
    await service.getState('u1', 'p1');
    await expect(
      service.consume('u1', 'p1', { estCostCents: 600, budgetCents: 500 }),
    ).rejects.toBeInstanceOf(DailyBudgetExceededError);
  });

  it('throws PetPausedError when pet is paused', async () => {
    await service.pause('u1', 'p1', 'test_reason');
    await expect(service.consume('u1', 'p1')).rejects.toBeInstanceOf(PetPausedError);
  });

  it('resume clears paused flag', async () => {
    await service.pause('u1', 'p1', 'x');
    const s = await service.resume('u1', 'p1');
    expect(s.paused).toBe(false);
    expect(s.pausedReason).toBeNull();
  });

  it('resetDailyCounters zeroes spend + calls across all states', async () => {
    const a = await service.getState('u1', 'p1');
    a.dailySpendCents = 200;
    a.dailyLlmCalls = 7;
    await repo.save(a);
    const b = await service.getState('u2', 'p2');
    b.dailySpendCents = 50;
    await repo.save(b);
    const n = await service.resetDailyCounters();
    expect(n).toBe(2);
    expect((await service.getState('u1', 'p1')).dailySpendCents).toBe(0);
    expect((await service.getState('u2', 'p2')).dailyLlmCalls).toBe(0);
  });
});
