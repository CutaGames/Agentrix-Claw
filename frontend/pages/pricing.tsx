import { MarketingLayout } from '../components/marketing/MarketingLayout';
import { PricingTable, FAQ } from '../components/marketing/sections';
import { buildSeo } from '../lib/seo';
import { useLocalization } from '../contexts/LocalizationContext';

export default function PricingPage() {
  const { t } = useLocalization();
  const seo = buildSeo({
    title: t({ zh: '定价 · Agentrix', en: 'Pricing · Agentrix' }),
    description: t({
      zh: 'Free / Lite $4.99 / Plus $14.99 / Pro $29.99 / Elite $69 / Enterprise 合同。所有能力全档开放，配额随订阅升级。',
      en: 'Free / Lite $4.99 / Plus $14.99 / Pro $29.99 / Elite $69 / Enterprise custom. All capabilities open, quotas scale with plan.',
    }),
    path: '/pricing',
  });
  return (
    <MarketingLayout seo={seo}>
      <section className="bg-agentrix-ink pt-16 pb-6 text-center">
        <div className="container mx-auto px-6">
          <h1 className="text-4xl font-extrabold md:text-5xl">
            {t({ zh: '所有能力全档开放，配额随订阅升级', en: 'All capabilities open. Quotas scale with your plan.' })}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-agentrix-fog">
            {t({
              zh: '5 档订阅 + Enterprise 合同。AXP 消费返现让你越用越值，年付省 2 个月。',
              en: '5 tiers + Enterprise contracts. AXP cashback rewards usage. Yearly saves 2 months.',
            })}
          </p>
        </div>
      </section>
      <PricingTable />
      <FAQ />
    </MarketingLayout>
  );
}
