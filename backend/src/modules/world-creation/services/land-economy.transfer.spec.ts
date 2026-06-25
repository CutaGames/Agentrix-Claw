import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { LandEconomyService } from './land-economy.service';
import { WorldPlot } from '../entities/world-plot.entity';
import { PlotListing } from '../entities/plot-listing.entity';
import { AgentAccountService } from '../../agent-account/agent-account.service';
import { AxpService } from '../../axp/axp.service';
import {
  REVENUE_SHARE_FIRST_SALE,
  REVENUE_SHARE_SECONDARY_SALE,
  PLOT_PRICE_USD_MAX,
  PLOT_PRICE_AXP_MAX,
} from '../../../../shared/types/world-creation';
import type {
  ListPlotForSaleRequest,
  TransferPlotRequest,
} from '../../../../shared/types/world-creation-api';

/**
 * Unit tests for LandEconomyService.listForSale + transferPlot (Task 8.4,
 * R2.4 / R2.5 / R2.6).
 *
 * Focus areas (per task spec):
 *   (1) price-range validation (USD/AXP bounds, non-integer AXP) is rejected;
 *   (2) non-owner listing rejected, duplicate active listing rejected;
 *   (3) transfer applies first-sale 5% / secondary 30% platform cut, net to seller;
 *   (4) missing signed confirmation → rejected with no charge;
 *   (5) commit-phase version mismatch → rollback + full refund, ownership unchanged;
 *   (6) insufficient balance on reserve → rejected.
 *
 * All repositories and AxpService.spend/earn are jest.fn mocks; the
 * manager.transaction is mocked to synchronously invoke its callback with a
 * controllable EntityManager stub.
 */
