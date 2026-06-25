import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MarketplaceSettlementBridge } from './marketplace-settlement.bridge';
import { AncestorChainService } from './ancestor-chain.service';
import { StripeConnectService } from '../payment/stripe-connect.service';
import { MarketplacePetListing } from '../../entities/marketplace-pet-listing.entity';

describe('MarketplaceSettlementBridge (BE-T3.8)', () => {
  let bridge: MarketplaceSettlementBridge;
  let listingRepo: any;
  let ancestor: any;
  let stripeConnect: any;

  const buildListing = (over: Partial<any> = {}) => ({
    id: 'L1', petSkinId: 'S1', sellerUserId: 'seller-B',
    status: 'sold', finalPriceUsd: '100.00', ...over,
  });

  beforeEach(async () => {
    listingRepo = { findOne: jest.fn() };
    ancestor = { resolveChain: jest.fn() };
    stripeConnect = { createTransfer: jest.fn() };

    const mod = await Test.createTestingModule({
      providers: [
        MarketplaceSettlementBridge,
        { provide: getRepositoryToken(MarketplacePetListing), useValue: listingRepo },
        { provide: AncestorChainService, useValue: ancestor },
        { provide: StripeConnectService, useValue: stripeConnect },
      ],
    }).compile();
    bridge = mod.get(MarketplaceSettlementBridge);
  });

  it('throws if listing not found', async () => {
    listingRepo.findOne.mockResolvedValueOnce(null);
    await expect(bridge.settleSoldListing('missing', async () => null))
      .rejects.toThrow(/not found/);
  });

  it('throws if listing not sold', async () => {
    listingRepo.findOne.mockResolvedValueOnce(buildListing({ status: 'active' }));
    await expect(bridge.settleSoldListing('L1', async () => null))
      .rejects.toThrow(/not sold/);
  });

  it('platform-only split: no transfers attempted (no royalty, seller has no Stripe account)', async () => {
    listingRepo.findOne.mockResolvedValueOnce(buildListing());
    ancestor.resolveChain.mockResolvedValueOnce([
      { creatorUserId: 'seller-B', royaltyRateBps: 0 }, // self → ignored
    ]);
    const result = await bridge.settleSoldListing('L1', async () => null);

    expect(result.split.platformCents).toBe(500); // 5% of $100
    expect(result.split.sellerCents).toBe(9500);
    // seller has no stripe account → manual payout pending
    expect(result.transfers).toHaveLength(1);
    expect(result.transfers[0]).toMatchObject({
      recipientUserId: 'seller-B', reason: 'seller', manualPayoutPending: true,
    });
    expect(stripeConnect.createTransfer).not.toHaveBeenCalled();
  });

  it('full royalty split: creator + seller both get Stripe transfers', async () => {
    listingRepo.findOne.mockResolvedValueOnce(buildListing());
    ancestor.resolveChain.mockResolvedValueOnce([
      { creatorUserId: 'creator-A', royaltyRateBps: 500 }, // 5%
    ]);
    const accounts: Record<string, string> = {
      'creator-A': 'acct_creatorA',
      'seller-B': 'acct_sellerB',
    };
    stripeConnect.createTransfer.mockImplementation(async (p: any) => ({
      id: `tr_${p.destinationAccountId}`,
    }));

    const result = await bridge.settleSoldListing('L1', async (uid) => accounts[uid] || null);

    expect(result.split.platformCents).toBe(500);
    expect(result.split.totalRoyaltyCents).toBe(500);
    expect(result.split.sellerCents).toBe(9000);

    expect(stripeConnect.createTransfer).toHaveBeenCalledTimes(2);
    const royaltyTx = result.transfers.find((t) => t.reason === 'royalty');
    const sellerTx = result.transfers.find((t) => t.reason === 'seller');
    expect(royaltyTx?.transferId).toBe('tr_acct_creatorA');
    expect(sellerTx?.transferId).toBe('tr_acct_sellerB');

    // Idempotency key in metadata
    const firstCall = stripeConnect.createTransfer.mock.calls[0][0];
    expect(firstCall.metadata.idempotencyKey).toMatch(/^mp_settle:L1:/);
  });

  it('Stripe transfer failure recorded but does not abort other transfers', async () => {
    listingRepo.findOne.mockResolvedValueOnce(buildListing());
    ancestor.resolveChain.mockResolvedValueOnce([
      { creatorUserId: 'creator-A', royaltyRateBps: 500 },
    ]);
    const accounts: Record<string, string> = {
      'creator-A': 'acct_creatorA',
      'seller-B': 'acct_sellerB',
    };
    stripeConnect.createTransfer.mockImplementation(async (p: any) => {
      if (p.destinationAccountId === 'acct_creatorA') throw new Error('insufficient_balance');
      return { id: 'tr_ok' };
    });

    const result = await bridge.settleSoldListing('L1', async (uid) => accounts[uid] || null);
    expect(result.transfers).toHaveLength(2);
    expect(result.transfers.find((t) => t.reason === 'royalty')?.error).toBe('insufficient_balance');
    expect(result.transfers.find((t) => t.reason === 'seller')?.transferId).toBe('tr_ok');
  });

  it('throws on invalid finalPriceUsd', async () => {
    listingRepo.findOne.mockResolvedValueOnce(buildListing({ finalPriceUsd: 'NaN' }));
    await expect(bridge.settleSoldListing('L1', async () => null))
      .rejects.toThrow(/finalPriceUsd/);
  });
});
