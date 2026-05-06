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

  /**
   * V4 §3.2 — Skin Marketplace listing.
   * Returns publicly browsable skins:
   *  - source='platform' (官方默认皮肤, owner_user_id IS NULL)
   *  - source IN ('generated','remixed') AND owner_user_id IS NOT NULL
   *    (community-uploaded; for now all generated skins are publicly browsable —
   *     a future privacy flag on PetSkin can refine this)
   * Excludes retired and the requester's own skins (those already appear in /skins).
   */
  async listMarketplace(
    opts: { limit?: number; offset?: number; source?: PetSkin['source']; excludeUserId?: string } = {},
  ): Promise<{ items: PetSkin[]; total: number }> {
    const limit = Math.min(100, Math.max(1, opts.limit ?? 30));
    const offset = Math.max(0, opts.offset ?? 0);
    const qb = this.skinRepo.createQueryBuilder('s').where('s.retired = false');
    if (opts.source) {
      qb.andWhere('s.source = :source', { source: opts.source });
    } else {
      qb.andWhere("(s.source = 'platform' OR s.source IN ('generated','remixed'))");
    }
    if (opts.excludeUserId) {
      qb.andWhere('(s.owner_user_id IS NULL OR s.owner_user_id <> :uid)', { uid: opts.excludeUserId });
    }
    const total = await qb.getCount();
    const items = await qb.orderBy('s.created_at', 'DESC').skip(offset).take(limit).getMany();
    return { items, total };
  }

  /**
   * V4 §3.2 — Install a marketplace skin into the requester's library.
   * For platform skins (owner=NULL) we just return the row — they're already visible.
   * For other-user skins we clone the row with source='purchased' (free for now;
   *  payments + royalties handled by RoyaltySplitter in a separate flow).
   */
  async installFromMarketplace(userId: string, skinId: string): Promise<PetSkin> {
    const src = await this.skinRepo.findOne({ where: { id: skinId } });
    if (!src) throw new NotFoundException(`pet skin not found: ${skinId}`);
    if (src.retired) throw new ForbiddenException(`pet skin retired`);
    if (src.ownerUserId === null || src.ownerUserId === userId) {
      return src;
    }
    const clone = this.skinRepo.create({
      ownerUserId: userId,
      source: 'purchased',
      displayName: src.displayName,
      url: src.url,
      thumbnailUrl: src.thumbnailUrl,
      format: src.format,
      manifest: { ...(src.manifest || {}), installedFrom: src.id },
      sourceRefId: src.id,
      parentSkinId: src.id,
      originalCreatorUserId: src.originalCreatorUserId ?? src.ownerUserId,
      royaltyRateBps: src.royaltyRateBps ?? 0,
      version: 1,
      retired: false,
    });
    const saved = await this.skinRepo.save(clone);
    this.logger.log(`PetSkin installed from marketplace: ${saved.id} from=${src.id} user=${userId}`);
    return saved;
  }

  /**
   * V4 §3.2 — User-uploaded skin registration.
   * The frontend uploads the asset to S3/CDN first, then POSTs the URL here.
   * We trust the URL but enforce ownership and a sane format.
   */
  async registerUpload(
    userId: string,
    input: { displayName: string; url: string; format?: PetSkin['format']; thumbnailUrl?: string; manifest?: Record<string, unknown> },
  ): Promise<PetSkin> {
    if (!input.displayName?.trim()) throw new ForbiddenException('displayName required');
    if (!input.url?.trim()) throw new ForbiddenException('url required');
    return this.create({
      ownerUserId: userId,
      source: 'generated',
      displayName: input.displayName.trim(),
      url: input.url.trim(),
      thumbnailUrl: input.thumbnailUrl ?? null,
      format: input.format ?? 'vrm',
      manifest: { ...(input.manifest || {}), uploadedAt: Date.now() },
      sourceRefId: null,
    });
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

  /**
   * Phase 2 W3 — mark skin as retired (DMCA upheld / admin pull).
   * Side-effects:
   *  - sets `retired = true`
   *  - clears any active pointer that references it
   * Returns the updated PetSkin or null if not found.
   */
  async delist(skinId: string, opts: { reason?: string } = {}): Promise<PetSkin | null> {
    const skin = await this.skinRepo.findOne({ where: { id: skinId } });
    if (!skin) return null;
    if (skin.retired) {
      this.logger.log(`PetSkin ${skinId} already retired (no-op) reason=${opts.reason ?? 'n/a'}`);
      return skin;
    }
    skin.retired = true;
    const saved = await this.skinRepo.save(skin);
    // Clear any active pointers using this skin
    const affectedActives = await this.activeRepo.find({ where: { activeSkinId: skinId } });
    for (const a of affectedActives) {
      a.activeSkinId = null;
      await this.activeRepo.save(a);
    }
    this.logger.warn(
      `PetSkin delisted: ${skinId} reason=${opts.reason ?? 'unspecified'} clearedActives=${affectedActives.length}`,
    );
    return saved;
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
