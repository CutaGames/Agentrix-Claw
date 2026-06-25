import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Request,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorldEngineFlagGuard } from '../guards/world-engine-flag.guard';
import { MarketplaceService } from '../services/marketplace.service';

@ApiTags('marketplace/world-assets')
@Controller('v1/marketplace/world-assets')
@UseGuards(JwtAuthGuard, WorldEngineFlagGuard)
@ApiBearerAuth()
export class MarketplaceController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  /**
   * POST /listing — Create a marketplace listing for a world asset.
   *
   * Accepts { assetId, price, currency: 'USD'|'AXP' }
   * Returns { listingId }
   *
   * Requirements: 8.1, 8.2
   */
  @Post('listing')
  @ApiOperation({ summary: 'Create a marketplace listing for a world asset' })
  async createListing(
    @Request() req: any,
    @Body() body: { assetId: string; price: number; currency: 'USD' | 'AXP' },
  ) {
    if (!body.assetId) {
      throw new BadRequestException('assetId is required');
    }
    if (body.price === undefined || body.price === null) {
      throw new BadRequestException('price is required');
    }
    if (!body.currency || !['USD', 'AXP'].includes(body.currency)) {
      throw new BadRequestException('currency must be USD or AXP');
    }

    const userId = req.user?.id || req.user?.sub;
    return this.marketplaceService.createListing(
      body.assetId,
      body.price,
      body.currency,
      userId,
    );
  }

  /**
   * GET / — Browse world asset marketplace listings with filters.
   *
   * Query params: category, minPrice, maxPrice, sort, page
   * Returns { items, total }
   *
   * Requirements: 8.1
   */
  @Get()
  @ApiOperation({ summary: 'Browse world asset marketplace listings' })
  async browseListings(
    @Query('category') category?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
  ) {
    return this.marketplaceService.browseListings({
      category,
      minPrice: minPrice ? parseFloat(minPrice) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
      sort,
      page: page ? parseInt(page, 10) : 1,
    });
  }

  /**
   * POST /:listingId/purchase — Purchase a world asset from the marketplace.
   *
   * Uses two-phase commit protocol (design §10).
   * Returns { transactionId, status: 'completed'|'failed' }
   *
   * Requirements: 8.3, 8.4, 8.7
   */
  @Post(':listingId/purchase')
  @ApiOperation({ summary: 'Purchase a world asset from the marketplace' })
  async purchaseAsset(
    @Request() req: any,
    @Param('listingId') listingId: string,
    @Body() body?: { paymentId?: string },
  ) {
    const buyerId = req.user?.id || req.user?.sub;
    return this.marketplaceService.purchaseAsset(
      listingId,
      buyerId,
      body?.paymentId,
    );
  }

  /**
   * GET /:assetId/suggested-price — Get AI-suggested price for a world asset.
   *
   * Returns { suggestedPrice, currency, factors }
   *
   * Requirements: 8.6
   */
  @Get(':assetId/suggested-price')
  @ApiOperation({ summary: 'Get AI-suggested price for a world asset' })
  async getSuggestedPrice(
    @Request() req: any,
    @Param('assetId') assetId: string,
  ) {
    return this.marketplaceService.getSuggestedPrice(assetId);
  }
}
