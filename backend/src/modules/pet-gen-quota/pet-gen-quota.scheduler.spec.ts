import { PetGenQuotaSchedulerService } from './pet-gen-quota.scheduler';
import { PetGenQuotaService } from './pet-gen-quota.service';

describe('PetGenQuotaSchedulerService (BE-T2.3)', () => {
  function makeRepo(opts: {
    countResult?: number;
    affected?: number;
    captured?: { cutoff?: Date };
  } = {}) {
    const captured = opts.captured ?? {};
    const repo: any = {
      count: jest.fn().mockResolvedValue(opts.countResult ?? 0),
      createQueryBuilder: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn(function (this: any, _sql: string, params: any) {
          captured.cutoff = params.cutoff;
          return this;
        }),
        execute: jest.fn().mockResolvedValue({ affected: opts.affected ?? 0 }),
      })),
    };
    return { repo, captured };
  }

  it('computes prevPeriod = previous UTC month', async () => {
    const { repo } = makeRepo({ countResult: 12 });
    const svc = new PetGenQuotaSchedulerService(repo);
    const now = new Date(Date.UTC(2026, 4, 1, 0, 5, 0)); // 2026-05-01
    const out = await svc.runMonthlyReset(now);
    expect(out.prevPeriod).toBe('2026-04');
    expect(out.previousRows).toBe(12);
  });

  it('handles January correctly (rolls back to previous year December)', async () => {
    const { repo } = makeRepo();
    const svc = new PetGenQuotaSchedulerService(repo);
    const now = new Date(Date.UTC(2027, 0, 1, 0, 5, 0)); // 2027-01-01
    const out = await svc.runMonthlyReset(now);
    expect(out.prevPeriod).toBe('2026-12');
  });

  it('reports releasedReserved from update query result', async () => {
    const { repo } = makeRepo({ affected: 7 });
    const svc = new PetGenQuotaSchedulerService(repo);
    const out = await svc.runMonthlyReset(new Date(Date.UTC(2026, 5, 1)));
    expect(out.releasedReserved).toBe(7);
  });

  it('uses 30-day cutoff for stale reservation release', async () => {
    const captured: { cutoff?: Date } = {};
    const { repo } = makeRepo({ captured });
    const svc = new PetGenQuotaSchedulerService(repo);
    const now = new Date(Date.UTC(2026, 5, 1, 0, 5, 0));
    await svc.runMonthlyReset(now);
    const expected = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    expect(captured.cutoff?.getTime()).toBe(expected.getTime());
  });

  it('does not throw when no rows exist for previous period', async () => {
    const { repo } = makeRepo({ countResult: 0, affected: 0 });
    const svc = new PetGenQuotaSchedulerService(repo);
    await expect(svc.runMonthlyReset()).resolves.toEqual(expect.objectContaining({
      previousRows: 0,
      releasedReserved: 0,
    }));
  });

  it('static currentPeriod uses UTC year-month', () => {
    expect(PetGenQuotaService.currentPeriod(new Date(Date.UTC(2026, 0, 15)))).toBe('2026-01');
    expect(PetGenQuotaService.currentPeriod(new Date(Date.UTC(2026, 11, 31)))).toBe('2026-12');
  });
});
