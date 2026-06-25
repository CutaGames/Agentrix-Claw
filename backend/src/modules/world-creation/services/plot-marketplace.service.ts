import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
  type FindOptionsOrder,
  type FindOptionsWhere,
} from 'typeorm';
import { WorldPlot } from '../entities/world-plot.entity';
import { PlotListing } from '../entities/plot-listing.entity';
import { LandEconomyService } from './land-economy.service';
import { ArenaService } from '../arena/arena.service';
import { AgentAccountService } from '../../agent-account/agent-account.service';
import {
  REVENUE_SHARE_FIRST_SALE,
  REVENUE_SHARE_SECONDARY_SALE,
} from '../../../../shared/types/world-creation';
import type {
  PlotSaleType,
  SubstrateTier,
} from '../../../../shared/types/world-creation';
import type { MarketplaceCurrency } from '../../../../shared/types/world-engine-api';
import type {
  BrowsePlotListingsQuery,
  BrowsePlotListingsResponse,
  CreatePlotListingRequest,
  CreatePlotListingResponse,
  PlotListingDto,
  PublishPlotResponse,
  PurchasePlotListingRequest,
  PurchasePlotListingResponse,
  ResolvePlotShareResponse,
} from '../../../../shared/types/world-creation-api';

/** Default / max page size for marketplace browsing. */
const BROWSE_DEFAULT_LIMIT = 20;
const BROWSE_MAX_LIMIT = 100;

/** Deep-link scheme + web fallback, reused from the v5 dungeon share model (R11.5/R11.6). */
const DEEP_LINK_DUNGEON_BASE = 'agentrix://world-engine/dungeon';
const WEB_PREVIEW_BASE = 'https://app.agentrix.io/world';
const APP_DOWNLOAD_LINK = 'https://app.agentrix.io/download';

/**
 * PlotMarketplaceService — Plot 体验发布 / 发现 / 上架 / 购买 / 分享 (design §10/§11, R11).
 *
 * **复用既有 service，不重建经济与审核逻辑**：
 *  - 发布 (publish) 委派 {@link ArenaService.publishArena}：经
 *    `PlotModerationService.runPrePublish` 过审 → status='published' →
 *    经 `MapService.discover` 在导航与发现过滤器可被发现 → 产出与 v5 dungeon
 *    一致的 `share_code` (R10.1 / R11.1 / R11.5)。
 *  - 上架 (createListing) 委派 {@link LandEconomyService.listForSale}：价格区间校验
 *    + owner 校验 + 写 `plot_listings`；本服务额外做 **首次上架仅限原创者** 门控
 *    (saleType='first' 时校验 originalCreatorAccountId，R11.3)，并组装含名称 /
 *    Substrate_Tier / 预览 / 价格的 listing DTO (R11.2)。
 *  - 购买 (purchase) 委派 {@link LandEconomyService.transferPlot}：两阶段提交 +
 *    乐观锁 + 一级 5% / 二级 30% 抽成净额入创作者 (卖家) AgentAccount (R11.4)。
 *  - 分享 (resolveShareLink) 复用 v5 dungeon `share_code` 深链 +
 *    无 app → web 预览页 + 下载提示 (R11.5 / R11.6)。
 *
 * 全局 SnakeNamingStrategy：列名自动派生，禁止手写 name。
 *
 * @see backend/src/modules/world-creation/arena/arena.service.ts — publishArena / share_code
 * @see backend/src/modules/world-creation/services/land-economy.service.ts — listForSale / transferPlot
 * @see backend/src/modules/world-engine/services/share.service.ts — v5 deep link / web 预览模型
 */
@Injectable()
export class PlotMarketplaceService {
  private readonly logger = new Logger(PlotMarketplaceService.name);

  constructor(
    @InjectRepository(WorldPlot)
    private readonly plotRepo: Repository<WorldPlot>,
    @InjectRepository(PlotListing)
    private readonly listingRepo: Repository<PlotListing>,
    /** 复用 Land_Economy 的上架 / 转让 (价格校验、乐观锁、抽成)。 */
    private readonly landEconomyService: LandEconomyService,
    /** 复用 Arena 发布流程 (审核门控 + status→published + share_code)。 */
    private readonly arenaService: ArenaService,
    private readonly agentAccountService: AgentAccountService,
  ) {}

  // ============================================================
  // R10.1 / R11.1 / R11.5 — Publish (moderation-gated → discoverable + share_code)
  // ============================================================

