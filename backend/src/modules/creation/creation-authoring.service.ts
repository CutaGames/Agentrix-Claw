import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CreationService } from './creation.service';
import { CreationPublishService } from './creation-publish.service';
import { CreationLegacyMapService } from './creation-legacy-map.service';
import { CreationEntity } from './entities/creation.entity';

// 复用 v6 创作引擎(不重建):prompt 驱动生成 + 三档连续谱编辑 + 版本/回滚。
import { AgentBuilderService } from '../world-creation/services/agent-builder.service';
import { CreationContinuumService } from '../world-creation/services/creation-continuum.service';
// 复用 v6 Creation_Task_Queue + Mobile Tier_C 强制路由(task 4.2,不重建):
//   - CreationTaskService:入队/派发/状态机(queued→running→completed|failed)。
//   - resolveCreationRouting:纯函数判定 Mobile Tier_C 必须派发离线(R3.7/R8.7)。
import { CreationTaskService } from '../world-creation/services/creation-task.service';
import { resolveCreationRouting } from '../world-creation/services/creation-routing';
import { WorldPlot } from '../world-creation/entities/world-plot.entity';
// 复用 v5 AgentAccount 解析「认证用户 → 其 AgentAccount」作为 Creation owner。
import { AgentAccount } from '../../entities/agent-account.entity';

import type {
  CreateCreationRequest,
  CreateCreationResponse,
  GenerateCreationRequest,
  GenerateCreationResponse,
  ContinueCreationRequest,
  ContinueCreationResponse,
} from '../../../shared/types/creation-api';
import type { Creation, CreationPreview } from '../../../shared/types/creation';
import type {
  CreationDispatchDecision,
  CreationTaskDto,
} from '../../../shared/types/world-creation-api';

/**
 * 后备 WorldPlot 的保留地图横坐标(world-creation-feed task 4.1)。
 *
 * 统一创作的 ECS 版本链由 v6 `EcsWorldService` 以 `plotId` 为键管理,因此每个有内容
 * 维度的 Creation 需要一个后备 WorldPlot 作为版本链锚点。这些后备 Plot 仅为内部记账,
 * **从不出现在统一地图**(地图可见性由 `Creation.geo` 驱动,非后备 Plot 的 mapX/mapY)。
 * 用一个负数保留带与真实地图网格(正坐标)隔离,避免占用真实选址坐标。
 */
const BACKING_PLOT_MAP_X = -1;

/** TypeORM/Postgres 唯一约束冲突错误码。 */
const PG_UNIQUE_VIOLATION = '23505';

/**
 * CreationAuthoringService — 统一创作入口的编排层(world-creation-feed task 4.1)。
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design}.md
 *   - 需求 2.1:自然语言提示词生成 ECS_World 草稿(promptDrive)。
 *   - 需求 2.2:promptDrive / coEdit / handBuild 三档连续谱,作用于同一份 ECS_World。
 *   - 需求 2.3:每次改动以结构化 diff 记录新版本,支持历史查看与回滚。
 *   - 需求 2.4:记录作者类型(user/agent)以区分归属。
 *
 * 设计:**复用而非重建**(design §Architecture / §Creation Authoring)。
 *   - Creation 实体(content-only / geo-only / both)的写入委托 {@link CreationService};
 *   - ECS 生成 / 连续谱编辑委托 v6 {@link AgentBuilderService} / {@link CreationContinuumService};
 *   - Creation ↔ 后备 WorldPlot 的桥接复用迁移接缝 {@link CreationLegacyMapService}
 *     (sourceType `world_plot`):首次需要内容时**惰性**为 Creation 派生一个后备 Plot
 *     作为 ECS 版本链锚点,并记录 legacy 映射;之后复用同一后备 Plot。
 *
 * 不在本任务范围:扫描素材质量门槛(task 4.3)、发布/审核(阶段 2,已落地于
 * CreationPublishService)。
 *
 * 本任务(task 4.2)在 task 4.1 编排之上加固创作的 Tier 校验与配额/成本上限,并补齐
 * Mobile Tier_C 的强制离线派发(需求 2.6/2.7/2.8):
 *   - **Tier 校验(需求 2.8)**:生成/编辑产物超出声明 Tier 的组件/能力时,v6 引擎
 *     ({@link AgentBuilderService.generateDraft} / {@link EcsWorldService.validateTier})
 *     返回结构化 `TIER_VIOLATION` 且不落库;本层原样透出(不旁路)。
 *   - **配额/成本上限(需求 2.7)**:生成前 v6 引擎经 `QuotaService` 校验月度成本上限;
 *     ≥80% 软阈值随成功响应透出 `quotaWarning`,达硬上限抛 `QUOTA_EXCEEDED`(阻断)。
 *   - **Tier_C 强制派发(需求 2.6)**:Mobile 发起的 Tier_C 创作 **不在本地执行**;
 *     generate 经 {@link resolveCreationRouting} 判定后改走 {@link CreationTaskService}
 *     入队派发到桌面端/Agent_Builder,并回报任务状态;continue 复用 v6 连续谱内置的
 *     派发决策,并由本层经同一 Creation_Task_Queue 实际入队、透出任务状态。
 */
