import { Injectable, Logger } from '@nestjs/common';

import { CreationRepository } from '../creation.repository';
import { CreationLegacyMapService } from '../creation-legacy-map.service';
import { CreationEntity } from '../entities/creation.entity';
import type { CreationLegacySourceType } from '../entities/creation-legacy-map.entity';
import type { CreationMetrics, CreationStatus, CreationType } from '../../../../shared/types/creation';
import type { SubstrateTier } from '../../../../shared/types/world-creation';
import type { AeonPlotPoi } from '../../../../shared/types/aeon-world';

const EMPTY_METRICS: CreationMetrics = { views: 0, likes: 0, sales: 0, comments: 0 };

/** 双写入参:legacy 写发生时,把对象的统一投影同步到 Creation 影子。 */
export interface DualWriteInput {
  sourceType: CreationLegacySourceType;
  legacyId: string;
  ownerAccountId: string;
  originalCreatorAccountId?: string;
  type: CreationType;
  status: CreationStatus;
  title: string;
  substrateTier?: SubstrateTier;
  ecsVersionId?: string | null;
  geo?: { lat: number; lng: number; gridCell: string } | null;
  poi?: AeonPlotPoi | null;
  shareCode?: string | null;
}

/**
 * CreationDualWriteService — 深合并双写过渡(world-creation-feed task 12.1)。
 *
 * spec: 需求 12.4/12.5 —— 新建/编辑旧对象(aeon_plot / world_plot)时,同时写一份
 * Creation 影子并维护 legacy 映射;读仍走旧路径,creations 作影子供对账。幂等:
 * 已有映射则**更新**对应 Creation,否则新建 + 记录映射。
 *
 * 由旧写路径(aeon plot.service / world-creation plot.service)在 create/update 后调用
 * (接线点由各自模块按灰度开关挂载;本服务只提供幂等 upsert 原语,避免循环依赖)。
 */
@Injectable()
export class CreationDualWriteService {
  private readonly logger = new Logger(CreationDualWriteService.name);

  constructor(
    private readonly repo: CreationRepository,
    private readonly legacyMap: CreationLegacyMapService,
  ) {}

  /** 幂等同步一条 legacy 写到 Creation 影子(返回影子 creationId)。 */
  async syncShadow(input: DualWriteInput): Promise<string> {
    const existingId = await this.legacyMap.resolveCreationId(input.sourceType, input.legacyId);

    if (existingId) {
      const existing = await this.repo.findById(existingId);
      if (existing) {
        this.applyFields(existing, input);
        await this.repo.save(existing);
        return existing.id;
      }
    }

    const entity = this.repo.create({
      ownerAccountId: input.ownerAccountId,
      originalCreatorAccountId: input.originalCreatorAccountId ?? input.ownerAccountId,
      type: input.type,
      status: input.status,
      title: input.title,
      substrateTier: input.substrateTier ?? 'A',
      ecsVersionId: input.ecsVersionId ?? null,
      boundAgentId: null,
      geo: input.geo ?? null,
      geoGridCell: input.geo?.gridCell ?? null,
      poi: input.poi ?? null,
      preview: null,
      offerings: [],
      manifestVersion: 0,
      shareCode: input.shareCode ?? null,
      metrics: { ...EMPTY_METRICS },
    });
    const saved = await this.repo.save(entity);
    // backfilled=false → 标记为"双写过渡"即时写入(与批量回填区分,需求 12.1)。
    await this.legacyMap.recordMapping({
      sourceType: input.sourceType,
      legacyId: input.legacyId,
      creationId: saved.id,
      backfilled: false,
    });
    this.logger.debug(`dual-write shadow created: ${input.sourceType}:${input.legacyId} → ${saved.id}`);
    return saved.id;
  }

  private applyFields(c: CreationEntity, input: DualWriteInput): void {
    c.ownerAccountId = input.ownerAccountId;
    if (input.originalCreatorAccountId) c.originalCreatorAccountId = input.originalCreatorAccountId;
    c.type = input.type;
    c.status = input.status;
    c.title = input.title;
    if (input.substrateTier) c.substrateTier = input.substrateTier;
    if (input.ecsVersionId !== undefined) c.ecsVersionId = input.ecsVersionId;
    if (input.geo !== undefined) {
      c.geo = input.geo;
      c.geoGridCell = input.geo?.gridCell ?? null;
    }
    if (input.poi !== undefined) c.poi = input.poi;
    if (input.shareCode !== undefined) c.shareCode = input.shareCode;
  }
}
