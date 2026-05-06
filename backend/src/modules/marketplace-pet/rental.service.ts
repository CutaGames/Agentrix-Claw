import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MarketplacePetListing } from '../../entities/marketplace-pet-listing.entity';
import { PetRentalLease } from '../../entities/pet-rental-lease.entity';

@Injectable()
export class RentalService {
  private readonly logger = new Logger(RentalService.name);

  constructor(
    @InjectRepository(MarketplacePetListing)
    private readonly listingRepo: Repository<MarketplacePetListing>,
    @InjectRepository(PetRentalLease)
    private readonly leaseRepo: Repository<PetRentalLease>,
  ) {}

  async createLease(
    listingId: string,
    renterUserId: string,
    days?: number,
  ): Promise<PetRentalLease> {
    const listing = await this.listingRepo.findOne({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('listing not found');
    if (listing.mode !== 'rental') throw new BadRequestException('listing is not a rental');
    if (listing.status !== 'active') throw new ConflictException(`listing not active (status=${listing.status})`);
    if (listing.sellerUserId === renterUserId) {
      throw new BadRequestException('cannot rent your own listing');
    }

    const duration = days ?? listing.rentalDurationDays ?? 7;
    if (duration < 1) throw new BadRequestException('rental duration must be >= 1 day');

    const pricePerDay = Number(listing.rentalPricePerDayUsd ?? '0');
    const totalPaid = (pricePerDay * duration).toFixed(2);

    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + duration * 86_400_000);

    const lease = this.leaseRepo.create({
      listingId,
      petSkinId: listing.petSkinId,
      renterUserId,
      ownerUserId: listing.sellerUserId,
      durationDays: duration,
      totalPaidUsd: totalPaid,
      startsAt,
      endsAt,
      status: 'active',
    });
    const saved = await this.leaseRepo.save(lease);

    listing.status = 'rented';
    await this.listingRepo.save(listing);

    this.logger.log(
      `Rental lease created: ${saved.id} listing=${listingId} renter=${renterUserId} days=${duration}`,
    );
    return saved;
  }

  async returnLease(leaseId: string): Promise<PetRentalLease> {
    const lease = await this.leaseRepo.findOne({ where: { id: leaseId } });
    if (!lease) throw new NotFoundException('lease not found');
    if (lease.status === 'returned') return lease; // idempotent
    if (lease.status === 'cancelled') return lease;

    lease.status = 'returned';
    lease.returnedAt = new Date();
    const saved = await this.leaseRepo.save(lease);

    // Re-open listing for further rental (or seller may cancel).
    await this.listingRepo.update({ id: lease.listingId }, { status: 'active' });
    this.logger.log(`Rental lease returned: ${leaseId}`);
    return saved;
  }

  async markOverdue(leaseId: string): Promise<PetRentalLease> {
    const lease = await this.leaseRepo.findOne({ where: { id: leaseId } });
    if (!lease) throw new NotFoundException('lease not found');
    if (lease.status !== 'active') return lease;
    lease.status = 'overdue';
    const saved = await this.leaseRepo.save(lease);
    this.logger.warn(`Rental lease marked overdue: ${leaseId}`);
    return saved;
  }

  async findActiveByRenter(renterUserId: string): Promise<PetRentalLease[]> {
    return this.leaseRepo.find({
      where: { renterUserId, status: 'active' },
      order: { endsAt: 'ASC' },
    });
  }
}
