import {
  Inject,
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  RequestTimeoutException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  ILike,
  In,
  Repository,
  type FindOptionsOrder,
  type FindOptionsWhere,
} from 'typeorm';
import { WorldPlot } from '../entities/world-plot.entity';
import { AgentAccountService } from '../../agent-account/agent-account.service';
import { SandboxService } from './sandbox.service';
import { EcsWorldService } from './ecs-world.service';
import { IdentityResolverService } from './identity-resolver.service';
import {
  MAP_PRESENCE_STORE,
  MAP_PRESENCE_TTL_MS,
  type MapPresenceStore,
  type PresenceRecord,
} from '../presence/map-presence.store';
import {
  MAP_PRESENCE_REFRESH_MS,
  PLOT_LOAD_TIMEOUT_MS,
} from '../../../../shared/types/world-creation';
import type {
  EcsWorld,
  SandboxIsolationLevel,
  SubstrateTier,
  WorldApiCapability,
  WorldCreationError,
} from '../../../../shared/types/world-creation';
import type {
  GetMapViewportQuery,
  GetMapViewportResponse,
  MapPlotSummary,
  MapPresenceResponse,
  PresenceEntry,
  DiscoverPlotsQuery,
  DiscoverPlotsResponse,
  PlotPreviewResponse,
  EnterPlotResponse,
  ReadonlyAssetHandle,
} from '../../../../shared/types/world-creation-api';

/** Default / max page size for discovery listing (R1.5). */
const DISCOVER_DEFAULT_LIMIT = 20;
const DISCOVER_MAX_LIMIT = 100;

/** Substrate_Tier → Capability_Sandbox isolation level (design §5.1, R6.1-6.3). */
const TIER_ISOLATION: Record<SubstrateTier, SandboxIsolationLevel> = {
  A: 'L0',
  B: 'L1',
  C: 'L2',
};

/** Plot 生命周期中「在地图上可见 / 可被发现」的状态集合 (R1.1)。 */
const MAP_VISIBLE_STATUSES = ['published', 'listed'] as const;

/**
 * MapService — World_Map 外层导航 / 发现 / 在场感 (design §1/§10, R1).
 *
 * 仅承载低交互 MMO-lite 层 (design §1.1 状态分层)：
 *   - 渲染共享地图：视口内的 Plot 集合 + 自身 avatar 位置 (R1.1)。
 *   - Presence (轻状态) 同步：刷新间隔 ≤ 2s，仅同步坐标 / 所在 Plot / 地块归属 (R1.2)。
 * 高交互全部下沉到实例化的 Plot 内层 (R1.6)；进入流程 / 发现过滤见 Task 10.2。
 *
 * Presence 读写经可注入的 {@link MapPresenceStore} (默认内存 TTL map，
 * 生产可替换为 ioredis 实现)，TTL ~ 数秒，心跳超时自然过期。
 */
@Injectable()
export class MapService {
  private readonly logger = new Logger(MapService.name);

  /** Plot load timeout before falling back to the map view (R1.7). Overridable in tests. */
  private readonly plotLoadTimeoutMs = PLOT_LOAD_TIMEOUT_MS;

  constructor(
    @InjectRepository(WorldPlot)
    private readonly plotRepo: Repository<WorldPlot>,
    private readonly agentAccountService: AgentAccountService,
    @Inject(MAP_PRESENCE_STORE)
    private readonly presenceStore: MapPresenceStore,
    private readonly sandboxService: SandboxService,
    private readonly ecsWorldService: EcsWorldService,
    private readonly identityResolver: IdentityResolverService,
  ) {}

  /**
   * R1.1 — 渲染视口内 Plot 集合 + 自身 avatar 位置。
   *
   * 查询落在 [minX..maxX] × [minY..maxY] 且地图可见 (published / listed) 的 Plot，
   * 映射为 MapPlotSummary[] (含 owner 显示名)。同时刷新调用者自身 presence 的 TTL
   * (导航中视为「在场」)，并回填其当前 avatar 位置 (无记录则默认视口中心)。
   */
  async getViewport(
    userId: string,
    query: GetMapViewportQuery,
  ): Promise<GetMapViewportResponse> {
    const box = this.normalizeViewport(query);

    const plots = await this.plotRepo.find({
      where: {
        mapX: Between(box.minX, box.maxX),
        mapY: Between(box.minY, box.maxY),
        status: In([...MAP_VISIBLE_STATUSES]),
      },
      order: { mapY: 'ASC', mapX: 'ASC' },
    });

    const summaries = await this.toPlotSummaries(plots);

    // 解析 / 刷新自身 presence：导航即视为在场，续期 TTL。无既有位置时落在视口中心，
    // 让首次进入地图的用户也有合理 avatar 坐标。
    const existing = userId ? await this.presenceStore.get(userId) : null;
    const selfPosition = existing
      ? { x: existing.x, y: existing.y }
      : { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };

    if (userId) {
      await this.presenceStore.set(
        {
          userId,
          displayName: existing?.displayName ?? (await this.resolveDisplayName(userId)),
          x: selfPosition.x,
          y: selfPosition.y,
          inPlotId: existing?.inPlotId ?? null,
        },
        MAP_PRESENCE_TTL_MS,
      );
    }

    return { plots: summaries, self: { position: selfPosition } };
  }

