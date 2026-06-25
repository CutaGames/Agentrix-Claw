/**
 * /market/leaderboard — creator leaderboard (Sprint W-1 P1).
 *
 * Pulls from the public endpoint /api/v1/marketplace/leaderboard with
 * three boards (gmv / listings / active). Falls back to friendly empty
 * state when no data yet.
 */
import { useCallback, useEffect, useState } from 'react';
import { MarketingLayout } from '../../components/marketing/MarketingLayout';
import { buildSeo } from '../../lib/seo';
import { useLocalization } from '../../contexts/LocalizationContext';
import { Trophy, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { API_BASE_URL } from '../../lib/api/client';

const BOARDS = ['gmv', 'listings', 'active'] as const;
type Board = typeof BOARDS[number];

interface Leader {
  rank: number;
  userId: string;
  value: number;
}

interface LeaderboardResp {
  board: Board;
  items: Leader[];
}

export default function LeaderboardPage() {
  const { t } = useLocalization();
  const [board, setBoard] = useState<Board>('gmv');
  const [items, setItems] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBoard = useCallback(async (b: Board) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE_URL}/v1/marketplace/leaderboard?board=${b}&limit=20`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as LeaderboardResp;
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (e) {
      setError((e as Error).message || 'Failed to load');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBoard(board);
  }, [board, fetchBoard]);

  const seo = buildSeo({
    title: t({ zh: '排行榜 · Agentrix Marketplace', en: 'Leaderboard · Agentrix Marketplace' }),
    description: t({
      zh: 'Agentrix 创作者排行榜：销售总额 / 上架数量 / 活跃挂牌',
      en: 'Agentrix creator leaderboards: GMV, listings, active',
    }),
    path: '/market/leaderboard',
  });

  const boardLabel = (b: Board) => {
    if (b === 'gmv') return t({ zh: '💰 销售额', en: '💰 GMV' });
    if (b === 'listings') return t({ zh: '📦 累计上架', en: '📦 Listings' });
    return t({ zh: '🟢 活跃中', en: '🟢 Active' });
  };

  const formatValue = (b: Board, v: number) => {
    if (b === 'gmv') return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    return v.toLocaleString();
  };

  return (
    <MarketingLayout seo={seo}>
      <section className="bg-agentrix-ink py-12">
        <div className="container mx-auto max-w-2xl px-6">
          <div className="text-center mb-2">
            <Trophy size={32} className="inline text-agentrix-solar" />
          </div>
          <h1 className="text-3xl font-extrabold text-center">
            {t({ zh: '创作者排行榜', en: 'Creator Leaderboard' })}
          </h1>
          <p className="mt-2 text-center text-sm text-agentrix-mist">
            {t({
              zh: '过去 30 天表现最好的创作者。每周刷新。',
              en: 'Top creators in the last 30 days. Refreshed weekly.',
            })}
          </p>

          <div className="mt-8 flex justify-center gap-2 flex-wrap">
            {BOARDS.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBoard(b)}
                className={`rounded-full px-5 py-2 text-xs font-semibold transition-colors ${
                  board === b
                    ? 'bg-agentrix-electric text-agentrix-ink'
                    : 'bg-white/10 text-agentrix-fog hover:text-white'
                }`}
              >
                {boardLabel(b)}
              </button>
            ))}
          </div>

          <div className="mt-8">
            {loading && (
              <div className="flex justify-center py-12">
                <RefreshCw className="w-6 h-6 text-agentrix-electric animate-spin" />
              </div>
            )}

            {!loading && error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-300 text-center">
                {t({ zh: '加载失败', en: 'Failed to load' })}: {error}
              </div>
            )}

            {!loading && !error && items.length === 0 && (
              <div className="rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft px-5 py-12 text-center">
                <div className="text-5xl mb-3">🏆</div>
                <div className="text-sm text-agentrix-fog">
                  {t({
                    zh: '暂无数据。Marketplace 刚启动，第一波创作者快要登榜了！',
                    en: 'No data yet. Marketplace is just opening — be the first to land here!',
                  })}
                </div>
                <Link
                  href="/market/sell"
                  className="mt-6 inline-block rounded-full bg-agentrix-electric px-6 py-2 text-xs font-bold text-agentrix-ink"
                >
                  {t({ zh: '上架我的皮肤 →', en: 'List My Skin →' })}
                </Link>
              </div>
            )}

            {!loading && !error && items.length > 0 && (
              <div className="space-y-2">
                {items.map((leader) => (
                  <Link
                    key={leader.rank}
                    href={`/market/creator/${leader.userId}`}
                    className="flex items-center justify-between rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft px-5 py-3 transition-colors hover:border-agentrix-electric/40"
                  >
                    <div className="flex items-center gap-4">
                      <span
                        className={`text-lg font-extrabold w-8 ${
                          leader.rank <= 3 ? 'text-agentrix-solar' : 'text-agentrix-mist'
                        }`}
                      >
                        #{leader.rank}
                      </span>
                      <span className="text-sm font-medium text-white">
                        @{leader.userId.slice(0, 8)}
                      </span>
                    </div>
                    <span className="text-sm font-bold text-agentrix-electric">
                      {formatValue(board, leader.value)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
