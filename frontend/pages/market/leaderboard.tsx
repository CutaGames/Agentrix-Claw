import { useState } from 'react';
import { MarketingLayout } from '../../components/marketing/MarketingLayout';
import { buildSeo } from '../../lib/seo';
import { useLocalization } from '../../contexts/LocalizationContext';
import { Trophy, TrendingUp, Heart, Shuffle } from 'lucide-react';
import Link from 'next/link';

const BOARDS = ['gmv', 'likes', 'remixes'] as const;
type Board = typeof BOARDS[number];

const MOCK_LEADERS = Array.from({ length: 10 }, (_, i) => ({
  rank: i + 1,
  userId: `creator${i + 1}`,
  value: Math.floor(Math.random() * 5000) + 100,
}));

export default function LeaderboardPage() {
  const { t } = useLocalization();
  const [board, setBoard] = useState<Board>('gmv');

  const seo = buildSeo({
    title: t({ zh: '排行榜 · Agentrix Marketplace', en: 'Leaderboard · Agentrix Marketplace' }),
    description: t({ zh: 'GMV / 收藏 / Remix 三榜', en: 'GMV / Likes / Remix leaderboards' }),
    path: '/market/leaderboard',
  });

  const boardLabel = (b: Board) => {
    if (b === 'gmv') return t({ zh: '💰 GMV', en: '💰 GMV' });
    if (b === 'likes') return t({ zh: '❤️ 收藏', en: '❤️ Likes' });
    return t({ zh: '🔀 Remix', en: '🔀 Remix' });
  };

  return (
    <MarketingLayout seo={seo}>
      <section className="bg-agentrix-ink py-12">
        <div className="container mx-auto max-w-2xl px-6">
          <h1 className="text-3xl font-extrabold text-center">
            <Trophy size={28} className="inline text-agentrix-solar" /> {t({ zh: '创作者排行榜', en: 'Creator Leaderboard' })}
          </h1>

          <div className="mt-8 flex justify-center gap-2">
            {BOARDS.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBoard(b)}
                className={`rounded-full px-5 py-2 text-xs font-semibold transition-colors ${
                  board === b ? 'bg-agentrix-electric text-agentrix-ink' : 'bg-white/10 text-agentrix-fog hover:text-white'
                }`}
              >
                {boardLabel(b)}
              </button>
            ))}
          </div>

          <div className="mt-8 space-y-2">
            {MOCK_LEADERS.map((leader) => (
              <Link
                key={leader.rank}
                href={`/market/creator/${leader.userId}`}
                className="flex items-center justify-between rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft px-5 py-3 transition-colors hover:border-agentrix-electric/40"
              >
                <div className="flex items-center gap-4">
                  <span className={`text-lg font-extrabold ${leader.rank <= 3 ? 'text-agentrix-solar' : 'text-agentrix-mist'}`}>
                    #{leader.rank}
                  </span>
                  <span className="text-sm font-medium text-white">@{leader.userId}</span>
                </div>
                <span className="text-sm font-bold text-agentrix-electric">
                  {board === 'gmv' ? `$${leader.value}` : leader.value}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
