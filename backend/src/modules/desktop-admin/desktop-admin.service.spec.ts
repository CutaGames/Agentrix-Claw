import { DesktopAdminService } from './desktop-admin.service';

/**
 * Stubs a TypeORM repo with a chainable QueryBuilder where each terminal
 * call (getRawMany / getRawOne) returns the configured fixture.
 */
function makeRepo(fixtures: { [k: string]: any }) {
  const callIndexBySignature: Record<string, number> = {};
  function takeFixture(sig: string) {
    const idx = callIndexBySignature[sig] || 0;
    callIndexBySignature[sig] = idx + 1;
    const list = fixtures[sig] || [];
    return list[idx] !== undefined ? list[idx] : list[list.length - 1];
  }

  const qb: any = {};
  const noop = () => qb;
  ['select', 'addSelect', 'where', 'andWhere', 'groupBy', 'addGroupBy', 'orderBy', 'limit'].forEach(
    (m) => (qb[m] = noop),
  );
  qb.getRawMany = jest.fn(async () => takeFixture('many'));
  qb.getRawOne = jest.fn(async () => takeFixture('one'));

  return {
    createQueryBuilder: jest.fn(() => qb),
  } as any;
}

describe('DesktopAdminService', () => {
  it('returns a dashboard with sane defaults when DB is empty', async () => {
    const repo = makeRepo({ many: [[], [], [], [], [], [], [], []], one: [null, null, null] });
    const service = new DesktopAdminService(repo, repo, repo);

    const r = await service.getDashboard(7);
    expect(r.windowDays).toBe(7);
    expect(r.crashStats.totalCrashes).toBe(0);
    expect(r.crashStats.crashRate).toBe(0);
    expect(r.dau.current).toBe(0);
    expect(r.alerts).toEqual([]);
  });

  it('clamps days to 1-90', async () => {
    const repo = makeRepo({ many: [[], [], [], [], [], [], []], one: [null, null, null, null] });
    const service = new DesktopAdminService(repo, repo, repo);

    const tooSmall = await service.getDashboard(0);
    expect(tooSmall.windowDays).toBe(1);

    const tooBig = await service.getDashboard(365);
    expect(tooBig.windowDays).toBe(90);
  });

  it('flags critical alert when crash rate >= 0.5%', async () => {
    // Build a stand-alone deterministic mock so we don't depend on the
    // exact ordering of getRawMany / getRawOne calls inside Promise.all.
    // We stub the public service method we care about (alerts derivation)
    // via a fresh service instance whose private methods we don't override
    // — instead we feed via dependency injection, but with a much tighter
    // scope: only crashStats matters for this assertion.

    const crashRepo = {
      createQueryBuilder: () => {
        const qb: any = {};
        const noop = () => qb;
        ['select', 'addSelect', 'where', 'andWhere', 'groupBy', 'addGroupBy', 'orderBy', 'limit'].forEach(
          (m) => (qb[m] = noop),
        );
        let manyCall = 0;
        qb.getRawMany = jest.fn(async () => {
          manyCall += 1;
          if (manyCall === 1) return [{ total: '15', devices: '10' }]; // crashStats totals
          if (manyCall === 2) return [{ fingerprint: 'a', type: 'rust_panic', sample_message: 'boom', total: '15' }];
          if (manyCall === 3) return [{ devices: '10' }]; // window DAU
          if (manyCall === 4) return [{ total: '5' }]; // prev totals
          return [];
        });
        return qb;
      },
    } as any;

    const eventsRepo = {
      createQueryBuilder: () => {
        const qb: any = {};
        const noop = () => qb;
        ['select', 'addSelect', 'where', 'andWhere', 'groupBy', 'addGroupBy', 'orderBy', 'limit'].forEach(
          (m) => (qb[m] = noop),
        );
        // crashStats DAU lookup → 10 devices; everything else → empty
        qb.getRawMany = jest.fn(async () => [{ devices: '10' }]);
        qb.getRawOne = jest.fn(async () => ({ devices: '0' }));
        return qb;
      },
    } as any;

    const downloadsRepo = {
      createQueryBuilder: () => {
        const qb: any = {};
        const noop = () => qb;
        ['select', 'addSelect', 'where', 'andWhere', 'groupBy', 'addGroupBy', 'orderBy', 'limit'].forEach(
          (m) => (qb[m] = noop),
        );
        qb.getRawMany = jest.fn(async () => []);
        qb.getRawOne = jest.fn(async () => ({ cnt: '0' }));
        return qb;
      },
    } as any;

    const service = new DesktopAdminService(crashRepo, eventsRepo, downloadsRepo);
    const r = await service.getDashboard(7);

    // 15 crashes / 10 DAU = 1.5 → way above the 0.5% threshold
    expect(r.crashStats.totalCrashes).toBe(15);
    expect(r.crashStats.crashRate).toBeGreaterThanOrEqual(0.005);
    const hasCrit = r.alerts.some((a) => a.severity === 'crit' && a.message.includes('Crash rate'));
    expect(hasCrit).toBe(true);
  });
});
