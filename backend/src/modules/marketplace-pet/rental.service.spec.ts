import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { RentalService } from './rental.service';
import { MarketplacePetListing } from '../../entities/marketplace-pet-listing.entity';
import { PetRentalLease } from '../../entities/pet-rental-lease.entity';

function makeRepo<T extends Record<string, any>>(initialRows: T[] = []) {
  const rows: T[] = [...initialRows];
  return {
    rows,
    findOne: jest.fn(async ({ where }: any) => {
      return rows.find((r) =>
        Object.entries(where).every(([k, v]) => (r as any)[k] === v),
      ) ?? null;
    }),
    find: jest.fn(async ({ where }: any = {}) =>
      rows.filter((r) =>
        Object.entries(where || {}).every(([k, v]) => (r as any)[k] === v),
      ),
    ),
    create: jest.fn((data: any) => ({ ...data })),
    save: jest.fn(async (e: any) => {
      const existing = rows.find((r) => (r as any).id === e.id);
      if (existing) { Object.assign(existing, e); return existing; }
      const withId = { id: 'r-' + (rows.length + 1), createdAt: new Date(), ...e };
      rows.push(withId as T);
      return withId;
    }),
    update: jest.fn(async (where: any, patch: any) => {
      const target = rows.find((r) => (r as any).id === where.id);
      if (target) Object.assign(target, patch);
      return { affected: target ? 1 : 0 };
    }),
  };
}

describe('RentalService (Phase 3 W1)', () => {
  let service: RentalService;
  let listingRepo: ReturnType<typeof makeRepo<any>>;
  let leaseRepo: ReturnType<typeof makeRepo<any>>;

  beforeEach(async () => {
    listingRepo = makeRepo<any>([
      {
        id: 'l-1',
        petSkinId: 'skin-1',
        sellerUserId: 'owner',
        mode: 'rental',
        status: 'active',
        rentalPricePerDayUsd: '5.00',
        rentalDurationDays: 7,
      },
    ]);
    leaseRepo = makeRepo<any>([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RentalService,
        { provide: getRepositoryToken(MarketplacePetListing), useValue: listingRepo },
        { provide: getRepositoryToken(PetRentalLease), useValue: leaseRepo },
      ],
    }).compile();
    service = module.get(RentalService);
  });

  it('creates a lease with correct duration + cost', async () => {
    const lease = await service.createLease('l-1', 'renter');
    expect(lease.durationDays).toBe(7);
    expect(lease.totalPaidUsd).toBe('35.00');
    expect(lease.status).toBe('active');
    expect(lease.endsAt.getTime()).toBeGreaterThan(lease.startsAt.getTime());
    expect(listingRepo.rows[0].status).toBe('rented');
  });

  it('overrides duration when caller passes days', async () => {
    const lease = await service.createLease('l-1', 'renter', 3);
    expect(lease.durationDays).toBe(3);
    expect(lease.totalPaidUsd).toBe('15.00');
  });

  it('rejects self-rental', async () => {
    await expect(service.createLease('l-1', 'owner')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects when listing not active', async () => {
    listingRepo.rows[0].status = 'sold';
    await expect(service.createLease('l-1', 'renter')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects when listing is not rental mode', async () => {
    listingRepo.rows[0].mode = 'fixed_price';
    await expect(service.createLease('l-1', 'renter')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('returnLease flips lease + reactivates listing', async () => {
    const lease = await service.createLease('l-1', 'renter');
    const returned = await service.returnLease(lease.id);
    expect(returned.status).toBe('returned');
    expect(returned.returnedAt).toBeInstanceOf(Date);
    expect(listingRepo.rows[0].status).toBe('active');
  });

  it('returnLease idempotent on already-returned', async () => {
    const lease = await service.createLease('l-1', 'renter');
    await service.returnLease(lease.id);
    const second = await service.returnLease(lease.id);
    expect(second.status).toBe('returned');
  });

  it('markOverdue flips status', async () => {
    const lease = await service.createLease('l-1', 'renter');
    const od = await service.markOverdue(lease.id);
    expect(od.status).toBe('overdue');
  });

  it('markOverdue no-ops on already-returned', async () => {
    const lease = await service.createLease('l-1', 'renter');
    await service.returnLease(lease.id);
    const od = await service.markOverdue(lease.id);
    expect(od.status).toBe('returned');
  });

  it('returnLease throws on missing lease', async () => {
    await expect(service.returnLease('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