@Injectable()
export class CreationAuthoringService {
  private readonly logger = new Logger(CreationAuthoringService.name);

  constructor(
    private readonly creationService: CreationService,
    private readonly publishService: CreationPublishService,
    private readonly legacyMap: CreationLegacyMapService,
    /** 复用 v6 prompt 驱动生成(promptDrive,需求 2.1)。 */
    private readonly agentBuilder: AgentBuilderService,
    /** 复用 v6 连续谱编排(promptDrive/coEdit/handBuild + 版本/回滚,需求 2.2/2.3)。 */
    private readonly continuum: CreationContinuumService,
    /** 复用 v6 Creation_Task_Queue:Mobile Tier_C 强制派发入队/状态机(需求 2.6,task 4.2)。 */
    private readonly creationTaskService: CreationTaskService,
    @InjectRepository(WorldPlot)
    private readonly plotRepo: Repository<WorldPlot>,
    @InjectRepository(AgentAccount)
    private readonly agentAccountRepo: Repository<AgentAccount>,
  ) {}

  // ============================================================
  // POST /v1/creations — 新建创作(可仅 geo / 仅内容 / 两者)(需求 1.6/1.7/2.1)
  // ============================================================

  /**
   * 新建一个 Creation;若携带 `prompt` 则在新建后立即触发一次 promptDrive 生成,
   * 等价于 create + generate 合并的低门槛"单一动作"入口(需求 2.1/2.9)。
   *
   * 三种形态由 `geo` 是否提供决定:省略 → 仅内容(纯线上,仅进创作流,需求 1.7);
   * 提供 → 带地理锚点(可进地图,需求 1.6);两者皆有时内容由 `prompt` 即时生成。
   *
   * @param userId 认证用户 id(配额计量 / author 归因)。
   * @param req    新建请求(类型/标题/可选 geo/可选 prompt)。
   */
  async createCreation(
    userId: string,
    req: CreateCreationRequest,
  ): Promise<CreateCreationResponse> {
    const ownerAccountId = await this.resolveOwnerAccountId(userId);

    const entity = await this.creationService.create({
      ownerAccountId,
      type: req.type,
      title: req.title,
      summary: req.summary ?? null,
      substrateTier: req.substrateTier,
      geo: req.geo ?? null,
    });

    // 无 inline prompt → 纯新建(草稿,内容维度可空)。
    if (!req.prompt) {
      return { creation: toCreationDto(entity) };
    }

    // 有 inline prompt → 立即 promptDrive 生成 ECS(单一动作)。
    const gen = await this.generate(userId, entity.id, {
      prompt: req.prompt,
      substrateTier: req.substrateTier,
      surface: req.surface,
    });

    const refreshed = await this.creationService.getById(entity.id);
    return {
      creation: toCreationDto(refreshed),
      ecsVersionId: gen.error ? undefined : gen.ecsVersionId,
      dispatch: gen.dispatch,
      task: gen.task,
      error: gen.error,
    };
  }

  // ============================================================
  // POST /v1/creations/:id/fork — Remix(血缘衍生)(P0-③)
  // ============================================================

