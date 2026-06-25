import { Injectable, NotFoundException } from '@nestjs/common';
import { CreationRepository } from './creation.repository';
import { CreationStateMachine } from './creation-state-machine';
import { CreationEntity } from './entities/creation.entity';
import { toGridCell } from '../../../shared/types/aeon-world';
import type { AeonPlotPoi } from '../../../shared/types/aeon-world';
import type { SubstrateTier } from '../../../shared/types/world-creation';
import type {
  CreationMetrics,
  CreationPreview,
  CreationStatus,
  CreationType,
  Offering,
} from '../../../shared/types/creation';

/**
 * 新建 Creation 的入参(world-creation-feed task 1.5)。
 *
 * 三种形态(需求 1.6 / 1.7):
 *   - 仅内容(纯线上,省略 geo —— 仅进创作流);
 *   - 仅地理(提供 geo,内容维度初始可空 —— 地图上的点);
 *   - 两者皆有。
 *
 * 与 shared 契约 `CreateCreationRequest`(creation-api.ts)对齐;此为领域服务入参,
 * 控制器/端点的 DTO 适配在阶段 3/4 完成。
 */
export interface CreateCreationInput {
  /** 当前所有者账户 id(必填)。 */
  ownerAccountId: string;
  /** 创作类型。 */
  type: CreationType;
  /** 标题。 */
  title: string;
  /** 摘要(可空)。 */
  summary?: string | null;
  /** 声明的基底层级(默认 'A')。 */
  substrateTier?: SubstrateTier;
  /** 首创者账户 id;省略时默认 = ownerAccountId(沿用 v6 originalCreator 语义)。 */
  originalCreatorAccountId?: string;
  /** 当前 ECS_World 版本引用(纯地理创作可省略/为 null)。 */
  ecsVersionId?: string | null;
  /** 绑定的 Agent_Builder id(离线自治建造,可空)。 */
  boundAgentId?: string | null;
  /** 可选地理锚点(经纬度);省略 → 纯内容创作(需求 1.7)。 */
  geo?: { lat: number; lng: number } | null;
  /** 真实商家绑定 POI(可空)。 */
  poi?: AeonPlotPoi | null;
  /** 预览物(草稿期可空;发布时由 task 2.3 校验/补占位)。 */
  preview?: CreationPreview | null;
  /** 0..N 供给项(默认 [])。 */
  offerings?: Offering[];
  /** Remix 血缘:直接母版 / 血缘根(fork 时设置;原创省略)。 */
  parentCreationId?: string | null;
  rootCreationId?: string | null;
}

/**
 * 更新 Creation 字段的入参(world-creation-feed task 1.5)。
 *
 * 仅更新内容/地理/展示字段;**状态流转不走此入口**,必须走 {@link CreationService.transitionStatus}
 * 以经过状态机守卫(需求 1.4 / 3.1 / 3.4)。
 *
 * 语义:仅当某键**显式出现**在 patch 中(含值为 null)才更新对应列;未出现的键保持不变。
 * 这样 `{ geo: null }` 表示"清除地理锚点",而省略 `geo` 表示"不动地理"。
 */
export interface UpdateCreationInput {
  title?: string;
  summary?: string | null;
  type?: CreationType;
  substrateTier?: SubstrateTier;
  ecsVersionId?: string | null;
  boundAgentId?: string | null;
  /** null 清除地理锚点;对象则重算 gridCell 并同步 geoGridCell。 */
  geo?: { lat: number; lng: number } | null;
  poi?: AeonPlotPoi | null;
  preview?: CreationPreview | null;
  offerings?: Offering[];
}

/** 互动计数初始值(需求 1.3)。 */
const ZERO_METRICS: CreationMetrics = { views: 0, likes: 0, sales: 0, comments: 0 };

/**
 * CreationService — 统一 Creation 注册表的 CRUD + 状态流转编排(world-creation-feed task 1.5)。
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design}.md
 *   - 需求 1.1:以统一 Creation 对象表示创作(唯一 id / 创作者 / 类型 / 状态 /
 *               可空地理锚点 / 可空网格坐标 / 预览 / 内容引用)。
 *   - 需求 1.4:六态生命周期的状态流转,经状态机守卫。
 *   - 需求 1.6 / 1.7:支持仅内容 / 仅地理 / 两者皆有三种形态。
 *
 * 职责边界:
 *   - 持久化原语委托 {@link CreationRepository}(查/存/删);
 *   - 状态流转守卫委托 {@link CreationStateMachine}(单一守卫入口,审核前置 / 违规即移出);
 *   - 本服务负责把"领域规则"编排到一起:字段默认值、geo↔geoGridCell 同步、
 *     状态机校验后写回。
 *
 * 不在本任务范围:offering/能力清单派生(阶段 2)、发现层(阶段 3)、Agent 网关(阶段 9)。
 */
@Injectable()
export class CreationService {
  constructor(
    private readonly repo: CreationRepository,
    private readonly stateMachine: CreationStateMachine,
  ) {}

  // ============================================================
  // Create(需求 1.1 / 1.6 / 1.7)
  // ============================================================

