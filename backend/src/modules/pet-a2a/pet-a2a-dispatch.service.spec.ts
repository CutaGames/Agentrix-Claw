import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PetA2ADispatch } from '../../entities/pet-a2a-dispatch.entity';
import { PetEnergyState } from '../../entities/pet-energy-state.entity';
import { PetA2ADispatchService } from './pet-a2a-dispatch.service';
import { PetEnergyService, EnergyExhaustedError } from '../pet-energy/pet-energy.service';

/**
 * BE-T4.7 — pet as A2A issuer + sub-task lifecycle + recovery.
 */
describe('PetA2ADispatchService', () => {
  let svc: PetA2ADispatchService;
  let energy: PetEnergyService;
  const dispatchStore: PetA2ADispatch[] = [];
  const energyStore = new Map<string, PetEnergyState>();

  beforeEach(async () => {
    dispatchStore.length = 0;
    energyStore.clear();
    let idCounter = 0;
    const dispatchRepo: any = {
      create: (p: any) => ({ ...p, id: `d${++idCounter}`, createdAt: new Date(), updatedAt: new Date(), result: null, errorMessage: null }),
      save: async (d: any) => {
        d.updatedAt = new Date();
        const idx = dispatchStore.findIndex((x) => x.id === d.id);
        if (idx >= 0) dispatchStore[idx] = d;
        else dispatchStore.push(d);
        return d;
      },
      findOne: async ({ where }: any) => dispatchStore.find((d) => d.id === where.id) ?? null,
      find: async ({ where }: any) => {
        // emulate OR array
        const conditions = Array.isArray(where) ? where : [where];
        return dispatchStore.filter((d) =>
          conditions.some((c) => {
            if (c.status && d.status !== c.status) return false;
            if (c.updatedAt) {
              const v = c.updatedAt.value ?? c.updatedAt._value;
              if (!(d.updatedAt < v)) return false;
            }
            return true;
          }),
        );
      },
    };
    const energyRepo: any = {
      findOne: async ({ where }: any) => energyStore.get(`${where.userId}:${where.petSkinId}`) ?? null,
      save: async (s: any) => {
        s.updatedAt = new Date();
        energyStore.set(`${s.userId}:${s.petSkinId}`, s);
        return s;
      },
      create: (p: any) => ({
        userId: p.userId, petSkinId: p.petSkinId, energy: 100,
        dailyLlmCalls: 0, dailySpendCents: 0, paused: false, pausedReason: null,
        createdAt: new Date(), updatedAt: new Date(),
      }),
      update: async () => ({ affected: 0 }),
    };
    const mod = await Test.createTestingModule({
      providers: [
        PetA2ADispatchService,
        PetEnergyService,
        { provide: getRepositoryToken(PetA2ADispatch), useValue: dispatchRepo },
        { provide: getRepositoryToken(PetEnergyState), useValue: energyRepo },
      ],
    }).compile();
    svc = mod.get(PetA2ADispatchService);
    energy = mod.get(PetEnergyService);
  });

  it('dispatches and consumes energy', async () => {
    const d = await svc.dispatch({
      userId: 'u1', petSkinId: 'p1',
      taskName: 'fetch_summary', targetAgentId: 'worker-a',
      rewardCents: 10,
    });
    expect(d.status).toBe('queued');
    const e = await energy.getState('u1', 'p1');
    expect(e.energy).toBe(95);
  });

  it('rejects dispatch when energy exhausted', async () => {
    const e = await energy.getState('u1', 'p1');
    e.energy = 1;
    await energyStore.set('u1:p1', e);
    await expect(
      svc.dispatch({ userId: 'u1', petSkinId: 'p1', taskName: 't', targetAgentId: 'w' }),
    ).rejects.toBeInstanceOf(EnergyExhaustedError);
  });

  it('lifecycle: queued -> running -> completed', async () => {
    const d = await svc.dispatch({ userId: 'u1', petSkinId: 'p1', taskName: 't', targetAgentId: 'w' });
    const r = await svc.markRunning(d.id, 'u1');
    expect(r.status).toBe('running');
    const c = await svc.complete(d.id, 'u1', { ok: true });
    expect(c.status).toBe('completed');
    expect(c.result).toEqual({ ok: true });
  });

  it('cannot complete by another user', async () => {
    const d = await svc.dispatch({ userId: 'u1', petSkinId: 'p1', taskName: 't', targetAgentId: 'w' });
    await expect(svc.complete(d.id, 'attacker', {})).rejects.toThrow(/not your dispatch/);
  });

  it('recoverStale marks queued/running older than timeout as recovered', async () => {
    const d = await svc.dispatch({ userId: 'u1', petSkinId: 'p1', taskName: 't', targetAgentId: 'w' });
    // Force the dispatch to look old
    d.updatedAt = new Date(Date.now() - 10 * 60 * 1000);
    const recovered = await svc.recoverStale(5 * 60 * 1000);
    expect(recovered).toBe(1);
    const after = dispatchStore.find((x) => x.id === d.id);
    expect(after?.status).toBe('recovered');
  });

  it('fail records errorMessage', async () => {
    const d = await svc.dispatch({ userId: 'u1', petSkinId: 'p1', taskName: 't', targetAgentId: 'w' });
    const f = await svc.fail(d.id, 'u1', 'worker_offline');
    expect(f.status).toBe('failed');
    expect(f.errorMessage).toBe('worker_offline');
  });
});