  /**
   * Remix(fork)一个已发布创作:复制其内容指针(ecsVersion/preview/offerings/type)为
   * 一个新创作,owner=remixer、首创者=remixer,并设置血缘(parentCreationId / rootCreationId)。
   * 立即发布(母版已审核 + 预览已复制 → 通过发布管线)。衍生作品成交时由经济层按血缘给上游分润。
   */
  async forkCreation(userId: string, parentId: string): Promise<CreateCreationResponse> {
    const parent = await this.creationService.getById(parentId);
    if (parent.status !== 'published' && parent.status !== 'listed') {
      throw new BadRequestException('只能 Remix 已发布的创作');
    }
    const ownerAccountId = await this.resolveOwnerAccountId(userId);

    const created = await this.creationService.create({
      ownerAccountId,
      type: parent.type,
      title: `${parent.title}·Remix`.slice(0, 120),
      summary: parent.summary ?? null,
      substrateTier: parent.substrateTier,
      ecsVersionId: parent.ecsVersionId, // 引用母版快照(只读复用,衍生可再编辑产生新版本)
      preview: parent.preview ?? null,
      offerings: parent.offerings ?? [],
      parentCreationId: parent.id,
      rootCreationId: parent.rootCreationId ?? parent.id,
    });

    try {
      await this.publishService.publish(created.id, {});
    } catch (e: any) {
      this.logger.warn(`fork publish failed (${created.id}): ${e?.message ?? e}; left as draft.`);
    }

    const refreshed = await this.creationService.getById(created.id);
    return { creation: toCreationDto(refreshed) };
  }

  // ============================================================
  // POST /v1/creations/:id/generate — 提示词生成 ECS(复用 v6 generate)(需求 2.1)
  // ============================================================

  /**
   * 对一个 Creation 执行 prompt 驱动的 ECS_World 生成,成功后把新版本写回
   * `Creation.ecsVersionId`(内容编辑产生新版本而非覆盖,需求 1.5/2.1)。
   *
   * **Mobile Tier_C 强制派发(需求 2.6,task 4.2)**:Tier_C 创作自移动端发起时**不在
   * 本地执行**;经纯函数 {@link resolveCreationRouting} 判定后改走
   * {@link CreationTaskService} 入队为 Creation_Task,派发到桌面端/Agent_Builder,并回报
   * 任务状态(返回 `dispatch` + `task`,不生成本地版本)。其余情形(Tier_A/B 任意端、
   * 桌面/Web 的 Tier_C)在本地经 v6 引擎生成。
   *
   * 本地路径委托 v6 {@link AgentBuilderService.generateDraft}:其内部完成 tier 天花板
   * 约束(越界返回 TIER_VIOLATION,不落库,需求 2.8)、月度成本上限配额校验(≥80% 软
   * 阈值透出 `quotaWarning`,达硬上限抛 QUOTA_EXCEEDED 阻断,需求 2.7)、结构校验。
   */
  async generate(
    userId: string,
    creationId: string,
    req: GenerateCreationRequest,
  ): Promise<GenerateCreationResponse> {
    const creation = await this.creationService.getById(creationId);

    // 需求 2.6 — Mobile 发起的 Tier_C 生成强制派发离线(复用 Creation_Task_Queue)。
    const surface = req.surface ?? 'desktop';
    const routing = resolveCreationRouting(surface, creation.substrateTier);
    if (routing.mustDispatch) {
      const task = await this.dispatchTierCTask(userId, creation, routing, {
        kind: 'generate',
        creationId,
        prompt: req.prompt,
        substrateTier: req.substrateTier ?? creation.substrateTier,
      });
      return { dispatch: routing, task };
    }

    const plotId = await this.resolveBackingPlotId(creation);

    const res = await this.agentBuilder.generateDraft(userId, plotId, {
      prompt: req.prompt,
      substrateTier: req.substrateTier,
    });

    // 生成成功(有版本且无结构化错误)→ 把版本指针写回 Creation。
    if (res.versionId && !res.error) {
      await this.creationService.update(creationId, { ecsVersionId: res.versionId });
    }

    return {
      ecsVersionId: res.versionId,
      ecsWorld: res.ecsWorld,
      quotaWarning: res.quotaWarning,
      error: res.error,
    };
  }

  // ============================================================
  // POST /v1/creations/:id/continue — 连续谱编辑(prompt/coEdit/handBuild)(需求 2.2/2.3/2.4)
  // ============================================================