  /**
   * 发布一个已生成 ECS_World 的 Plot：经发布前审核通过 → status='published'
   * (经 MapService.discover 可被发现) → 产出与 v5 dungeon 一致的 share_code。
   *
   * 直接委派 {@link ArenaService.publishArena} (审核钩子 + 幂等 share_code 生成)，
   * 不重复实现发布 / 审核逻辑。
   */
  async publish(plotId: string, userId?: string): Promise<PublishPlotResponse> {
    return this.arenaService.publishArena(plotId, userId);
  }

  // ============================================================
  // R11.2 / R11.3 — Create Marketplace listing (original-creator gated)
  // ============================================================

  /**
   * 在 Marketplace 上架一个 Plot 体验 (R11.2 / R11.3)。
   *
   * 流程：
   *  1. 加载 Plot 并解析卖家 AgentAccount (经认证用户)。
   *  2. **首次上架门控** (R11.3)：saleType='first' 时仅原创者可上架；
   *     非原创者 → 返回结构化 `NOT_ORIGINAL_CREATOR` 错误并附提示，不写库。
   *  3. 委派 {@link LandEconomyService.listForSale} 完成价格区间校验 + owner 校验 +
   *     重复挂牌校验 + 写 `plot_listings` + Plot status→'listed'。
   *  4. 组装含名称 / Substrate_Tier / 预览 / 价格的 {@link PlotListingDto} (R11.2)。
   *
   * @param userId 经认证的发起用户 (= 卖家)。
   */
  async createListing(
    userId: string,
    body: CreatePlotListingRequest,
  ): Promise<CreatePlotListingResponse> {
    if (!userId) {
      throw new BadRequestException('Missing authenticated user');
    }
    if (!body?.plotId) {
      throw new BadRequestException('plotId is required');
    }

    const plot = await this.plotRepo.findOne({ where: { id: body.plotId } });
    if (!plot) {
      throw new NotFoundException(`Plot ${body.plotId} not found`);
    }

    const sellerAccountId = await this.resolveOwnerAccountId(userId);

    // 仅当前 owner 可上架 (listForSale 亦会再校验；此处提前给出明确错误)。
    if (!plot.ownerAccountId || plot.ownerAccountId !== sellerAccountId) {
      throw new ForbiddenException('Only the Plot owner may list it for sale');
    }

    // R11.3 首次上架仅限原创者：originalCreatorAccountId 已记录则严格匹配，
    // 未记录 (历史地块) 时退化为「当前 owner 即视为创作者」。
    if (body.saleType === 'first' && !this.isOriginalCreator(plot, sellerAccountId)) {
      this.logger.warn(
        `Rejected first-sale listing for plot ${plot.id}: seller ${sellerAccountId} ` +
          `is not the original creator (${plot.originalCreatorAccountId ?? 'unset'})`,
      );
      return {
        error: {
          error: 'NOT_ORIGINAL_CREATOR',
          detail:
            'Only the original creator may list this Plot for an initial (first) sale. ' +
            'List it as a secondary sale instead.',
        },
      };
    }

    // 委派 Land_Economy 完成价格校验 + 写库 + Plot status→listed。
    const { listingId } = await this.landEconomyService.listForSale(
      userId,
      body.plotId,
      {
        price: body.price,
        currency: body.currency,
        saleType: body.saleType,
      },
    );

    const listing = await this.listingRepo.findOne({ where: { id: listingId } });
    if (!listing) {
      // 理论不可达：刚写入即消失。
      throw new NotFoundException(`Listing ${listingId} disappeared after creation`);
    }

    this.logger.log(
      `Plot ${plot.id} listed on Marketplace by account ${sellerAccountId} ` +
        `(${body.price} ${body.currency}, saleType=${body.saleType}, listing=${listingId})`,
    );

    return { listing: this.toListingDto(listing, plot) };
  }

  // ============================================================
  // R11.2 — Browse Marketplace listings
  // ============================================================

  /**
   * 浏览 Marketplace 上活跃的 Plot 上架记录 (R11.2)。
   *
   * 仅列出 status='active' 的 listing，可按 Substrate_Tier (经其 Plot) /
   * 价格区间 / 币种过滤，并按 sort 排序分页。每条结果组装含名称 /
   * Substrate_Tier / 预览 / 价格的 {@link PlotListingDto}。
   */
  async browseListings(
    query: BrowsePlotListingsQuery,
  ): Promise<BrowsePlotListingsResponse> {
    const page = Math.max(1, Math.floor(query?.page ?? 1));
    const rawLimit = Math.floor(query?.limit ?? BROWSE_DEFAULT_LIMIT);
    const limit = Math.min(Math.max(1, rawLimit), BROWSE_MAX_LIMIT);
    const sort = query?.sort ?? 'newest';

    const where: FindOptionsWhere<PlotListing> = { status: 'active' };
    this.applyPriceFilter(where, query);

    const order: FindOptionsOrder<PlotListing> = this.resolveListingOrder(sort);

    const [rows, total] = await this.listingRepo.findAndCount({
      where,
      order,
      // tier 过滤需 join Plot，故先取一页候选再按 tier 过滤 (limit 较小，开销可控)。
      skip: (page - 1) * limit,
      take: limit,
    });

    // 批量解析 listing → plot (取名称 / tier / 预览)。
    const plotMap = await this.loadPlotsForListings(rows);

    let items: PlotListingDto[] = rows
      .map((listing) => {
        const plot = plotMap.get(listing.plotId);
        return plot ? this.toListingDto(listing, plot) : null;
      })
      .filter((dto): dto is PlotListingDto => dto !== null);

    // Substrate_Tier 过滤 (基于 Plot 声明的 tier)。
    if (query?.substrateTier) {
      items = items.filter((dto) => dto.substrateTier === query.substrateTier);
    }

    return { items, total };
  }

