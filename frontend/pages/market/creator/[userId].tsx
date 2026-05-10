import { useRouter } from 'next/router';
import { MarketingLayout } from '../../../components/marketing/MarketingLayout';
import { buildSeo } from '../../../lib/seo';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { Star, TrendingUp, Palette } from 'lucide-react';

export default function CreatorProfilePage() {
  const router = useRouter();
  const { userId } = router.query;
  const { t } = useLocalization();

  const seo = buildSeo({
    title: t({ zh: `创作者 @${userId} · Agentrix`, en: `Creator @${userId} · Agentrix` }),
    description: t({ zh: '查看创作者作品、GMV、粉丝', en: 'View creator works, GMV, followers' }),
    path: `/market/creator/${userId}`,
  });

  return (
    <MarketingLayout seo={seo}>
      <section className="bg-agentrix-ink py-12">
        <div className="container mx-auto px-6 max-w-4xl">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-agentrix-purple to-agentrix-electric flex items-center justify-center text-2xl font-bold text-white">
              {String(userId).charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-extrabold">@{userId}</h1>
              <p className="text-sm text-agentrix-fog">{t({ zh: 'Elite 创作者 · 加入 2026-03', en: 'Elite Creator · Joined 2026-03' })}</p>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft p-4 text-center">
              <Palette size={20} className="mx-auto text-agentrix-electric" />
              <p className="mt-2 text-2xl font-bold text-white">24</p>
              <p className="text-xs text-agentrix-mist">{t({ zh: '作品', en: 'Works' })}</p>
            </div>
            <div className="rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft p-4 text-center">
              <TrendingUp size={20} className="mx-auto text-agentrix-solar" />
              <p className="mt-2 text-2xl font-bold text-white">$1,240</p>
              <p className="text-xs text-agentrix-mist">{t({ zh: '总 GMV', en: 'Total GMV' })}</p>
            </div>
            <div className="rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft p-4 text-center">
              <Star size={20} className="mx-auto text-agentrix-purpleSoft" />
              <p className="mt-2 text-2xl font-bold text-white">342</p>
              <p className="text-xs text-agentrix-mist">{t({ zh: '关注者', en: 'Followers' })}</p>
            </div>
          </div>

          <h2 className="mt-10 text-lg font-bold">{t({ zh: '作品列表', en: 'Works' })}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft overflow-hidden">
                <div className="aspect-square bg-gradient-to-br from-agentrix-purple/15 to-agentrix-electric/10 flex items-center justify-center">
                  <span className="text-3xl opacity-40">🐾</span>
                </div>
                <div className="p-3">
                  <p className="text-sm font-bold text-white">Skin #{i + 1}</p>
                  <p className="text-xs text-agentrix-solar">${(Math.random() * 15 + 2).toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