  /**
   * R1.2 — Presence 轻状态同步 (≤2s 刷新)。
   *
   * 返回其它在场用户的 avatar 位置 / 所在 Plot (轻状态)，并附服务端刷新预算
   * {@link MAP_PRESENCE_REFRESH_MS} 作为客户端轮询节拍 hint。
   * 仅读取活跃 (未过期) 记录；本调用不修改任何状态。
   */
  async getPresence(userId: string): Promise<MapPresenceResponse> {
    const records = await this.presenceStore.list(userId);
    return {
      entries: records.map((r) => this.toPresenceEntry(r)),
      refreshMs: MAP_PRESENCE_REFRESH_MS,
    };
  }

  /**
   * 写自己的轻状态 (坐标 / 所在 Plot) 并续期 TTL — presence 心跳的写入路径 (R1.2)。
   *
   * 仅承载低交互层 (R1.6)：禁止携带任何重交互 / 玩法状态。供客户端导航 / 移动 /
   * 进入 Plot 时上报；写入后其它在场端在一个刷新周期内即可读到 (≤2s)。
   */
  async updateSelfPresence(
    userId: string,
    position: { x: number; y: number },
    inPlotId?: string | null,
  ): Promise<void> {
    if (!userId) {
      throw new BadRequestException('Missing authenticated user');
    }
    if (
      !position ||
      typeof position.x !== 'number' ||
      typeof position.y !== 'number' ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y)
    ) {
      throw new BadRequestException('A finite { x, y } position is required');
    }
    const existing = await this.presenceStore.get(userId);
    await this.presenceStore.set(
      {
        userId,
        displayName: existing?.displayName ?? (await this.resolveDisplayName(userId)),
        x: position.x,
        y: position.y,
        inPlotId: inPlotId ?? null,
      },
      MAP_PRESENCE_TTL_MS,
    );
  }

  // ============================================================
  // Helpers
  // ============================================================

  /** 校验并归一化视口窗口 (允许 min/max 颠倒)。 */
  private normalizeViewport(query: GetMapViewportQuery): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } {
    const nums = [query?.minX, query?.minY, query?.maxX, query?.maxY];
    if (nums.some((n) => typeof n !== 'number' || !Number.isFinite(n))) {
      throw new BadRequestException(
        'Viewport requires finite numeric minX, minY, maxX, maxY',
      );
    }
    return {
      minX: Math.min(query.minX, query.maxX),
      maxX: Math.max(query.minX, query.maxX),
      minY: Math.min(query.minY, query.maxY),
      maxY: Math.max(query.minY, query.maxY),
    };
  }

  /** 将 WorldPlot[] 映射为 MapPlotSummary[]，批量解析 owner 显示名 (避免 N+1)。 */
  private async toPlotSummaries(plots: WorldPlot[]): Promise<MapPlotSummary[]> {
    const ownerNames = await this.resolveOwnerDisplayNames(plots);
    return plots.map((plot) => ({
      plotId: plot.id,
      title: plot.title ?? '',
      ownerDisplayName: plot.ownerAccountId
        ? ownerNames.get(plot.ownerAccountId) ?? 'Unknown'
        : 'Unowned',
      substrateTier: plot.substrateTier,
      mapX: plot.mapX,
      mapY: plot.mapY,
      status: plot.status,
    }));
  }

  /** 批量解析 ownerAccountId → 显示名 (AgentAccount.name)；失败回退 'Unknown'。 */
  private async resolveOwnerDisplayNames(
    plots: WorldPlot[],
  ): Promise<Map<string, string>> {
    const ids = Array.from(
      new Set(
        plots
          .map((p) => p.ownerAccountId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    );
    const names = new Map<string, string>();
    await Promise.all(
      ids.map(async (id) => {
        try {
          const account = await this.agentAccountService.findById(id);
          names.set(id, account?.name ?? 'Unknown');
        } catch {
          // 账户解析失败不阻塞地图渲染 (轻状态层最终一致)。
          names.set(id, 'Unknown');
        }
      }),
    );
    return names;
  }

  /** 解析用户的显示名 (经其 AgentAccount.name)；无账户时回退为短 userId。 */
  private async resolveDisplayName(userId: string): Promise<string> {
    try {
      const { items } = await this.agentAccountService.findByOwner(userId, 1, 1);
      if (items?.length && items[0].name) {
        return items[0].name;
      }
    } catch {
      // 忽略：presence 显示名是非关键展示字段。
    }
    return userId.slice(0, 8);
  }

  /** 将 presence 活跃记录映射为对外 PresenceEntry (轻状态)。 */
  private toPresenceEntry(rec: PresenceRecord): PresenceEntry {
    return {
      userId: rec.userId,
      displayName: rec.displayName,
      position: { x: rec.x, y: rec.y },
      inPlotId: rec.inPlotId ?? null,
    };
  }

  /**
   * R1.5 — 发现过滤：按 category / Substrate_Tier / popularity rank 列出 Plot。
   *
   * 仅列出地图可见 (published / listed) 的 Plot；按声明 Substrate_Tier 过滤、
   * 按可选 category 过滤、按 sort 排序并分页。结果按结果位置回填 popularityRank
   * (页内顺序，page-aware)，作为发现排序名次。
   *
   * NOTE (interim)：WorldPlot 当前无独立 `category` / 互动量列。category 暂以
   * 标题大小写不敏感匹配实现 (ILIKE)，popularity 排序暂以新近度 (createdAt DESC)
   * 作为代理；待引入专门的分类 / 互动量字段后替换为权威排序，不改本方法签名。
   */
  async discover(query: DiscoverPlotsQuery): Promise<DiscoverPlotsResponse> {
    const page = Math.max(1, Math.floor(query?.page ?? 1));
    const rawLimit = Math.floor(query?.limit ?? DISCOVER_DEFAULT_LIMIT);
    const limit = Math.min(Math.max(1, rawLimit), DISCOVER_MAX_LIMIT);
    const sort = query?.sort ?? 'popularity';

    const where: FindOptionsWhere<WorldPlot> = {
      status: In([...MAP_VISIBLE_STATUSES]),
    };
    if (query?.substrateTier) {
      where.substrateTier = query.substrateTier;
    }
    const category = query?.category?.trim();
    if (category) {
      where.title = ILike(`%${category}%`);
    }

    // 'tier' → 分层成组 (A→B→C) 再新近；其余 ('newest'/'popularity') → 新近度。
    const order: FindOptionsOrder<WorldPlot> =
      sort === 'tier'
        ? { substrateTier: 'ASC', createdAt: 'DESC' }
        : { createdAt: 'DESC' };

    const [rows, total] = await this.plotRepo.findAndCount({
      where,
      order,
      skip: (page - 1) * limit,
      take: limit,
    });

    const summaries = await this.toPlotSummaries(rows);
    const items: MapPlotSummary[] = summaries.map((summary, i) => ({
      ...summary,
      popularityRank: (page - 1) * limit + i + 1,
    }));

    return { items, total };
  }

  /**
   * R1.3 — 选中 Plot 的预览：名称、owner 显示名、Substrate_Tier、进入动作 (canEnter)。
   *
   * canEnter 为真当且仅当 Plot 已生成 ECS_World (ecsVersionId 非空) 且
   * (处于地图可见状态 published/listed，或调用者即 owner —— 允许 owner 预览/进入草稿)。
   */
  async previewPlot(
    userId: string,
    plotId: string,
  ): Promise<PlotPreviewResponse> {
    const plot = await this.plotRepo.findOne({ where: { id: plotId } });
    if (!plot) {
      throw new NotFoundException(`Plot not found: ${plotId}`);
    }

    const ownerNames = await this.resolveOwnerDisplayNames([plot]);
    const ownerDisplayName = plot.ownerAccountId
      ? ownerNames.get(plot.ownerAccountId) ?? 'Unknown'
      : 'Unowned';

    const ownerAccountIds = await this.resolveOwnerAccountIds(userId);
    const isOwner =
      !!plot.ownerAccountId && ownerAccountIds.has(plot.ownerAccountId);
    const isMapVisible = (MAP_VISIBLE_STATUSES as readonly string[]).includes(
      plot.status,
    );
    const canEnter = !!plot.ecsVersionId && (isMapVisible || isOwner);

    return {
      plotId: plot.id,
      title: plot.title ?? '',
      ownerDisplayName,
      substrateTier: plot.substrateTier,
      canEnter,
    };
  }

  /**
   * R1.4/R1.7 — 进入动作：在 Capability_Sandbox 实例化 Plot 体验并切入内层。
   *
   * 流程 (design §1.2)：加载 Plot 权威 ECS_World → 按 substrateTier 选隔离级
   * (A=L0 / B=L1 / C=L2) → 服务端解析进入者资产为只读 handle 注入 →
   * SandboxService.instantiate 启动隔离实例并返回 sessionId。
   *
   * 整个加载/实例化用 {@link raceLoadTimeout} 以 {@link PLOT_LOAD_TIMEOUT_MS}
   * (10s) 包裹：超时则抛出结构化 LOAD_TIMEOUT 错误，客户端据此显示失败原因并
   * 返回地图视图 (R1.7)。
   */
  async enterPlot(userId: string, plotId: string): Promise<EnterPlotResponse> {
    return this.raceLoadTimeout(
      this.loadAndInstantiate(userId, plotId),
      plotId,
    );
  }

  // ============================================================
  // Enter / discovery helpers
  // ============================================================

  /** 加载权威 ECS_World、选隔离级、注入只读 handle 并实例化沙箱会话 (R1.4)。 */
  private async loadAndInstantiate(
    userId: string,
    plotId: string,
  ): Promise<EnterPlotResponse> {
    const plot = await this.plotRepo.findOne({ where: { id: plotId } });
    if (!plot) {
      throw new NotFoundException(`Plot not found: ${plotId}`);
    }
    if (!plot.ecsVersionId) {
      throw new NotFoundException(
        `Plot "${plotId}" has no ECS_World to instantiate`,
      );
    }

    // 加载 Plot 权威 ECS_World (当前版本快照)。
    const ecsWorld = await this.ecsWorldService.loadWorldAtVersion(
      plot.ecsVersionId,
    );

    // 按 substrateTier 决定隔离级 (A=L0 / B=L1 / C=L2)。
    const isolationLevel = TIER_ISOLATION[plot.substrateTier];

    // 体验声明授权的能力子集 (Tier_B rules / Tier_C logicModules)；L0 为空。
    const grantedCaps = this.collectGrantedCaps(ecsWorld);

    // 服务端解析进入者资产为只读 handle (无所有权凭证)；解析器未就绪则空数组占位。
    const readonlyAssetHandles = await this.resolveReadonlyHandlesSafe(
      userId,
      plotId,
    );

    const { sessionId } = await this.sandboxService.instantiate(
      plotId,
      isolationLevel,
      grantedCaps,
      'full',
    );

    return { sessionId, ecsWorld, isolationLevel, readonlyAssetHandles };
  }

  /**
   * 以 {@link plotLoadTimeoutMs} 包裹加载工作，超时抛结构化 LOAD_TIMEOUT (R1.7)。
   * 无论成功 / 失败都清理定时器，避免悬挂句柄。
   */
  private async raceLoadTimeout<T>(work: Promise<T>, plotId: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const error: WorldCreationError = {
          error: 'LOAD_TIMEOUT',
          detail: `Plot "${plotId}" failed to load within ${this.plotLoadTimeoutMs}ms`,
        };
        reject(new RequestTimeoutException(error));
      }, this.plotLoadTimeoutMs);
    });
    try {
      return await Promise.race([work, timeout]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  /**
   * 收集体验声明授权的 World_API 能力子集 (deny-by-default 的授权面)：
   * Tier_B 从 rules[].do[].cap，Tier_C 从 logicModules[].capabilities。
   * 仅声明用途，不在此校验白名单 (由 SandboxService 分派时双门控)。
   */
  private collectGrantedCaps(
    world: EcsWorld,
  ): Array<WorldApiCapability | string> {
    const caps = new Set<string>();
    for (const rule of world.rules ?? []) {
      for (const action of rule.do ?? []) {
        if (action?.cap) {
          caps.add(action.cap);
        }
      }
    }
    for (const mod of world.logicModules ?? []) {
      for (const cap of mod.capabilities ?? []) {
        caps.add(cap);
      }
    }
    return Array.from(caps);
  }

  /**
   * 解析进入者资产为只读 handle (R9.1)；IdentityResolver 尚未就绪 (并行任务 11.1)
   * 或解析失败时，以空数组占位，不阻塞进入流程。
   */
  private async resolveReadonlyHandlesSafe(
    userId: string,
    plotId: string,
  ): Promise<ReadonlyAssetHandle[]> {
    try {
      return await this.identityResolver.resolveReadonlyHandles(userId, plotId);
    } catch (err) {
      this.logger.debug(
        `identity resolver unavailable for plot=${plotId}: ${
          err instanceof Error ? err.message : String(err)
        }; injecting empty read-only handles`,
      );
      return [];
    }
  }

  /** 解析 userId 拥有的 AgentAccount id 集合 (用于 owner 判定)；失败回退空集。 */
  private async resolveOwnerAccountIds(userId: string): Promise<Set<string>> {
    if (!userId) {
      return new Set();
    }
    try {
      const { items } = await this.agentAccountService.findByOwner(userId, 1, 100);
      return new Set((items ?? []).map((account) => account.id));
    } catch {
      // owner 解析失败不阻塞预览 (canEnter 退化为仅依据可见状态)。
      return new Set();
    }
  }
}
