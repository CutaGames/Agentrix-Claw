import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
  CreationLegacyMapEntity,
  CreationLegacySourceType,
} from './entities/creation-legacy-map.entity';

/** 记录一条 legacy ↔ creation 映射的入参。 */
export interface RecordLegacyMappingInput {
  sourceType: CreationLegacySourceType;
  legacyId: string;
  creationId: string;
  /** true 表示由批量回填脚本(需求 12.2)写入;false/缺省表示双写过渡(需求 12.1)即时写入。 */
  backfilled?: boolean;
}

/**
 * CreationLegacyMapService — legacy ↔ Creation 映射的读写适配器(world-creation-feed task 1.4)。
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design}.md(§Migration Strategy 阶段 1–2)
 *
 * 这是深合并迁移的统一"接缝",供后续任务复用:
 *   - 双写过渡(task 12.1):新建/编辑旧对象时调用 `recordMapping` 建立影子 Creation 映射。
 *   - 幂等回填(task 12.2):批量回填时先 `resolveCreationId` 去重,未命中才新建并 `recordMapping`。
 *   - 对账 / 读切换(task 12.4):用 `resolveLegacyId` / `resolveLegacyRefs` 反向回溯比对。
 *
 * 仅承载映射的持久化原语,不含回填/对账业务编排(留给阶段 12 任务)。
 */
@Injectable()
export class CreationLegacyMapService {
  constructor(
    @InjectRepository(CreationLegacyMapEntity)
    private readonly repo: Repository<CreationLegacyMapEntity>,
  ) {}

  /**
   * 记录(或更新)一条 legacy ↔ creation 映射。
   *
   * 幂等:以 (sourceType, legacyId) 为业务键 upsert —— 重复回填同一 legacy 对象不会产生重复行,
   * 而是把它指向(可能更新后的)creationId,满足"幂等回填"(需求 12.2)。
   */
  async recordMapping(input: RecordLegacyMappingInput): Promise<CreationLegacyMapEntity> {
    const { sourceType, legacyId, creationId, backfilled } = input;
    const existing = await this.repo.findOne({ where: { sourceType, legacyId } });

    if (existing) {
      existing.creationId = creationId;
      if (backfilled) existing.backfilledAt = new Date();
      return this.repo.save(existing);
    }

    const entity = this.repo.create({
      sourceType,
      legacyId,
      creationId,
      backfilledAt: backfilled ? new Date() : null,
    });
    return this.repo.save(entity);
  }

  /**
   * 正向解析:给定 legacy 源 → 其映射的 creationId;未建立映射返回 null。
   * 双写过渡(需求 12.1)用于判断旧对象是否已有影子 Creation。
   */
  async resolveCreationId(
    sourceType: CreationLegacySourceType,
    legacyId: string,
  ): Promise<string | null> {
    const row = await this.repo.findOne({ where: { sourceType, legacyId } });
    return row?.creationId ?? null;
  }

  /**
   * 反向解析:给定 creationId + 来源维度 → 其 legacy id;未建立映射返回 null。
   * 对账(需求 12.2/12.5)用于回溯 Creation 的某一维度 legacy 源做字段比对。
   */
  async resolveLegacyId(
    creationId: string,
    sourceType: CreationLegacySourceType,
  ): Promise<string | null> {
    const row = await this.repo.findOne({ where: { creationId, sourceType } });
    return row?.legacyId ?? null;
  }

  /** 反向解析:给定 creationId → 其全部 legacy 源(geo + content 维度各 0..1 条)。 */
  async resolveLegacyRefs(creationId: string): Promise<CreationLegacyMapEntity[]> {
    return this.repo.find({ where: { creationId } });
  }

  /** 批量正向解析:给定同一来源类型的多个 legacy id → legacyId→creationId 映射表(回填批处理用)。 */
  async resolveCreationIds(
    sourceType: CreationLegacySourceType,
    legacyIds: string[],
  ): Promise<Map<string, string>> {
    if (legacyIds.length === 0) return new Map();
    const rows = await this.repo.find({
      where: { sourceType, legacyId: In(legacyIds) },
    });
    return new Map(rows.map((r) => [r.legacyId, r.creationId]));
  }
}
