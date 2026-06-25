import { CreationDiscoveryService } from './creation-discovery.service';
import {
  CreationFollowResolver,
  CreationSeedSource,
  DefaultCreationSeedSource,
  SeedCreationQuery,
} from './feed-personalization';
import { CreationRepository } from '../creation.repository';
import {
  CreationStateMachine,
  DISCOVERABLE_STATUSES,
} from '../creation-state-machine';
import { CreationEntity } from '../entities/creation.entity';
import type {
  CreationStatus,
  CreationType,
} from '../../../../shared/types/creation';

/**
 * 创作流 feed 排序口径 + 冷启动种子填充单元测试(world-creation-feed task 3.2)。
 *
 * 覆盖:
 *   - following:仅含被关注创作者的创作;解析器不可用时优雅降级为 newest(需求 5.6);
 *   - following 关注空集 → 由冷启动种子填充补内容(需求 5.9);
 *   - 冷启动:有机结果稀少时触发种子填充并对有机去重;充足时不触发(需求 5.9);
 *   - 排序口径稳定:种子追加在有机之后,不打乱有机排名,游标分页跨边界不重不漏;
 *   - DefaultCreationSeedSource:跨地域池去重 + 截断。
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

/** 忠实内存仓库:findDiscoverableCandidates 镜像真实 SQL 语义(可发现收敛 + createdAt 倒序 + limit)。 */
class FakeCreationRepo {
  rows: CreationEntity[] = [];

  seed(...entities: CreationEntity[]): void {
    this.rows.push(...entities);
  }

  private discoverable(): CreationEntity[] {
    return this.rows.filter((c) => DISCOVERABLE_STATUSES.has(c.status));
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
}

/** 可控关注解析器替身。 */
class FakeFollowResolver implements CreationFollowResolver {
  constructor(
    private readonly map: Record<string, string[]>,
    private readonly throwFor?: string,
  ) {}

  async resolveFollowedCreatorIds(viewerAccountId: string): Promise<string[]> {
    if (this.throwFor && viewerAccountId === this.throwFor) {
      throw new Error('follow store unavailable');
    }
    return this.map[viewerAccountId] ?? [];
  }
}

/** 可控种子源替身:返回预置实体(供 dedupe/排序边界测试)。 */
class FakeSeedSource implements CreationSeedSource {
  calls: SeedCreationQuery[] = [];
  constructor(private readonly seeds: CreationEntity[]) {}

