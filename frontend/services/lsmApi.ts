/**
 * 杠杆滚球预测市场（LSM）Web API 客户端。
 * 对接后端 modules/leverage-sports-market（基址与 marketplaceApi 一致，结尾含 /api）。
 */
import axios, { AxiosInstance } from 'axios';

const getApiBaseUrl = (): string => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    const envUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!envUrl.endsWith('/api')) {
      return envUrl.endsWith('/') ? `${envUrl}api` : `${envUrl}/api`;
    }
    return envUrl;
  }
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const isLocal =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.');
    if (isLocal) return 'http://localhost:3001/api';
    return `${window.location.origin}/api`;
  }
  if (process.env.BACKEND_URL) {
    const backendUrl = process.env.BACKEND_URL;
    return backendUrl.endsWith('/api') ? backendUrl : `${backendUrl.replace(/\/$/, '')}/api`;
  }
  if (process.env.NODE_ENV === 'production') return 'https://api.agentrix.top/api';
  return 'http://localhost:3001/api';
};

const http: AxiosInstance = axios.create({
  baseURL: getApiBaseUrl(),
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
});

http.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token =
      localStorage.getItem('access_token') ||
      localStorage.getItem('authToken') ||
      sessionStorage.getItem('authToken');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

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
export interface LsmVaultView {
  id: string;
  kind: 'protocol' | 'user';
  name: string | null;
  leaderUserId?: string | null;
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

export interface LsmLeaderboardRow {
  rank: number;
  userId: string;
  value: number;
  bets: number;
}

function idemKey(): string {
  return `w-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const lsmApi = {
  async listLive(league?: string, limit = 50): Promise<LsmMarketView[]> {
    const { data } = await http.get('/lsm/markets/live', { params: { league, limit } });
    return data.items;
  },
  async listRecent(limit = 20): Promise<LsmMarketView[]> {
    const { data } = await http.get('/lsm/markets/recent', { params: { limit } });
    return data.items;
  },
  async getMarket(id: string): Promise<LsmMarketView> {
    const { data } = await http.get(`/lsm/markets/${id}`);
    return data;
  },
  async preview(input: {
    marketId: string;
    outcomeIdx: number;
    stake: number;
    leverage: number;
  }): Promise<LsmPreview> {
    const { data } = await http.post('/lsm/orders/preview', input);
    return data;
  },
  async place(input: {
    marketId: string;
    outcomeIdx: number;
    stake: number;
    leverage: number;
    quotedOdds: number;
  }): Promise<{ id: string; status: string; winPayout: number }> {
    const { data } = await http.post('/lsm/orders', { ...input, idemKey: idemKey() });
    return data;
  },
  async myOrders(limit = 50) {
    const { data } = await http.get('/lsm/me/orders', { params: { limit } });
    return data.items;
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
    const { data } = await http.post(`/lsm/orders/${orderId}/cashout`, {});
    return data;
  },
  async listVaults(kind?: 'protocol' | 'user'): Promise<LsmVaultView[]> {
    const { data } = await http.get('/lsm/vaults', { params: { kind } });
    return data.items;
  },
  async getVault(id: string): Promise<LsmVaultView> {
    const { data } = await http.get(`/lsm/vaults/${id}`);
    return data;
  },
  async deposit(vaultId: string, amount: number) {
    const { data } = await http.post('/lsm/vaults/deposit', { vaultId, amount });
    return data;
  },
  async redeem(vaultId: string, shares: number) {
    const { data } = await http.post('/lsm/vaults/redeem', { vaultId, shares });
    return data;
  },
  async myPositions(): Promise<LsmVaultPosition[]> {
    const { data } = await http.get('/lsm/vaults/me/positions');
    return data.items;
  },
  async createUserVault(input: {
    name: string;
    initialDeposit: number;
    minLeaderShareBps?: number;
    profitShareBps?: number;
    depositLockSecs?: number;
  }): Promise<LsmVaultView> {
    const { data } = await http.post('/lsm/vaults/user', input);
    return data;
  },
  async closeVault(vaultId: string): Promise<LsmVaultView> {
    const { data } = await http.post(`/lsm/vaults/${vaultId}/close`, {});
    return data;
  },
  async listSubscriptions(vaultId: string): Promise<LsmSubscription[]> {
    const { data } = await http.get(`/lsm/vaults/${vaultId}/subscriptions`);
    return data.items;
  },
  async upsertSubscription(input: {
    vaultId: string;
    scopeType: 'league' | 'market';
    scopeValue: string;
    capacity: number;
    feeBidBps: number;
    enabled?: boolean;
  }): Promise<LsmSubscription> {
    const { data } = await http.post('/lsm/vaults/subscriptions', input);
    return data;
  },
  async disclosure(): Promise<{
    zh: { title: string; points: string[] };
    en: { title: string; points: string[] };
  }> {
    const { data } = await http.get('/lsm/vaults/disclosure');
    return data;
  },
  async leaderboard(
    board: 'pnl' | 'volume' = 'pnl',
    period: 'all' | 'week' = 'all',
    limit = 20,
  ): Promise<{ board: string; period: string; items: LsmLeaderboardRow[] }> {
    const { data } = await http.get('/lsm/leaderboard', { params: { board, period, limit } });
    return data;
  },
};
