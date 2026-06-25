import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CreationRepository } from '../creation.repository';
import { CreationLegacyMapService } from '../creation-legacy-map.service';
import { CreationEntity } from '../entities/creation.entity';
import { WorldPlot } from '../../world-creation/entities/world-plot.entity';
import { AeonPlot } from '../../aeon/entities/aeon-plot.entity';

import type { CreationStatus, CreationType, CreationMetrics } from '../../../../shared/types/creation';
import type { AeonPlotPoi } from '../../../../shared/types/aeon-world';

/** 回填批次结果。 */
export interface BackfillResult {
  scanned: number;
  created: number;
  skipped: number;
}

/** 对账结果(Property 6 脚手架)。 */
export interface ReconcileResult {
  worldPlots: { legacy: number; mapped: number };
  aeonPlots: { legacy: number; mapped: number };
  consistent: boolean;
}

const EMPTY_METRICS: CreationMetrics = { views: 0, likes: 0, sales: 0, comments: 0 };

/** v6 world_plot.status(枚举值一致)→ CreationStatus。 */
function mapWorldPlotStatus(s: string): CreationStatus {
  const allowed: CreationStatus[] = ['draft', 'published', 'listed', 'unpublished', 'suspended'];
  return (allowed as string[]).includes(s) ? (s as CreationStatus) : 'draft';
}

/** Aeon plot.status(active/dormant)→ CreationStatus。 */
function mapAeonStatus(s: string): CreationStatus {
  return s === 'active' ? 'published' : 'unpublished';
}

/**
 * CreationBackfillService — 深合并迁移之「幂等回填 + 对账」(world-creation-feed task 12.2 / 12.5)。
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design}.md(§Migration Strategy)
 *   - 需求 12.2:回填 aeon_plot→Creation(geo 维度)、world_plots/ecs→Creation(内容维度),
 *     建立 legacy 映射;幂等(已映射则跳过)。
 *   - 需求 12.5 / Property 6:对账比对 legacy 与 creations 一致性。
 *
 * 单一 Creation 同时承载两维度(需求 12.6):
 *   - world_plot → 内容维度(substrateTier / ecsVersionId / status);
 *   - aeon_plot  → 地理维度(geo / poi)。
 * 二者各自经 legacy 映射去重;同一物理对象未来可合并为一个 Creation 的两维度
 * (本脚手架先各自建 Creation + 映射,合并维度的撮合作为后续增强)。
 *
 * 注:仅承载后台分批回填编排;读切换/灰度/回滚(12.4)由运维侧按 cohort 控制。
 * owner 维度:world_plot.ownerAccountId 为 AgentAccount id;aeon_plot.ownerUserId 为
 * userId —— 回填时各自原样写入 ownerAccountId(精确账户撮合为后续增强,已在此标注)。
 */
@Injectable()
export class CreationBackfillService {
  private readonly logger = new Logger(CreationBackfillService.name);

  constructor(
    private readonly repo: CreationRepository,
    private readonly legacyMap: CreationLegacyMapService,
    @InjectRepository(WorldPlot)
    private readonly worldPlotRepo: Repository<WorldPlot>,
    @InjectRepository(AeonPlot)
    private readonly aeonPlotRepo: Repository<AeonPlot>,
  ) {}

  /** 回填 v6 world_plots → Creation(内容维度);幂等。 */
  async backfillWorldPlots(batchSize = 200): Promise<BackfillResult> {
    const rows = await this.worldPlotRepo.find({ take: batchSize });
    let created = 0;
    let skipped = 0;
    for (const p of rows) {
      const existing = await this.legacyMap.resolveCreationId('world_plot', p.id);
      if (existing) { skipped += 1; continue; }
      const entity = this.repo.create({
        ownerAccountId: p.ownerAccountId ?? '00000000-0000-0000-0000-000000000000',
        originalCreatorAccountId: p.originalCreatorAccountId ?? p.ownerAccountId ?? '00000000-0000-0000-0000-000000000000',
        type: 'place' as CreationType,
        status: mapWorldPlotStatus(p.status as unknown as string),
        title: p.title ?? `Plot ${p.mapX},${p.mapY}`,
        substrateTier: p.substrateTier,
        ecsVersionId: p.ecsVersionId ?? null,
        boundAgentId: p.boundAgentId ?? null,
        geo: null,
        geoGridCell: null,
        poi: null,
        preview: null,
        offerings: [],
        manifestVersion: 0,
        shareCode: p.shareCode ?? null,
        metrics: { ...EMPTY_METRICS },
      });
      const saved = await this.repo.save(entity);
      await this.legacyMap.recordMapping({ sourceType: 'world_plot', legacyId: p.id, creationId: saved.id, backfilled: true });
      created += 1;
    }
    this.logger.log(`backfillWorldPlots: scanned=${rows.length} created=${created} skipped=${skipped}`);
    return { scanned: rows.length, created, skipped };
  }

  /** 回填 Aeon aeon_plots → Creation(地理维度);幂等。 */
  async backfillAeonPlots(batchSize = 200): Promise<BackfillResult> {
    const rows = await this.aeonPlotRepo.find({ take: batchSize });
    let created = 0;
    let skipped = 0;
    for (const p of rows) {
      const existing = await this.legacyMap.resolveCreationId('aeon_plot', p.id);
      if (existing) { skipped += 1; continue; }
      const poi = (p.poi as AeonPlotPoi | null) ?? null;
      const entity = this.repo.create({
        ownerAccountId: p.ownerUserId,
        originalCreatorAccountId: p.ownerUserId,
        type: (poi ? 'shop' : 'place') as CreationType,
        status: mapAeonStatus(p.status),
        title: p.displayName ?? '未命名领地',
        substrateTier: 'A',
        ecsVersionId: null,
        boundAgentId: null,
        geo: { lat: p.lat, lng: p.lng, gridCell: p.gridCell },
        geoGridCell: p.gridCell,
        poi,
        preview: null,
        offerings: [],
        manifestVersion: 0,
        shareCode: null,
        metrics: { ...EMPTY_METRICS },
      });
      const saved = await this.repo.save(entity);
      await this.legacyMap.recordMapping({ sourceType: 'aeon_plot', legacyId: p.id, creationId: saved.id, backfilled: true });
      created += 1;
    }
    this.logger.log(`backfillAeonPlots: scanned=${rows.length} created=${created} skipped=${skipped}`);
    return { scanned: rows.length, created, skipped };
  }

  /** 对账(Property 6 脚手架):比对 legacy 总量与已映射量。 */
  async reconcile(): Promise<ReconcileResult> {
    const [wpLegacy, apLegacy] = await Promise.all([
      this.worldPlotRepo.count(),
      this.aeonPlotRepo.count(),
    ]);
    let wpMapped = 0;
    let apMapped = 0;
    const wp = await this.worldPlotRepo.find({ select: ['id'] });
    for (const p of wp) if (await this.legacyMap.resolveCreationId('world_plot', p.id)) wpMapped += 1;
    const ap = await this.aeonPlotRepo.find({ select: ['id'] });
    for (const p of ap) if (await this.legacyMap.resolveCreationId('aeon_plot', p.id)) apMapped += 1;

    const consistent = wpMapped === wpLegacy && apMapped === apLegacy;
    return {
      worldPlots: { legacy: wpLegacy, mapped: wpMapped },
      aeonPlots: { legacy: apLegacy, mapped: apMapped },
      consistent,
    };
  }
}
