import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PetSkin } from '../../entities/pet-skin.entity';
import { PetActiveSkin } from '../../entities/pet-active-skin.entity';

export interface CreateSkinInput {
  ownerUserId: string | null;
  source: 'platform' | 'generated' | 'purchased' | 'remixed' | 'gifted';
  displayName: string;
  url: string;
  thumbnailUrl?: string | null;
  format?: 'svg' | 'rive' | 'vrm' | 'live2d';
  manifest?: Record<string, unknown>;
  sourceRefId?: string | null;
}

/**
 * PetSkinService — 用户皮肤资产管理 + 激活指针
 *
 * 职责：
 *  - 列出用户拥有的皮肤（含 platform 全局皮肤）
 *  - 激活某只皮肤（更新 pet_active_skins）
 *  - 注册新皮肤（PetCreator 完成 / Marketplace 购买回调使用）
 *
 * 不负责：
 *  - 实际渲染（前端 PetCanvas / PetVRM）
 *  - 资源生成（PetGenerationService）
 */
@Injectable()
export class PetSkinService {
  private readonly logger = new Logger(PetSkinService.name);

  constructor(
    @InjectRepository(PetSkin)
    private readonly skinRepo: Repository<PetSkin>,
    @InjectRepository(PetActiveSkin)
    private readonly activeRepo: Repository<PetActiveSkin>,
  ) {}

  /** 列出用户拥有 + 平台共享的可用皮肤 */
  async listOwned(userId: string): Promise<PetSkin[]> {
    return this.skinRepo
      .createQueryBuilder('s')
      .where('s.retired = false')
      .andWhere('(s.owner_user_id = :userId OR s.owner_user_id IS NULL)', { userId })
      .orderBy('s.created_at', 'DESC')
      .getMany();
  }

  async findById(skinId: string): Promise<PetSkin | null> {
    return this.skinRepo.findOne({ where: { id: skinId } });
  }

  async create(input: CreateSkinInput): Promise<PetSkin> {
    const entity = this.skinRepo.create({
      ownerUserId: input.ownerUserId,
      source: input.source,
      displayName: input.displayName,
      url: input.url,
      thumbnailUrl: input.thumbnailUrl ?? null,
      format: input.format ?? 'vrm',
      manifest: input.manifest ?? {},
      sourceRefId: input.sourceRefId ?? null,
      version: 1,
      retired: false,
    });
    const saved = await this.skinRepo.save(entity);
    this.logger.log(`PetSkin created: ${saved.id} owner=${saved.ownerUserId} source=${saved.source}`);
    return saved;
  }

  /** 激活某皮肤（必须属于用户 or 平台共享） */
  async activate(userId: string, skinId: string): Promise<PetActiveSkin> {
    const skin = await this.skinRepo.findOne({ where: { id: skinId } });
    if (!skin) throw new NotFoundException(`pet skin not found: ${skinId}`);
    if (skin.retired) throw new ForbiddenException(`pet skin retired`);
    if (skin.ownerUserId && skin.ownerUserId !== userId) {
      throw new ForbiddenException(`pet skin not owned by user`);
    }

    let active = await this.activeRepo.findOne({ where: { userId } });
    if (!active) {
      active = this.activeRepo.create({ userId, activeSkinId: skinId });
    } else {
      active.activeSkinId = skinId;
    }
    return this.activeRepo.save(active);
  }

  async getActive(userId: string): Promise<PetActiveSkin | null> {
    return this.activeRepo.findOne({ where: { userId } });
  }

  async clearActive(userId: string): Promise<void> {
    const active = await this.activeRepo.findOne({ where: { userId } });
    if (active) {
      active.activeSkinId = null;
      await this.activeRepo.save(active);
    }
  }

  toDto(skin: PetSkin) {
    return {
      id: skin.id,
      owner_user_id: skin.ownerUserId,
      source: skin.source,
      display_name: skin.displayName,
      url: skin.url,
      thumbnail_url: skin.thumbnailUrl,
      format: skin.format,
      manifest: skin.manifest,
      source_ref_id: skin.sourceRefId,
      version: skin.version,
      retired: skin.retired,
      created_at: skin.createdAt ? skin.createdAt.getTime() : Date.now(),
    };
  }
}
