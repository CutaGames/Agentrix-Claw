import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { MarketplacePetListing } from '../../entities/marketplace-pet-listing.entity';
import { PetRentalLease } from '../../entities/pet-rental-lease.entity';
import { AuctionService } from './auction.service';
import { RentalService } from './rental.service';

/**
 * MarketplaceScheduler — Phase 3 W1.
 *  - Closes ended auctions every minute (BE-T3.9 anti-snipe extends end time mid-flight).
 *  - Marks overdue rental leases every hour and auto-returns 24h after expiry.
 *  - Expires unused active listings whose `activeUntil` has passed.
 */
@Injectable()
export class MarketplaceScheduler {
  private readonly logger = new Logger(MarketplaceScheduler.name);

  constructor(
    @InjectRepository(MarketplacePetListing)
    private readonly listingRepo: Repository<MarketplacePetListing>,
    @InjectRepository(PetRentalLease)
    private readonly leaseRepo: Repository<PetRentalLease>,
    private readonly auctionService: AuctionService,
    private readonly rentalService: RentalService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { timeZone: 'UTC' })
  async closeEndedAuctions(): Promise<void> {
    try {
      const now = new Date();
      const ended = await this.listingRepo.find({
        where: {
          mode: 'auction',
          status: 'active',
          auctionEndsAt: LessThan(now),
        },
        take: 50,
      });
      if (ended.length === 0) return;
      for (const listing of ended) {
        try {
          await this.auctionService.closeAuction(listing.id);
        } catch (err: any) {
          this.logger.error(`closeAuction(${listing.id}) failed: ${err?.message ?? err}`);
        }
      }
    } catch (err: any) {
      this.logger.error(`closeEndedAuctions tick failed: ${err?.message ?? err}`);
    }
  }

  @Cron(CronExpression.EVERY_HOUR, { timeZone: 'UTC' })
  async sweepOverdueLeases(): Promise<void> {
    try {
      const now = new Date();
      // Mark active leases past endsAt as overdue.
      const overdue = await this.leaseRepo.find({
        where: { status: 'active', endsAt: LessThan(now) },
        take: 100,
      });
      for (const lease of overdue) {
        try {
          await this.rentalService.markOverdue(lease.id);
        } catch (err: any) {
          this.logger.error(`markOverdue(${lease.id}) failed: ${err?.message ?? err}`);
        }
      }

      // Auto-return overdue leases > 24h grace.
      const grace = new Date(now.getTime() - 24 * 3_600_000);
      const stale = await this.leaseRepo.find({
        where: { status: 'overdue', endsAt: LessThan(grace) },
        take: 100,
      });
      for (const lease of stale) {
        try {
          await this.rentalService.returnLease(lease.id);
        } catch (err: any) {
          this.logger.error(`auto-returnLease(${lease.id}) failed: ${err?.message ?? err}`);
        }
      }
    } catch (err: any) {
      this.logger.error(`sweepOverdueLeases tick failed: ${err?.message ?? err}`);
    }
  }

  @Cron(CronExpression.EVERY_HOUR, { timeZone: 'UTC' })
  async expireOldListings(): Promise<void> {
    try {
      const now = new Date();
      const result = await this.listingRepo
        .createQueryBuilder()
        .update(MarketplacePetListing)
        .set({ status: 'expired' })
        .where('status = :s', { s: 'active' })
        .andWhere('mode != :m', { m: 'auction' }) // auctions handled separately
        .andWhere('active_until IS NOT NULL')
        .andWhere('active_until < :now', { now })
        .execute();
      if (result.affected) {
        this.logger.log(`expireOldListings: marked ${result.affected} expired`);
      }
    } catch (err: any) {
      this.logger.error(`expireOldListings tick failed: ${err?.message ?? err}`);
    }
  }
}