  /**
   * 新建一个 Creation(初始 status=draft)。
   *
   * - geo 省略 → 纯内容创作(geo / geoGridCell 皆 null,需求 1.7);
   * - geo 提供 → 由 `toGridCell` 派生网格单元,并把 `geoGridCell` 扁平投影保持同步(需求 1.6);
   * - originalCreatorAccountId 省略时默认 = ownerAccountId。
   */
  async create(input: CreateCreationInput): Promise<CreationEntity> {
    const entity = this.repo.create({
      ownerAccountId: input.ownerAccountId,
      originalCreatorAccountId: input.originalCreatorAccountId ?? input.ownerAccountId,
      type: input.type,
      status: 'draft',
      title: input.title,
      summary: input.summary ?? null,
      substrateTier: input.substrateTier ?? 'A',
      ecsVersionId: input.ecsVersionId ?? null,
      boundAgentId: input.boundAgentId ?? null,
      poi: input.poi ?? null,
      preview: input.preview ?? null,
      offerings: input.offerings ?? [],
      manifestVersion: 0,
      shareCode: null,
      metrics: { ...ZERO_METRICS },
      parentCreationId: input.parentCreationId ?? null,
      rootCreationId: input.rootCreationId ?? null,
    });

    this.applyGeo(entity, input.geo ?? null);

    return this.repo.save(entity);
  }

  // ============================================================
  // Read(需求 1.1 / 3.6 / 10.4)
  // ============================================================

  /** 按 id 查找;不存在返回 null。 */
  async findById(id: string): Promise<CreationEntity | null> {
    return this.repo.findById(id);
  }

  /** 按 id 获取;不存在抛 NotFoundException。 */
  async getById(id: string): Promise<CreationEntity> {
    const entity = await this.repo.findById(id);
    if (!entity) {
      throw new NotFoundException(`Creation not found: ${id}`);
    }
    return entity;
  }

  /** 按可分享短码查找(深链解析,需求 3.6 / 8.4);不存在返回 null。 */
  async getByShareCode(shareCode: string): Promise<CreationEntity | null> {
    return this.repo.findByShareCode(shareCode);
  }

  /** 列出某账户拥有的全部 Creation(「我的创作」管理,需求 10.4)。 */
  async listByOwner(ownerAccountId: string): Promise<CreationEntity[]> {
    return this.repo.findByOwner(ownerAccountId);
  }

  // ============================================================
  // Update(字段更新,不含状态流转)
  // ============================================================

  /**
   * 更新 Creation 的内容/地理/展示字段(不含 status —— 状态流转走 {@link transitionStatus})。
   *
   * 仅更新 patch 中**显式出现**的键;`geo` 更新时重算 gridCell 并保持 `geoGridCell` 同步(task 1.1)。
   */
  async update(id: string, patch: UpdateCreationInput): Promise<CreationEntity> {
    const entity = await this.getById(id);

    if (has(patch, 'title')) entity.title = patch.title!;
    if (has(patch, 'summary')) entity.summary = patch.summary ?? null;
    if (has(patch, 'type')) entity.type = patch.type!;
    if (has(patch, 'substrateTier')) entity.substrateTier = patch.substrateTier!;
    if (has(patch, 'ecsVersionId')) entity.ecsVersionId = patch.ecsVersionId ?? null;
    if (has(patch, 'boundAgentId')) entity.boundAgentId = patch.boundAgentId ?? null;
    if (has(patch, 'poi')) entity.poi = patch.poi ?? null;
    if (has(patch, 'preview')) entity.preview = patch.preview ?? null;
    if (has(patch, 'offerings')) entity.offerings = patch.offerings ?? [];
    if (has(patch, 'geo')) this.applyGeo(entity, patch.geo ?? null);

    return this.repo.save(entity);
  }

  // ============================================================
  // State transition(需求 1.4 / 3.1 / 3.4)
  // ============================================================

  /**
   * 把一个 Creation 流转到目标状态。
   *
   * 先经 {@link CreationStateMachine.assertTransition} 守卫(非法转移抛
   * InvalidCreationTransitionError),通过后才写回 —— 落实"审核前置 / 违规即移出"
   * 等不变量(需求 3.1 / 3.4,Property 4)。同态(from === to)亦被守卫拒绝。
   */
  async transitionStatus(id: string, to: CreationStatus): Promise<CreationEntity> {
    const entity = await this.getById(id);
    this.stateMachine.assertTransition(entity.status, to);
    entity.status = to;
    return this.repo.save(entity);
  }

  // ============================================================
  // Internal
  // ============================================================

  /**
   * 把地理锚点写入实体,并保持扁平投影 `geoGridCell` 与 `geo.gridCell` 同步(task 1.1)。
   * geo 为 null → 清除两者;否则由 `toGridCell` 派生网格单元(前后端共用同一量化逻辑)。
   */
  private applyGeo(
    entity: CreationEntity,
    geo: { lat: number; lng: number } | null,
  ): void {
    if (geo === null) {
      entity.geo = null;
      entity.geoGridCell = null;
      return;
    }
    const gridCell = toGridCell(geo.lat, geo.lng);
    entity.geo = { lat: geo.lat, lng: geo.lng, gridCell };
    entity.geoGridCell = gridCell;
  }
}

/** 判断 patch 是否显式携带某键(含值为 null/undefined 的显式置位)。 */
function has<T extends object>(obj: T, key: keyof T): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}
