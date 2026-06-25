import { CreationDiscoveryService } from './creation-discovery.service';
import {
  CreationRepository,
  DiscoveryBbox,
} from '../creation.repository';
import {
  CreationStateMachine,
  DISCOVERABLE_STATUSES,
} from '../creation-state-machine';
import { CreationEntity } from '../entities/creation.entity';
import { CreationCapabilityManifestEntity } from '../entities/creation-capability-manifest.entity';
import { AgentAccount } from '../../../entities/agent-account.entity';
import { toGridCell } from '../../../../shared/types/aeon-world';
import type {
  CreationStatus,
  CreationType,
  CreationVerb,
  Offering,
} from '../../../../shared/types/creation';

/**
 * CreationDiscoveryService 单元测试(world-creation-feed task 3.1)。
 *
 * 覆盖:
 *  - 仅可发现状态(published/listed)进入任一发现面(Property 4,需求 3.1/3.4);
 *  - 地图模式 bbox / 中心+半径过滤(需求 4.1);
 *  - 创作流游标分页 + 排序(newest/hot/nearby,需求 5.1/5.6);
 *  - Agent 检索动词过滤 + 能力清单挂载(需求 13.1)。
 *
 * 采用忠实内存仓库替身:其发现查询方法**镜像真实 SQL 语义**(可发现状态收敛 +
 * bbox/动词/类型粗过滤),以便服务层逻辑(精筛/排序/游标/投影/清单挂载)被完整验证。
 */

