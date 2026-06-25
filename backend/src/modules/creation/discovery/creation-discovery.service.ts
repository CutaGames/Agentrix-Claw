import { Injectable, Optional, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';

import { CreationRepository, DiscoveryBbox } from '../creation.repository';
import { CreationStateMachine } from '../creation-state-machine';
import { CreationEntity } from '../entities/creation.entity';
import { CreationCapabilityManifestEntity } from '../entities/creation-capability-manifest.entity';
import { AgentAccount } from '../../../entities/agent-account.entity';
import {
  CREATION_FOLLOW_RESOLVER,
  CREATION_SEED_SOURCE,
  CreationFollowResolver,
  CreationSeedSource,
} from './feed-personalization';

import {
  AEON_GEO,
  haversineMeters,
} from '../../../../shared/types/aeon-world';
import type {
  CapabilityManifest,
  CreationDiscoveryItem,
  CreationMetrics,
} from '../../../../shared/types/creation';
import type {
  CreationAgentSearchItem,
  DiscoverAgentSearchQuery,
  DiscoverAgentSearchResponse,
  DiscoverCreationsQuery,
  DiscoverCreationsResponse,
  DiscoverFeedQuery,
  DiscoverFeedResponse,
  DiscoverMapQuery,
  DiscoverMapResponse,
  FeedSort,
} from '../../../../shared/types/creation-api';

/** feed 默认每页条数(契约 §5)。 */
const FEED_DEFAULT_LIMIT = 10;
/** agentSearch 默认每页条数(契约 §5)。 */
const AGENT_DEFAULT_LIMIT = 20;
/** 单页条数硬上限(防滥查)。 */
const MAX_LIMIT = 100;

/**
 * 冷启动阈值(需求 5.9)。当某次 feed 查询的有机(organic)候选总数低于该阈值时,
 * 视为"内容稀少",触发种子内容填充,保证新用户至少有约一屏内容可刷。
 * 取一页条数,确保稀疏判定与单页规模对齐。
 */
const FEED_COLD_START_THRESHOLD = 10;

/** 单次冷启动填充尝试拉取的种子条数上限(去重后截断)。 */
const FEED_SEED_FILL_LIMIT = 30;

/**
 * CreationDiscoveryService — 统一发现层(world-creation-feed task 3.1)。
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design}.md
 *   - design §Discovery Surfaces:三发现面共用一个查询层,读同一 Creation 注册表;
 *     仅查询形态不同 —— map(视口/附近)、feed(游标+排序)、agentSearch(语义+能力过滤)。
 *   - 需求 1.2:统一发现接口返回 Creation 列表,无论底层来自原 A(真实地理)或原 B(抽象网格)。
 *   - 需求 1.8:返回投影同时含类型/预览/创作者摘要/互动计数/can-enter,卡片渲染无需二次请求。
 *   - 需求 4.1:地图模式按视口/附近返回带 geo 的标记。
 *   - 需求 5.1:创作流模式以游标分页返回已发布 Creation。
 *   - 需求 13.1:Agent 检索按语义/能力/价格/地理/信任过滤,返回 Creation + 其能力清单。
 *
 * **CRITICAL 不变量(Property 4,需求 3.1/3.4):** 任何发现面只返回
 * status ∈ {published, listed} 的 Creation。仓储层 SQL 已收敛(`discoverableQb`),
 * 本服务再以 {@link CreationStateMachine.isDiscoverable} 做权威兜底过滤(defense in depth),
 * 确保即便候选来源含非可发现状态也绝不外泄。
 *
 * 职责分层:
 *   - 仓储层:SQL 可下推过滤(可发现状态 + bbox + 类型 + 动词包含)。
 *   - 本服务:不可下推精筛(半径 haversine / 价格上限 / 语义相关度)、排序、游标分页、
 *     实体 → CreationDiscoveryItem 投影、agentSearch 的能力清单挂载。
 *
 * 注:本服务在 task 3.1 落地三形态接口骨架与游标/排序机制;task 3.2 补全
 * `following` 关注图谱筛选(经 {@link CreationFollowResolver} 接缝,social 阶段 8
 * 绑定真实实现)与冷启动种子填充(经 {@link CreationSeedSource} 接缝,需求 5.9)。
 */
@Injectable()
export class CreationDiscoveryService {
  constructor(
    private readonly repo: CreationRepository,
    private readonly stateMachine: CreationStateMachine,
    @Optional()
    @InjectRepository(CreationCapabilityManifestEntity)
    private readonly manifestRepo?: Repository<CreationCapabilityManifestEntity>,
    @Optional()
    @InjectRepository(AgentAccount)
    private readonly accountRepo?: Repository<AgentAccount>,
    /**
     * 关注图谱解析器(following 口径,需求 5.6)。social 在阶段 8 落地,故此处
     * `@Optional()` 注入;未绑定时 following 优雅降级为 newest。
     */
    @Optional()
    @Inject(CREATION_FOLLOW_RESOLVER)
    private readonly followResolver?: CreationFollowResolver,
    /**
     * 冷启动种子内容源(需求 5.9)。默认绑定 DefaultCreationSeedSource;
     * 单测可不注入(则不做填充,保持既有行为)。
     */
    @Optional()
    @Inject(CREATION_SEED_SOURCE)
    private readonly seedSource?: CreationSeedSource,
  ) {}

  // ============================================================
  // 统一入口(契约 §5:判别联合 → 三形态)
  // ============================================================

  /** 统一发现入口:按 `query.mode` 分派到三形态。 */
  async discover(query: DiscoverCreationsQuery): Promise<DiscoverCreationsResponse> {
    switch (query.mode) {
      case 'map':
        return this.map(query);
      case 'feed':
        return this.feed(query);
      case 'agentSearch':
        return this.agentSearch(query);
      default:
        // 穷尽判别;TS 已保证不可达,运行时兜底为空 feed。
        return { mode: 'feed', items: [], nextCursor: null, sort: 'newest' };
    }
  }

  // ============================================================
  // ① 地图模式(人·意图):视口 bbox 或 中心点+半径(需求 4.1)
  // ============================================================

  async map(query: DiscoverMapQuery): Promise<DiscoverMapResponse> {
    const bbox = this.resolveBbox(query);
    // 有视口/中心 → 按包围盒查带 geo 的标记(原行为)。
    // 无视口/中心(客户端"世界总览",当前移动端默认调用方式)→ 返回全部可发现
    // 创作,而非空集 —— 否则首次进入"世界地图"恒为空(用户报告:地图是空的)。
    // 无 geo 的创作(如游戏种子)以列表标记呈现;有 geo 的仍带坐标。
    let candidates: CreationEntity[] = bbox
      ? await this.repo.findDiscoverableInBbox(bbox, query.type)
      : await this.repo.findDiscoverableCandidates({ type: query.type, limit: MAX_LIMIT });

    // 权威兜底:仅保留可发现状态(Property 4)。
    candidates = candidates.filter((c) => this.stateMachine.isDiscoverable(c.status));

    // 中心+半径:用 haversine 精筛到圆形范围内(bbox 是外接矩形,偏大)。
    if (query.center) {
      const radius = this.clampRadius(query.radiusMeters);
      candidates = candidates.filter((c) => {
        if (!c.geo) return false;
        return (
          haversineMeters(query.center!.lat, query.center!.lng, c.geo.lat, c.geo.lng) <=
          radius
        );
      });
    }

    const markers = await this.projectMany(candidates);
    return { mode: 'map', markers };
  }

  /** 从查询解析包围盒:优先 viewport;否则 center+radius 换算为外接 bbox。 */
  private resolveBbox(query: DiscoverMapQuery): DiscoveryBbox | null {
    if (query.viewport) {
      const v = query.viewport;
      return {
        minLat: Math.min(v.minLat, v.maxLat),
        maxLat: Math.max(v.minLat, v.maxLat),
        minLng: Math.min(v.minLng, v.maxLng),
        maxLng: Math.max(v.minLng, v.maxLng),
      };
    }
    if (query.center) {
      const radius = this.clampRadius(query.radiusMeters);
      // 纬度 1 度 ≈ 111_320 m;经度按纬度收缩(cos)。
      const dLat = radius / 111_320;
      const dLng =
        radius /
        (111_320 * Math.max(0.01, Math.cos((query.center.lat * Math.PI) / 180)));
      return {
        minLat: query.center.lat - dLat,
        maxLat: query.center.lat + dLat,
        minLng: query.center.lng - dLng,
        maxLng: query.center.lng + dLng,
      };
    }
    return null;
  }

  private clampRadius(radiusMeters?: number): number {
    const r = radiusMeters ?? AEON_GEO.NEARBY_DEFAULT_RADIUS_M;
    return Math.min(Math.max(0, r), AEON_GEO.NEARBY_MAX_RADIUS_M);
  }

  // ============================================================
  // ② 创作流模式(人·娱乐):游标 + 排序(需求 5.1/5.6)
  // ============================================================

  async feed(query: DiscoverFeedQuery): Promise<DiscoverFeedResponse> {
    const requestedSort: FeedSort = query.sort ?? 'newest';
    const limit = this.clampLimit(query.limit, FEED_DEFAULT_LIMIT);
    const offset = this.decodeCursor(query.cursor);

    let candidates = await this.repo.findDiscoverableCandidates();
    candidates = candidates.filter((c) => this.stateMachine.isDiscoverable(c.status));

    // following:按关注图谱筛选(需求 5.6)。
    //   - 解析器不可用(social 未落地或异常)→ 整体降级为 newest;
    //   - 解析器可用但关注空 → 过滤后有机集为空,交由冷启动填充补内容(需求 5.9)。
    let orderingSort: FeedSort = requestedSort;
    if (requestedSort === 'following') {
      const followed = await this.resolveFollowedCreators(query.viewerAccountId);
      if (followed === null) {
        orderingSort = 'newest';
      } else {
        candidates = candidates.filter((c) => followed.has(c.ownerAccountId));
      }
    }

    const organic = this.sortFeed(candidates, orderingSort, query.near);

    // 冷启动种子填充(需求 5.9):有机结果稀少时追加种子内容(跨页稳定 + 去重)。
    const ordered = await this.applyColdStartFill(organic, orderingSort, query.near);

    const { page, nextCursor } = this.paginate(ordered, offset, limit);

    const items = await this.projectMany(page);
    // 响应回显客户端请求的口径(即便 following 内部降级,语义上仍是 following)。
    return { mode: 'feed', items, nextCursor, sort: requestedSort };
  }

  /**
   * 解析浏览者关注的创作者 id 集合(following 口径,需求 5.6)。
   *
   * 返回值语义区分三种情形:
   *   - `null`:解析器**不可用**(未注入 / viewerAccountId 缺省 / 解析异常)→
   *     调用方据此整体降级为 newest;
   *   - 空 Set:解析器可用但**未关注任何人**→ following 过滤后有机集为空,
   *     由冷启动填充补内容;
   *   - 非空 Set:据此筛选有机集。
   */
  private async resolveFollowedCreators(
    viewerAccountId?: string,
  ): Promise<Set<string> | null> {
    if (!viewerAccountId || !this.followResolver) {
      return null;
    }
    try {
      const ids = await this.followResolver.resolveFollowedCreatorIds(viewerAccountId);
      return new Set(ids ?? []);
    } catch {
      // 解析失败按"不可用"处理,优雅降级(需求 5.9 不让用户面对空流)。
      return null;
    }
  }

  /**
   * 冷启动种子填充(需求 5.9):当有机结果稀少(< {@link FEED_COLD_START_THRESHOLD})
   * 时,从种子源拉取官方/种子/跨地域内容,**按当前排序口径排序后追加到有机结果之后**,
   * 并对有机 id 去重。
   *
   * 排序口径稳定性:有机结果整体保持其原排序在前,种子内容(同口径排序)在后 ——
   * 既不打乱有机排名,又保证 `[...organic, ...seed]` 是确定序列,使 offset 游标分页
   * 跨"有机/种子"边界仍不重不漏。无种子源(单测/未注入)时原样返回。
   */
  private async applyColdStartFill(
    organic: CreationEntity[],
    sort: FeedSort,
    near?: { lat: number; lng: number },
  ): Promise<CreationEntity[]> {
    if (organic.length >= FEED_COLD_START_THRESHOLD || !this.seedSource) {
      return organic;
    }

    const organicIds = new Set(organic.map((c) => c.id));
    const seedRaw = await this.seedSource.getSeedCreations({
      limit: FEED_SEED_FILL_LIMIT,
      excludeIds: [...organicIds],
    });

    // 兜底:仅保留可发现状态(defense in depth)+ 再次去重(防种子源未排除干净)。
    const seed = seedRaw.filter(
      (c) => this.stateMachine.isDiscoverable(c.status) && !organicIds.has(c.id),
    );
    if (seed.length === 0) {
      return organic;
    }

    const sortedSeed = this.sortFeed(seed, sort, near);
    return [...organic, ...sortedSeed];
  }

  /** 按口径排序候选集(稳定:同分用 id 兜底,保证游标分页跨页不重不漏)。 */
  private sortFeed(
    items: CreationEntity[],
    sort: FeedSort,
    near?: { lat: number; lng: number },
  ): CreationEntity[] {
    const arr = [...items];
    switch (sort) {
      case 'hot':
        return arr.sort(
          (a, b) =>
            this.hotness(b.metrics) - this.hotness(a.metrics) ||
            this.byNewest(a, b),
        );
      case 'nearby': {
        if (!near) {
          // 无定位中心 → 退化为最新(避免静默丢弃)。
          return arr.sort((a, b) => this.byNewest(a, b));
        }
        return arr.sort((a, b) => {
          const da = a.geo
            ? haversineMeters(near.lat, near.lng, a.geo.lat, a.geo.lng)
            : Number.POSITIVE_INFINITY;
          const db = b.geo
            ? haversineMeters(near.lat, near.lng, b.geo.lat, b.geo.lng)
            : Number.POSITIVE_INFINITY;
          return da - db || this.byNewest(a, b);
        });
      }
      case 'following':
        // 关注图谱筛选已在 feed() 完成(需求 5.6);此处对已筛选的关注创作按最新排序。
        return arr.sort((a, b) => this.byNewest(a, b));
      case 'newest':
      default:
        // 默认创作流:优先展示真实可玩的 game(其余按最新)。
        return arr.sort((a, b) => this.byGameFirst(a, b) || this.byNewest(a, b));
    }
  }

  /** game/drama 优先(默认流偏向真实可玩内容);同组时返回 0 交给次级排序。 */
  private byGameFirst(a: CreationEntity, b: CreationEntity): number {
    const playable = (t: string) => (t === 'game' || t === 'drama' ? 0 : 1);
    return playable(a.type) - playable(b.type);
  }

  /** 互动热度评分(需求 5.6 热度口径占位):成交 > 留言 > 点赞 > 浏览。 */
  private hotness(m: CreationMetrics): number {
    return m.sales * 5 + m.comments * 2 + m.likes * 3 + m.views;
  }

  /** createdAt 倒序;同刻用 id 倒序兜底,保证全序稳定。 */
  private byNewest(a: CreationEntity, b: CreationEntity): number {
    const ta = a.createdAt instanceof Date ? a.createdAt.getTime() : Number(a.createdAt ?? 0);
    const tb = b.createdAt instanceof Date ? b.createdAt.getTime() : Number(b.createdAt ?? 0);
    if (tb !== ta) return tb - ta;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  }

  // ============================================================
  // ③ Agent 能力检索(机器):语义 + 能力/类目/价格/地理/信任过滤(需求 13.1)
  // ============================================================

  async agentSearch(
    query: DiscoverAgentSearchQuery,
  ): Promise<DiscoverAgentSearchResponse> {
    const limit = this.clampLimit(query.limit, AGENT_DEFAULT_LIMIT);
    const offset = this.decodeCursor(query.cursor);

    let candidates = await this.repo.findDiscoverableForAgent({
      verbs: query.verbs,
      type: query.type,
    });
    candidates = candidates.filter((c) => this.stateMachine.isDiscoverable(c.status));

    // 价格上限精筛(展示价过滤;权威金额仍由 Economy_Bridge 计算)。
    if (typeof query.maxPriceAxp === 'number') {
      candidates = candidates.filter((c) =>
        (c.offerings ?? []).some(
          (o) => typeof o.price?.axp === 'number' && o.price.axp <= query.maxPriceAxp!,
        ),
      );
    }
    if (typeof query.maxPriceUsd === 'number') {
      candidates = candidates.filter((c) =>
        (c.offerings ?? []).some(
          (o) => typeof o.price?.usd === 'number' && o.price.usd <= query.maxPriceUsd!,
        ),
      );
    }

    // 地理范围精筛(中心+半径)。
    if (query.near) {
      const radius = this.clampRadius(query.near.radiusMeters);
      candidates = candidates.filter((c) => {
        if (!c.geo) return false;
        return (
          haversineMeters(query.near!.lat, query.near!.lng, c.geo.lat, c.geo.lng) <=
          radius
        );
      });
    }

    // 语义相关度:按 query 词命中标题/摘要/offering 名打分并排序(占位实现,
    // 真·语义检索/向量化为后续工作);无 query 则按 newest。
    const ranked = this.rankBySemantics(candidates, query.query);
    const { page, nextCursor } = this.paginate(ranked.items, offset, limit);

    const items = await this.projectAgentItems(page, ranked.relevanceById);
    return { mode: 'agentSearch', items, nextCursor };
  }

  /** 词命中相关度评分(0..1):命中标题/摘要/offering 名的查询词比例。 */
  private rankBySemantics(
    items: CreationEntity[],
    query?: string,
  ): { items: CreationEntity[]; relevanceById: Map<string, number> } {
    const relevanceById = new Map<string, number>();
    const terms = (query ?? '')
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);

    if (terms.length === 0) {
      const sorted = [...items].sort((a, b) => this.byNewest(a, b));
      return { items: sorted, relevanceById };
    }

    for (const c of items) {
      const haystack = [
        c.title,
        c.summary ?? '',
        ...(c.offerings ?? []).map((o) => `${o.name} ${o.description ?? ''}`),
      ]
        .join(' ')
        .toLowerCase();
      const hits = terms.filter((t) => haystack.includes(t)).length;
      relevanceById.set(c.id, hits / terms.length);
    }

    const sorted = [...items].sort(
      (a, b) =>
        (relevanceById.get(b.id) ?? 0) - (relevanceById.get(a.id) ?? 0) ||
        this.byNewest(a, b),
    );
    return { items: sorted, relevanceById };
  }

  // ============================================================
  // 投影:CreationEntity → CreationDiscoveryItem(需求 1.8)
  // ============================================================

  /** 批量投影为发现项,并批量解析创作者摘要(避免 N+1)。 */
  private async projectMany(
    entities: CreationEntity[],
  ): Promise<CreationDiscoveryItem[]> {
    const creatorMap = await this.resolveCreators(entities);
    return entities.map((e) => this.toDiscoveryItem(e, creatorMap));
  }

  /** Agent 检索项:发现投影 + 能力清单挂载 + 相关度(需求 13.1)。 */
  private async projectAgentItems(
    entities: CreationEntity[],
    relevanceById: Map<string, number>,
  ): Promise<CreationAgentSearchItem[]> {
    const creatorMap = await this.resolveCreators(entities);
    const manifestMap = await this.resolveManifests(entities);
    return entities.map((e) => {
      const base = this.toDiscoveryItem(e, creatorMap);
      const item: CreationAgentSearchItem = {
        ...base,
        manifest: manifestMap.get(e.id) ?? this.emptyManifest(e),
      };
      const rel = relevanceById.get(e.id);
      if (typeof rel === 'number') {
        item.relevance = rel;
      }
      return item;
    });
  }

  /** 单实体 → 发现投影(需求 1.8:卡片渲染所需全部字段,无需二次请求)。 */
  private toDiscoveryItem(
    e: CreationEntity,
    creatorMap: Map<string, AgentAccount>,
  ): CreationDiscoveryItem {
    const creator = creatorMap.get(e.ownerAccountId);
    return {
      id: e.id,
      type: e.type,
      title: e.title,
      summary: e.summary ?? undefined,
      // 发布必备预览物;草稿不入发现面,理论恒有 —— 兜底占位防御 null。
      preview: e.preview ?? { kind: 'cover', url: '' },
      creator: {
        accountId: e.ownerAccountId,
        name: creator?.name,
        avatarUrl: creator?.avatarUrl,
      },
      metrics: e.metrics,
      geo: e.geo,
      poi: e.poi,
      canEnter: this.canEnter(e),
      offerings: e.offerings ?? [],
    };
  }

  /**
   * can-enter 判定(需求 1.8):是否有可加载的体验。
   *   - game:总可进入(有可玩包,或进入时懒生成/模板兜底);
   *   - 其它:有内容版本(ECS_World)或有地理锚点(可映射 Aeon room/stage)即可进入。
   */
  private canEnter(e: CreationEntity): boolean {
    if (e.type === 'game' || e.type === 'drama') return true;
    return e.ecsVersionId !== null || e.geo !== null;
  }

  /** 批量解析创作者摘要(name/avatar);无 accountRepo 时返回空映射(name 缺省)。 */
  private async resolveCreators(
    entities: CreationEntity[],
  ): Promise<Map<string, AgentAccount>> {
    const map = new Map<string, AgentAccount>();
    if (!this.accountRepo || entities.length === 0) {
      return map;
    }
    const ids = [...new Set(entities.map((e) => e.ownerAccountId))];
    const accounts = await this.accountRepo.find({ where: { id: In(ids) } });
    for (const a of accounts) {
      map.set(a.id, a);
    }
    return map;
  }

  /**
   * 批量解析各 Creation 的当前生效能力清单(isActive)。
   * 无 manifestRepo 时返回空映射,投影时以空清单兜底。
   */
  private async resolveManifests(
    entities: CreationEntity[],
  ): Promise<Map<string, CapabilityManifest>> {
    const map = new Map<string, CapabilityManifest>();
    if (!this.manifestRepo || entities.length === 0) {
      return map;
    }
    const ids = [...new Set(entities.map((e) => e.id))];
    const rows = await this.manifestRepo.find({
      where: { creationId: In(ids), isActive: true },
    });
    for (const row of rows) {
      map.set(row.creationId, {
        creationId: row.creationId,
        version: row.version,
        tools: row.tools ?? [],
        customTools: row.customTools ?? undefined,
      });
    }
    return map;
  }

  /** 无生效清单时的兜底空清单(对应当前 manifestVersion)。 */
  private emptyManifest(e: CreationEntity): CapabilityManifest {
    return {
      creationId: e.id,
      version: e.manifestVersion ?? 0,
      tools: [],
    };
  }

  // ============================================================
  // 游标分页(offset 编码)与限额
  // ============================================================

  /** 游标 = base64(JSON{o:offset});首屏/无效游标 → offset 0。 */
  private decodeCursor(cursor?: string): number {
    if (!cursor) return 0;
    try {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
      const o = Number(decoded?.o);
      return Number.isFinite(o) && o >= 0 ? Math.floor(o) : 0;
    } catch {
      return 0;
    }
  }

  private encodeCursor(offset: number): string {
    return Buffer.from(JSON.stringify({ o: offset }), 'utf8').toString('base64');
  }

  /** 取 [offset, offset+limit) 页;若仍有剩余给出 nextCursor。 */
  private paginate<T>(
    sorted: T[],
    offset: number,
    limit: number,
  ): { page: T[]; nextCursor: string | null } {
    const page = sorted.slice(offset, offset + limit);
    const consumed = offset + page.length;
    const nextCursor = consumed < sorted.length ? this.encodeCursor(consumed) : null;
    return { page, nextCursor };
  }

  private clampLimit(limit: number | undefined, fallback: number): number {
    const l = typeof limit === 'number' && limit > 0 ? Math.floor(limit) : fallback;
    return Math.min(l, MAX_LIMIT);
  }
}
