import { MarketingLayout } from '../components/marketing/MarketingLayout';
import { PricingTable, FAQ } from '../components/marketing/sections';
import { buildSeo } from '../lib/seo';
import { useLocalization } from '../contexts/LocalizationContext';

export default function PricingPage() {
  const { t } = useLocalization();
  const seo = buildSeo({
    title: t({ zh: '定价 · Agentrix', en: 'Pricing · Agentrix' }),
    description: t({
      zh: '免费、Pro $20/月、Team $50/席位/月、Enterprise 定制。所有付费计划支持 7 天退款。',
      en: 'Free, Pro $20/mo, Team $50/seat/mo, Enterprise custom. All paid plans include a 7-day refund.',
    }),
    path: '/pricing',
  });
  return (
    <MarketingLayout seo={seo}>
      <section className="bg-agentrix-ink pt-16 pb-6 text-center">
        <div className="container mx-auto px-6">
          <h1 className="text-4xl font-extrabold md:text-5xl">
            {t({ zh: '为成长付费，而不是流量', en: 'Pay for growth, not for traffic' })}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-agentrix-fog">
            {t({
              zh: '免费体验全部三层愿景，Pro 解锁 Auto-Earn，Team 共享技能仓库，Enterprise 满足合规。',
              en: 'Free for the full three-layer vision. Pro unlocks Auto-Earn. Team shares skills. Enterprise covers compliance.',
            })}
          </p>
        </div>
      </section>
      <PricingTable />
      <FAQ />
    </MarketingLayout>
  );
}
