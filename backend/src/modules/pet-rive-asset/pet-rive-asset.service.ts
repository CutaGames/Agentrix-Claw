import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { PetRiveAsset } from '../../entities/pet-rive-asset.entity';

/**
 * PetRiveAssetService — Phase 2 W1 Rive 资产清单（骨架）
 *
 * 用途：
 *  - 桌面/移动/Web 渲染层启动时拉取「该灵魂 + 当前皮肤」对应的 .riv 文件
 *  - 渲染层根据 emotion 触发 Rive State Machine 的 trigger
 *
 * 当前实现：纯查询；上传 / 上架在 Phase 3 Marketplace 模块（不在本骨架范围）。
 */
@Injectable()
export class PetRiveAssetService {
  constructor(
    @InjectRepository(PetRiveAsset)
    private readonly repo: Repository<PetRiveAsset>,
  ) {}

  /** 取灵魂的默认 Rive（kind='default' 优先；若无则返回通用兜底 soulTemplateId IS NULL） */
  async getDefaultBySoul(soulTemplateId: string): Promise<PetRiveAsset | null> {
    let row = await this.repo.findOne({
      where: { soulTemplateId, kind: 'default', retired: false },
      order: { version: 'DESC' },
    });
    if (row) return row;
    return this.repo.findOne({
      where: { soulTemplateId: IsNull(), kind: 'default', retired: false },
      order: { version: 'DESC' },
    });
  }

  /** 列出灵魂的全部 Rive 资产（默认 + 季节 + 联名） */
  async listBySoul(soulTemplateId: string): Promise<PetRiveAsset[]> {
    return this.repo.find({
      where: { soulTemplateId, retired: false },
      order: { kind: 'ASC', version: 'DESC' },
    });
  }

  async findById(id: string): Promise<PetRiveAsset> {
    const r = await this.repo.findOne({ where: { id, retired: false } });
    if (!r) throw new NotFoundException(`pet-rive-asset ${id} not found`);
    return r;
  }

  toDto(a: PetRiveAsset) {
    return {
      id: a.id,
      soul_template_id: a.soulTemplateId,
      skin_id: a.skinId,
      kind: a.kind,
      display_name: a.displayName,
      url: a.url,
      thumbnail_url: a.thumbnailUrl,
      state_machine: a.stateMachine,
      emotion_map: a.emotionMap || {},
      perf_baseline: a.perfBaseline || {},
      version: a.version,
    };
  }
}
