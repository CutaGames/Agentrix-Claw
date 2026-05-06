import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MarketplaceListingService } from './marketplace-listing.service';
import { AuctionService } from './auction.service';
import { RentalService } from './rental.service';
import { ReverseImageSearchService } from './reverse-image-search.service';
import { RemixBreedingService } from './remix-breeding.service';
import { PetListingMode } from '../../entities/marketplace-pet-listing.entity';

/**
 * Marketplace Pet API — Phase 3 W1.
 *
 *   GET    /api/v1/marketplace/pets               browse active listings
 *   POST   /api/v1/marketplace/pets               seller creates listing
 *   GET    /api/v1/marketplace/pets/:id           listing detail
 *   POST   /api/v1/marketplace/pets/:id/cancel    seller cancels
 *   POST   /api/v1/marketplace/pets/:id/buy       fixed-price buy
 *   POST   /api/v1/marketplace/pets/:id/bid       auction bid
 *   GET    /api/v1/marketplace/pets/:id/bids      auction bid history
 *   POST   /api/v1/marketplace/pets/:id/rent      start rental
 *   POST   /api/v1/marketplace/leases/:id/return  return rental early
 *
 * Note: Payment settlement is delegated to the existing Stripe webhook flow
 * (PetOverageBillingService pattern). The endpoints here flip listing state
 * AFTER the controller has confirmed payment intent metadata.
 */
@UseGuards(JwtAuthGuard)
@Controller('v1/marketplace')
export class MarketplacePetController {
  constructor(
    private readonly listingService: MarketplaceListingService,
    private readonly auctionService: AuctionService,
    private readonly rentalService: RentalService,
    private readonly reverseSearchService: ReverseImageSearchService,
    private readonly remixService: RemixBreedingService,
  ) {}

  @Get('pets')
  async browse(
    @Query('mode') mode?: PetListingMode,
    @Query('seller') sellerUserId?: string,
  ) {
    const items = await this.listingService.findActiveListings({ mode, sellerUserId });
    return { items };
  }

  @Get('pets/:id')
  async detail(@Param('id') id: string) {
    const listing = await this.listingService.findById(id);
    return { listing };
  }

  @Post('pets')
  async create(@Req() req: any, @Body() body: any) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const listing = await this.listingService.createListing({
      petSkinId: body.pet_skin_id,
      sellerUserId: userId,
      mode: body.mode,
      priceUsd: body.price_usd,
      startingBidUsd: body.starting_bid_usd,
      reservePriceUsd: body.reserve_price_usd,
      minBidIncrementUsd: body.min_bid_increment_usd,
      auctionDurationHours: body.auction_duration_hours,
      rentalPricePerDayUsd: body.rental_price_per_day_usd,
      rentalDurationDays: body.rental_duration_days,
      royaltyRateBps: body.royalty_rate_bps,
      description: body.description,
      activeDays: body.active_days,
    });
    return { listing };
  }

  @Post('pets/:id/cancel')
  async cancel(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const listing = await this.listingService.cancelListing(id, userId);
    return { listing };
  }

  @Post('pets/:id/buy')
  async buy(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    // body.paid_price_usd is supplied by the payment controller after Stripe success.
    const listing = await this.listingService.buyFixedPrice(id, userId, body.paid_price_usd);
    return { listing };
  }

  @Post('pets/:id/bid')
  async bid(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const result = await this.auctionService.placeBid(id, userId, body.amount_usd);
    return { result };
  }

  @Get('pets/:id/bids')
  async bids(@Param('id') id: string) {
    const items = await this.auctionService.listBids(id);
    return { items };
  }

  @Post('pets/:id/rent')
  async rent(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const lease = await this.rentalService.createLease(id, userId, body.days);
    return { lease };
  }

  @Post('leases/:id/return')
  async returnLease(@Param('id') id: string) {
    const lease = await this.rentalService.returnLease(id);
    return { lease };
  }

  /** BE-T3.6: reverse image search by pre-computed pHash. */
  @Post('reverse-search')
  async reverseSearch(@Body() body: any) {
    if (!body?.phash || typeof body.phash !== 'string') {
      return { matches: [] };
    }
    const matches = await this.reverseSearchService.searchByHash(body.phash, {
      threshold: typeof body.threshold === 'number' ? body.threshold : undefined,
      limit: typeof body.limit === 'number' ? body.limit : undefined,
      excludeSkinId: body.exclude_skin_id,
    });
    return { matches };
  }

  /** BE-T3.7: remix two parent skins into a child PetSkin. */
  @Post('remix')
  async remix(@Req() req: any, @Body() body: any) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const child = await this.remixService.breed({
      parentASkinId: body.parent_a_skin_id,
      parentBSkinId: body.parent_b_skin_id,
      requesterUserId: userId,
      displayName: body.display_name,
      desiredRoyaltyRateBps: body.desired_royalty_rate_bps,
    });
    return { skin: child };
  }
}
