import { splitRoyalty, RoyaltyChainLink } from './royalty-splitter';

const PLATFORM_BPS = 500; // 5%

describe('splitRoyalty (BE-T3.4 / BE-T3.5)', () => {
  it('no ancestors → all (gross - platform) goes to seller', () => {
    const r = splitRoyalty({
      grossPriceCents: 10000, // $100
      platformBps: PLATFORM_BPS,
      sellerUserId: 's1',
      ancestorChain: [],
    });
    expect(r.platformCents).toBe(500);
    expect(r.totalRoyaltyCents).toBe(0);
    expect(r.sellerCents).toBe(9500);
    expect(r.scaledDown).toBe(false);
    expect(r.payouts).toHaveLength(2);
  });

  it('single creator with 20% royalty (BE-T3.4 — 30/70-ish split semantics)', () => {
    // gross 10000c, platform 500c, royalty 2000c → seller 7500c
    const r = splitRoyalty({
      grossPriceCents: 10000,
      platformBps: PLATFORM_BPS,
      sellerUserId: 'reseller',
      ancestorChain: [{ creatorUserId: 'creator-A', royaltyRateBps: 2000 }],
    });
    expect(r.platformCents).toBe(500);
    expect(r.totalRoyaltyCents).toBe(2000);
    expect(r.sellerCents).toBe(7500);
    const royaltyPayout = r.payouts.find((p) => p.reason === 'royalty');
    expect(royaltyPayout).toMatchObject({
      recipientUserId: 'creator-A',
      amountCents: 2000,
      ancestorLayer: 0,
    });
  });

  it('honours up to 3 ancestor layers (BE-T3.5 — 3-layer cap)', () => {
    const chain: RoyaltyChainLink[] = [
      { creatorUserId: 'gen0', royaltyRateBps: 1000 }, // 10%
      { creatorUserId: 'gen1', royaltyRateBps: 800 },  // 8%
      { creatorUserId: 'gen2', royaltyRateBps: 600 },  // 6%
      { creatorUserId: 'gen3', royaltyRateBps: 400 },  // dropped
      { creatorUserId: 'gen4', royaltyRateBps: 200 },  // dropped
    ];
    const r = splitRoyalty({
      grossPriceCents: 10000,
      platformBps: PLATFORM_BPS,
      sellerUserId: 'seller',
      ancestorChain: chain,
    });
    expect(r.totalRoyaltyCents).toBe(1000 + 800 + 600); // 2400
    expect(r.platformCents).toBe(500);
    expect(r.sellerCents).toBe(7100);
    expect(r.payouts.filter((p) => p.reason === 'royalty')).toHaveLength(3);
    const layers = r.payouts.filter((p) => p.reason === 'royalty').map((p) => p.ancestorLayer);
    expect(layers).toEqual([0, 1, 2]);
    // Verify gen3/gen4 not present
    expect(r.payouts.find((p) => p.recipientUserId === 'gen3')).toBeUndefined();
    expect(r.payouts.find((p) => p.recipientUserId === 'gen4')).toBeUndefined();
  });

  it('drops self-royalty when seller appears in own ancestor chain', () => {
    const r = splitRoyalty({
      grossPriceCents: 10000,
      platformBps: PLATFORM_BPS,
      sellerUserId: 'creator-A',
      ancestorChain: [{ creatorUserId: 'creator-A', royaltyRateBps: 5000 }],
    });
    expect(r.totalRoyaltyCents).toBe(0);
    expect(r.sellerCents).toBe(9500);
  });

  it('drops zero-rate ancestors silently', () => {
    const r = splitRoyalty({
      grossPriceCents: 10000,
      platformBps: PLATFORM_BPS,
      sellerUserId: 's',
      ancestorChain: [
        { creatorUserId: 'gen0', royaltyRateBps: 0 },
        { creatorUserId: 'gen1', royaltyRateBps: 1500 },
      ],
    });
    const royaltyPayouts = r.payouts.filter((p) => p.reason === 'royalty');
    expect(royaltyPayouts).toHaveLength(1);
    expect(royaltyPayouts[0].recipientUserId).toBe('gen1');
  });

  it('clamps royaltyRateBps > 10000 to 10000', () => {
    const r = splitRoyalty({
      grossPriceCents: 10000,
      platformBps: 0,
      sellerUserId: 's',
      ancestorChain: [{ creatorUserId: 'g', royaltyRateBps: 99999 }],
    });
    // royalty would be 100% → seller gets 0; not negative
    expect(r.totalRoyaltyCents).toBe(10000);
    expect(r.sellerCents).toBe(0);
    expect(r.scaledDown).toBe(false);
  });

  it('scales royalties down proportionally when sum > gross (no negative seller)', () => {
    // Two ancestors at 60% each = 120% combined, plus 5% platform → must scale down
    const r = splitRoyalty({
      grossPriceCents: 10000,
      platformBps: PLATFORM_BPS,
      sellerUserId: 's',
      ancestorChain: [
        { creatorUserId: 'gen0', royaltyRateBps: 6000 },
        { creatorUserId: 'gen1', royaltyRateBps: 6000 },
      ],
    });
    expect(r.scaledDown).toBe(true);
    expect(r.platformCents).toBe(500);
    expect(r.platformCents + r.totalRoyaltyCents + r.sellerCents).toBeLessThanOrEqual(10000);
    expect(r.sellerCents).toBeGreaterThanOrEqual(0);
  });

  it('handles zero gross price gracefully', () => {
    const r = splitRoyalty({
      grossPriceCents: 0,
      platformBps: PLATFORM_BPS,
      sellerUserId: 's',
      ancestorChain: [{ creatorUserId: 'g', royaltyRateBps: 5000 }],
    });
    expect(r.platformCents).toBe(0);
    expect(r.totalRoyaltyCents).toBe(0);
    expect(r.sellerCents).toBe(0);
  });

  it('uses cents (integer) — never produces fractional cents', () => {
    const r = splitRoyalty({
      grossPriceCents: 333,
      platformBps: 250,
      sellerUserId: 's',
      ancestorChain: [{ creatorUserId: 'g', royaltyRateBps: 333 }],
    });
    for (const p of r.payouts) {
      expect(Number.isInteger(p.amountCents)).toBe(true);
      expect(p.amountCents).toBeGreaterThanOrEqual(0);
    }
    expect(r.platformCents + r.totalRoyaltyCents + r.sellerCents).toBeLessThanOrEqual(333);
  });

  it('platform payout uses __platform__ recipient id', () => {
    const r = splitRoyalty({
      grossPriceCents: 1000,
      platformBps: 500,
      sellerUserId: 's',
      ancestorChain: [],
    });
    const platform = r.payouts.find((p) => p.reason === 'platform');
    expect(platform?.recipientUserId).toBe('__platform__');
  });
});
