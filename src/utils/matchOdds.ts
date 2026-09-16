/**
 * Match odds utilities — builds a structured, fully-legible 1X2 odds list
 * for the World Cup / sports share poster.
 *
 * The poster previously joined all outcomes into one cramped string that got
 * truncated (dropping the 平局/Draw outcome). This helper returns one entry per
 * outcome, ordered as the conventional 1X2 column layout — Home, Draw, Away —
 * so the dedicated odds panel in ShareCardView can render each one in full.
 */

/** A single fair-odds outcome as returned by the LSM market view. */
export interface MatchOddsOutcome {
  /** 0 = home, 1 = away, 2 = draw (LSM convention). */
  outcomeIdx: number;
  fairOdds: number;
}

/** Minimal market shape needed to build the odds list (structurally typed). */
export interface MatchOddsMarketLike {
  homeTeam: string;
  awayTeam: string;
  odds: MatchOddsOutcome[];
}

/** One ready-to-render odds cell for the poster's dedicated odds panel. */
export interface MatchOddsEntry {
  label: string;
  value: string;
  impliedPct?: string;
  highlight?: boolean;
}

/**
 * Build a structured odds list ordered as conventional 1X2 columns:
 * Home (outcomeIdx 0) → Draw (outcomeIdx 2) → Away (outcomeIdx 1).
 *
 * Only outcomes actually present in `market.odds` are included, so 2-way
 * markets (no draw) simply render Home + Away. Each entry carries the label,
 * the fair odds formatted to 2 decimals, and the implied probability (%).
 *
 * @param market - Market with team names + fair-odds outcomes.
 * @param zh - Whether to use Chinese labels (affects the Draw label only).
 * @returns Ordered list of legible odds entries.
 */
export function buildMatchOddsList(
  market: MatchOddsMarketLike,
  zh: boolean,
): MatchOddsEntry[] {
  const labels: Record<number, string> = {
    0: market.homeTeam,
    1: market.awayTeam,
    2: zh ? '平局' : 'Draw',
  };
  // Conventional 1X2 display order: Home, Draw, Away.
  const displayOrder = [0, 2, 1];
  const byIdx = new Map<number, MatchOddsOutcome>();
  for (const o of market.odds ?? []) {
    if (o && Number.isFinite(o.fairOdds) && o.fairOdds > 0) byIdx.set(o.outcomeIdx, o);
  }

  const entries: MatchOddsEntry[] = [];
  for (const idx of displayOrder) {
    const o = byIdx.get(idx);
    if (!o) continue;
    entries.push({
      label: labels[idx] ?? `#${idx}`,
      value: o.fairOdds.toFixed(2),
      impliedPct: `${Math.round(100 / o.fairOdds)}%`,
    });
  }
  return entries;
}
