/**
 * Unit tests for buildMatchOddsList.
 *
 * Regression guard for the share-poster bug where the joined odds string
 * truncated and dropped the 平局/Draw outcome. The structured list must:
 *  - order outcomes as conventional 1X2: Home (0), Draw (2), Away (1)
 *  - include every outcome present (so Draw is never lost)
 *  - format value to 2 decimals and compute implied probability
 *  - gracefully handle 2-way markets (no draw) and bad odds
 */
import { buildMatchOddsList } from '../matchOdds';

describe('buildMatchOddsList', () => {
  const base = { homeTeam: 'Brazil', awayTeam: 'Japan' };

  it('orders 3-way market as Home, Draw, Away (1X2) regardless of input order', () => {
    const market = {
      ...base,
      odds: [
        { outcomeIdx: 1, fairOdds: 5.6 }, // away
        { outcomeIdx: 0, fairOdds: 1.75 }, // home
        { outcomeIdx: 2, fairOdds: 3.4 }, // draw
      ],
    };
    const list = buildMatchOddsList(market, true);
    expect(list.map((e) => e.label)).toEqual(['Brazil', '平局', 'Japan']);
    expect(list.map((e) => e.value)).toEqual(['1.75', '3.40', '5.60']);
  });

  it('includes the draw outcome (the bug regression case)', () => {
    const market = {
      ...base,
      odds: [
        { outcomeIdx: 0, fairOdds: 1.75 },
        { outcomeIdx: 1, fairOdds: 5.6 },
        { outcomeIdx: 2, fairOdds: 3.4 },
      ],
    };
    const list = buildMatchOddsList(market, true);
    expect(list.some((e) => e.label === '平局')).toBe(true);
    expect(list).toHaveLength(3);
  });

  it('uses English "Draw" label when zh is false', () => {
    const market = {
      ...base,
      odds: [
        { outcomeIdx: 0, fairOdds: 2.0 },
        { outcomeIdx: 2, fairOdds: 3.0 },
        { outcomeIdx: 1, fairOdds: 4.0 },
      ],
    };
    const list = buildMatchOddsList(market, false);
    expect(list.map((e) => e.label)).toEqual(['Brazil', 'Draw', 'Japan']);
  });

  it('computes implied probability rounded to nearest percent', () => {
    const market = { ...base, odds: [{ outcomeIdx: 0, fairOdds: 2.0 }] };
    const [home] = buildMatchOddsList(market, false);
    expect(home.impliedPct).toBe('50%'); // 100 / 2.0
  });

  it('handles 2-way markets (no draw) as Home then Away only', () => {
    const market = {
      ...base,
      odds: [
        { outcomeIdx: 1, fairOdds: 2.5 },
        { outcomeIdx: 0, fairOdds: 1.5 },
      ],
    };
    const list = buildMatchOddsList(market, true);
    expect(list.map((e) => e.label)).toEqual(['Brazil', 'Japan']);
    expect(list).toHaveLength(2);
  });

  it('filters out invalid or non-positive odds', () => {
    const market = {
      ...base,
      odds: [
        { outcomeIdx: 0, fairOdds: 1.75 },
        { outcomeIdx: 2, fairOdds: 0 },
        { outcomeIdx: 1, fairOdds: Number.NaN },
      ],
    };
    const list = buildMatchOddsList(market, true);
    expect(list.map((e) => e.label)).toEqual(['Brazil']);
  });

  it('returns empty list when odds missing', () => {
    expect(buildMatchOddsList({ ...base, odds: [] }, true)).toEqual([]);
  });
});
