import { Injectable } from '@nestjs/common';

import { CreationRepository } from '../creation.repository';
import { CreationEntity } from '../entities/creation.entity';
import type { CreationType } from '../../../../shared/types/creation';

/**
 * 创作流个性化与冷启动接缝(world-creation-feed task 3.2)。
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design}.md
 *   - 需求 5.6:创作流支持排序/推荐口径(最新/热度/关注/附近)。
 *   - 需求 5.9:创作流冷启动 —— 内容稀少时以官方/种子/跨地域内容填充,
 *     保证新用户首次进入即有可刷内容。
 *   - design §Discovery Surfaces ② 创作流:冷启动以官方/种子/跨地域内容填充。
 *
 * 本文件把两处"外部依赖"抽象为可注入接缝,使 CreationDiscoveryService 不直接
 * 耦合到尚未落地的社交图谱(阶段 8)与运营种子来源:
 *
 *   1. {@link CreationFollowResolver} —— 解析浏览者关注的创作者 id 集合,供
 *      `following` 口径筛选。social 关注关系在阶段 8 才落地,故此处仅定义接缝;
 *      未绑定实现时 feed 优雅降级(见服务层)。
 *   2. {@link CreationSeedSource} —— 冷启动种子内容源。默认实现以"全局可发现的
 *      高热创作"作为跨地域填充(无需新增 schema 列即可保证新用户有内容);
 *      运营可替换为基于种子标记/官方账号的实现。
 */

// ============================================================
// ① 关注图谱解析接缝(following 口径,需求 5.6)
// ============================================================

/**
 * 关注图谱解析器 —— 解析某浏览者关注的"创作者账户 id"集合。
 *
 * 依赖说明(阶段 8 social):关注关系存储尚未建立。本接口为接缝,允许在
 * social 落地后注入真实实现(读关注关系表)。在此之前不绑定任何 provider,
 * CreationDiscoveryService 以 `@Optional()` 注入,缺省时 `following` 降级为
 * `newest`(需求 5.9:新用户始终有内容)。
 */
export interface CreationFollowResolver {
  /**
   * 返回 `viewerAccountId` 关注的创作者账户 id 列表。
   * 关注空列表为合法结果(用户未关注任何人)—— 与"解析器不可用"语义不同。
   */
  resolveFollowedCreatorIds(viewerAccountId: string): Promise<string[]>;
}

/** 关注图谱解析器注入令牌(阶段 8 绑定真实实现)。 */
export const CREATION_FOLLOW_RESOLVER = Symbol('CREATION_FOLLOW_RESOLVER');

// ============================================================
// ② 冷启动种子内容源(需求 5.9)
// ============================================================

/** 种子内容拉取选项。 */
export interface SeedCreationQuery {
  /** 期望拉取的种子条数上限。 */
  limit: number;
  /** 需排除的 id(有机结果已含,避免重复)。 */
  excludeIds: string[];
  /** 可选类型过滤(与有机查询口径一致)。 */
  type?: CreationType;
}

/**
 * 冷启动种子内容源 —— 当有机(organic)结果稀少时提供填充内容(需求 5.9)。
 *
 * 实现需保证:
 *   - 仅返回可发现状态的 Creation(服务层仍会兜底过滤,defense in depth);
 *   - 返回顺序确定(给定输入产出稳定),以保证游标分页跨页不重不漏;
 *   - 已尽量排除 `excludeIds`(服务层仍会再次去重)。
 */
export interface CreationSeedSource {
  getSeedCreations(query: SeedCreationQuery): Promise<CreationEntity[]>;
}

/** 冷启动种子内容源注入令牌。 */
export const CREATION_SEED_SOURCE = Symbol('CREATION_SEED_SOURCE');

/**
 * DefaultCreationSeedSource — 默认冷启动种子源。
 *
 * 策略:以"全局可发现创作"作为**跨地域**填充池(需求 5.9 的"跨地域内容"),
 * 不依赖任何新增 schema 列或运营标记即可让新用户有内容可刷。服务层负责把这些
 * 种子按当前排序口径排序并去重后追加到有机结果之后。
 *
 * 运营可替换:后续若引入"种子标记/官方账号"白名单,实现一个新的
 * CreationSeedSource 并在模块用 `{ provide: CREATION_SEED_SOURCE, useClass }`
 * 覆盖即可,服务层无需改动(开闭原则)。
 */
@Injectable()
export class DefaultCreationSeedSource implements CreationSeedSource {
  constructor(private readonly repo: CreationRepository) {}

  async getSeedCreations(query: SeedCreationQuery): Promise<CreationEntity[]> {
    const exclude = new Set(query.excludeIds);
    // 拉取一个略大于所需的候选池,去重后截断(池子大小有上限防全表载入)。
    const poolSize = Math.min(Math.max(query.limit * 4, 50), 200);
    const pool = await this.repo.findDiscoverableCandidates({
      type: query.type,
      limit: poolSize,
    });
    return pool.filter((c) => !exclude.has(c.id)).slice(0, query.limit);
  }
}
