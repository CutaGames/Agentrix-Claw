import { CreationBackfillService } from './creation-backfill.service';

/**
 * Unit tests for CreationBackfillService (world-creation-feed task 12.2 / 12.5).
 *
 * 校验:
 *  - 幂等:已映射的 legacy 对象不重复建 Creation(需求 12.2)。
 *  - 维度映射:world_plot → 内容维度;aeon_plot → geo 维度(+ poi → type=shop)。
 *  - 对账:reconcile 在全部映射后返回 consistent=true(Property 6 脚手架)。
 *
 * 纯逻辑:仓储/映射用内存替身。
 */
describe('CreationBackfillService (task 12.2/12.5)', () => {
  function setup() {
    const creations: any[] = [];
    const repo = {
      create: jest.fn().mockImplementation((x: any) => x),
      save: jest.fn().mockImplementation((x: any) => {
        const row = { ...x, id: `creation_${creations.length}` };
        creations.push(row);
        return Promise.resolve(row);
      }),
    };
    // 内存 legacy 映射:(sourceType:legacyId) → creationId
    const map = new Map<string, string>();
    const legacyMap = {
      resolveCreationId: jest.fn().mockImplementation((st: string, lid: string) => Promise.resolve(map.get(`${st}:${lid}`) ?? null)),
      recordMapping: jest.fn().mockImplementation((i: any) => { map.set(`${i.sourceType}:${i.legacyId}`, i.creationId); return Promise.resolve({}); }),
    };
    const worldPlots = [
      { id: 'wp1', ownerAccountId: 'acc1', originalCreatorAccountId: 'acc1', status: 'published', title: 'Gallery', substrateTier: 'A', ecsVersionId: 'v1', boundAgentId: null, mapX: 1, mapY: 2, shareCode: 'WP1CODE' },
    ];
    const aeonPlots = [
      { id: 'ap1', ownerUserId: 'user1', status: 'active', displayName: '咖啡馆', lat: 39.9, lng: 116.4, gridCell: '39.900,116.400', poi: { name: '星巴克', category: 'cafe' } },
      { id: 'ap2', ownerUserId: 'user2', status: 'dormant', displayName: '空地', lat: 31.2, lng: 121.5, gridCell: '31.200,121.500', poi: null },
    ];
    const worldPlotRepo = {
      find: jest.fn().mockResolvedValue(worldPlots),
      count: jest.fn().mockResolvedValue(worldPlots.length),
    };
    const aeonPlotRepo = {
      find: jest.fn().mockResolvedValue(aeonPlots),
      count: jest.fn().mockResolvedValue(aeonPlots.length),
    };
    const svc = new CreationBackfillService(repo as any, legacyMap as any, worldPlotRepo as any, aeonPlotRepo as any);
    return { svc, creations, map };
  }

  it('backfillWorldPlots:内容维度映射 + 幂等', async () => {
    const { svc, creations } = setup();
    const r1 = await svc.backfillWorldPlots();
    expect(r1.scanned).toBe(1);
    expect(r1.created).toBe(1);
    expect(r1.skipped).toBe(0);
    expect(creations[0].ecsVersionId).toBe('v1');
    expect(creations[0].geo).toBeNull();
    // 再跑一次:已映射 → 全部跳过(幂等)。
    const r2 = await svc.backfillWorldPlots();
    expect(r2.created).toBe(0);
    expect(r2.skipped).toBe(1);
  });

  it('backfillAeonPlots:geo 维度映射,poi→shop,无 poi→place;dormant→unpublished', async () => {
    const { svc, creations } = setup();
    const r = await svc.backfillAeonPlots();
    expect(r.created).toBe(2);
    const cafe = creations.find((c) => c.title === '咖啡馆');
    expect(cafe.type).toBe('shop');
    expect(cafe.status).toBe('published');
    expect(cafe.geo).toEqual({ lat: 39.9, lng: 116.4, gridCell: '39.900,116.400' });
    const empty = creations.find((c) => c.title === '空地');
    expect(empty.type).toBe('place');
    expect(empty.status).toBe('unpublished');
  });

  it('reconcile:全部回填后 consistent=true', async () => {
    const { svc } = setup();
    await svc.backfillWorldPlots();
    await svc.backfillAeonPlots();
    const rec = await svc.reconcile();
    expect(rec.consistent).toBe(true);
    expect(rec.worldPlots).toEqual({ legacy: 1, mapped: 1 });
    expect(rec.aeonPlots).toEqual({ legacy: 2, mapped: 2 });
  });
});