let seq = 0;
function makeCreation(overrides: Partial<CreationEntity> = {}): CreationEntity {
  const id = overrides.id ?? `creation-${++seq}`;
  return {
    id,
    ownerAccountId: 'owner-1',
    originalCreatorAccountId: 'owner-1',
    type: 'place' as CreationType,
    status: 'published' as CreationStatus,
    title: '咖啡馆',
    summary: null,
    substrateTier: 'A',
    ecsVersionId: 'ecs-1',
    boundAgentId: null,
    geo: null,
    geoGridCell: null,
    poi: null,
    preview: { kind: 'cover', url: 'https://cdn.example/c.png' },
    offerings: [],
    manifestVersion: 1,
    shareCode: 'CODE0001',
    metrics: { views: 0, likes: 0, sales: 0, comments: 0 },
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as CreationEntity;
}

function withGeo(
  overrides: Partial<CreationEntity>,
  lat: number,
  lng: number,
): CreationEntity {
  return makeCreation({
    ...overrides,
    geo: { lat, lng, gridCell: toGridCell(lat, lng) },
    geoGridCell: toGridCell(lat, lng),
  });
}

function offering(id: string, verbs: CreationVerb[], price?: Offering['price']): Offering {
  return { id, kind: 'product', name: id, verbs, price };
}

/**
 * 忠实内存仓库 —— 镜像真实仓储的发现查询 SQL 语义:
 * 各方法都先按 DISCOVERABLE_STATUSES 收敛(审核前置),再做结构化粗过滤。
 */
class FakeCreationRepo {
  rows: CreationEntity[] = [];

  seed(...entities: CreationEntity[]): void {
    this.rows.push(...entities);
  }

  private discoverable(): CreationEntity[] {
    return this.rows.filter((c) => DISCOVERABLE_STATUSES.has(c.status));
  }

  async findDiscoverableInBbox(
    bbox: DiscoveryBbox,
    type?: CreationType,
  ): Promise<CreationEntity[]> {
    return this.discoverable().filter((c) => {
      if (!c.geo) return false;
      if (type && c.type !== type) return false;
      return (
        c.geo.lat >= bbox.minLat &&
        c.geo.lat <= bbox.maxLat &&
        c.geo.lng >= bbox.minLng &&
        c.geo.lng <= bbox.maxLng
      );
    });
  }

  async findDiscoverableCandidates(opts?: {
    type?: CreationType;
    limit?: number;
  }): Promise<CreationEntity[]> {
    let out = this.discoverable();
    if (opts?.type) out = out.filter((c) => c.type === opts.type);
    out = [...out].sort(
      (a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime(),
    );
    return out.slice(0, opts?.limit ?? 1000);
  }

  async findDiscoverableForAgent(opts?: {
    verbs?: CreationVerb[];
    type?: CreationType;
    limit?: number;
  }): Promise<CreationEntity[]> {
    let out = this.discoverable();
    if (opts?.type) out = out.filter((c) => c.type === opts.type);
    for (const verb of opts?.verbs ?? []) {
      out = out.filter((c) =>
        (c.offerings ?? []).some((o) => o.verbs.includes(verb)),
      );
    }
    return out.slice(0, opts?.limit ?? 1000);
  }
}

/** 内存 manifest 仓库:仅实现 find({ where: { creationId: In(...), isActive } })。 */
class FakeManifestRepo {
  rows: CreationCapabilityManifestEntity[] = [];

  seed(...entities: CreationCapabilityManifestEntity[]): void {
    this.rows.push(...entities);
  }

  async find(opts: {
    where: { creationId: { _value: string[] }; isActive: boolean };
  }): Promise<CreationCapabilityManifestEntity[]> {
    // In(ids) 在 TypeORM 里是 FindOperator;此处直接读其内部值数组以镜像语义。
    const ids: string[] = (opts.where.creationId as any)._value ?? [];
    return this.rows.filter(
      (r) => ids.includes(r.creationId) && r.isActive === opts.where.isActive,
    );
  }
}

/** 内存账户仓库:仅实现 find({ where: { id: In(...) } })。 */
class FakeAccountRepo {
  rows: AgentAccount[] = [];

  seed(...accounts: AgentAccount[]): void {
    this.rows.push(...accounts);
  }

  async find(opts: { where: { id: { _value: string[] } } }): Promise<AgentAccount[]> {
    const ids: string[] = (opts.where.id as any)._value ?? [];
    return this.rows.filter((a) => ids.includes(a.id));
  }
}

interface Harness {
  service: CreationDiscoveryService;
  repo: FakeCreationRepo;
  manifestRepo: FakeManifestRepo;
  accountRepo: FakeAccountRepo;
}

function makeHarness(): Harness {
  const repo = new FakeCreationRepo();
  const manifestRepo = new FakeManifestRepo();
  const accountRepo = new FakeAccountRepo();
  const service = new CreationDiscoveryService(
    repo as unknown as CreationRepository,
    new CreationStateMachine(),
    manifestRepo as any,
    accountRepo as any,
  );
  return { service, repo, manifestRepo, accountRepo };
}

// ============================================================
// Property 4 — 仅可发现状态进入发现面(需求 3.1/3.4)
// ============================================================
describe('CreationDiscoveryService — 审核前置(只返回 published/listed)', () => {
  const NON_DISCOVERABLE: CreationStatus[] = [
    'draft',
    'under_review',
    'unpublished',
    'suspended',
  ];

  it('feed 只返回 published/listed,过滤掉所有非可发现状态', async () => {
    const h = makeHarness();
    h.repo.seed(
      makeCreation({ id: 'pub', status: 'published' }),
      makeCreation({ id: 'lst', status: 'listed' }),
      ...NON_DISCOVERABLE.map((status) => makeCreation({ status })),
    );

    const res = await h.service.feed({ mode: 'feed' });
    const ids = res.items.map((i) => i.id).sort();
    expect(ids).toEqual(['lst', 'pub']);
  });

  it('服务层兜底:即便候选源混入非可发现状态,也绝不外泄(defense in depth)', async () => {
    const h = makeHarness();
    // 故意让 fake 返回包含 suspended 的候选(绕过仓储 SQL 过滤的假想场景)。
    jest
      .spyOn(h.repo, 'findDiscoverableCandidates')
      .mockResolvedValue([
        makeCreation({ id: 'leak', status: 'suspended' }),
        makeCreation({ id: 'ok', status: 'published' }),
      ]);

    const res = await h.service.feed({ mode: 'feed' });
    expect(res.items.map((i) => i.id)).toEqual(['ok']);
  });

  it('map 与 agentSearch 同样只返回可发现状态', async () => {
    const h = makeHarness();
    h.repo.seed(
      withGeo({ id: 'pub', status: 'published' }, 31.2, 121.47),
      withGeo({ id: 'draft', status: 'draft' }, 31.2, 121.47),
      makeCreation({
        id: 'sus',
        status: 'suspended',
        offerings: [offering('o1', ['query', 'order'])],
      }),
      makeCreation({
        id: 'pub2',
        status: 'published',
        offerings: [offering('o2', ['query', 'order'])],
      }),
    );

    const mapRes = await h.service.map({
      mode: 'map',
      viewport: { minLat: 31, minLng: 121, maxLat: 32, maxLng: 122 },
    });
    expect(mapRes.markers.map((m) => m.id)).toEqual(['pub']);

    const agentRes = await h.service.agentSearch({
      mode: 'agentSearch',
      verbs: ['order'],
    });
    expect(agentRes.items.map((i) => i.id)).toEqual(['pub2']);
  });
});

// ============================================================
// ① 地图模式(需求 4.1)
// ============================================================
describe('CreationDiscoveryService — 地图模式', () => {
  it('viewport bbox 过滤:只返回视口内带 geo 的创作', async () => {
    const h = makeHarness();
    h.repo.seed(
      withGeo({ id: 'inside' }, 31.23, 121.47), // 上海,视口内
      withGeo({ id: 'outside' }, 39.9, 116.4), // 北京,视口外
      makeCreation({ id: 'noGeo', geo: null, geoGridCell: null }), // 纯内容,无 geo
    );

    const res = await h.service.map({
      mode: 'map',
      viewport: { minLat: 31, minLng: 121, maxLat: 32, maxLng: 122 },
    });
    expect(res.markers.map((m) => m.id)).toEqual(['inside']);
    expect(res.markers[0].geo).toEqual({
      lat: 31.23,
      lng: 121.47,
      gridCell: toGridCell(31.23, 121.47),
    });
  });

  it('center+radius:bbox 外接矩形角落被 haversine 圆形精筛剔除', async () => {
    const h = makeHarness();
    const center = { lat: 31.0, lng: 121.0 };
    // 正北约 800m(在 1km 半径内)。
    const near = withGeo({ id: 'near' }, 31.0072, 121.0);
    // 东北角对角约 1.1km(在外接 bbox 内,但圆形外)。
    const corner = withGeo({ id: 'corner' }, 31.0072, 121.0084);
    h.repo.seed(near, corner);

    const res = await h.service.map({
      mode: 'map',
      center,
      radiusMeters: 1000,
    });
    expect(res.markers.map((m) => m.id)).toEqual(['near']);
  });

  it('投影含 can-enter / 类型 / 预览 / 创作者(需求 1.8)', async () => {
    const h = makeHarness();
    h.accountRepo.seed({
      id: 'owner-1',
      name: '咖啡师小王',
      avatarUrl: 'https://cdn.example/a.png',
    } as AgentAccount);
    h.repo.seed(withGeo({ id: 'c1', type: 'shop', ecsVersionId: 'ecs-9' }, 31.2, 121.4));

    const res = await h.service.map({
      mode: 'map',
      viewport: { minLat: 31, minLng: 121, maxLat: 32, maxLng: 122 },
    });
    const m = res.markers[0];
    expect(m.type).toBe('shop');
    expect(m.canEnter).toBe(true);
    expect(m.preview.kind).toBe('cover');
    expect(m.creator).toEqual({
      accountId: 'owner-1',
      name: '咖啡师小王',
      avatarUrl: 'https://cdn.example/a.png',
    });
  });
});

// ============================================================
// ② 创作流模式:游标分页 + 排序(需求 5.1/5.6)
// ============================================================
describe('CreationDiscoveryService — 创作流模式', () => {
  it('游标分页:逐页消费且不重不漏,末页 nextCursor 为 null', async () => {
    const h = makeHarness();
    const base = Date.now();
    for (let i = 0; i < 5; i++) {
      h.repo.seed(
        makeCreation({ id: `c${i}`, createdAt: new Date(base + i * 1000) }),
      );
    }

    const page1 = await h.service.feed({ mode: 'feed', limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await h.service.feed({
      mode: 'feed',
      limit: 2,
      cursor: page1.nextCursor!,
    });
    const page3 = await h.service.feed({
      mode: 'feed',
      limit: 2,
      cursor: page2.nextCursor!,
    });

    expect(page3.items).toHaveLength(1);
    expect(page3.nextCursor).toBeNull();

    const allIds = [...page1.items, ...page2.items, ...page3.items].map((i) => i.id);
    expect(new Set(allIds).size).toBe(5); // 不重
    expect(allIds).toHaveLength(5); // 不漏
  });

  it('newest 排序:按 createdAt 倒序', async () => {
    const h = makeHarness();
    const base = Date.now();
    h.repo.seed(
      makeCreation({ id: 'old', createdAt: new Date(base) }),
      makeCreation({ id: 'mid', createdAt: new Date(base + 1000) }),
      makeCreation({ id: 'new', createdAt: new Date(base + 2000) }),
    );

    const res = await h.service.feed({ mode: 'feed', sort: 'newest' });
    expect(res.items.map((i) => i.id)).toEqual(['new', 'mid', 'old']);
    expect(res.sort).toBe('newest');
  });

  it('hot 排序:按互动热度倒序', async () => {
    const h = makeHarness();
    h.repo.seed(
      makeCreation({ id: 'cold', metrics: { views: 1, likes: 0, sales: 0, comments: 0 } }),
      makeCreation({ id: 'hot', metrics: { views: 0, likes: 0, sales: 100, comments: 0 } }),
      makeCreation({ id: 'warm', metrics: { views: 0, likes: 10, sales: 0, comments: 0 } }),
    );

    const res = await h.service.feed({ mode: 'feed', sort: 'hot' });
    expect(res.items.map((i) => i.id)).toEqual(['hot', 'warm', 'cold']);
  });

  it('nearby 排序:按到定位中心的距离升序', async () => {
    const h = makeHarness();
    const near = { lat: 31.0, lng: 121.0 };
    h.repo.seed(
      withGeo({ id: 'far' }, 31.5, 121.0),
      withGeo({ id: 'close' }, 31.01, 121.0),
      withGeo({ id: 'mid' }, 31.1, 121.0),
    );

    const res = await h.service.feed({ mode: 'feed', sort: 'nearby', near });
    expect(res.items.map((i) => i.id)).toEqual(['close', 'mid', 'far']);
  });
});

// ============================================================
// ③ Agent 能力检索:动词过滤 + 清单挂载(需求 13.1)
// ============================================================
describe('CreationDiscoveryService — Agent 检索', () => {
  it('verb 过滤:只返回 offerings 支持全部所需动词的创作', async () => {
    const h = makeHarness();
    h.repo.seed(
      makeCreation({ id: 'orderable', offerings: [offering('o1', ['query', 'order'])] }),
      makeCreation({ id: 'queryOnly', offerings: [offering('o2', ['query'])] }),
      makeCreation({
        id: 'bookable',
        offerings: [offering('o3', ['query', 'book'])],
      }),
    );

    const res = await h.service.agentSearch({ mode: 'agentSearch', verbs: ['order'] });
    expect(res.items.map((i) => i.id)).toEqual(['orderable']);
  });

  it('挂载当前生效能力清单(isActive)到每个结果项', async () => {
    const h = makeHarness();
    h.repo.seed(
      makeCreation({
        id: 'shop1',
        manifestVersion: 3,
        offerings: [offering('o1', ['query', 'order'])],
      }),
    );
    h.manifestRepo.seed({
      id: 'm-active',
      creationId: 'shop1',
      version: 3,
      ecsVersionId: 'ecs-1',
      tools: [
        { name: 'order_o1', verb: 'order', offeringId: 'o1', inputSchema: {}, consumes: true },
      ],
      customTools: null,
      isActive: true,
    } as CreationCapabilityManifestEntity);
    // 旧版本清单(isActive=false)不应被挂载。
    h.manifestRepo.seed({
      id: 'm-old',
      creationId: 'shop1',
      version: 2,
      ecsVersionId: 'ecs-0',
      tools: [],
      customTools: null,
      isActive: false,
    } as CreationCapabilityManifestEntity);

    const res = await h.service.agentSearch({ mode: 'agentSearch', verbs: ['order'] });
    expect(res.items).toHaveLength(1);
    const item = res.items[0];
    expect(item.manifest.version).toBe(3);
    expect(item.manifest.tools.map((t) => t.name)).toEqual(['order_o1']);
  });

  it('无生效清单时挂载空清单兜底(version 取 manifestVersion)', async () => {
    const h = makeHarness();
    h.repo.seed(
      makeCreation({
        id: 'noManifest',
        manifestVersion: 0,
        offerings: [offering('o1', ['query'])],
      }),
    );

    const res = await h.service.agentSearch({ mode: 'agentSearch' });
    const item = res.items.find((i) => i.id === 'noManifest')!;
    expect(item.manifest.tools).toEqual([]);
    expect(item.manifest.version).toBe(0);
  });

  it('价格上限精筛:剔除无满足价格的 offering 的创作', async () => {
    const h = makeHarness();
    h.repo.seed(
      makeCreation({
        id: 'cheap',
        offerings: [offering('o1', ['query', 'order'], { axp: 50 })],
      }),
      makeCreation({
        id: 'pricey',
        offerings: [offering('o2', ['query', 'order'], { axp: 500 })],
      }),
    );

    const res = await h.service.agentSearch({
      mode: 'agentSearch',
      verbs: ['order'],
      maxPriceAxp: 100,
    });
    expect(res.items.map((i) => i.id)).toEqual(['cheap']);
  });

  it('语义 query:按词命中相关度排序并给出 relevance', async () => {
    const h = makeHarness();
    h.repo.seed(
      makeCreation({ id: 'match', title: '深夜咖啡馆', summary: '手冲精品咖啡' }),
      makeCreation({ id: 'nomatch', title: '健身房', summary: '撸铁' }),
    );

    const res = await h.service.agentSearch({ mode: 'agentSearch', query: '咖啡' });
    expect(res.items[0].id).toBe('match');
    expect(res.items[0].relevance).toBe(1);
    const nomatch = res.items.find((i) => i.id === 'nomatch')!;
    expect(nomatch.relevance).toBe(0);
  });
});

// ============================================================
// 统一入口分派
// ============================================================
describe('CreationDiscoveryService — discover 分派', () => {
  it('按 mode 分派到三形态', async () => {
    const h = makeHarness();
    h.repo.seed(withGeo({ id: 'g' }, 31.2, 121.4));

    const map = await h.service.discover({
      mode: 'map',
      viewport: { minLat: 31, minLng: 121, maxLat: 32, maxLng: 122 },
    });
    expect(map.mode).toBe('map');

    const feed = await h.service.discover({ mode: 'feed' });
    expect(feed.mode).toBe('feed');

    const agent = await h.service.discover({ mode: 'agentSearch' });
    expect(agent.mode).toBe('agentSearch');
  });
});