  // ============================================================
  // R11.4 — Purchase a listing (transfer + revenue share)
  // ============================================================

  /**
   * 购买一个 Plot 上架记录 (R11.4)。
   *
   * 委派 {@link LandEconomyService.transferPlot} 执行 Trust 门控签名校验 +
   * 两阶段提交 + 乐观锁 + 一级 5% / 二级 30% 平台抽成，净额入卖家 (创作者)
   * AgentAccount。本方法据 listing 价格 + saleType 计算抽成额回显，并把转让结果
   * 映射为 {@link PurchasePlotListingResponse}。
   *
   * @param userId    经认证的发起用户 (= 买家)。
   * @param listingId 目标上架记录 id。
   */
  async purchase(
    userId: string,
    listingId: string,
    body: PurchasePlotListingRequest,
  ): Promise<PurchasePlotListingResponse> {
    if (!userId) {
      throw new BadRequestException('Missing authenticated user');
    }
    if (!listingId) {
      throw new BadRequestException('listingId is required');
    }

    const listing = await this.listingRepo.findOne({ where: { id: listingId } });
    if (!listing) {
      throw new NotFoundException(`Listing ${listingId} not found`);
    }

    // 据 listing 计算平台抽成额 (native 币种) 用于响应回显；
    // 真实记账 (扣买家 / 净额入卖家) 由 transferPlot 服务端权威执行。
    const platformCut = this.computePlatformCutNative(listing);

    const result = await this.landEconomyService.transferPlot(userId, {
      listingId,
      signedConfirmation: body?.signedConfirmation ?? '',
    });

    if (!result.committed) {
      return { status: 'failed', error: result.error };
    }

    this.logger.log(
      `Plot listing ${listingId} purchased by user ${userId} ` +
        `(newOwner=${result.newOwnerAccountId}, platformCut=${platformCut}, saleType=${listing.saleType})`,
    );

    return {
      transactionId: listingId,
      status: 'completed',
      platformCut,
    };
  }

  // ============================================================
  // R11.5 / R11.6 — Share link resolution (deep link + web preview fallback)
  // ============================================================

  /**
   * 解析可分享 Plot `share_code` (R11.5 / R11.6)。
   *
   * 复用 v5 dungeon 分享模型：产出 `agentrix://world-engine/dungeon/{shareCode}`
   * 深链 (app 已安装时直接进入) 与 `https://app.agentrix.io/world/{token}` web 预览页
   * (无 app 时跳转) + 下载提示。share_code 无对应 Plot 时返回 available=false。
   */
  async resolveShareLink(shareCode: string): Promise<ResolvePlotShareResponse> {
    const code = (shareCode ?? '').trim();
    if (!code) {
      throw new BadRequestException('shareCode is required');
    }

    const plot = await this.plotRepo.findOne({ where: { shareCode: code } });
    const webPreviewUrl = `${WEB_PREVIEW_BASE}/${this.encodeToken(
      plot?.id ?? code,
    )}`;

    if (!plot) {
      return {
        available: false,
        webPreviewUrl,
        appDownloadLink: APP_DOWNLOAD_LINK,
        message: 'This experience is no longer available.',
      };
    }

    return {
      available: true,
      plotId: plot.id,
      title: plot.title ?? '',
      substrateTier: plot.substrateTier,
      deepLink: `${DEEP_LINK_DUNGEON_BASE}/${code}`,
      webPreviewUrl,
      appDownloadLink: APP_DOWNLOAD_LINK,
    };
  }

  // ============================================================
  // Helpers
  // ============================================================

  /** 原创者判定 (R11.3)：记录存在则严格匹配；未记录则退化为当前 owner。 */
  private isOriginalCreator(plot: WorldPlot, sellerAccountId: string): boolean {
    return plot.originalCreatorAccountId
      ? plot.originalCreatorAccountId === sellerAccountId
      : plot.ownerAccountId === sellerAccountId;
  }

