import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PetSkin } from '../../entities/pet-skin.entity';
import { PetActiveSkin } from '../../entities/pet-active-skin.entity';
import { AncestorChainService } from '../marketplace-pet/ancestor-chain.service';
import { splitRoyalty, RoyaltySplitResult } from '../marketplace-pet/royalty-splitter';

/** V4 §3.2 — platform commission (basis points) for skin sales. */
const SKIN_PLATFORM_BPS = 500;

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
    private readonly ancestorChain: AncestorChainService,
  ) {}

  /**
   * Phase 6 — Breed lineage viz.
   * Walks PetSkin.parentSkinId chain to assemble an ordered (oldest → newest)
   * lineage descriptor suitable for social-profile display. Cycle-guarded and
   * depth-bounded (8). Returns empty array for unknown skinId.
   */
  async getLineage(skinId: string): Promise<Array<{
    id: string;
    display_name: string;
    source: string;
    original_creator_user_id: string | null;
    royalty_rate_bps: number;
    parent_skin_id: string | null;
    thumbnail_url: string | null;
  }>> {
    const visited = new Set<string>();
    const reverse: PetSkin[] = [];
    let cur = await this.skinRepo.findOne({ where: { id: skinId } });
    let depth = 0;
    while (cur && depth < 8) {
      if (visited.has(cur.id)) break;
      visited.add(cur.id);
      reverse.push(cur);
      if (!cur.parentSkinId) break;
      cur = await this.skinRepo.findOne({ where: { id: cur.parentSkinId } });
      depth++;
    }
    return reverse.reverse().map((s) => ({
      id: s.id,
      display_name: s.displayName,
      source: s.source,
      original_creator_user_id: s.originalCreatorUserId ?? null,
      royalty_rate_bps: s.royaltyRateBps ?? 0,
      parent_skin_id: s.parentSkinId ?? null,
      thumbnail_url: s.thumbnailUrl ?? null,
    }));
  }

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
   * Only returns skins that are publicly browsable AND moderation-approved AND not retired.
   *  - Platform-source rows (owner=NULL) are seeded as public + approved.
   *  - User-uploaded rows are private + pending until the owner publishes
   *    and a moderator approves.
   * Excludes the requester's own skins (those already appear in /skins).
   */
  async listMarketplace(
    opts: { limit?: number; offset?: number; source?: PetSkin['source']; excludeUserId?: string } = {},
  ): Promise<{ items: PetSkin[]; total: number }> {
    const limit = Math.min(100, Math.max(1, opts.limit ?? 30));
    const offset = Math.max(0, opts.offset ?? 0);
    const qb = this.skinRepo
      .createQueryBuilder('s')
      .where('s.retired = false')
      .andWhere("s.visibility = 'public'")
      .andWhere("s.moderation_status = 'approved'");
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
   * For other-user skins we clone the row with source='purchased'.
   *
   * Pricing:
   *  - priceCents=0 → free install (no payment required).
   *  - priceCents>0 → caller MUST pass `acknowledgedPriceCents` matching the
   *    current price. The split is computed via RoyaltySplitter and embedded
   *    into the clone manifest (`purchaseSplit`) for downstream payout
   *    settlement (Stripe Connect / wallet debit handled out-of-band by the
   *    payment service).
   */
  async installFromMarketplace(
    userId: string,
    skinId: string,
    opts: { acknowledgedPriceCents?: number } = {},
  ): Promise<PetSkin> {
    const src = await this.skinRepo.findOne({ where: { id: skinId } });
    if (!src) throw new NotFoundException(`pet skin not found: ${skinId}`);
    if (src.retired) throw new ForbiddenException(`pet skin retired`);
    if (src.ownerUserId === null || src.ownerUserId === userId) {
      return src;
    }
    if (src.visibility !== 'public' || src.moderationStatus !== 'approved') {
      throw new ForbiddenException(`pet skin not available for install`);
    }

    let purchaseSplit: RoyaltySplitResult | null = null;
    if (src.priceCents > 0) {
      if (opts.acknowledgedPriceCents !== src.priceCents) {
        throw new ForbiddenException(
          `price acknowledgement required (priceCents=${src.priceCents})`,
        );
      }
      purchaseSplit = await this.computeSplit(src, userId);
    }

    const clone = this.skinRepo.create({
      ownerUserId: userId,
      source: 'purchased',
      displayName: src.displayName,
      url: src.url,
      thumbnailUrl: src.thumbnailUrl,
      format: src.format,
      manifest: {
        ...(src.manifest || {}),
        installedFrom: src.id,
        ...(purchaseSplit
          ? {
              purchaseSplit: {
                grossPriceCents: src.priceCents,
                ...purchaseSplit,
                payoutStatus: 'pending',
              },
            }
          : {}),
      },
      sourceRefId: src.id,
      parentSkinId: src.id,
      originalCreatorUserId: src.originalCreatorUserId ?? src.ownerUserId,
      royaltyRateBps: src.royaltyRateBps ?? 0,
      version: 1,
      retired: false,
      visibility: 'private',
      moderationStatus: 'approved',
      priceCents: 0,
    });
    const saved = await this.skinRepo.save(clone);
    this.logger.log(
      `PetSkin installed from marketplace: ${saved.id} from=${src.id} user=${userId} priceCents=${src.priceCents}`,
    );
    return saved;
  }

  /**
   * V4 §3.2 — Preview the royalty split a buyer would trigger if they bought
   * `skinId` right now. Useful for the FE "you'll pay $X, creator gets $Y" UI.
   */
  async previewRoyaltySplit(
    skinId: string,
    requesterUserId: string,
  ): Promise<{ priceCents: number; split: RoyaltySplitResult } | null> {
    const skin = await this.skinRepo.findOne({ where: { id: skinId } });
    if (!skin || skin.retired) return null;
    if (skin.priceCents <= 0) {
      return {
        priceCents: 0,
        split: {
          payouts: [],
          totalRoyaltyCents: 0,
          platformCents: 0,
          sellerCents: 0,
          scaledDown: false,
        },
      };
    }
    const split = await this.computeSplit(skin, requesterUserId);
    return { priceCents: skin.priceCents, split };
  }

  private async computeSplit(skin: PetSkin, _buyerUserId: string): Promise<RoyaltySplitResult> {
    const sellerUserId = skin.ownerUserId ?? '__platform__';
    const ancestorChain = await this.ancestorChain.resolveChain(skin.id);
    return splitRoyalty({
      grossPriceCents: skin.priceCents,
      platformBps: SKIN_PLATFORM_BPS,
      sellerUserId,
      ancestorChain,
    });
  }

  /**
   * V4 §3.2 — User-uploaded skin registration.
   * The frontend uploads the asset to S3/CDN first, then POSTs the URL here.
   * Defaults: visibility='private' + moderationStatus='pending'.
   * The user must explicitly publish (setVisibility('public')) to enter the moderation queue.
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

  /**
   * V4 §3.2 — Owner sets their skin visibility.
   * 'public' transitions force moderation_status back to 'pending' if it was rejected;
   * 'private'/'unlisted' do not change moderation_status.
   */
  async setVisibility(
    userId: string,
    skinId: string,
    visibility: PetSkin['visibility'],
  ): Promise<PetSkin> {
    const skin = await this.skinRepo.findOne({ where: { id: skinId } });
    if (!skin) throw new NotFoundException(`pet skin not found: ${skinId}`);
    if (skin.ownerUserId !== userId) throw new ForbiddenException('not skin owner');
    skin.visibility = visibility;
    if (visibility === 'public' && skin.moderationStatus === 'rejected') {
      skin.moderationStatus = 'pending';
    }
    return this.skinRepo.save(skin);
  }

  /** V4 §3.2 — Owner sets a sale price (USD cents, 0 = free). */
  async setPrice(userId: string, skinId: string, priceCents: number): Promise<PetSkin> {
    const skin = await this.skinRepo.findOne({ where: { id: skinId } });
    if (!skin) throw new NotFoundException(`pet skin not found: ${skinId}`);
    if (skin.ownerUserId !== userId) throw new ForbiddenException('not skin owner');
    if (!Number.isFinite(priceCents) || priceCents < 0) {
      throw new ForbiddenException('priceCents must be a non-negative integer');
    }
    skin.priceCents = Math.floor(priceCents);
    return this.skinRepo.save(skin);
  }

  /** V4 §3.2 — Admin moderation. */
  async moderate(
    skinId: string,
    status: 'approved' | 'rejected',
    reason?: string,
  ): Promise<PetSkin | null> {
    const skin = await this.skinRepo.findOne({ where: { id: skinId } });
    if (!skin) return null;
    skin.moderationStatus = status;
    const saved = await this.skinRepo.save(skin);
    this.logger.log(`PetSkin moderation ${status}: ${skinId} reason=${reason ?? 'n/a'}`);
    return saved;
  }

  async findById(skinId: string): Promise<PetSkin | null> {
    return this.skinRepo.findOne({ where: { id: skinId } });
  }

  async create(input: CreateSkinInput): Promise<PetSkin> {
    // V4 §3.2 — Platform skins are public + approved out of the box.
    // Everything else starts private + pending; owner publishes explicitly via setVisibility.
    const isPlatform = input.source === 'platform' && input.ownerUserId === null;
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
      visibility: isPlatform ? 'public' : 'private',
      moderationStatus: isPlatform ? 'approved' : 'pending',
      priceCents: 0,
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
      visibility: skin.visibility,
      moderation_status: skin.moderationStatus,
      price_cents: skin.priceCents,
      parent_skin_id: skin.parentSkinId,
      original_creator_user_id: skin.originalCreatorUserId,
      royalty_rate_bps: skin.royaltyRateBps,
      created_at: skin.createdAt ? skin.createdAt.getTime() : Date.now(),
    };
  }
}
