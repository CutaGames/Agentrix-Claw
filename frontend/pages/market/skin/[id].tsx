import { useRouter } from 'next/router';
import Link from 'next/link';
import { MarketingLayout } from '../../../components/marketing/MarketingLayout';
import { buildSeo } from '../../../lib/seo';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { Heart, Eye, Shuffle, ShoppingCart, Gavel } from 'lucide-react';

export default function SkinDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const { t } = useLocalization();

  const seo = buildSeo({
    title: t({ zh: `皮肤详情 · Agentrix Marketplace`, en: `Skin Detail · Agentrix Marketplace` }),
    description: t({ zh: '查看皮肤 3D 预览、Remix 树、历史成交', en: 'View skin 3D preview, Remix tree, transaction history' }),
    path: `/market/skin/${id}`,
  });

  return (
    <MarketingLayout seo={seo}>
      <section className="bg-agentrix-ink py-12">
        <div className="container mx-auto px-6">
          <div className="grid gap-8 lg:grid-cols-2">
            {/* 3D Preview — generative gradient art */}
            <div className="aspect-square rounded-2xl border border-agentrix-inkLine overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-600/40 via-indigo-900/60 to-cyan-500/30" />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(34,211,255,0.15)_0%,transparent_50%)]" />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_80%,rgba(124,58,237,0.2)_0%,transparent_50%)]" />
              <div className="absolute bottom-6 left-6 right-6 text-center">
                <p className="text-xs text-white/60 bg-black/30 backdrop-blur-sm rounded-lg px-3 py-2">
                  {t({ zh: '3D / VRM 实时预览（W3 集成 three-vrm）', en: '3D / VRM live preview (W3 three-vrm integration)' })}
                </p>
              </div>
            </div>

            {/* Details */}
            <div>
              <h1 className="text-3xl font-extrabold">Skin #{id}</h1>
              <p className="mt-2 text-sm text-agentrix-fog">
                {t({ zh: '创作者：@creator1 · Clan A', en: 'Creator: @creator1 · Clan A' })}
              </p>

              <div className="mt-6 flex gap-6 text-sm text-agentrix-fog">
                <span className="inline-flex items-center gap-1"><Heart size={14} /> 128</span>
                <span className="inline-flex items-center gap-1"><Eye size={14} /> 1,024</span>
                <span className="inline-flex items-center gap-1"><Shuffle size={14} /> 12 Remixes</span>
              </div>

              {/* Price & actions */}
              <div className="mt-8 rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft p-6">
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-extrabold text-agentrix-solar">$9.99</span>
                  <span className="text-sm text-agentrix-mist">{t({ zh: '一口价', en: 'Fixed price' })}</span>
                </div>
                <div className="mt-4 flex gap-3">
                  <button className="inline-flex items-center gap-2 rounded-full bg-agentrix-solar px-6 py-2.5 text-sm font-bold text-agentrix-ink hover:opacity-90">
                    <ShoppingCart size={16} />
                    {t({ zh: '立即购买', en: 'Buy now' })}
                  </button>
                  <button className="inline-flex items-center gap-2 rounded-full bg-white/10 px-6 py-2.5 text-sm font-bold text-white hover:bg-white/15">
                    <Gavel size={16} />
                    {t({ zh: '出价', en: 'Place bid' })}
                  </button>
                </div>
                <p className="mt-3 text-xs text-agentrix-mist">
                  {t({ zh: '支持 AXP 抵扣（≤20%）', en: 'AXP redeem supported (≤20%)' })}
                </p>
              </div>

              {/* Remix tree placeholder */}
              <div className="mt-6">
                <h3 className="text-sm font-bold text-white">{t({ zh: 'Remix 树', en: 'Remix Tree' })}</h3>
                <div className="mt-3 rounded-lg border border-agentrix-inkLine bg-white/5 p-4 text-center text-xs text-agentrix-mist">
                  {t({ zh: 'Remix 树可视化（W3 上线）', en: 'Remix tree visualization (W3)' })}
                </div>
              </div>

              {/* History placeholder */}
              <div className="mt-6">
                <h3 className="text-sm font-bold text-white">{t({ zh: '历史成交', en: 'Transaction History' })}</h3>
                <div className="mt-3 rounded-lg border border-agentrix-inkLine bg-white/5 p-4 text-center text-xs text-agentrix-mist">
                  {t({ zh: '暂无成交记录', en: 'No transactions yet' })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
