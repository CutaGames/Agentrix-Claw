import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MarketplacePetListing, PetListingMode } from '../../entities/marketplace-pet-listing.entity';
import { PetSkin } from '../../entities/pet-skin.entity';
import { MarketplaceSettlementBridge } from './marketplace-settlement.bridge';

const DEFAULT_ACTIVE_DAYS = 30;
const MAX_ROYALTY_BPS = 10000;

export interface CreateListingInput {
  petSkinId: string;
  sellerUserId: string;
  mode: PetListingMode;
  /** Required for fixed_price; optional for auction (BIN). */
  priceUsd?: string;
  startingBidUsd?: string;
  reservePriceUsd?: string;
  minBidIncrementUsd?: string;
  /** Required for auction: how long until close (hours). Server computes auctionEndsAt. */
  auctionDurationHours?: number;
  rentalPricePerDayUsd?: string;
  rentalDurationDays?: number;
  royaltyRateBps?: number;
  description?: string;
  activeDays?: number;
}

@Injectable()
export class MarketplaceListingService {
  private readonly logger = new Logger(MarketplaceListingService.name);

  constructor(
    @InjectRepository(MarketplacePetListing)
    private readonly listingRepo: Repository<MarketplacePetListing>,
    @InjectRepository(PetSkin)
    private readonly skinRepo: Repository<PetSkin>,
    @Optional() private readonly settlementBridge?: MarketplaceSettlementBridge,
  ) {}

  async createListing(input: CreateListingInput): Promise<MarketplacePetListing> {
    const skin = await this.skinRepo.findOne({ where: { id: input.petSkinId } });
    if (!skin) throw new NotFoundException('pet_skin not found');
    if (skin.retired) throw new ForbiddenException('pet_skin retired');
    if (!skin.ownerUserId || skin.ownerUserId !== input.sellerUserId) {
      throw new ForbiddenException('seller does not own this pet_skin');
    }

    // Block duplicate active listings for same skin.
    const existing = await this.listingRepo.findOne({
      where: { petSkinId: input.petSkinId, status: 'active' },
    });
    if (existing) {
      throw new ConflictException('an active listing already exists for this pet_skin');
    }

    this.validateModeFields(input);

    const royaltyRateBps = clampRoyalty(input.royaltyRateBps ?? skin.royaltyRateBps ?? 0);
    const activeUntil = new Date(
      Date.now() + (input.activeDays ?? DEFAULT_ACTIVE_DAYS) * 86_400_000,
    );

    const auctionEndsAt =
      input.mode === 'auction' && input.auctionDurationHours
        ? new Date(Date.now() + input.auctionDurationHours * 3_600_000)
        : null;

    const listing = this.listingRepo.create({
      petSkinId: input.petSkinId,
      sellerUserId: input.sellerUserId,
      mode: input.mode,
      status: 'active',
      priceUsd: input.priceUsd ?? null,
      startingBidUsd: input.startingBidUsd ?? null,
      reservePriceUsd: input.reservePriceUsd ?? null,
      minBidIncrementUsd: input.minBidIncrementUsd ?? '1.00',
      auctionEndsAt,
      rentalPricePerDayUsd: input.rentalPricePerDayUsd ?? null,
      rentalDurationDays: input.rentalDurationDays ?? null,
      royaltyRateBps,
      description: input.description ?? null,
      activeUntil,
    });

    const saved = await this.listingRepo.save(listing);
    this.logger.log(
      `Listing created: ${saved.id} skin=${saved.petSkinId} mode=${saved.mode} seller=${saved.sellerUserId}`,
    );
    return saved;
  }

