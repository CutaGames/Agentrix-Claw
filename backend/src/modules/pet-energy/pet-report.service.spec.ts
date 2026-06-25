import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PetLlmUsageEvent } from '../../entities/pet-llm-usage-event.entity';
import { PetA2ADispatch } from '../../entities/pet-a2a-dispatch.entity';
import { PetEnergyState } from '../../entities/pet-energy-state.entity';
import { PetReportService } from './pet-report.service';

/**
 * BE-T4.8 — daily report aggregator.
 */
describe('PetReportService', () => {
  let svc: PetReportService;

  beforeEach(async () => {
    const usageEvents = [
      { userId: 'u1', petSkinId: 'p1', model: 'm', costCents: 5, createdAt: new Date() },
      { userId: 'u1', petSkinId: 'p1', model: 'm', costCents: 7, createdAt: new Date() },
      { userId: 'u1', petSkinId: 'p1', model: 'm', costCents: 1, createdAt: new Date(Date.now() - 48 * 3_600_000) }, // out of window
    ];
    const dispatches = [
      { id: 'd1', userId: 'u1', petSkinId: 'p1', status: 'completed', rewardCents: 100, createdAt: new Date() },
      { id: 'd2', userId: 'u1', petSkinId: 'p1', status: 'failed', rewardCents: 50, createdAt: new Date() },
      { id: 'd3', userId: 'u1', petSkinId: 'p1', status: 'completed', rewardCents: 25, createdAt: new Date() },
    ];
    const energyStates = [
      { userId: 'u1', petSkinId: 'p1', energy: 73, paused: false },
    ];
    const filterByWindow = (rows: any[], where: any) => {
      const between = where.createdAt;
      const value = between?._value ?? between?.value;
      const [from, to] = Array.isArray(value) ? value : [new Date(0), new Date()];
      return rows.filter(
        (r) =>
          r.userId === where.userId &&
          r.petSkinId === where.petSkinId &&
          r.createdAt >= from &&
          r.createdAt <= to,
      );
    };
    const usageRepo: any = { find: async ({ where }: any) => filterByWindow(usageEvents, where) };
    const dispatchRepo: any = { find: async ({ where }: any) => filterByWindow(dispatches, where) };
    const energyRepo: any = {
      findOne: async ({ where }: any) =>
        energyStates.find((e) => e.userId === where.userId && e.petSkinId === where.petSkinId) ?? null,
    };

    const mod = await Test.createTestingModule({
      providers: [
        PetReportService,
        { provide: getRepositoryToken(PetLlmUsageEvent), useValue: usageRepo },
        { provide: getRepositoryToken(PetA2ADispatch), useValue: dispatchRepo },
        { provide: getRepositoryToken(PetEnergyState), useValue: energyRepo },
      ],
    }).compile();
    svc = mod.get(PetReportService);
  });

  it('aggregates llm calls + cost + dispatches + reward', async () => {
    const r = await svc.generateDailyReport('u1', 'p1');
    expect(r.llmCalls).toBe(2); // out-of-window event excluded
    expect(r.llmCostCents).toBe(12);
    expect(r.dispatches).toBe(3);
    expect(r.dispatchesCompleted).toBe(2);
    expect(r.dispatchesFailed).toBe(1);
    expect(r.rewardEarnedCents).toBe(125); // only completed
    expect(r.energyAtEnd).toBe(73);
    expect(r.paused).toBe(false);
  });

  it('returns zero when no data', async () => {
    const r = await svc.generateDailyReport('uX', 'pX');
    expect(r.llmCalls).toBe(0);
    expect(r.dispatches).toBe(0);
    expect(r.rewardEarnedCents).toBe(0);
    expect(r.energyAtEnd).toBe(0);
  });
});
