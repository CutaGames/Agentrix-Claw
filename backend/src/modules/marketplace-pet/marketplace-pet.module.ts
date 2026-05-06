import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketplacePetListing } from '../../entities/marketplace-pet-listing.entity';
import { PetAuctionBid } from '../../entities/pet-auction-bid.entity';
import { PetRentalLease } from '../../entities/pet-rental-lease.entity';
import { PetSkin } from '../../entities/pet-skin.entity';
import { MarketplaceListingService } from './marketplace-listing.service';
import { AuctionService } from './auction.service';
import { RentalService } from './rental.service';
import { AncestorChainService } from './ancestor-chain.service';
import { MarketplaceScheduler } from './marketplace.scheduler';
import { MarketplacePetController } from './marketplace-pet.controller';
import { ReverseImageSearchService } from './reverse-image-search.service';
import { RemixBreedingService } from './remix-breeding.service';
import { MarketplaceSettlementBridge } from './marketplace-settlement.bridge';

/**
 * MarketplacePetModule — Phase 3 W1 Marketplace MVP.
 *
 *  - Listing/Buy/Cancel (fixed price)
 *  - Auction (bid + anti-snipe extension + auto-close cron)
 *  - Rental (lease + auto-return cron)
 *  - Royalty splitter (pure function in royalty-splitter.ts)
 *  - VRM blendshape validator (BE-T3.2; full auto-rig BE-T3.1 deferred to W2)
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      MarketplacePetListing,
      PetAuctionBid,
      PetRentalLease,
      PetSkin,
    ]),
  ],
  controllers: [MarketplacePetController],
  providers: [
    MarketplaceListingService,
    AuctionService,
    RentalService,
    AncestorChainService,
    MarketplaceScheduler,
    ReverseImageSearchService,
    RemixBreedingService,
    MarketplaceSettlementBridge,
  ],
  exports: [
    MarketplaceListingService,
    AuctionService,
    RentalService,
    AncestorChainService,
    ReverseImageSearchService,
    RemixBreedingService,
    MarketplaceSettlementBridge,
  ],
})
export class MarketplacePetModule {}
