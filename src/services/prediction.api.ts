// Prediction-market API client (mobile)
import { apiFetch } from './api';

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
  round?: PredictionRound | null;
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
  liveRounds: (asset = 'BTC', limit = 4) =>
    apiFetch<{ items: PredictionRound[] }>(
      `/prediction-market/rounds/live?asset=${asset}&limit=${limit}`,
    ),
  recentRounds: (asset = 'BTC', limit = 6) =>
    apiFetch<{ items: PredictionRound[] }>(
      `/prediction-market/rounds/recent?asset=${asset}&limit=${limit}`,
    ),
  placeBet: (body: { roundId: string; side: BetSide; amount: number }) =>
    apiFetch<{ bet: PredictionBet; balance: any; round: PredictionRound }>(
      `/prediction-market/bets`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  myBalance: () => apiFetch<PredictionBalance>(`/prediction-market/me/balance`),
  myBets: (limit = 20) =>
    apiFetch<{ items: PredictionBet[] }>(`/prediction-market/me/bets?limit=${limit}`),
  polymarketTrending: (limit = 8) =>
    apiFetch<{ items: PolymarketEvent[] }>(
      `/prediction-market/polymarket/trending?limit=${limit}`,
    ),
};
