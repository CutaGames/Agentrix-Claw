import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type PetListingMode = 'fixed_price' | 'auction' | 'rental';
export type PetListingStatus =
  | 'draft'
  | 'active'
  | 'sold'
  | 'rented'
  | 'cancelled'
  | 'expired'
  | 'delisted';

/**
 * MarketplacePetListing — Phase 3 W1 marketplace MVP.
 *
 * One row per listing of a PetSkin onto the marketplace. A skin may have
 * multiple listings over time (e.g. listed → sold → re-listed by new owner).
 *
 * Three modes:
 *  - fixed_price: instant buy at `priceUsd`
 *  - auction:    sealed/English bidding, see PetAuctionBid
 *  - rental:     time-bound use, returns to seller after `rentalDurationDays`
 *
 * Royalty:
 *  - `royaltyRateBps` (basis points, 0-10000) is paid to the original creator
 *    on EVERY resale. 3-layer ancestor cap is enforced by RoyaltySplitterService.
 */
@Entity('marketplace_pet_listings')
@Index('idx_mpl_skin', ['petSkinId'])
@Index('idx_mpl_seller_status', ['sellerUserId', 'status'])
@Index('idx_mpl_status_mode', ['status', 'mode'])
@Index('idx_mpl_active_until', ['activeUntil'])
export class MarketplacePetListing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  petSkinId: string;

  @Column({ type: 'uuid' })
  sellerUserId: string;

  @Column({ type: 'varchar', length: 16 })
  mode: PetListingMode;

  @Column({ type: 'varchar', length: 16, default: 'draft' })
  status: PetListingStatus;

  /** Fixed-price or "buy it now" price. NULL for auction-only without BIN. */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  priceUsd: string | null;

  /** Auction starting bid. */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  startingBidUsd: string | null;

  /** Minimum bid increment in USD. */
  @Column({ type: 'numeric', precision: 8, scale: 2, default: '1.00' })
  minBidIncrementUsd: string;

  /** Reserve price (auction will not settle below this; cancelled if not met). */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  reservePriceUsd: string | null;

  /** Auction end timestamp (nullable for fixed_price/rental). */
  @Column({ type: 'timestamptz', nullable: true })
  auctionEndsAt: Date | null;

  /** Rental price per day. */
  @Column({ type: 'numeric', precision: 8, scale: 2, nullable: true })
  rentalPricePerDayUsd: string | null;

  /** Rental fixed term in days (counter-offer flow). */
  @Column({ type: 'integer', nullable: true })
  rentalDurationDays: number | null;

  /** Royalty paid to original creator on each sale, in basis points (0-10000). */
  @Column({ type: 'integer', default: 0 })
  royaltyRateBps: number;

  /** Seller's note / description. */
  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Active listings expire after this point (auto-removed by cron). */
  @Column({ type: 'timestamptz', nullable: true })
  activeUntil: Date | null;

  /** Buyer (when sold). */
  @Column({ type: 'uuid', nullable: true })
  buyerUserId: string | null;

  /** Sale price actually paid (may differ from price for auction). */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  finalPriceUsd: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  soldAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
