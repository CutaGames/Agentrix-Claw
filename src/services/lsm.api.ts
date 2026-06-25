// 赛事预测市场 API 服务（后端模块 leverage-sports-market / lsm，前端展示「赛事预测」）
import { apiFetch } from './api';

export interface LsmOddsOutcome {
  outcomeIdx: number;
  fairOdds: number;
}

export interface LsmMarketView {
  id: string;
  externalMarketId: string;
  sport: string;
  league: string | null;
  homeTeam: string;
  awayTeam: string;
  outcomeCount: number;
  status: 'pre' | 'live' | 'suspended' | 'final' | 'voided';
  kickoffAt: number | null;
  lastOddsAt: number | null;
  tradable: boolean;
  stale: boolean;
  winningOutcomeIdx: number | null;
  homeScore?: number | null;
  awayScore?: number | null;
  odds: LsmOddsOutcome[];
}

export interface LsmPreview {
  marketId: string;
  outcomeIdx: number;
  stake: number;
  leverage: number;
  fairOdds: number;
  tradableOdds: number;
  notional: number;
  maxProfit: number;
  maxLoss: number;
  winPayout: number;
  tradable: boolean;
  slippageBps: number;
}

export interface LsmOrder {
  id: string;
  marketId: string;
  outcomeIdx: number;
  stake: number;
  leverage: number;
  entryOdds: number;
  notional: number;
  maxProfit: number;
  status: 'open' | 'won' | 'lost' | 'refunded' | 'cashed_out';
  payout: number;
  closePnl: number;
  /** OPEN 单当前可兑现值（mark-to-market，整数 AXP）；不可兑现时为 null */
  cashoutValue: number | null;
  createdAt: number;
  settledAt: number | null;
}

export interface LsmVaultView {
  id: string;
  kind: 'protocol' | 'user';
  name: string | null;
  leaderUserId: string | null;
  status: 'active' | 'closing' | 'closed';
  bankroll: number;
  reserved: number;
  equity: number;
  totalShares: number;
  nav: number;
  utilizationBps: number;
  minLeaderShareBps: number;
  profitShareBps: number;
  depositLockSecs: number;
}

export interface LsmVaultPosition {
  vaultId: string;
  shares: number;
  costBasis: number;
  isLeader: boolean;
  lockedUntil: number | null;
}

export interface LsmSubscription {
  id: string;
  vaultId: string;
  scopeType: 'league' | 'market';
  scopeValue: string;
  capacity: number;
  feeBidBps: number;
  enabled: boolean;
}

export interface LsmDisclosure {
  zh: { title: string; points: string[] };
  en: { title: string; points: string[] };
  minKyc: { bet: string; lp: string; leader: string };
}

export interface LsmLeaderboardRow {
  rank: number;
  userId: string;
  value: number;
  bets: number;
}

