import { useRouter } from 'next/router';
import { MarketingLayout } from '../../../components/marketing/MarketingLayout';
import { buildSeo } from '../../../lib/seo';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { Gavel, Clock, Users } from 'lucide-react';

export default function AuctionDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const { t } = useLocalization();

  const seo = buildSeo({
    title: t({ zh: `拍卖 #${id} · Agentrix`, en: `Auction #${id} · Agentrix` }),
    description: t({ zh: '实时出价拍卖大厅', en: 'Real-time bidding auction hall' }),
    path: `/market/auction/${id}`,
  });

  return (
    <MarketingLayout seo={seo}>
      <section className="bg-agentrix-ink py-12">
        <div className="container mx-auto px-6">
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="aspect-square rounded-2xl border border-agentrix-inkLine bg-gradient-to-br from-agentrix-purple/30 to-agentrix-electric/20 flex items-center justify-center">
              <span className="text-6xl">🐾</span>
            </div>
            <div>
              <h1 className="text-3xl font-extrabold">{t({ zh: '拍卖大厅', en: 'Auction Hall' })} #{id}</h1>
              <div className="mt-4 flex gap-4 text-sm text-agentrix-fog">
                <span className="inline-flex items-center gap-1"><Clock size={14} /> {t({ zh: '剩余 2h 34m', en: '2h 34m left' })}</span>
                <span className="inline-flex items-center gap-1"><Users size={14} /> {t({ zh: '8 人出价', en: '8 bidders' })}</span>
              </div>

              <div className="mt-8 rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft p-6">
                <p className="text-xs text-agentrix-mist">{t({ zh: '当前最高出价', en: 'Current highest bid' })}</p>
                <p className="mt-1 text-3xl font-extrabold text-agentrix-solar">$24.50</p>
                <p className="mt-1 text-xs text-agentrix-fog">{t({ zh: '起拍价 $5.00 · 加价幅度 $0.50', en: 'Starting $5.00 · Increment $0.50' })}</p>

                <div className="mt-6 flex gap-3">
                  <input
                    type="number"
                    placeholder="$25.00"
                    className="flex-1 rounded-lg border border-agentrix-inkLine bg-white/5 px-4 py-2.5 text-sm text-white placeholder-agentrix-mist focus:border-agentrix-electric focus:outline-none"
                  />
                  <button className="inline-flex items-center gap-2 rounded-full bg-agentrix-solar px-6 py-2.5 text-sm font-bold text-agentrix-ink hover:opacity-90">
                    <Gavel size={16} />
                    {t({ zh: '出价', en: 'Bid' })}
                  </button>
                </div>
              </div>

              {/* Bid history */}
              <div className="mt-6">
                <h3 className="text-sm font-bold text-white">{t({ zh: '出价记录', en: 'Bid History' })}</h3>
                <div className="mt-3 space-y-2">
                  {[24.5, 24.0, 23.0, 20.0, 15.0].map((price, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg bg-white/5 px-4 py-2 text-xs">
                      <span className="text-agentrix-fog">@user{i + 1}</span>
                      <span className="font-bold text-white">${price.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
