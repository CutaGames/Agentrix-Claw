import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException } from '@nestjs/common';
import { PlotMarketplaceService } from './plot-marketplace.service';
import { WorldPlot } from '../entities/world-plot.entity';
import { PlotListing } from '../entities/plot-listing.entity';
import { LandEconomyService } from './land-economy.service';
import { ArenaService } from '../arena/arena.service';
import { AgentAccountService } from '../../agent-account/agent-account.service';
import type { CreatePlotListingRequest } from '../../../../shared/types/world-creation-api';

/**
 * Unit tests for PlotMarketplaceService (Task 16.3, R11.3 / R11.4).
 *
 * Focus:
 *  - createListing first-sale gating: only the original creator may list a Plot
 *    for an initial (first) sale; a non-creator is rejected with a structured
 *    NOT_ORIGINAL_CREATOR error and nothing is written. The original creator is
 *    delegated to LandEconomyService.listForSale.
 *  - platform-cut computation: 5% first-sale / 30% secondary-sale for AXP and
 *    USD listings.
 *
 * All collaborators are mocked — no DB, no economy side effects.
 */
describe('PlotMarketplaceService', () => {
  let service: PlotMarketplaceService;
  let plotRepo: { findOne: jest.Mock };
  let listingRepo: { findOne: jest.Mock };
  let landEconomyService: { listForSale: jest.Mock; transferPlot: jest.Mock };
  let arenaService: { publishArena: jest.Mock };
  let agentAccountService: { findByOwner: jest.Mock };

  const USER_ID = 'user-1';
  const CREATOR_ACCOUNT_ID = 'acc-creator-1';
  const OTHER_ACCOUNT_ID = 'acc-other-1';
  const PLOT_ID = 'plot-1';
  const LISTING_ID = 'listing-1';

  const creatorPlot: WorldPlot = {
    id: PLOT_ID,
    ownerAccountId: CREATOR_ACCOUNT_ID,
    originalCreatorAccountId: CREATOR_ACCOUNT_ID,
    substrateTier: 'B',
    ecsVersionId: null,
    mapX: 1,
    mapY: 2,
    status: 'published',
    title: 'My Arena',
    boundAgentId: null,
    shareCode: 'ABC123',
    version: 3,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:01.000Z'),
  } as WorldPlot;

  const makeListing = (overrides: Partial<PlotListing> = {}): PlotListing =>
    ({
      id: LISTING_ID,
      plotId: PLOT_ID,
      sellerAccountId: CREATOR_ACCOUNT_ID,
      priceUsd: null,
      priceAxp: '1000',
      saleType: 'first',
      status: 'active',
      version: 1,
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      ...overrides,
    }) as PlotListing;

  beforeEach(async () => {
    plotRepo = { findOne: jest.fn().mockResolvedValue({ ...creatorPlot }) };
    listingRepo = { findOne: jest.fn().mockResolvedValue(makeListing()) };
    landEconomyService = {
      listForSale: jest.fn().mockResolvedValue({ listingId: LISTING_ID }),
      transferPlot: jest.fn().mockResolvedValue({
        committed: true,
        newOwnerAccountId: OTHER_ACCOUNT_ID,
      }),
    };
    arenaService = { publishArena: jest.fn() };
    agentAccountService = {
      findByOwner: jest
        .fn()
        .mockResolvedValue({ items: [{ id: CREATOR_ACCOUNT_ID }], total: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlotMarketplaceService,
        { provide: getRepositoryToken(WorldPlot), useValue: plotRepo },
        { provide: getRepositoryToken(PlotListing), useValue: listingRepo },
        { provide: LandEconomyService, useValue: landEconomyService },
        { provide: ArenaService, useValue: arenaService },
        { provide: AgentAccountService, useValue: agentAccountService },
      ],
    }).compile();

    service = module.get(PlotMarketplaceService);
  });

  // ============================================================
  // R11.3 — first-sale listing is restricted to the original creator
  // ============================================================
  describe('createListing first-sale gating', () => {
    const firstSaleBody: CreatePlotListingRequest = {
      plotId: PLOT_ID,
      price: 1000,
      currency: 'AXP',
      saleType: 'first',
    };

    it('delegates to listForSale when the original creator lists for first sale', async () => {
      const res = await service.createListing(USER_ID, firstSaleBody);

      expect(res.error).toBeUndefined();
      expect(res.listing).toBeDefined();
      expect(res.listing?.listingId).toBe(LISTING_ID);
      expect(res.listing?.title).toBe('My Arena');
      expect(res.listing?.substrateTier).toBe('B');
      expect(landEconomyService.listForSale).toHaveBeenCalledWith(
        USER_ID,
        PLOT_ID,
        { price: 1000, currency: 'AXP', saleType: 'first' },
      );
    });

    it('rejects a non-original-creator first sale with NOT_ORIGINAL_CREATOR and writes nothing', async () => {
      // The authenticated seller owns the Plot but is NOT the original creator.
      agentAccountService.findByOwner.mockResolvedValue({
        items: [{ id: OTHER_ACCOUNT_ID }],
        total: 1,
      });
      plotRepo.findOne.mockResolvedValue({
        ...creatorPlot,
        ownerAccountId: OTHER_ACCOUNT_ID,
        originalCreatorAccountId: CREATOR_ACCOUNT_ID,
      });

      const res = await service.createListing(USER_ID, firstSaleBody);

      expect(res.listing).toBeUndefined();
      expect(res.error?.error).toBe('NOT_ORIGINAL_CREATOR');
      expect(res.error?.detail).toContain('original creator');
      // Nothing persisted: listForSale never invoked.
      expect(landEconomyService.listForSale).not.toHaveBeenCalled();
    });

    it('rejects when the seller is not the current Plot owner', async () => {
      agentAccountService.findByOwner.mockResolvedValue({
        items: [{ id: OTHER_ACCOUNT_ID }],
        total: 1,
      });
      // Plot owned by the creator, seller is someone else.
      await expect(
        service.createListing(USER_ID, firstSaleBody),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(landEconomyService.listForSale).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // R11.4 — platform revenue share (5% first / 30% secondary)
  // ============================================================
  describe('computePlatformCutNative via purchase', () => {
    it('applies 5% on a first-sale AXP listing', async () => {
      listingRepo.findOne.mockResolvedValue(
        makeListing({ priceAxp: '1000', priceUsd: null, saleType: 'first' }),
      );

      const res = await service.purchase(USER_ID, LISTING_ID, {
        signedConfirmation: 'sig',
      });

      expect(res.status).toBe('completed');
      // 1000 AXP * 5% = 50 (rounded integer for AXP).
      expect(res.platformCut).toBe(50);
    });

    it('applies 30% on a secondary-sale AXP listing', async () => {
      listingRepo.findOne.mockResolvedValue(
        makeListing({ priceAxp: '1000', priceUsd: null, saleType: 'secondary' }),
      );

      const res = await service.purchase(USER_ID, LISTING_ID, {
        signedConfirmation: 'sig',
      });

      // 1000 AXP * 30% = 300.
      expect(res.platformCut).toBe(300);
    });

    it('applies 5% on a first-sale USD listing rounded to cents', async () => {
      listingRepo.findOne.mockResolvedValue(
        makeListing({ priceAxp: null, priceUsd: '99.99', saleType: 'first' }),
      );

      const res = await service.purchase(USER_ID, LISTING_ID, {
        signedConfirmation: 'sig',
      });

      // 99.99 USD * 5% = 4.9995 → rounded to 5.00 (cents precision).
      expect(res.platformCut).toBe(5);
    });

    it('applies 30% on a secondary-sale USD listing rounded to cents', async () => {
      listingRepo.findOne.mockResolvedValue(
        makeListing({ priceAxp: null, priceUsd: '50.00', saleType: 'secondary' }),
      );

      const res = await service.purchase(USER_ID, LISTING_ID, {
        signedConfirmation: 'sig',
      });

      // 50.00 USD * 30% = 15.00.
      expect(res.platformCut).toBe(15);
    });

    it('returns failed without a platform cut when the transfer is not committed', async () => {
      landEconomyService.transferPlot.mockResolvedValue({
        committed: false,
        error: { error: 'TRUST_LEVEL_REQUIRED', detail: 'Trust 3 required' },
      });

      const res = await service.purchase(USER_ID, LISTING_ID, {
        signedConfirmation: '',
      });

      expect(res.status).toBe('failed');
      expect(res.error?.error).toBe('TRUST_LEVEL_REQUIRED');
    });
  });
});
