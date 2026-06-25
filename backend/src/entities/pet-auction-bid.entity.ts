import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * PetAuctionBid — Phase 3 W1 auction bid.
 * Each bid for a marketplace_pet_listing of mode='auction'.
 * Bids are append-only; the highest bid wins at auction close.
 */
@Entity('pet_auction_bids')
@Index('idx_pab_listing_amount', ['listingId', 'amountUsd'])
@Index('idx_pab_bidder', ['bidderUserId'])
export class PetAuctionBid {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  listingId: string;

  @Column({ type: 'uuid' })
  bidderUserId: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amountUsd: string;

  /** Set true when this bid is the current top bid (1 row at a time per listing). */
  @Column({ type: 'boolean', default: false })
  isLeading: boolean;

  /** When refunded after being outbid (proxy bid, escrow release etc.). */
  @Column({ type: 'timestamptz', nullable: true })
  refundedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
