import { useState } from 'react';
import Link from 'next/link';
import { MarketingLayout } from '../../components/marketing/MarketingLayout';
import { buildSeo } from '../../lib/seo';
import { useLocalization } from '../../contexts/LocalizationContext';
import { TrendingUp, Sparkles, Trophy, Filter } from 'lucide-react';

const TABS = ['trending', 'new', 'leaderboard'] as const;
type Tab = typeof TABS[number];

const CLANS = ['All', 'A', 'B', 'C', 'D', 'E', 'F'] as const;

// Mock data — W2 real API: GET /api/v1/market/skins
const MOCK_ITEMS = Array.from({ length: 16 }, (_, i) => ({
  id: `skin-${i + 1}`,
  title: `Pet Skin #${i + 1}`,
  creator: `creator${(i % 5) + 1}`,
  clan: (['A', 'B', 'C', 'D', 'E', 'F'] as const)[i % 6],
  price: (Math.random() * 20 + 1).toFixed(2),
  likes: Math.floor(Math.random() * 300) + 5,
}));

export default function MarketplacePage() {
  const { t } = useLocalization();
  const [tab, setTab] = useState<Tab>('trending');
  const [clan, setClan] = useState<string>('All');

  const seo = buildSeo({
    title: t({ zh: 'Marketplace · 宠物皮肤集市 · Agentrix', en: 'Marketplace · Pet Skin Market · Agentrix' }),
    description: t({ zh: '浏览、购买、拍卖宠物皮肤。Remix 创作赚取分成。', en: 'Browse, buy, auction pet skins. Remix and earn revenue share.' }),
    path: '/market',
  });

  const filtered = clan === 'All' ? MOCK_ITEMS : MOCK_ITEMS.filter((s) => s.clan === clan);

  return (
    <MarketingLayout seo={seo}>
      <section className="bg-agentrix-ink pt-14 pb-6">
        <div className="container mx-auto px-6">
          <h1 className="text-3xl font-extrabold md:text-4xl">
            {t({ zh: '🎪 Marketplace', en: '🎪 Marketplace' })}
          </h1>
          <p className="mt-2 text-agentrix-fog">
            {t({ zh: '浏览 · 购买 · 拍卖 · Remix · 赚取分成', en: 'Browse · Buy · Auction · Remix · Earn' })}
          </p>

          {/* Tabs */}
          <div className="mt-6 flex gap-2">
            {TABS.map((t2) => (
              <button
                key={t2}
                type="button"
                onClick={() => setTab(t2)}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                  tab === t2 ? 'bg-agentrix-electric text-agentrix-ink' : 'bg-white/10 text-agentrix-fog hover:text-white'
                }`}
              >
                {t2 === 'trending' && <TrendingUp size={13} />}
                {t2 === 'new' && <Sparkles size={13} />}
                {t2 === 'leaderboard' && <Trophy size={13} />}
                {t2 === 'trending' ? t({ zh: '热门', en: 'Trending' }) : t2 === 'new' ? t({ zh: '最新', en: 'New' }) : t({ zh: '排行榜', en: 'Leaderboard' })}
              </button>
            ))}
          </div>

          {/* Clan filter */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Filter size={13} className="text-agentrix-mist" />
            {CLANS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setClan(c)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  clan === c ? 'bg-agentrix-purpleSoft text-white' : 'bg-white/5 text-agentrix-fog hover:text-white'
                }`}
              >
                {c === 'All' ? t({ zh: '全部', en: 'All' }) : `Clan ${c}`}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Grid */}
      <section className="bg-agentrix-ink pb-20">
        <div className="container mx-auto px-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((item) => (
              <Link
                key={item.id}
                href={`/market/skin/${item.id}`}
                className="group rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft overflow-hidden transition-all duration-300 hover:border-agentrix-electric/50 hover:-translate-y-1 hover:shadow-lg hover:shadow-agentrix-electric/10"
              >
                <div className="aspect-square relative overflow-hidden">
                  <div className={`absolute inset-0 bg-gradient-to-br ${
                    item.clan === 'A' ? 'from-purple-600/30 via-indigo-900/50 to-cyan-500/20' :
                    item.clan === 'B' ? 'from-emerald-600/30 via-teal-900/50 to-blue-500/20' :
                    item.clan === 'C' ? 'from-rose-600/30 via-pink-900/50 to-orange-500/20' :
                    item.clan === 'D' ? 'from-amber-600/30 via-yellow-900/50 to-lime-500/20' :
                    item.clan === 'E' ? 'from-sky-600/30 via-blue-900/50 to-violet-500/20' :
                    'from-fuchsia-600/30 via-purple-900/50 to-pink-500/20'
                  }`} />
                  <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.08)_0%,transparent_70%)]" />
                  <div className="absolute top-3 right-3 rounded-full bg-agentrix-solar/90 px-2 py-0.5 text-[10px] font-bold text-agentrix-ink">
                    ${item.price}
                  </div>
                  <div className="absolute bottom-3 left-3 rounded-full bg-black/50 backdrop-blur-sm px-2 py-0.5 text-[10px] text-white/80">
                    Clan {item.clan}
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="text-sm font-bold text-white group-hover:text-agentrix-electric transition-colors">{item.title}</h3>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-agentrix-mist">@{item.creator}</span>
                    <span className="text-xs text-agentrix-fog">♥ {item.likes}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
