import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Public } from '../../auth/decorators/public.decorator';
import { PlotMarketplaceService } from '../services/plot-marketplace.service';
import type {
  CreatePlotListingRequest,
  CreatePlotListingResponse,
  BrowsePlotListingsQuery,
  BrowsePlotListingsResponse,
  PurchasePlotListingRequest,
  PurchasePlotListingResponse,
  PublishPlotResponse,
  ResolvePlotShareResponse,
} from '../../../../shared/types/world-creation-api';

/**
 * PlotMarketplaceController — Plot 体验上架 / 发现 / 购买 / 发布 / 分享 (design §10/§11, R11).
 *
 * 路由前缀 `api/v1/world-creation` (marketplace + publish + share)。委派
 * {@link PlotMarketplaceService}，后者复用 LandEconomyService (上架/转让/抽成) +
 * ArenaService (审核门控发布 + share_code)，不重建经济/审核逻辑：
 *   - 发布过审 → status=published → 经 MapService.discover 可被发现，产 share_code。
 *   - Marketplace 上架含名称 / Substrate_Tier / 预览 / 价格；首次上架仅限原创者。
 *   - 购买复用两阶段提交 + 一级 5% / 二级 30% 抽成净额入创作者 AgentAccount。
 *   - share_code 深链 + 无 app → web 预览页 + 下载提示 (复用 v5 share 模型)。
 */
@ApiTags('world-creation/plot-marketplace')
@Controller('v1/world-creation')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PlotMarketplaceController {
  constructor(
    private readonly plotMarketplaceService: PlotMarketplaceService,
  ) {}

  /** POST /api/v1/world-creation/marketplace/plots — 创建上架 (R11.2/R11.3)。 */
  @Post('marketplace/plots')
  @ApiOperation({ summary: 'List a Plot experience on the Marketplace (original-creator gated)' })
  async createListing(
    @Request() req: any,
    @Body() body: CreatePlotListingRequest,
  ): Promise<CreatePlotListingResponse> {
    const userId = req.user?.id ?? req.user?.sub;
    return this.plotMarketplaceService.createListing(userId, body);
  }

  /** GET /api/v1/world-creation/marketplace/plots — 浏览上架 (R11.2)。 */
  @Get('marketplace/plots')
  @ApiOperation({ summary: 'Browse Plot listings' })
  async browseListings(
    @Query() query: BrowsePlotListingsQuery,
  ): Promise<BrowsePlotListingsResponse> {
    return this.plotMarketplaceService.browseListings(query);
  }

  /** POST /api/v1/world-creation/marketplace/plots/:listingId/purchase — 购买 (R11.4)。 */
  @Post('marketplace/plots/:listingId/purchase')
  @ApiOperation({ summary: 'Purchase a Plot listing (Trust3 signed, 5%/30% revenue share)' })
  async purchase(
    @Request() req: any,
    @Param('listingId') listingId: string,
    @Body() body: PurchasePlotListingRequest,
  ): Promise<PurchasePlotListingResponse> {
    const userId = req.user?.id ?? req.user?.sub;
    return this.plotMarketplaceService.purchase(userId, listingId, body);
  }

  /** POST /api/v1/world-creation/plots/:plotId/publish — 发布过审后进入发现 (R10.1/R11.1)。 */
  @Post('plots/:plotId/publish')
  @ApiOperation({ summary: 'Publish a Plot (runs moderation, emits share_code)' })
  async publish(
    @Request() req: any,
    @Param('plotId') plotId: string,
  ): Promise<PublishPlotResponse> {
    const userId = req.user?.id ?? req.user?.sub;
    return this.plotMarketplaceService.publish(plotId, userId);
  }

  /**
   * GET /api/v1/world-creation/marketplace/share/:shareCode — 分享深链解析 (R11.5/R11.6)。
   *
   * Public：分享链接面向尚未安装 app 的访客，无 Bearer 时返回 web 预览页 + 下载提示。
   */
  @Public()
  @Get('marketplace/share/:shareCode')
  @ApiOperation({ summary: 'Resolve a Plot share_code (deep link + web preview fallback)' })
  async resolveShare(
    @Param('shareCode') shareCode: string,
  ): Promise<ResolvePlotShareResponse> {
    return this.plotMarketplaceService.resolveShareLink(shareCode);
  }
}