describe('LandEconomyService — listForSale + transferPlot', () => {
  let service: LandEconomyService;

  let plotRepo: {
    findOne: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    manager: { transaction: jest.Mock };
  };
  let listingRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let agentAccountService: { findByOwner: jest.Mock; findById: jest.Mock };
  let axpService: { spend: jest.Mock; earn: jest.Mock };

  // Transaction EntityManager stub — configured per test.
  let txPlot: WorldPlot | null;
  let txListing: PlotListing | null;
  let txSaveCalls: Array<[unknown, unknown]>;

  const SELLER_ACCOUNT_ID = 'acc-seller-1';
  const SELLER_USER_ID = 'seller-user-1';
  const BUYER_ACCOUNT_ID = 'acc-buyer-1';
  const BUYER_USER_ID = 'buyer-user-1';

  const makePlot = (over: Partial<WorldPlot> = {}): WorldPlot =>
    ({
      id: 'plot-1',
      ownerAccountId: SELLER_ACCOUNT_ID,
      substrateTier: 'B',
      ecsVersionId: null,
      mapX: 1,
      mapY: 2,
      status: 'listed',
      title: 'Test Plot',
      boundAgentId: null,
      version: 6,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:01.000Z'),
      ...over,
    }) as WorldPlot;

  const makeListing = (over: Partial<PlotListing> = {}): PlotListing =>
    ({
      id: 'listing-1',
      plotId: 'plot-1',
      sellerAccountId: SELLER_ACCOUNT_ID,
      priceUsd: null,
      priceAxp: '1000',
      saleType: 'first',
      status: 'active',
      version: 3,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:01.000Z'),
      ...over,
    }) as PlotListing;

  beforeEach(async () => {
    txPlot = null;
    txListing = null;
    txSaveCalls = [];

    const em = {
      findOne: jest.fn(async (entity: unknown) => {
        if (entity === WorldPlot) return txPlot;
        if (entity === PlotListing) return txListing;
        return null;
      }),
      save: jest.fn(async (entity: unknown, value: unknown) => {
        txSaveCalls.push([entity, value]);
        return value;
      }),
    };

    plotRepo = {
      findOne: jest.fn(),
      save: jest.fn(async (v) => v),
      update: jest.fn(),
      manager: {
        transaction: jest.fn(async (cb: (m: typeof em) => unknown) => cb(em)),
      },
    };
    listingRepo = {
      findOne: jest.fn(),
      create: jest.fn((v) => ({ id: 'listing-new', ...v })),
      save: jest.fn(async (v) => v),
    };
    agentAccountService = {
      // Default: the authenticated user resolves to the BUYER account.
      findByOwner: jest
        .fn()
        .mockResolvedValue({ items: [{ id: BUYER_ACCOUNT_ID }], total: 1 }),
      // Seller account → owner userId lookup.
      findById: jest
        .fn()
        .mockResolvedValue({ id: SELLER_ACCOUNT_ID, ownerId: SELLER_USER_ID }),
    };
    axpService = {
      spend: jest.fn().mockResolvedValue({ ledger_id: 'l1', balance: 0 }),
      earn: jest.fn().mockResolvedValue({ ledger_id: 'l2', balance: 0 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LandEconomyService,
        { provide: getRepositoryToken(WorldPlot), useValue: plotRepo },
        { provide: getRepositoryToken(PlotListing), useValue: listingRepo },
        { provide: AgentAccountService, useValue: agentAccountService },
        { provide: AxpService, useValue: axpService },
      ],
    }).compile();

    service = module.get(LandEconomyService);
  });

  // ============================================================
  // (1) + (2) listForSale — price validation & ownership / duplicate guards
  // ============================================================
  describe('listForSale', () => {
    const ownerList: ListPlotForSaleRequest = {
      price: 500,
      currency: 'AXP',
      saleType: 'first',
    };

    beforeEach(() => {
      // The authenticated user is the seller/owner for listing tests.
      agentAccountService.findByOwner.mockResolvedValue({
        items: [{ id: SELLER_ACCOUNT_ID }],
        total: 1,
      });
    });

    it('creates an active listing for the owner with a valid AXP price', async () => {
      plotRepo.findOne.mockResolvedValue(makePlot());
      listingRepo.findOne.mockResolvedValue(null);

      const res = await service.listForSale(SELLER_USER_ID, 'plot-1', ownerList);

      expect(res.status).toBe('active');
      expect(res.listingId).toBeDefined();
      // Plot flipped to 'listed'.
      expect(plotRepo.save).toHaveBeenCalled();
      const created = listingRepo.create.mock.calls[0][0];
      expect(created.priceAxp).toBe('500');
      expect(created.priceUsd).toBeNull();
      expect(created.sellerAccountId).toBe(SELLER_ACCOUNT_ID);
    });

    it('rejects a USD price above the allowed maximum (out of range)', async () => {
      await expect(
        service.listForSale(SELLER_USER_ID, 'plot-1', {
          price: PLOT_PRICE_USD_MAX + 1,
          currency: 'USD',
          saleType: 'first',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      // Rejected before any repository write.
      expect(plotRepo.findOne).not.toHaveBeenCalled();
      expect(listingRepo.create).not.toHaveBeenCalled();
    });

    it('rejects a USD price below the allowed minimum (out of range)', async () => {
      await expect(
        service.listForSale(SELLER_USER_ID, 'plot-1', {
          price: 0,
          currency: 'USD',
          saleType: 'first',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(listingRepo.create).not.toHaveBeenCalled();
    });

    it('rejects an AXP price above the allowed maximum (out of range)', async () => {
      await expect(
        service.listForSale(SELLER_USER_ID, 'plot-1', {
          price: PLOT_PRICE_AXP_MAX + 1,
          currency: 'AXP',
          saleType: 'first',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(listingRepo.create).not.toHaveBeenCalled();
    });

    it('rejects a non-integer AXP price', async () => {
      await expect(
        service.listForSale(SELLER_USER_ID, 'plot-1', {
          price: 10.5,
          currency: 'AXP',
          saleType: 'first',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(listingRepo.create).not.toHaveBeenCalled();
    });

    it('rejects listing by a user who is not the Plot owner', async () => {
      plotRepo.findOne.mockResolvedValue(makePlot());
      // Authenticated user resolves to a DIFFERENT account than the owner.
      agentAccountService.findByOwner.mockResolvedValue({
        items: [{ id: 'acc-not-owner' }],
        total: 1,
      });

      await expect(
        service.listForSale('intruder', 'plot-1', ownerList),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(listingRepo.create).not.toHaveBeenCalled();
    });

    it('rejects a duplicate active listing for the same Plot', async () => {
      plotRepo.findOne.mockResolvedValue(makePlot());
      listingRepo.findOne.mockResolvedValue(
        makeListing({ id: 'listing-existing', status: 'active' }),
      );

      await expect(
        service.listForSale(SELLER_USER_ID, 'plot-1', ownerList),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(listingRepo.create).not.toHaveBeenCalled();
    });

    it('throws NotFound when the Plot does not exist', async () => {
      plotRepo.findOne.mockResolvedValue(null);

      await expect(
        service.listForSale(SELLER_USER_ID, 'plot-1', ownerList),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ============================================================
  // (3) + (4) + (5) + (6) transferPlot — cut, refund, rollback, gating
  // ============================================================
  describe('transferPlot', () => {
    const transferReq: TransferPlotRequest = {
      listingId: 'listing-1',
      signedConfirmation: 'sig-abc',
    };

    /** Wire up a happy-path transaction where the snapshot versions match. */
    const wireCommittableTx = (plot: WorldPlot, listing: PlotListing) => {
      // The transaction EntityManager sees the same versions as the snapshot.
      txPlot = makePlot({ ...plot });
      txListing = makeListing({ ...listing });
    };

    it('applies a 5% first-sale platform cut and credits the net to the seller', async () => {
      const plot = makePlot({ version: 6 });
      const listing = makeListing({
        priceAxp: '1000',
        saleType: 'first',
        version: 3,
      });
      plotRepo.findOne.mockResolvedValue(plot);
      listingRepo.findOne.mockResolvedValue(listing);
      wireCommittableTx(plot, listing);

      const res = await service.transferPlot(BUYER_USER_ID, transferReq);

      expect(res.committed).toBe(true);
      expect(res.newOwnerAccountId).toBe(BUYER_ACCOUNT_ID);
      expect(res.authoritativeAmount).toBe(1000);

      // Buyer charged the full authoritative amount.
      expect(axpService.spend).toHaveBeenCalledTimes(1);
      expect(axpService.spend.mock.calls[0][0]).toMatchObject({
        userId: BUYER_USER_ID,
        amount: 1000,
        source: 'plot_purchase',
      });

      // Seller credited net of 5% cut: 1000 - round(1000*0.05) = 950.
      const expectedCut = Math.round(1000 * REVENUE_SHARE_FIRST_SALE);
      expect(axpService.earn).toHaveBeenCalledTimes(1);
      expect(axpService.earn.mock.calls[0][0]).toMatchObject({
        userId: SELLER_USER_ID,
        amount: 1000 - expectedCut,
        source: 'plot_revenue',
      });
      expect(1000 - expectedCut).toBe(950);

      // Ownership flipped to buyer inside the transaction.
      const plotSave = txSaveCalls.find(([e]) => e === WorldPlot);
      expect((plotSave?.[1] as WorldPlot).ownerAccountId).toBe(BUYER_ACCOUNT_ID);
    });

    it('applies a 30% secondary-sale platform cut and credits the net to the seller', async () => {
      const plot = makePlot({ version: 6 });
      const listing = makeListing({
        priceAxp: '1000',
        saleType: 'secondary',
        version: 3,
      });
      plotRepo.findOne.mockResolvedValue(plot);
      listingRepo.findOne.mockResolvedValue(listing);
      wireCommittableTx(plot, listing);

      const res = await service.transferPlot(BUYER_USER_ID, transferReq);

      expect(res.committed).toBe(true);

      // Seller credited net of 30% cut: 1000 - round(1000*0.30) = 700.
      const expectedCut = Math.round(1000 * REVENUE_SHARE_SECONDARY_SALE);
      expect(axpService.earn.mock.calls[0][0]).toMatchObject({
        userId: SELLER_USER_ID,
        amount: 1000 - expectedCut,
        source: 'plot_revenue',
      });
      expect(1000 - expectedCut).toBe(700);
    });

    it('rejects without charging when the signed confirmation is missing', async () => {
      const res = await service.transferPlot(BUYER_USER_ID, {
        listingId: 'listing-1',
        signedConfirmation: '',
      });

      expect(res.committed).toBe(false);
      expect(res.error?.error).toBe('ECONOMY_REJECTED');
      // No balance touched: neither charge nor refund nor transaction.
      expect(axpService.spend).not.toHaveBeenCalled();
      expect(axpService.earn).not.toHaveBeenCalled();
      expect(plotRepo.manager.transaction).not.toHaveBeenCalled();
    });

    it('rolls back and refunds the buyer in full on a commit-phase version mismatch (ownership unchanged)', async () => {
      const plot = makePlot({ version: 6 });
      const listing = makeListing({ version: 3, priceAxp: '1000' });
      plotRepo.findOne.mockResolvedValue(plot);
      listingRepo.findOne.mockResolvedValue(listing);

      // The transaction sees a CONCURRENTLY MODIFIED plot (version bumped).
      txPlot = makePlot({ version: 7 });
      txListing = makeListing({ version: 3 });

      const res = await service.transferPlot(BUYER_USER_ID, transferReq);

      expect(res.committed).toBe(false);
      expect(res.error?.error).toBe('ECONOMY_REJECTED');

      // Buyer was charged on reserve, then fully refunded.
      expect(axpService.spend).toHaveBeenCalledTimes(1);
      expect(axpService.spend.mock.calls[0][0]).toMatchObject({ amount: 1000 });
      expect(axpService.earn).toHaveBeenCalledTimes(1);
      expect(axpService.earn.mock.calls[0][0]).toMatchObject({
        userId: BUYER_USER_ID,
        amount: 1000,
        source: 'plot_payout',
      });

      // Ownership NOT changed: no WorldPlot save committed in the rolled-back tx.
      const plotSave = txSaveCalls.find(([e]) => e === WorldPlot);
      expect(plotSave).toBeUndefined();
    });

    it('rejects when the buyer has insufficient balance on reserve (no refund, no ownership change)', async () => {
      const plot = makePlot({ version: 6 });
      const listing = makeListing({ version: 3, priceAxp: '1000' });
      plotRepo.findOne.mockResolvedValue(plot);
      listingRepo.findOne.mockResolvedValue(listing);

      axpService.spend.mockRejectedValue(
        new BadRequestException('insufficient balance'),
      );

      const res = await service.transferPlot(BUYER_USER_ID, transferReq);

      expect(res.committed).toBe(false);
      expect(res.error?.error).toBe('ECONOMY_REJECTED');
      // Charge attempted (and failed atomically) → no refund, no transaction.
      expect(axpService.spend).toHaveBeenCalledTimes(1);
      expect(axpService.earn).not.toHaveBeenCalled();
      expect(plotRepo.manager.transaction).not.toHaveBeenCalled();
    });

    it('rejects a self-purchase (buyer account equals seller account)', async () => {
      const plot = makePlot();
      const listing = makeListing({ sellerAccountId: BUYER_ACCOUNT_ID });
      plotRepo.findOne.mockResolvedValue(plot);
      listingRepo.findOne.mockResolvedValue(listing);

      await expect(
        service.transferPlot(BUYER_USER_ID, transferReq),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(axpService.spend).not.toHaveBeenCalled();
    });

    it('rejects when the listing is not active', async () => {
      const listing = makeListing({ status: 'sold' });
      listingRepo.findOne.mockResolvedValue(listing);

      const res = await service.transferPlot(BUYER_USER_ID, transferReq);

      expect(res.committed).toBe(false);
      expect(res.error?.error).toBe('ECONOMY_REJECTED');
      expect(axpService.spend).not.toHaveBeenCalled();
    });

    it('settles a USD-priced listing by converting to AXP for the authoritative amount', async () => {
      const plot = makePlot({ version: 6 });
      // $5.00 → 5000 AXP at 1 AXP = $0.001.
      const listing = makeListing({
        priceUsd: '5.00',
        priceAxp: null,
        saleType: 'first',
        version: 3,
      });
      plotRepo.findOne.mockResolvedValue(plot);
      listingRepo.findOne.mockResolvedValue(listing);
      wireCommittableTx(plot, listing);

      const res = await service.transferPlot(BUYER_USER_ID, transferReq);

      expect(res.committed).toBe(true);
      // Native amount echoed in USD; wallet charged the converted AXP.
      expect(res.authoritativeAmount).toBe(5);
      expect(axpService.spend.mock.calls[0][0]).toMatchObject({ amount: 5000 });
    });
  });
});
