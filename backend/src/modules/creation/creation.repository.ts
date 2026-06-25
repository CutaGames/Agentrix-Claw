import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { CreationEntity } from './entities/creation.entity';
import { DISCOVERABLE_STATUSES } from './creation-state-machine';
import type { CreationType, CreationVerb } from '../../../shared/types/creation';

/** 地图模式视口包围盒(经纬度上下界)。 */
export interface DiscoveryBbox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

/**
 * CreationRepository — 统一 Creation 注册表的数据访问层(world-creation-feed task 1.1)。
 *
 * 仅承载持久化原语(查/存/删),不含业务规则:
 *   - 状态机转换守卫 → task 1.2;
 *   - CRUD + 状态流转编排服务 → task 1.5。
 *
 * 薄封装 TypeORM `Repository<CreationEntity>`,为后续服务提供稳定的注入点,
 * 把 ORM 细节(乐观锁、jsonb 列、SnakeNamingStrategy)收敛在此处。
 */
@Injectable()
export class CreationRepository {
  constructor(
    @InjectRepository(CreationEntity)
    private readonly repo: Repository<CreationEntity>,
  ) {}

  /** 暴露底层 TypeORM 仓库,供需要 QueryBuilder / 事务的高级查询使用(task 1.5/3.1)。 */
  get orm(): Repository<CreationEntity> {
    return this.repo;
  }

  /** 新建一个未持久化的实体实例(交由调用方补全字段后 save)。 */
  create(partial: Partial<CreationEntity>): CreationEntity {
    return this.repo.create(partial);
  }

  /** 保存(插入或更新)一个 Creation;乐观锁版本由 @VersionColumn 维护。 */
  async save(entity: CreationEntity): Promise<CreationEntity> {
    return this.repo.save(entity);
  }

  /** 按 id 查找;不存在返回 null。 */
  async findById(id: string): Promise<CreationEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  /** 批量按 id 查找(保发现层投影/批量解析用)。 */
  async findByIds(ids: string[]): Promise<CreationEntity[]> {
    if (ids.length === 0) return [];
    return this.repo.find({ where: { id: In(ids) } });
  }

  /** 按可分享短码查找(深链解析,需求 3.6 / 8.4);不存在返回 null。 */
  async findByShareCode(shareCode: string): Promise<CreationEntity | null> {
    return this.repo.findOne({ where: { shareCode } });
  }

  /** 列出某账户拥有的全部 Creation(「我的创作」管理,需求 10.4)。 */
  async findByOwner(ownerAccountId: string): Promise<CreationEntity[]> {
    return this.repo.find({
      where: { ownerAccountId },
      order: { updatedAt: 'DESC' },
    });
  }

  /** 列出多个 owner 账户(用户的全部 AgentAccount + userId 兜底)拥有的全部 Creation。 */
  async findByOwners(ownerAccountIds: string[]): Promise<CreationEntity[]> {
    const ids = [...new Set((ownerAccountIds || []).filter(Boolean))];
    if (ids.length === 0) return [];
    return this.repo.find({
      where: { ownerAccountId: In(ids) },
      order: { updatedAt: 'DESC' },
    });
  }

  /** 删除一个 Creation(测试/迁移收口用;业务下架走状态机 unpublished)。 */
  async deleteById(id: string): Promise<void> {
    await this.repo.delete({ id });
  }

  // ============================================================
  // 统一发现层查询(world-creation-feed task 3.1)
  //
  // 三发现面(map / feed / agentSearch)共享同一注册表(design §Discovery
  // Surfaces)。本层只负责 SQL 可下推的过滤:
  //   - **审核前置(Property 4)**:一律仅返回 status ∈ DISCOVERABLE_STATUSES
  //     {published, listed} 的 Creation —— 在数据源处即收敛,杜绝非可发现内容
  //     进入任何发现面(需求 3.1/3.4)。
  //   - 结构化粗过滤:bbox(地图)、类型、标准动词(Agent 检索)。
  //
  // 不可下推的精筛(半径 haversine、价格上限、语义相关度、信任级)由
  // CreationDiscoveryService 在应用层完成;排序/游标分页亦在服务层统一处理,
  // 以便三形态共用一致的投影与一致性保证。
  // ============================================================

  /** 可发现状态的 QueryBuilder 基底(审核前置,Property 4)。 */
  private discoverableQb(alias = 'c') {
    return this.repo
      .createQueryBuilder(alias)
      .where(`${alias}.status IN (:...statuses)`, {
        statuses: [...DISCOVERABLE_STATUSES],
      });
  }

  /**
   * ① 地图模式 —— 视口包围盒内、带地理锚点的可发现 Creation(需求 4.1)。
   *
   * geo 为 jsonb,经 `->>` 抽取 lat/lng 做范围过滤;`geo_grid_cell IS NOT NULL`
   * 快速排除纯内容创作(无地理,需求 1.7)。中心+半径查询由服务层换算为 bbox
   * 后复用本方法,再以 haversine 精筛。
   */
  async findDiscoverableInBbox(
    bbox: DiscoveryBbox,
    type?: CreationType,
  ): Promise<CreationEntity[]> {
    const qb = this.discoverableQb('c')
      .andWhere('c.geo_grid_cell IS NOT NULL')
      .andWhere(`(c.geo ->> 'lat')::double precision BETWEEN :minLat AND :maxLat`, {
        minLat: bbox.minLat,
        maxLat: bbox.maxLat,
      })
      .andWhere(`(c.geo ->> 'lng')::double precision BETWEEN :minLng AND :maxLng`, {
        minLng: bbox.minLng,
        maxLng: bbox.maxLng,
      });
    if (type) {
      qb.andWhere('c.type = :type', { type });
    }
    return qb.getMany();
  }

  /**
   * ② 创作流模式 —— 全部可发现 Creation(需求 5.1)。
   *
   * 排序口径(newest/hot/following/nearby)、游标分页与 `nearby` 距离排序在服务层
   * 统一处理(task 3.1/3.2),故此处仅按 createdAt 倒序返回有界候选集,既给出
   * 稳定的默认顺序(newest),又用 `limit` 防止全表载入。
   */
  async findDiscoverableCandidates(opts?: {
    type?: CreationType;
    limit?: number;
  }): Promise<CreationEntity[]> {
    const qb = this.discoverableQb('c').orderBy('c.created_at', 'DESC');
    if (opts?.type) {
      qb.andWhere('c.type = :type', { type: opts.type });
    }
    qb.take(opts?.limit ?? 1000);
    return qb.getMany();
  }

  /**
   * ③ Agent 能力检索 —— 可发现 + offerings 支持全部所需标准动词(需求 13.1)。
   *
   * offerings 为 jsonb 数组(每项含 `verbs`);用 `@>` 容器包含算子按
   * `[{ "verbs": ["<verb>"] }]` 逐动词收敛(要求同时满足全部所需动词)。
   * 价格/地理/语义/信任等精筛在服务层完成。
   */
  async findDiscoverableForAgent(opts?: {
    verbs?: CreationVerb[];
    type?: CreationType;
    limit?: number;
  }): Promise<CreationEntity[]> {
    const qb = this.discoverableQb('c').orderBy('c.created_at', 'DESC');
    if (opts?.type) {
      qb.andWhere('c.type = :type', { type: opts.type });
    }
    (opts?.verbs ?? []).forEach((verb, i) => {
      qb.andWhere(`c.offerings @> :verbFilter${i}`, {
        [`verbFilter${i}`]: JSON.stringify([{ verbs: [verb] }]),
      });
    });
    qb.take(opts?.limit ?? 1000);
    return qb.getMany();
  }
}
