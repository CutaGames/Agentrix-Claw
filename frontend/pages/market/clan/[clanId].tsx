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
                className="rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft overflow-hidden hover:border-agentrix-electric/50"
              >
                <div className="aspect-square bg-gradient-to-br from-agentrix-purple/20 to-agentrix-electric/10 flex items-center justify-center">
                  <span className="text-3xl opacity-40">🐾</span>
                </div>
                <div className="p-3">
                  <p className="text-sm font-bold text-white">{item.title}</p>
                  <p className="text-xs text-agentrix-solar">${item.price}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
