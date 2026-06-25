import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { AuctionService } from './auction.service';
import { MarketplacePetListing } from '../../entities/marketplace-pet-listing.entity';
import { PetAuctionBid } from '../../entities/pet-auction-bid.entity';
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
    find: jest.fn(async ({ where, order }: any = {}) => {
      let out = rows.filter((r) =>
        Object.entries(where || {}).every(([k, v]) => (r as any)[k] === v),
      );
      if (order && order.amountUsd) {
        out = [...out].sort((a, b) =>
          order.amountUsd === 'DESC'
            ? Number(b.amountUsd) - Number(a.amountUsd)
            : Number(a.amountUsd) - Number(b.amountUsd),
        );
      }
      return out;
    }),
    create: jest.fn((data: any) => ({ ...data })),
    save: jest.fn(async (e: any) => {
      const existing = rows.find((r) => (r as any).id === e.id);
      if (existing) { Object.assign(existing, e); return existing; }
      const withId = { id: 'b-' + (rows.length + 1), createdAt: new Date(), ...e };
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

function makeDataSource(repos: Record<string, any>): Partial<DataSource> {
  return {
    transaction: jest.fn(async (fn: any) => {
      const mgr = {
        save: jest.fn(async (cls: any, e: any) => {
          // route by entity class name
          const repoKey = (cls?.name || cls).toString();
          const repo = repos[repoKey];
          if (!repo) throw new Error(`no repo for ${repoKey}`);
          return repo.save(e);
        }),
        update: jest.fn(async (cls: any, where: any, patch: any) => {
          const repoKey = (cls?.name || cls).toString();
          const repo = repos[repoKey];
          if (!repo) return { affected: 0 };
          return repo.update(where, patch);
        }),
        create: jest.fn((cls: any, data: any) => {
          const repoKey = (cls?.name || cls).toString();
          const repo = repos[repoKey];
          return repo.create(data);
        }),
      };
      return fn(mgr);
    }) as any,
  };
}

describe('AuctionService (Phase 3 W1)', () => {
  let service: AuctionService;
  let listingRepo: ReturnType<typeof makeRepo<any>>;
  let bidRepo: ReturnType<typeof makeRepo<any>>;
  let skinRepo: ReturnType<typeof makeRepo<any>>;

  const futureEnd = () => new Date(Date.now() + 3600_000);

  beforeEach(async () => {
    listingRepo = makeRepo<any>([
      {
        id: 'l-1',
        petSkinId: 'skin-1',
        sellerUserId: 'seller',
        mode: 'auction',
        status: 'active',
        startingBidUsd: '10.00',
        minBidIncrementUsd: '1.00',
        reservePriceUsd: '50.00',
        auctionEndsAt: futureEnd(),
      },
    ]);
    bidRepo = makeRepo<any>([]);
    skinRepo = makeRepo<any>([{ id: 'skin-1', ownerUserId: 'seller', retired: false }]);
    const ds = makeDataSource({
      MarketplacePetListing: listingRepo,
      PetAuctionBid: bidRepo,
      PetSkin: skinRepo,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuctionService,
        { provide: getRepositoryToken(MarketplacePetListing), useValue: listingRepo },
        { provide: getRepositoryToken(PetAuctionBid), useValue: bidRepo },
        { provide: getRepositoryToken(PetSkin), useValue: skinRepo },
        { provide: DataSource, useValue: ds },
      ],
    }).compile();
    service = module.get(AuctionService);
  });

  describe('placeBid', () => {
    it('accepts first valid bid at startingBidUsd', async () => {
      const r = await service.placeBid('l-1', 'bidder-A', '10.00');
      expect(r.bid.amountUsd).toBe('10.00');
      expect(r.bid.isLeading).toBe(true);
    });

    it('rejects bid below startingBidUsd', async () => {
      await expect(service.placeBid('l-1', 'bidder-A', '5.00')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects bid below current top + min increment', async () => {
      await service.placeBid('l-1', 'bidder-A', '20.00');
      await expect(service.placeBid('l-1', 'bidder-B', '20.50')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('demotes previous top bid when new bid wins', async () => {
      await service.placeBid('l-1', 'bidder-A', '20.00');
      await service.placeBid('l-1', 'bidder-B', '21.00');
      const leading = bidRepo.rows.filter((b) => b.isLeading);
      expect(leading).toHaveLength(1);
      expect(leading[0].bidderUserId).toBe('bidder-B');
    });

    it('rejects seller bidding on own auction', async () => {
      await expect(service.placeBid('l-1', 'seller', '10.00')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rejects bid on auction past end time', async () => {
      listingRepo.rows[0].auctionEndsAt = new Date(Date.now() - 1000);
      await expect(service.placeBid('l-1', 'bidder-A', '10')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('closeAuction', () => {
    it('settles to top bidder when reserve met', async () => {
      await service.placeBid('l-1', 'bidder-A', '60.00');
      listingRepo.rows[0].auctionEndsAt = new Date(Date.now() - 1000);
      const settled = await service.closeAuction('l-1');
      expect(settled.status).toBe('sold');
      expect(settled.buyerUserId).toBe('bidder-A');
      expect(settled.finalPriceUsd).toBe('60.00');
      expect(skinRepo.rows[0].ownerUserId).toBe('bidder-A');
    });

    it('cancels when reserve not met', async () => {
      await service.placeBid('l-1', 'bidder-A', '20.00');
      listingRepo.rows[0].auctionEndsAt = new Date(Date.now() - 1000);
      const settled = await service.closeAuction('l-1');
      expect(settled.status).toBe('cancelled');
    });

    it('cancels with no bids', async () => {
      listingRepo.rows[0].auctionEndsAt = new Date(Date.now() - 1000);
      const settled = await service.closeAuction('l-1');
      expect(settled.status).toBe('cancelled');
    });

    it('idempotent on already-closed', async () => {
      listingRepo.rows[0].status = 'sold';
      const r = await service.closeAuction('l-1');
      expect(r.status).toBe('sold');
    });

    it('refuses to close before end time', async () => {
      await expect(service.closeAuction('l-1')).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
