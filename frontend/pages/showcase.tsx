import { useState } from 'react';
import Link from 'next/link';
import { MarketingLayout } from '../components/marketing/MarketingLayout';
import { buildSeo } from '../lib/seo';
import { useLocalization } from '../contexts/LocalizationContext';
import { Heart, Eye, Shuffle, Filter } from 'lucide-react';

// Mock data for W1 — will be replaced by GET /api/v1/market/skins?sort=featured in W2
const MOCK_SKINS = Array.from({ length: 12 }, (_, i) => ({
  id: `skin-${i + 1}`,
  title: `Cyber Pet #${i + 1}`,
  creator: `@creator${i + 1}`,
  clan: (['A', 'B', 'C', 'D', 'E', 'F'] as const)[i % 6],
  likes: Math.floor(Math.random() * 500) + 10,
  views: Math.floor(Math.random() * 2000) + 100,
  remixes: Math.floor(Math.random() * 50),
  thumbnail: `/images/placeholder-skin-${(i % 4) + 1}.png`,
}));

const CLANS = ['All', 'A', 'B', 'C', 'D', 'E', 'F'] as const;

export default function ShowcasePage() {
  const { t } = useLocalization();
  const [selectedClan, setSelectedClan] = useState<string>('All');

  const seo = buildSeo({
    title: t({ zh: 'Showcase · 每日精选皮肤 · Agentrix', en: 'Showcase · Daily Featured Skins · Agentrix' }),
    description: t({
      zh: '浏览 Agentrix 社区创作的精选宠物皮肤，发现灵感，Remix 创作。',
      en: 'Browse featured pet skins created by the Agentrix community. Find inspiration, remix and create.',
    }),
    path: '/showcase',
  });

  const filtered = selectedClan === 'All'
    ? MOCK_SKINS
    : MOCK_SKINS.filter((s) => s.clan === selectedClan);

  return (
    <MarketingLayout seo={seo}>
      <section className="bg-agentrix-ink pt-16 pb-8">
        <div className="container mx-auto px-6">
          <div className="text-center">
            <h1 className="text-4xl font-extrabold md:text-5xl">
              {t({ zh: '🎨 今日精选', en: '🎨 Today\'s Picks' })}
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-agentrix-fog">
              {t({
                zh: '社区创作者每日上新的宠物皮肤精选。点击任意作品查看详情、Remix 或购买。',
                en: 'Daily curated pet skins from community creators. Click any piece to view details, remix or purchase.',
              })}
            </p>
          </div>

          {/* Clan filter */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
            <Filter size={14} className="text-agentrix-mist" />
            {CLANS.map((clan) => (
              <button
                key={clan}
                type="button"
                onClick={() => setSelectedClan(clan)}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                  selectedClan === clan
                    ? 'bg-agentrix-electric text-agentrix-ink'
                    : 'bg-white/10 text-agentrix-fog hover:text-white'
                }`}
              >
                {clan === 'All' ? t({ zh: '全部', en: 'All' }) : `Clan ${clan}`}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Masonry grid */}
      <section className="bg-agentrix-ink pb-20">
        <div className="container mx-auto px-6">
          <div className="columns-1 gap-5 sm:columns-2 lg:columns-3 xl:columns-4">
            {filtered.map((skin) => (
              <Link
                key={skin.id}
                href={`/market/skin/${skin.id}`}
                className="group mb-5 block break-inside-avoid rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft overflow-hidden transition-all hover:border-agentrix-electric/50 hover:shadow-lg hover:shadow-agentrix-electric/10"
              >
                {/* Thumbnail placeholder */}
                <div className="aspect-square bg-gradient-to-br from-agentrix-purple/20 to-agentrix-electric/20 flex items-center justify-center">
                  <span className="text-4xl opacity-50">🐾</span>
                </div>
                <div className="p-4">
                  <h3 className="text-sm font-bold text-white group-hover:text-agentrix-electric transition-colors">
                    {skin.title}
                  </h3>
                  <p className="mt-1 text-xs text-agentrix-mist">{skin.creator} · Clan {skin.clan}</p>
                  <div className="mt-3 flex items-center gap-4 text-xs text-agentrix-fog">
                    <span className="inline-flex items-center gap-1"><Heart size={12} /> {skin.likes}</span>
                    <span className="inline-flex items-center gap-1"><Eye size={12} /> {skin.views}</span>
                    <span className="inline-flex items-center gap-1"><Shuffle size={12} /> {skin.remixes}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {filtered.length === 0 && (
            <p className="py-20 text-center text-agentrix-fog">
              {t({ zh: '该族群暂无精选作品', en: 'No featured works for this clan yet' })}
            </p>
          )}
        </div>
      </section>
    </MarketingLayout>
  );
}