  /**
   * 在同一份 ECS_World 上按 `mode` 继续编辑(三档连续谱无损切换),产生带 diff 的新版本
   * (需求 2.2/2.3);改动作者类型(user/agent)由底层 diff 记录(需求 2.4)。
   *
   * 委托 v6 {@link CreationContinuumService.continueEditing}:其统一三模式入口、维护
   * 同一 diff/version 链(支持回滚,需求 2.3),并对 Mobile 发起的 Tier_C 创作返回
   * `dispatched` 派发决策(需求 2.6,task 4.2)。本层在 `applied` 且产生新版本时把版本
   * 指针写回 `Creation.ecsVersionId`,保持注册表与版本链一致;在 `dispatched` 时经
   * {@link CreationTaskService} 把创作实际入队为 Creation_Task(派发到桌面端/Agent_Builder)
   * 并把任务状态快照透出给调用方(需求 2.6:向用户反馈任务状态)。
   */
  async continue(
    userId: string,
    creationId: string,
    req: ContinueCreationRequest,
  ): Promise<ContinueCreationResponse> {
    const creation = await this.creationService.getById(creationId);
    const plotId = await this.resolveBackingPlotId(creation);

    const res = await this.continuum.continueEditing(userId, plotId, req);

    // 本地编辑成功并产生新版本 → 同步版本指针到 Creation。
    if (res.outcome === 'applied' && res.versionId && !res.error) {
      await this.creationService.update(creationId, { ecsVersionId: res.versionId });
      return res;
    }

    // 需求 2.6 — Mobile Tier_C 被派发离线:经 Creation_Task_Queue 实际入队并回报任务状态。
    if (res.outcome === 'dispatched' && res.dispatch?.mustDispatch) {
      const task = await this.dispatchTierCTask(userId, creation, res.dispatch, {
        kind: 'continue',
        creationId,
        mode: req.mode,
        prompt: req.prompt,
        instruction: req.instruction,
        ops: req.ops,
      });
      return { ...res, task };
    }

    return res;
  }

  // ============================================================
  // Internal — Mobile Tier_C 强制派发(复用 Creation_Task_Queue,需求 2.6)
  // ============================================================

  /**
   * 把一个 Mobile 发起的 Tier_C 创作入队为 Creation_Task 并派发离线(桌面端/Agent_Builder),
   * 返回任务状态快照供调用方跟踪(需求 2.6)。
   *
   * 复用 v6 {@link CreationTaskService.submit}:其内部以 {@link resolveCreationRouting} 再次
   * 强制路由(surface=mobile + Tier_C ⇒ 绝不 `self`),据 `routing.target` 选择 desktop/agent
   * 作为偏好目标,写 `creation_tasks`(status=queued)并经派发通道推进状态机。任务作用在
   * Creation 的后备 WorldPlot(ECS 版本链锚点)之上。
   */
  private async dispatchTierCTask(
    userId: string,
    creation: CreationEntity,
    routing: CreationDispatchDecision,
    input: Record<string, unknown>,
  ): Promise<CreationTaskDto> {
    const plotId = await this.resolveBackingPlotId(creation);
    const preferredTarget = routing.target === 'agent' ? 'agent' : 'desktop';

    const submitted = await this.creationTaskService.submit(userId, {
      plotId,
      target: preferredTarget,
      substrateTier: creation.substrateTier,
      surface: 'mobile',
      input,
    });

    this.logger.log(
      `Creation ${creation.id} Tier_${creation.substrateTier} authoring on mobile dispatched as ` +
        `Creation_Task ${submitted.task.taskId} → ${submitted.effectiveTarget} ` +
        `(status=${submitted.task.status}) — not run locally (需求 2.6)`,
    );

    return submitted.task;
  }

  // ============================================================
  // Internal — Creation ↔ 后备 WorldPlot 桥接(复用 legacy 映射接缝)
  // ============================================================

  /**
   * 解析(或惰性派生)一个 Creation 的后备 WorldPlot id —— ECS 版本链锚点。
   *
   * 已建立 `world_plot` legacy 映射 → 直接复用;否则派生一个新的后备 Plot
   * (继承 Creation 的 owner / originalCreator / substrateTier / boundAgentId /
   * 现有 ecsVersionId),并记录 legacy 映射(需求 12.1)。
   */
  private async resolveBackingPlotId(creation: CreationEntity): Promise<string> {
    const existing = await this.legacyMap.resolveLegacyId(creation.id, 'world_plot');
    if (existing) {
      return existing;
    }

    const plot = await this.provisionBackingPlot(creation);
    await this.legacyMap.recordMapping({
      sourceType: 'world_plot',
      legacyId: plot.id,
      creationId: creation.id,
    });
    this.logger.log(
      `Provisioned backing WorldPlot ${plot.id} for Creation ${creation.id} ` +
        `(Tier_${creation.substrateTier}) as ECS version-chain anchor`,
    );
    return plot.id;
  }