  /** 解析用户的单一 owner AgentAccount id (复用 v5 AgentAccount)。 */
  private async resolveOwnerAccountId(userId: string): Promise<string> {
    const { items } = await this.agentAccountService.findByOwner(userId, 1, 1);
    if (!items?.length) {
      throw new BadRequestException(
        'No AgentAccount found for the current user; an AgentAccount is required to list or own a Plot.',
      );
    }
    return items[0].id;
  }

  /** 平台抽成额 (native 币种)：一级 5% / 二级 30% (R11.4)。 */
  private computePlatformCutNative(listing: PlotListing): number {
    const rate =
      listing.saleType === 'secondary'
        ? REVENUE_SHARE_SECONDARY_SALE
        : REVENUE_SHARE_FIRST_SALE;
    if (listing.priceAxp != null) {
      return Math.round(Number(listing.priceAxp) * rate);
    }
    if (listing.priceUsd != null) {
      return Math.round(Number(listing.priceUsd) * rate * 100) / 100;
    }
    return 0;
  }

  /** 组装含名称 / Substrate_Tier / 预览 / 价格的 listing DTO (R11.2)。 */
  private toListingDto(listing: PlotListing, plot: WorldPlot): PlotListingDto {
    const dto: PlotListingDto = {
      listingId: listing.id,
      plotId: listing.plotId,
      sellerAccountId: listing.sellerAccountId,
      title: plot.title ?? '',
      substrateTier: plot.substrateTier,
      saleType: listing.saleType as PlotSaleType,
      status: listing.status,
      version: listing.version,
      createdAt: listing.createdAt?.toISOString?.() ?? '',
    };
    // 预览：已发布且有 share_code 的 Plot 暴露 web 预览页作为预览来源 (R11.2/R11.6)。
    if (plot.shareCode) {
      dto.previewUrl = `${WEB_PREVIEW_BASE}/${this.encodeToken(plot.id)}`;
    }
    if (listing.priceUsd != null) {
      dto.priceUsd = Number(listing.priceUsd);
    }
    if (listing.priceAxp != null) {
      dto.priceAxp = Number(listing.priceAxp);
    }
    return dto;
  }

  /** 价格区间 / 币种过滤 (按对应币种列)。 */
  private applyPriceFilter(
    where: FindOptionsWhere<PlotListing>,
    query: BrowsePlotListingsQuery,
  ): void {
    const min = query?.minPrice;
    const max = query?.maxPrice;
    if (min == null && max == null) {
      return;
    }
    const currency: MarketplaceCurrency = query?.currency ?? 'AXP';
    const column = currency === 'USD' ? 'priceUsd' : 'priceAxp';
    if (min != null && max != null) {
      (where as Record<string, unknown>)[column] = Between(
        String(min),
        String(max),
      );
    } else if (min != null) {
      (where as Record<string, unknown>)[column] = MoreThanOrEqual(String(min));
    } else if (max != null) {
      (where as Record<string, unknown>)[column] = LessThanOrEqual(String(max));
    }
  }

  /** 排序映射：newest / price_asc / price_desc / popularity。 */
  private resolveListingOrder(
    sort: NonNullable<BrowsePlotListingsQuery['sort']>,
  ): FindOptionsOrder<PlotListing> {
    switch (sort) {
      case 'price_asc':
        return { priceAxp: 'ASC', priceUsd: 'ASC', createdAt: 'DESC' };
      case 'price_desc':
        return { priceAxp: 'DESC', priceUsd: 'DESC', createdAt: 'DESC' };
      // popularity 暂以新近度代理 (无独立互动量列，与 MapService.discover 一致)。
      case 'popularity':
      case 'newest':
      default:
        return { createdAt: 'DESC' };
    }
  }

  /** 批量解析 listing → 其 Plot (取名称 / tier / 预览)，避免 N+1。 */
  private async loadPlotsForListings(
    listings: PlotListing[],
  ): Promise<Map<string, WorldPlot>> {
    const plotIds = Array.from(new Set(listings.map((l) => l.plotId)));
    const map = new Map<string, WorldPlot>();
    if (!plotIds.length) {
      return map;
    }
    const plots = await this.plotRepo.find({ where: { id: In(plotIds) } });
    for (const plot of plots) {
      map.set(plot.id, plot);
    }
    return map;
  }

  /** base64url 编码 Plot id → web 预览 token (与 v5 ShareService.encodeToken 一致)。 */
  private encodeToken(plotId: string): string {
    return Buffer.from(plotId, 'utf-8').toString('base64url');
  }
}
