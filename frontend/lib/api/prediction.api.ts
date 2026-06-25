import { apiClient } from './client';

export type RoundStatus = 'open' | 'locked' | 'settled' | 'voided';
export type Outcome = 'up' | 'down' | 'tie' | 'unknown';
export type BetSide = 'up' | 'down';

export interface PredictionRound {
  id: string;
  asset: string;
  status: RoundStatus;
  openTime: string;
  lockTime: string;
  expiryTime: string;
  lockPrice: number | null;
  closePrice: number | null;
  outcome: Outcome;
  totalPool: number;
  upPool: number;
  downPool: number;
  upCount: number;
  downCount: number;
  upPct: number;
  downPct: number;
  upOdds: number | null;
  downOdds: number | null;
  feeRate: number;
  intervalSeconds: number;
}

export interface PredictionBet {
  id: string;
  roundId: string;
  side: BetSide;
  amount: number;
  status: 'placed' | 'won' | 'lost' | 'refunded';
  outcome: Outcome;
  payout: number;
  createdAt: string;
  settledAt: string | null;
  round: PredictionRound | null;
}

export interface PredictionBalance {
  balance: number;
  totalWagered: number;
  totalPayout: number;
  netPnl: number;
  totalBets: number;
  winsCount: number;
  lossesCount: number;
  currentStreak: number;
  bestStreak: number;
  winRate: number;
}

export interface LeaderboardRow {
  rank: number;
  userId: string;
  netPnl: number;
  totalBets: number;
  winsCount: number;
  lossesCount: number;
  bestStreak: number;
  winRate: number;
}

export interface PolymarketEvent {
  id: string;
  slug: string;
  title: string;
  description?: string;
  imageUrl?: string;
  endDate?: string;
  volume?: number;
  liquidity?: number;
  yesPrice?: number;
  noPrice?: number;
  url: string;
  category?: string;
}

export const predictionApi = {
  liveRounds: (asset = 'BTC', limit = 8) =>
    apiClient.get<{ items: PredictionRound[] }>(
      `/prediction-market/rounds/live?asset=${asset}&limit=${limit}`,
    ),
  recentRounds: (asset = 'BTC', limit = 10) =>
    apiClient.get<{ items: PredictionRound[] }>(
      `/prediction-market/rounds/recent?asset=${asset}&limit=${limit}`,
    ),
  getRound: (id: string) =>
    apiClient.get<PredictionRound>(`/prediction-market/rounds/${id}`),

  placeBet: (params: { roundId: string; side: BetSide; amount: number }) =>
    apiClient.post<{ bet: PredictionBet; balance: PredictionBalance; round: PredictionRound }>(
      '/prediction-market/bets',
      params,
    ),

  myBalance: () => apiClient.get<PredictionBalance>('/prediction-market/me/balance'),
  myBets: (limit = 30) =>
    apiClient.get<{ items: PredictionBet[] }>(`/prediction-market/me/bets?limit=${limit}`),
  leaderboard: (limit = 10) =>
    apiClient.get<{ items: LeaderboardRow[] }>(
      `/prediction-market/leaderboard?limit=${limit}`,
    ),

  polymarketTrending: (limit = 12) =>
    apiClient.get<{ items: PolymarketEvent[] }>(
      `/prediction-market/polymarket/trending?limit=${limit}`,
    ),
};
