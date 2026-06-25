import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { MarketplaceListingService } from './marketplace-listing.service';
import { MarketplacePetListing } from '../../entities/marketplace-pet-listing.entity';
import { PetSkin } from '../../entities/pet-skin.entity';

function makeRepo<T extends Record<string, any>>(initialRows: T[] = []) {
  const rows: T[] = [...initialRows];
  return {
    rows,
    findOne: jest.fn(async ({ where }: any) => {
      return rows.find((r) =>
        Object.entries(where).every(([k, v]) => (r as any)[k] === v),
      ) ?? null;
    }),
    create: jest.fn((data: any) => ({ ...data })),
    save: jest.fn(async (e: any) => {
      const existing = rows.find((r) => (r as any).id === e.id);
      if (existing) {
        Object.assign(existing, e);
        return existing;
      }
      const withId = { id: 'l-' + (rows.length + 1), ...e };
      rows.push(withId as T);
      return withId;
    }),
    update: jest.fn(async (where: any, patch: any) => {
      const target = rows.find((r) => (r as any).id === where.id);
      if (target) Object.assign(target, patch);
      return { affected: target ? 1 : 0 };
    }),
    createQueryBuilder: jest.fn(() => {
      const state: any = { wheres: [] };
      const qb: any = {
        where: (s: string, p?: any) => { state.wheres.push({ s, p }); return qb; },
        andWhere: (s: string, p?: any) => { state.wheres.push({ s, p }); return qb; },
        orderBy: () => qb,
        getMany: async () => rows,
      };
      return qb;
    }),
  };
}

describe('MarketplaceListingService (Phase 3 W1)', () => {
  let service: MarketplaceListingService;
  let listingRepo: ReturnType<typeof makeRepo<any>>;
  let skinRepo: ReturnType<typeof makeRepo<any>>;

  const skinFixture = {
    id: 'skin-1',
    ownerUserId: 'user-A',
    retired: false,
    royaltyRateBps: 500,
  };

  beforeEach(async () => {
    listingRepo = makeRepo<any>([]);
    skinRepo = makeRepo<any>([{ ...skinFixture }]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketplaceListingService,
        { provide: getRepositoryToken(MarketplacePetListing), useValue: listingRepo },
        { provide: getRepositoryToken(PetSkin), useValue: skinRepo },
      ],
    }).compile();
    service = module.get(MarketplaceListingService);
  });

  describe('createListing', () => {
    it('creates a fixed_price listing with correct fields', async () => {
      const listing = await service.createListing({
        petSkinId: 'skin-1',
        sellerUserId: 'user-A',
        mode: 'fixed_price',
        priceUsd: '49.99',
      });
      expect(listing.status).toBe('active');
      expect(listing.priceUsd).toBe('49.99');
      expect(listing.royaltyRateBps).toBe(500); // inherited from skin
      expect(listing.activeUntil).toBeInstanceOf(Date);
    });

    it('creates an auction listing with auctionEndsAt computed', async () => {
      const listing = await service.createListing({
        petSkinId: 'skin-1',
        sellerUserId: 'user-A',
        mode: 'auction',
        startingBidUsd: '10',
        auctionDurationHours: 24,
      });
      expect(listing.mode).toBe('auction');
      expect(listing.auctionEndsAt).toBeInstanceOf(Date);
      expect(listing.auctionEndsAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it('rejects when seller does not own the skin', async () => {
      await expect(
        service.createListing({
          petSkinId: 'skin-1',
          sellerUserId: 'user-B',
          mode: 'fixed_price',
          priceUsd: '10',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects when skin is retired', async () => {
      skinRepo.rows[0].retired = true;
      await expect(
        service.createListing({
          petSkinId: 'skin-1',
          sellerUserId: 'user-A',
          mode: 'fixed_price',
          priceUsd: '10',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects when there is already an active listing for the same skin', async () => {
      await service.createListing({
        petSkinId: 'skin-1',
        sellerUserId: 'user-A',
        mode: 'fixed_price',
        priceUsd: '10',
      });
      await expect(
        service.createListing({
          petSkinId: 'skin-1',
          sellerUserId: 'user-A',
          mode: 'fixed_price',
          priceUsd: '20',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects fixed_price without priceUsd', async () => {
      await expect(
        service.createListing({
          petSkinId: 'skin-1',
          sellerUserId: 'user-A',
          mode: 'fixed_price',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects auction without startingBidUsd', async () => {
      await expect(
        service.createListing({
          petSkinId: 'skin-1',
          sellerUserId: 'user-A',
          mode: 'auction',
          auctionDurationHours: 24,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects rental without rentalDurationDays', async () => {
      await expect(
        service.createListing({
          petSkinId: 'skin-1',
          sellerUserId: 'user-A',
          mode: 'rental',
          rentalPricePerDayUsd: '5',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('clamps royalty over 10000bps to 10000', async () => {
      const listing = await service.createListing({
        petSkinId: 'skin-1',
        sellerUserId: 'user-A',
        mode: 'fixed_price',
        priceUsd: '10',
        royaltyRateBps: 99999,
      });
      expect(listing.royaltyRateBps).toBe(10000);
    });
  });

  describe('cancelListing', () => {
    it('marks listing cancelled when seller cancels active', async () => {
      const created = await service.createListing({
        petSkinId: 'skin-1',
        sellerUserId: 'user-A',
        mode: 'fixed_price',
        priceUsd: '10',
      });
      const cancelled = await service.cancelListing(created.id, 'user-A');
      expect(cancelled.status).toBe('cancelled');
    });

    it('rejects cancel from non-seller', async () => {
      const created = await service.createListing({
        petSkinId: 'skin-1',
        sellerUserId: 'user-A',
        mode: 'fixed_price',
        priceUsd: '10',
      });
      await expect(service.cancelListing(created.id, 'user-B')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('buyFixedPrice', () => {
    it('flips status to sold + transfers skin ownership', async () => {
      const created = await service.createListing({
        petSkinId: 'skin-1',
        sellerUserId: 'user-A',
        mode: 'fixed_price',
        priceUsd: '49.99',
      });
      const sold = await service.buyFixedPrice(created.id, 'user-B', '49.99');
      expect(sold.status).toBe('sold');
      expect(sold.buyerUserId).toBe('user-B');
      expect(sold.finalPriceUsd).toBe('49.99');
      expect(skinRepo.rows[0].ownerUserId).toBe('user-B');
      expect(skinRepo.rows[0].source).toBe('purchased');
    });

    it('idempotent on already-sold by same buyer', async () => {
      const created = await service.createListing({
        petSkinId: 'skin-1',
        sellerUserId: 'user-A',
        mode: 'fixed_price',
        priceUsd: '10',
      });
      await service.buyFixedPrice(created.id, 'user-B', '10');
      const again = await service.buyFixedPrice(created.id, 'user-B', '10');
      expect(again.status).toBe('sold');
    });

    it('rejects self-purchase', async () => {
      const created = await service.createListing({
        petSkinId: 'skin-1',
        sellerUserId: 'user-A',
        mode: 'fixed_price',
        priceUsd: '10',
      });
      await expect(service.buyFixedPrice(created.id, 'user-A', '10')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects buy when listing is auction mode', async () => {
      const created = await service.createListing({
        petSkinId: 'skin-1',
        sellerUserId: 'user-A',
        mode: 'auction',
        startingBidUsd: '5',
        auctionDurationHours: 24,
      });
      await expect(service.buyFixedPrice(created.id, 'user-B', '5')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
