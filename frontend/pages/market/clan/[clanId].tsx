import { useRouter } from 'next/router';
import { MarketingLayout } from '../../../components/marketing/MarketingLayout';
import { buildSeo } from '../../../lib/seo';
import { useLocalization } from '../../../contexts/LocalizationContext';
import Link from 'next/link';

export default function ClanFilterPage() {
  const router = useRouter();
  const { clanId } = router.query;
  const { t } = useLocalization();

  const seo = buildSeo({
    title: t({ zh: `Clan ${clanId} · Agentrix Marketplace`, en: `Clan ${clanId} · Agentrix Marketplace` }),
    description: t({ zh: `浏览 Clan ${clanId} 族群的宠物皮肤`, en: `Browse Clan ${clanId} pet skins` }),
    path: `/market/clan/${clanId}`,
  });

  const items = Array.from({ length: 8 }, (_, i) => ({
    id: `skin-clan-${clanId}-${i}`,
    title: `Clan ${clanId} Skin #${i + 1}`,
    price: (Math.random() * 15 + 2).toFixed(2),
  }));

  return (
    <MarketingLayout seo={seo}>
      <section className="bg-agentrix-ink py-12">
        <div className="container mx-auto px-6">
          <h1 className="text-3xl font-extrabold">Clan {clanId}</h1>
          <p className="mt-2 text-agentrix-fog">
            {t({ zh: `浏览 Clan ${clanId} 族群的所有皮肤`, en: `All skins from Clan ${clanId}` })}
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {items.map((item) => (
              <Link
                key={item.id}
                href={`/market/skin/${item.id}`}
                className="group rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft overflow-hidden transition-all duration-300 hover:border-agentrix-electric/50 hover:-translate-y-1 hover:shadow-lg hover:shadow-agentrix-electric/10"
              >
                <div className="aspect-square relative overflow-hidden">
                  <div className={`absolute inset-0 bg-gradient-to-br from-purple-600/30 via-indigo-900/50 to-cyan-500/20`} />
                  <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.08)_0%,transparent_70%)]" />
                </div>
                <div className="p-3">
                  <p className="text-sm font-bold text-white group-hover:text-agentrix-electric transition-colors">{item.title}</p>
                  <p className="mt-1 text-xs text-agentrix-solar font-semibold">${item.price}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
