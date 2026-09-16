import { lsmToolResultToCard } from '../lsmToolCard';

describe('lsmToolResultToCard', () => {
  it('maps lsm_market_list (match string + outcomes.decimalOdds) → markets view', () => {
    const result = {
      cardType: 'lsm_market_list',
      total: 1,
      markets: [
        {
          marketId: 'm1',
          match: 'Brazil vs Spain',
          league: 'World Cup',
          status: 'live',
          tradable: true,
          score: '1:0',
          outcomes: [
            { outcomeIdx: 0, label: 'Brazil', decimalOdds: 2.0, impliedPct: 50 },
            { outcomeIdx: 1, label: 'Spain', decimalOdds: 4.0 },
          ],
        },
      ],
    };
    const card = lsmToolResultToCard('lsm_search_markets', result) as any;
    expect(card.kind).toBe('markets');
    const m = card.markets[0];
    expect(m.id).toBe('m1');
    expect(m.homeTeam).toBe('Brazil');
    expect(m.awayTeam).toBe('Spain');
    expect(m.homeScore).toBe(1);
    expect(m.odds[0]).toEqual({ outcomeIdx: 0, fairOdds: 2.0 });
  });

  it('unwraps result.data with cardType', () => {
    const card = lsmToolResultToCard('lsm_preview_order', {
      data: { cardType: 'lsm_preview', tradableOdds: 1.95, notional: 200, maxProfit: 190, maxLoss: 100, winPayout: 290, asset: 'USDC' },
    }) as any;
    expect(card.kind).toBe('preview');
    expect(card.preview.tradableOdds).toBe(1.95);
    expect(card.asset).toBe('USDC');
  });

  it('parses JSON string result', () => {
    const card = lsmToolResultToCard('lsm_place_order', JSON.stringify({
      cardType: 'lsm_order_placed', id: 'o1', status: 'open', asset: 'USDC', stake: 100, leverage: 5, entryOdds: 1.79, winPayout: 495,
    })) as any;
    expect(card.kind).toBe('order_placed');
    expect(card.order.id).toBe('o1');
    expect(card.order.winPayout).toBe(495);
  });

  it('maps positions + cashed_out + spending_authorized', () => {
    const pos = lsmToolResultToCard('lsm_my_positions', {
      cardType: 'lsm_positions', total: 1,
      positions: [{ id: 'o1', asset: 'USDC', stake: 100, leverage: 5, entryOdds: 1.8, status: 'open', payout: 0, closePnl: 0, cashoutValue: 120 }],
    }) as any;
    expect(pos.kind).toBe('positions');
    expect(pos.positions[0].cashoutValue).toBe(120);

    const co = lsmToolResultToCard('lsm_cashout', { cardType: 'lsm_cashed_out', id: 'o1', status: 'cashed_out', asset: 'USDC', payout: 100, closePnl: 0 }) as any;
    expect(co.kind).toBe('cashed_out');
    expect(co.order.payout).toBe(100);

    const auth = lsmToolResultToCard('lsm_authorize_spending', { cardType: 'lsm_spending_authorized', dailyLimitUsdc: 100 }) as any;
    expect(auth.kind).toBe('spending_authorized');
    expect(auth.mandate.dailyLimitUsdc).toBe(100);
  });

  it('returns null for unknown / empty', () => {
    expect(lsmToolResultToCard('lsm_search_markets', { cardType: 'lsm_market_list', markets: [] })).toBeNull();
    expect(lsmToolResultToCard('other_tool', { foo: 1 })).toBeNull();
    expect(lsmToolResultToCard('lsm_x', null)).toBeNull();
  });
});
