/**
 * Pricing table — 5 tiers + Enterprise (V4 · 2026-05-10 frozen).
 */
import { useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { PRICING_TIERS } from './_shared';

export function PricingTable() {
  const { t } = useLocalization();
  const [yearly, setYearly] = useState(false);

  const mainTiers = PRICING_TIERS.filter((tier) => !tier.isEnterprise);
  const enterprise = PRICING_TIERS.find((tier) => tier.isEnterprise)!;

  return (
    <section className="bg-agentrix-ink py-20">
      <div className="container mx-auto px-6">
        <div className="mx-auto mb-8 max-w-2xl text-center">
          <h2 className="text-3xl font-bold md:text-4xl">
            {t({ zh: '简单透明的定价', en: 'Simple, transparent pricing' })}
          </h2>
          <p className="mt-3 text-agentrix-fog">
            {t({
              zh: '所有能力全档开放，配额随订阅升级。AXP 消费返现让你越用越值。',
              en: 'All capabilities open at every tier. Quotas scale with your plan. AXP cashback rewards usage.',
            })}
          </p>
        </div>

        {/* Billing toggle */}
        <div className="mb-10 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setYearly(false)}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
              !yearly ? 'bg-agentrix-electric text-agentrix-ink' : 'bg-white/10 text-agentrix-fog hover:text-white'
            }`}
          >
            {t({ zh: '月付', en: 'Monthly' })}
          </button>
          <button
            type="button"
            onClick={() => setYearly(true)}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
              yearly ? 'bg-agentrix-electric text-agentrix-ink' : 'bg-white/10 text-agentrix-fog hover:text-white'
            }`}
          >
            {t({ zh: '年付 · 省 2 个月', en: 'Yearly · save 2 months' })}
          </button>
        </div>

        {/* 5 main tier cards */}
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {mainTiers.map((tier) => {
            const displayPrice = yearly && tier.yearlyPrice ? tier.yearlyPrice : tier.monthlyPrice;
            const displayUnit = yearly && tier.yearlyPrice
              ? t({ zh: '/ 年', en: '/ year' })
              : tier.monthlyPrice === '$0'
                ? t(tier.unit)
                : t({ zh: '/ 月', en: '/ month' });

            return (
              <div
                key={tier.key}
                className={`relative flex flex-col rounded-2xl border p-5 transition-transform ${
                  tier.highlight
                    ? 'border-agentrix-electric bg-gradient-to-b from-agentrix-electric/10 to-agentrix-purple/10 shadow-2xl shadow-agentrix-electric/20 md:-translate-y-2'
                    : 'border-agentrix-inkLine bg-agentrix-inkSoft'
                }`}
              >
                {tier.highlight && (
                  <span className="absolute -top-3 left-5 rounded-full bg-agentrix-solar px-3 py-1 text-xs font-bold text-agentrix-ink">
                    {t({ zh: '推荐', en: 'Most popular' })}
                  </span>
                )}
                {tier.axpCashback > 0 && (
                  <span className="absolute -top-3 right-5 rounded-full bg-agentrix-purpleSoft/80 px-2.5 py-1 text-xs font-bold text-white">
                    +{tier.axpCashback}% AXP
                  </span>
                )}
                <h3 className="text-lg font-bold text-white">{t(tier.name)}</h3>
                <p className="mt-1 text-xs text-agentrix-mist">{t(tier.tagline)}</p>
                <div className="mt-4 flex items-end gap-1">
                  <span className="text-3xl font-extrabold text-white">{displayPrice}</span>
                  <span className="pb-0.5 text-xs text-agentrix-mist">{displayUnit}</span>
                </div>
                {yearly && tier.yearlySavings && (
                  <p className="mt-1 text-xs font-medium text-agentrix-solar">{t(tier.yearlySavings)}</p>
                )}
                <ul className="mt-4 flex-1 space-y-2 text-sm text-agentrix-fog">
                  {tier.features.map((f) => (
                    <li key={f.en} className="flex items-start gap-2">
                      <Check size={13} className="mt-0.5 shrink-0 text-agentrix-electric" />
                      <span>{t(f)}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={yearly && tier.yearlyPrice ? tier.ctaHref.replace('monthly', 'yearly') : tier.ctaHref}
                  className={`mt-5 inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-bold transition-opacity hover:opacity-90 ${
                    tier.highlight
                      ? 'bg-agentrix-solar text-agentrix-ink'
                      : 'bg-white/10 text-white hover:bg-white/15'
                  }`}
                >
                  {t(tier.cta)}
                </Link>
              </div>
            );
          })}
        </div>

        {/* Enterprise wide card */}
        <div className="mt-8 rounded-2xl border border-agentrix-inkLine bg-agentrix-inkSoft p-6 md:flex md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">{t(enterprise.name)}</h3>
            <p className="mt-1 text-sm text-agentrix-fog">{t(enterprise.tagline)}</p>
            <ul className="mt-3 space-y-1 text-sm text-agentrix-fog">
              {enterprise.features.map((f) => (
                <li key={f.en} className="flex items-start gap-2">
                  <Check size={13} className="mt-0.5 shrink-0 text-agentrix-electric" />
                  <span>{t(f)}</span>
                </li>
              ))}
            </ul>
          </div>
          <Link
            href={enterprise.ctaHref}
            className="mt-5 inline-flex items-center justify-center rounded-full bg-white/10 px-6 py-3 text-sm font-bold text-white hover:bg-white/15 md:mt-0 md:ml-8"
          >
            {t(enterprise.cta)}
          </Link>
        </div>

        {/* Overage explanation */}
        <div className="mt-8 rounded-xl border border-agentrix-inkLine/60 bg-agentrix-inkSoft/50 p-5 text-center">
          <p className="text-sm font-semibold text-white">
            {t({ zh: '💡 预算 / 配额耗尽时，你有 3 个选择：', en: '💡 When budget / quota runs out, you have 3 options:' })}
          </p>
          <div className="mt-3 flex flex-col items-center gap-2 text-xs text-agentrix-fog sm:flex-row sm:justify-center sm:gap-6">
            <span>① {t({ zh: 'AXP 抵扣：10,000 AXP = $10', en: 'AXP redeem: 10,000 AXP = $10' })}</span>
            <span>② {t({ zh: '现金实扣：绑卡按需 1.3-1.5×', en: 'Pay-as-you-go: card at 1.3-1.5×' })}</span>
            <span>③ {t({ zh: 'BYOK：自带 API Key 免 LLM 计费', en: 'BYOK: bring your own key, no LLM billing' })}</span>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-agentrix-mist">
          {t({
            zh: '所有付费计划支持 7 天无理由退款。年付 = 月价 × 10（省 2 个月）。',
            en: 'All paid plans include a 7-day refund. Yearly = monthly × 10 (save 2 months).',
          })}
        </p>
      </div>
    </section>
  );
}
