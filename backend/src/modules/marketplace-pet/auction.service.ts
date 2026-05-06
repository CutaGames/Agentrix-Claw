import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { MarketplacePetListing } from '../../entities/marketplace-pet-listing.entity';
import { PetAuctionBid } from '../../entities/pet-auction-bid.entity';
import { PetSkin } from '../../entities/pet-skin.entity';
import { applyAntiSnipe } from './anti-snipe';

@Injectable()
export class AuctionService {
  private readonly logger = new Logger(AuctionService.name);

  constructor(
    @InjectRepository(MarketplacePetListing)
    private readonly listingRepo: Repository<MarketplacePetListing>,
    @InjectRepository(PetAuctionBid)
    private readonly bidRepo: Repository<PetAuctionBid>,
    @InjectRepository(PetSkin)
    private readonly skinRepo: Repository<PetSkin>,
    private readonly dataSource: DataSource,
  ) {}

  async placeBid(
    listingId: string,
    bidderUserId: string,
    amountUsd: string,
  ): Promise<{ bid: PetAuctionBid; newEndsAt: Date | null; extended: boolean }> {
    const listing = await this.listingRepo.findOne({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('listing not found');
    if (listing.mode !== 'auction') throw new BadRequestException('listing is not an auction');
    if (listing.status !== 'active') throw new ConflictException(`auction not active (status=${listing.status})`);
    if (listing.sellerUserId === bidderUserId) {
      throw new ForbiddenException('cannot bid on your own auction');
    }
    if (!listing.auctionEndsAt || listing.auctionEndsAt.getTime() <= Date.now()) {
      throw new ConflictException('auction has ended');
    }

    const amount = Number(amountUsd);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('amountUsd must be > 0');
    }

    // Determine current top bid.
    const top = await this.bidRepo.findOne({
      where: { listingId, isLeading: true },
    });

    const startingBid = Number(listing.startingBidUsd ?? '0');
    const minIncrement = Number(listing.minBidIncrementUsd ?? '1');
    const minRequired = top ? Number(top.amountUsd) + minIncrement : startingBid;

    if (amount < minRequired) {
      throw new BadRequestException(
        `bid must be >= ${minRequired.toFixed(2)} (current top + min increment)`,
      );
    }

    // Anti-snipe extension.
    const bidAt = new Date();
    const originalEndsAt = listing.auctionEndsAt; // approximation; for v1 we use current as anchor
    const antiSnipe = applyAntiSnipe({
      currentEndsAt: listing.auctionEndsAt,
      originalEndsAt,
      bidAt,
    });

    return this.dataSource.transaction(async (mgr) => {
      // Demote previous top.
      if (top) {
        top.isLeading = false;
        await mgr.save(PetAuctionBid, top);
      }
      const bid = mgr.create(PetAuctionBid, {
        listingId,
        bidderUserId,
        amountUsd,
        isLeading: true,
      });
      const savedBid = await mgr.save(PetAuctionBid, bid);

      if (antiSnipe.extended) {
        listing.auctionEndsAt = antiSnipe.newEndsAt;
        await mgr.save(MarketplacePetListing, listing);
        this.logger.log(
          `Auction ${listingId} extended by anti-snipe → newEnds=${antiSnipe.newEndsAt.toISOString()}`,
        );
      }
      return { bid: savedBid, newEndsAt: listing.auctionEndsAt, extended: antiSnipe.extended };
    });
  }

  /**
   * Close an auction at end-time. Called by AuctionScheduler.
   * If reserve met → marks 'sold' + transfers skin to top bidder.
   * If no bids or reserve not met → marks 'cancelled'.
   * Idempotent.
   */
  async closeAuction(listingId: string): Promise<MarketplacePetListing> {
    const listing = await this.listingRepo.findOne({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('listing not found');
    if (listing.status !== 'active') return listing; // idempotent
    if (listing.mode !== 'auction') {
      throw new BadRequestException('listing is not an auction');
    }
    if (!listing.auctionEndsAt || listing.auctionEndsAt.getTime() > Date.now()) {
      throw new ConflictException('auction has not yet ended');
    }

    const top = await this.bidRepo.findOne({
      where: { listingId, isLeading: true },
    });

    if (!top) {
      listing.status = 'cancelled';
      this.logger.log(`Auction ${listingId} closed with no bids → cancelled`);
      return this.listingRepo.save(listing);
    }

    const reserve = Number(listing.reservePriceUsd ?? '0');
    if (reserve > 0 && Number(top.amountUsd) < reserve) {
      listing.status = 'cancelled';
      this.logger.log(
        `Auction ${listingId} closed top=${top.amountUsd} < reserve=${reserve} → cancelled`,
      );
      return this.listingRepo.save(listing);
    }

    return this.dataSource.transaction(async (mgr) => {
      listing.status = 'sold';
      listing.buyerUserId = top.bidderUserId;
      listing.finalPriceUsd = top.amountUsd;
      listing.soldAt = new Date();
      const saved = await mgr.save(MarketplacePetListing, listing);
      await mgr.update(
        PetSkin,
        { id: listing.petSkinId },
        { ownerUserId: top.bidderUserId, source: 'purchased' },
      );
      this.logger.log(
        `Auction ${listingId} settled buyer=${top.bidderUserId} price=${top.amountUsd}`,
      );
      return saved;
    });
  }

  async listBids(listingId: string): Promise<PetAuctionBid[]> {
    return this.bidRepo.find({
      where: { listingId },
      order: { amountUsd: 'DESC', createdAt: 'DESC' },
    });
  }
}