  async getSeedCreations(query: SeedCreationQuery): Promise<CreationEntity[]> {
    this.calls.push(query);
    const exclude = new Set(query.excludeIds);
    return this.seeds.filter((c) => !exclude.has(c.id)).slice(0, query.limit);
  }
}

function makeService(opts: {
  repo: FakeCreationRepo;
  followResolver?: CreationFollowResolver;
  seedSource?: CreationSeedSource;
}): CreationDiscoveryService {
  return new CreationDiscoveryService(
    opts.repo as unknown as CreationRepository,
    new CreationStateMachine(),
    undefined,
    undefined,
    opts.followResolver,
    opts.seedSource,
  );
}

// ============================================================
// following 口径(需求 5.6)
// ============================================================
describe('CreationDiscoveryService.feed — following 关注口径', () => {
  it('仅返回被关注创作者的创作', async () => {
    const repo = new FakeCreationRepo();
    const base = Date.now();
    repo.seed(
      makeCreation({ id: 'a', ownerAccountId: 'creatorA', createdAt: new Date(base + 3000) }),
      makeCreation({ id: 'b', ownerAccountId: 'creatorB', createdAt: new Date(base + 2000) }),
      makeCreation({ id: 'c', ownerAccountId: 'creatorC', createdAt: new Date(base + 1000) }),
    );
    const service = makeService({
      repo,
      followResolver: new FakeFollowResolver({ viewer1: ['creatorA', 'creatorC'] }),
    });

    const res = await service.feed({
      mode: 'feed',
      sort: 'following',
      viewerAccountId: 'viewer1',
    });

    // 只含关注的 A、C,按最新倒序;B 被排除。
    expect(res.items.map((i) => i.id)).toEqual(['a', 'c']);
    expect(res.sort).toBe('following');
  });

  it('解析器未注入 → 优雅降级为 newest(返回全部,口径仍回显 following)', async () => {
    const repo = new FakeCreationRepo();
    const base = Date.now();
    repo.seed(
      makeCreation({ id: 'a', ownerAccountId: 'creatorA', createdAt: new Date(base + 2000) }),
      makeCreation({ id: 'b', ownerAccountId: 'creatorB', createdAt: new Date(base + 1000) }),
    );
    // 无 followResolver、无 seedSource。
    const service = makeService({ repo });

    const res = await service.feed({
      mode: 'feed',
      sort: 'following',
      viewerAccountId: 'viewer1',
    });

    expect(res.items.map((i) => i.id)).toEqual(['a', 'b']); // 降级 newest,不丢内容
    expect(res.sort).toBe('following');
  });

  it('解析器抛错 → 按不可用处理,降级为 newest', async () => {
    const repo = new FakeCreationRepo();
    repo.seed(
      makeCreation({ id: 'a', ownerAccountId: 'creatorA' }),
      makeCreation({ id: 'b', ownerAccountId: 'creatorB' }),
    );
    const service = makeService({
      repo,
      followResolver: new FakeFollowResolver({}, 'viewer1'),
    });

    const res = await service.feed({
      mode: 'feed',
      sort: 'following',
      viewerAccountId: 'viewer1',
    });

    expect(res.items.map((i) => i.id).sort()).toEqual(['a', 'b']);
  });

  it('缺省 viewerAccountId → 降级为 newest', async () => {
    const repo = new FakeCreationRepo();
    repo.seed(makeCreation({ id: 'a' }), makeCreation({ id: 'b' }));
    const service = makeService({
      repo,
      followResolver: new FakeFollowResolver({ viewer1: ['x'] }),
    });

    const res = await service.feed({ mode: 'feed', sort: 'following' });
    expect(res.items).toHaveLength(2);
  });

  it('关注空集 + 有种子源 → 关注流为空时由冷启动填充补内容', async () => {
    const repo = new FakeCreationRepo();
    repo.seed(makeCreation({ id: 'organic', ownerAccountId: 'creatorX' }));
    const base = Date.now();
    const seeds = [
      makeCreation({ id: 'seed1', ownerAccountId: 'official', createdAt: new Date(base + 2000) }),
      makeCreation({ id: 'seed2', ownerAccountId: 'official', createdAt: new Date(base + 1000) }),
    ];
    const service = makeService({
      repo,
      followResolver: new FakeFollowResolver({ viewer1: [] }), // 关注空集(可用但未关注)
      seedSource: new FakeSeedSource(seeds),
    });

    const res = await service.feed({
      mode: 'feed',
      sort: 'following',
      viewerAccountId: 'viewer1',
    });

    // 关注空 → 有机为空 → 仅种子内容。
    expect(res.items.map((i) => i.id)).toEqual(['seed1', 'seed2']);
  });
});

// ============================================================
// 冷启动种子填充(需求 5.9)
// ============================================================
describe('CreationDiscoveryService.feed — 冷启动种子填充', () => {
  it('有机稀少时触发填充,并对有机去重(种子追加在有机之后)', async () => {
    const repo = new FakeCreationRepo();
    const base = Date.now();
    repo.seed(
      makeCreation({ id: 'o1', createdAt: new Date(base + 2000) }),
      makeCreation({ id: 'o2', createdAt: new Date(base + 1000) }),
    );
    // 种子池含一个与有机重复的 id(o1)应被去重。
    const seeds = [
      makeCreation({ id: 'o1', createdAt: new Date(base + 2000) }),
      makeCreation({ id: 's1', createdAt: new Date(base + 500) }),
      makeCreation({ id: 's2', createdAt: new Date(base + 400) }),
    ];
    const seedSource = new FakeSeedSource(seeds);
    const service = makeService({ repo, seedSource });

    const res = await service.feed({ mode: 'feed', sort: 'newest', limit: 50 });

    // 有机在前(newest 倒序),去重后的种子在后;o1 不重复出现。
    expect(res.items.map((i) => i.id)).toEqual(['o1', 'o2', 's1', 's2']);
    // 种子源被请求且已传入 excludeIds。
    expect(seedSource.calls).toHaveLength(1);
    expect(seedSource.calls[0].excludeIds.sort()).toEqual(['o1', 'o2']);
  });

  it('有机充足(达阈值)时不触发填充', async () => {
    const repo = new FakeCreationRepo();
    const base = Date.now();
    // 阈值为 10:播种 10 条有机内容。
    for (let i = 0; i < 10; i++) {
      repo.seed(makeCreation({ id: `o${i}`, createdAt: new Date(base + i * 1000) }));
    }
    const seedSource = new FakeSeedSource([makeCreation({ id: 'seedX' })]);
    const service = makeService({ repo, seedSource });

    const res = await service.feed({ mode: 'feed', sort: 'newest', limit: 50 });

    expect(res.items.map((i) => i.id)).not.toContain('seedX');
    expect(seedSource.calls).toHaveLength(0); // 未尝试拉取种子
  });

  it('无种子源时稀少也不填充(保持既有行为)', async () => {
    const repo = new FakeCreationRepo();
    repo.seed(makeCreation({ id: 'o1' }));
    const service = makeService({ repo }); // 无 seedSource

    const res = await service.feed({ mode: 'feed', sort: 'newest' });
    expect(res.items.map((i) => i.id)).toEqual(['o1']);
  });

  it('填充内容仅限可发现状态(defense in depth)', async () => {
    const repo = new FakeCreationRepo();
    repo.seed(makeCreation({ id: 'o1' }));
    const seeds = [
      makeCreation({ id: 'badSeed', status: 'suspended' }),
      makeCreation({ id: 'goodSeed', status: 'published' }),
    ];
    const service = makeService({ repo, seedSource: new FakeSeedSource(seeds) });

    const res = await service.feed({ mode: 'feed', sort: 'newest' });
    expect(res.items.map((i) => i.id)).toEqual(['o1', 'goodSeed']);
  });

  it('排序口径稳定:游标分页跨"有机/种子"边界不重不漏', async () => {
    const repo = new FakeCreationRepo();
    const base = Date.now();
    repo.seed(
      makeCreation({ id: 'o1', createdAt: new Date(base + 3000) }),
      makeCreation({ id: 'o2', createdAt: new Date(base + 2000) }),
    );
    const seeds = [
      makeCreation({ id: 's1', createdAt: new Date(base + 1500) }),
      makeCreation({ id: 's2', createdAt: new Date(base + 1000) }),
      makeCreation({ id: 's3', createdAt: new Date(base + 500) }),
    ];
    const service = makeService({ repo, seedSource: new FakeSeedSource(seeds) });

    const collected: string[] = [];
    let cursor: string | null | undefined;
    let guard = 0;
    do {
      const page = await service.feed({
        mode: 'feed',
        sort: 'newest',
        limit: 2,
        cursor: cursor ?? undefined,
      });
      collected.push(...page.items.map((i) => i.id));
      cursor = page.nextCursor;
    } while (cursor && guard++ < 10);

    // 有机在前 + 种子在后,完整序列;不重不漏。
    expect(collected).toEqual(['o1', 'o2', 's1', 's2', 's3']);
    expect(new Set(collected).size).toBe(5);
  });
});

// ============================================================
// DefaultCreationSeedSource(跨地域池)
// ============================================================
describe('DefaultCreationSeedSource', () => {
  it('以全局可发现创作为跨地域池,排除有机 id 并截断', async () => {
    const repo = new FakeCreationRepo();
    const base = Date.now();
    repo.seed(
      makeCreation({ id: 'g1', createdAt: new Date(base + 3000) }),
      makeCreation({ id: 'g2', createdAt: new Date(base + 2000) }),
      makeCreation({ id: 'g3', createdAt: new Date(base + 1000) }),
      makeCreation({ id: 'draft', status: 'draft' }), // 不可发现,池中应排除
    );
    const source = new DefaultCreationSeedSource(
      repo as unknown as CreationRepository,
    );

    const seeds = await source.getSeedCreations({
      limit: 2,
      excludeIds: ['g1'],
    });

    // 排除 g1 与 draft;按 createdAt 倒序取前 2 → g2, g3。
    expect(seeds.map((c) => c.id)).toEqual(['g2', 'g3']);
  });
});