/** 简单 uuid（幂等键，防重复提交） */
function idemKey(): string {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const lsmApi = {
  // ── 盘口（只读） ──
  async listLive(league?: string, limit = 50): Promise<LsmMarketView[]> {
    const qs = new URLSearchParams();
    if (league) qs.set('league', league);
    qs.set('limit', String(limit));
    const r = await apiFetch<{ items: LsmMarketView[] }>(`/lsm/markets/live?${qs}`);
    return r.items;
  },
  async listRecent(limit = 20): Promise<LsmMarketView[]> {
    const r = await apiFetch<{ items: LsmMarketView[] }>(`/lsm/markets/recent?limit=${limit}`);
    return r.items;
  },
  async getMarket(id: string): Promise<LsmMarketView> {
    return apiFetch<LsmMarketView>(`/lsm/markets/${id}`);
  },

  // ── 下单 ──
  async preview(input: {
    marketId: string;
    outcomeIdx: number;
    stake: number;
    leverage: number;
  }): Promise<LsmPreview> {
    return apiFetch<LsmPreview>(`/lsm/orders/preview`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  async place(input: {
    marketId: string;
    outcomeIdx: number;
    stake: number;
    leverage: number;
    quotedOdds: number;
  }): Promise<{ id: string; status: string; winPayout: number }> {
    return apiFetch(`/lsm/orders`, {
      method: 'POST',
      body: JSON.stringify({ ...input, idemKey: idemKey() }),
    });
  },
  async myOrders(limit = 50): Promise<LsmOrder[]> {
    const r = await apiFetch<{ items: LsmOrder[] }>(`/lsm/me/orders?limit=${limit}`);
    return r.items;
  },
  async oddsHistory(
    marketId: string,
    range: 'all' | '30m' | '10m' | '5m' = 'all',
  ): Promise<{
    marketId: string;
    range: string;
    series: Array<{ outcomeIdx: number; points: Array<{ ts: number; odds: number }> }>;
  }> {
    return apiFetch(`/lsm/markets/${marketId}/odds-history?range=${range}`);
  },
  async cashOut(
    orderId: string,
  ): Promise<{
    id: string;
    status: string;
    payout: number;
    closePnl: number;
    cashoutValue: number;
    settledAt: number | null;
  }> {
    return apiFetch(`/lsm/orders/${orderId}/cashout`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  // ── 金库（LP） ──
  async listVaults(kind?: 'protocol' | 'user'): Promise<LsmVaultView[]> {
    const qs = kind ? `?kind=${kind}` : '';
    const r = await apiFetch<{ items: LsmVaultView[] }>(`/lsm/vaults${qs}`);
    return r.items;
  },
  async getVault(id: string): Promise<LsmVaultView> {
    return apiFetch<LsmVaultView>(`/lsm/vaults/${id}`);
  },
  async deposit(vaultId: string, amount: number): Promise<{ sharesMinted: number; nav: number }> {
    return apiFetch(`/lsm/vaults/deposit`, {
      method: 'POST',
      body: JSON.stringify({ vaultId, amount }),
    });
  },
  async redeem(vaultId: string, shares: number): Promise<{ payout: number; sharesBurned: number; nav: number }> {
    return apiFetch(`/lsm/vaults/redeem`, {
      method: 'POST',
      body: JSON.stringify({ vaultId, shares }),
    });
  },
  async myPositions(): Promise<LsmVaultPosition[]> {
    const r = await apiFetch<{ items: LsmVaultPosition[] }>(`/lsm/vaults/me/positions`);
    return r.items;
  },
  async createUserVault(input: {
    name: string;
    initialDeposit: number;
    minLeaderShareBps?: number;
    profitShareBps?: number;
    depositLockSecs?: number;
  }): Promise<LsmVaultView> {
    return apiFetch<LsmVaultView>(`/lsm/vaults/user`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  async closeVault(vaultId: string): Promise<LsmVaultView> {
    return apiFetch<LsmVaultView>(`/lsm/vaults/${vaultId}/close`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },
  async listSubscriptions(vaultId: string): Promise<LsmSubscription[]> {
    const r = await apiFetch<{ items: LsmSubscription[] }>(`/lsm/vaults/${vaultId}/subscriptions`);
    return r.items;
  },
  async upsertSubscription(input: {
    vaultId: string;
    scopeType: 'league' | 'market';
    scopeValue: string;
    capacity: number;
    feeBidBps: number;
    enabled?: boolean;
  }): Promise<LsmSubscription> {
    return apiFetch<LsmSubscription>(`/lsm/vaults/subscriptions`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  async disclosure(): Promise<LsmDisclosure> {
    return apiFetch<LsmDisclosure>(`/lsm/vaults/disclosure`);
  },
  async leaderboard(
    board: 'pnl' | 'volume' = 'pnl',
    period: 'all' | 'week' = 'all',
    limit = 20,
  ): Promise<{ board: string; period: string; items: LsmLeaderboardRow[] }> {
    const qs = new URLSearchParams({ board, period, limit: String(limit) });
    return apiFetch(`/lsm/leaderboard?${qs}`);
  },
};