  async cancelListing(listingId: string, sellerUserId: string): Promise<MarketplacePetListing> {
    const listing = await this.listingRepo.findOne({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('listing not found');
    if (listing.sellerUserId !== sellerUserId) {
      throw new ForbiddenException('only the seller can cancel this listing');
    }
    if (listing.status !== 'active' && listing.status !== 'draft') {
      throw new ConflictException(`cannot cancel listing in status=${listing.status}`);
    }
    listing.status = 'cancelled';
    return this.listingRepo.save(listing);
  }

  /**
   * Fixed-price purchase. Caller (controller) must have already settled payment;
   * this method only flips the listing + transfers the skin ownership.
   * Returns the updated listing. Idempotent on already-sold (returns as-is).
   */
  async buyFixedPrice(
    listingId: string,
    buyerUserId: string,
    paidPriceUsd: string,
  ): Promise<MarketplacePetListing> {
    const listing = await this.listingRepo.findOne({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('listing not found');
    if (listing.status === 'sold' && listing.buyerUserId === buyerUserId) {
      return listing; // idempotent
    }
    if (listing.status !== 'active') {
      throw new ConflictException(`listing not active (status=${listing.status})`);
    }
    if (listing.mode !== 'fixed_price') {
      throw new BadRequestException('listing is not fixed_price');
    }
    if (listing.sellerUserId === buyerUserId) {
      throw new BadRequestException('cannot buy your own listing');
    }

    listing.status = 'sold';
    listing.buyerUserId = buyerUserId;
    listing.finalPriceUsd = paidPriceUsd;
    listing.soldAt = new Date();
    const saved = await this.listingRepo.save(listing);

    // Transfer skin ownership.
    await this.skinRepo.update(
      { id: listing.petSkinId },
      { ownerUserId: buyerUserId, source: 'purchased' },
    );
    this.logger.log(
      `Listing sold: ${listing.id} skin=${listing.petSkinId} buyer=${buyerUserId} price=${paidPriceUsd}`,
    );

    // BE-T3.8: trigger Stripe Connect settlement (royalty splits to creator chain + seller).
    // Fire-and-forget: settlement failures must not block the buyer's purchase response.
    // Default resolver returns null (manual payout pending) — wire to UserService.findStripeAccount once available.
    if (this.settlementBridge) {
      this.settlementBridge
        .settleSoldListing(saved.id, async (_userId: string) => null)
        .catch((err) => {
          this.logger.error(
            `settleSoldListing failed listing=${saved.id}: ${err?.message || err}`,
          );
        });
    }

    return saved;
  }

  async findActiveListings(filter?: { mode?: PetListingMode; sellerUserId?: string }) {
    const qb = this.listingRepo
      .createQueryBuilder('l')
      .where('l.status = :status', { status: 'active' })
      .orderBy('l.created_at', 'DESC');
    if (filter?.mode) qb.andWhere('l.mode = :mode', { mode: filter.mode });
    if (filter?.sellerUserId) qb.andWhere('l.seller_user_id = :s', { s: filter.sellerUserId });
    return qb.getMany();
  }

  async findById(id: string): Promise<MarketplacePetListing | null> {
    return this.listingRepo.findOne({ where: { id } });
  }

  private validateModeFields(input: CreateListingInput): void {
    switch (input.mode) {
      case 'fixed_price':
        if (!input.priceUsd || Number(input.priceUsd) <= 0) {
          throw new BadRequestException('priceUsd > 0 required for fixed_price');
        }
        break;
      case 'auction':
        if (!input.startingBidUsd || Number(input.startingBidUsd) <= 0) {
          throw new BadRequestException('startingBidUsd > 0 required for auction');
        }
        if (!input.auctionDurationHours || input.auctionDurationHours < 1) {
          throw new BadRequestException('auctionDurationHours >= 1 required for auction');
        }
        break;
      case 'rental':
        if (!input.rentalPricePerDayUsd || Number(input.rentalPricePerDayUsd) <= 0) {
          throw new BadRequestException('rentalPricePerDayUsd > 0 required for rental');
        }
        if (!input.rentalDurationDays || input.rentalDurationDays < 1) {
          throw new BadRequestException('rentalDurationDays >= 1 required for rental');
        }
        break;
      default:
        throw new BadRequestException(`unknown mode: ${input.mode as string}`);
    }
  }

  /**
   * Sprint W-1 P1: aggregated leaderboard for the marketplace landing page.
   *
   * Three boards:
   *   - gmv:     SUM(finalPriceUsd) by seller; only sold listings
   *   - listings: COUNT(*) by seller; all-time
   *   - active:  COUNT(*) by seller; current active listings
   *
   * Leaderboards intentionally do NOT include royalty income — that's the
   * seller's gross sale value. For Remix royalty income see future
   * /v1/marketplace/royalties/leaderboard.
   */
  async leaderboard(
    board: 'gmv' | 'listings' | 'active' = 'gmv',
    limit = 10,
  ): Promise<Array<{ rank: number; userId: string; value: number }>> {
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const qb = this.listingRepo
      .createQueryBuilder('l')
      .select('l.seller_user_id', 'seller_user_id');

    if (board === 'gmv') {
      qb.addSelect('SUM(l.final_price_usd)', 'value')
        .where('l.status = :sold', { sold: 'sold' })
        .andWhere('l.final_price_usd IS NOT NULL');
    } else if (board === 'listings') {
      qb.addSelect('COUNT(*)', 'value');
    } else {
      qb.addSelect('COUNT(*)', 'value').where('l.status = :active', { active: 'active' });
    }

    const rows = await qb
      .groupBy('l.seller_user_id')
      .orderBy('value', 'DESC')
      .limit(safeLimit)
      .getRawMany<{ seller_user_id: string; value: string }>();

    return rows.map((r, idx) => ({
      rank: idx + 1,
      userId: r.seller_user_id,
      value: Number(r.value) || 0,
    }));
  }
}

function clampRoyalty(v: number): number {
  if (!Number.isFinite(v) || v < 0) return 0;
  if (v > MAX_ROYALTY_BPS) return MAX_ROYALTY_BPS;
  return Math.floor(v);
}