  /**
   * 派生一个后备 WorldPlot,坐标落在保留带(BACKING_PLOT_MAP_X,mapY 自增)。
   *
   * (mapX,mapY) 唯一约束:用保留带内 `MAX(mapY)+1` 分配,并发争抢导致唯一冲突时重试。
   * 这些坐标纯属内部记账(后备 Plot 不上图);Creation 的地图可见性由 `Creation.geo` 决定。
   */
  private async provisionBackingPlot(creation: CreationEntity): Promise<WorldPlot> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const row = await this.plotRepo
        .createQueryBuilder('p')
        .select('MAX(p.mapY)', 'maxY')
        .where('p.mapX = :x', { x: BACKING_PLOT_MAP_X })
        .getRawOne<{ maxY: number | string | null }>();
      const nextY = Number(row?.maxY ?? 0) + 1;

      const plot = this.plotRepo.create({
        ownerAccountId: creation.ownerAccountId,
        originalCreatorAccountId: creation.originalCreatorAccountId,
        substrateTier: creation.substrateTier,
        ecsVersionId: creation.ecsVersionId,
        boundAgentId: creation.boundAgentId,
        mapX: BACKING_PLOT_MAP_X,
        mapY: nextY,
        status: 'draft',
        title: creation.title,
      });

      try {
        return await this.plotRepo.save(plot);
      } catch (err) {
        if (isUniqueViolation(err) && attempt < 4) {
          continue; // 并发分配到同一 mapY → 重试取下一个空位。
        }
        throw err;
      }
    }
    // 理论不可达(重试上限内必有空位);兜底抛错避免静默。
    throw new Error(
      `Failed to provision a backing WorldPlot for Creation ${creation.id} after retries`,
    );
  }

  /**
   * 解析认证用户对应的 Creation owner 账户 id。
   *
   * 优先取该用户的主 AgentAccount(creditScore 最高);该用户尚无 AgentAccount 时
   * 回退为 userId(User.id 与 AgentAccount.id 同为 uuid,owner 列类型安全)。
   */
  private async resolveOwnerAccountId(userId: string): Promise<string> {
    const account = await this.agentAccountRepo.findOne({
      where: { ownerId: userId },
      order: { creditScore: 'DESC' },
    });
    return account?.id ?? userId;
  }

  /**
   * 解析认证用户「拥有」的全部 owner 账户 id —— 用于「我的世界」列出本人创作。
   * 返回该用户名下所有 AgentAccount.id + userId 兜底(创作时 ownerAccountId 取主账户 id,
   * 早期/无账户时回退 userId;两者都纳入,确保历史创作都能查到)。
   */
  async resolveOwnedAccountIds(userId: string): Promise<string[]> {
    if (!userId) return [];
    let accountIds: string[] = [];
    try {
      const accounts = await this.agentAccountRepo.find({ where: { ownerId: userId } });
      accountIds = accounts.map((a) => a.id);
    } catch {
      /* best-effort */
    }
    return [...new Set([...accountIds, userId])];
  }
}

/**
 * CreationEntity → 共享 `Creation` DTO 投影(跨端单一来源)。
 * 发布前草稿可能 preview 为 null;与发现层一致地兜底占位(草稿不入发现面)。
 */
export function toCreationDto(e: CreationEntity): Creation {
  const placeholderPreview: CreationPreview = { kind: 'cover', url: '' };
  return {
    id: e.id,
    ownerAccountId: e.ownerAccountId,
    originalCreatorAccountId: e.originalCreatorAccountId,
    type: e.type,
    status: e.status,
    title: e.title,
    summary: e.summary ?? undefined,
    substrateTier: e.substrateTier,
    ecsVersionId: e.ecsVersionId,
    boundAgentId: e.boundAgentId,
    geo: e.geo,
    poi: e.poi,
    preview: e.preview ?? placeholderPreview,
    offerings: e.offerings ?? [],
    manifestVersion: e.manifestVersion,
    shareCode: e.shareCode,
    metrics: e.metrics,
    createdAt: toEpochMs(e.createdAt),
    updatedAt: toEpochMs(e.updatedAt),
  };
}

/** Date / 时间戳 → epoch 毫秒(容忍内存仓库的 Date 或已是 number 的情况)。 */
function toEpochMs(value: Date | number | null | undefined): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return Date.now();
}

/** 判断是否为 Postgres 唯一约束冲突(后备 Plot 坐标并发分配重试用)。 */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === PG_UNIQUE_VIOLATION
  );
}
