import { useState } from 'react';
import { MarketingLayout } from '../../components/marketing/MarketingLayout';
import { buildSeo } from '../../lib/seo';
import { useLocalization } from '../../contexts/LocalizationContext';
import { Check } from 'lucide-react';

const STEPS = ['select', 'metadata', 'pricing', 'remix', 'confirm'] as const;

export default function SellPage() {
  const { t } = useLocalization();
  const [step, setStep] = useState(0);

  const seo = buildSeo({
    title: t({ zh: '上架皮肤 · Agentrix Marketplace', en: 'List Skin · Agentrix Marketplace' }),
    description: t({ zh: '5 步上架你的宠物皮肤', en: '5-step skin listing wizard' }),
    path: '/market/sell',
  });

  const stepLabels = [
    t({ zh: '选择皮肤', en: 'Select Skin' }),
    t({ zh: '元数据', en: 'Metadata' }),
    t({ zh: '定价模式', en: 'Pricing' }),
    t({ zh: 'Remix 分成', en: 'Remix Share' }),
    t({ zh: '确认提交', en: 'Confirm' }),
  ];

  return (
    <MarketingLayout seo={seo}>
      <section className="bg-agentrix-ink py-12">
        <div className="container mx-auto max-w-2xl px-6">
          <h1 className="text-2xl font-extrabold text-center">
            {t({ zh: '上架你的皮肤', en: 'List Your Skin' })}
          </h1>

          {/* Stepper */}
          <div className="mt-8 flex items-center justify-between">
            {STEPS.map((s, i) => (
              <div key={s} className="flex flex-col items-center gap-1">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                  i < step ? 'bg-agentrix-electric text-agentrix-ink' : i === step ? 'bg-agentrix-solar text-agentrix-ink' : 'bg-white/10 text-agentrix-mist'
                }`}>
                  {i < step ? <Check size={14} /> : i + 1}
                </div>
                <span className="text-[10px] text-agentrix-mist">{stepLabels[i]}</span>
              </div>
            ))}
          </div>

          {/* Step content placeholder */}
          <div className="mt-10 rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft p-8 text-center">
            <p className="text-agentrix-fog">
              {t({ zh: `步骤 ${step + 1}：${stepLabels[step]}`, en: `Step ${step + 1}: ${stepLabels[step]}` })}
            </p>
            <p className="mt-2 text-xs text-agentrix-mist">
              {t({ zh: '（W4 实现完整表单逻辑）', en: '(Full form logic in W4)' })}
            </p>
          </div>

          {/* Navigation */}
          <div className="mt-6 flex justify-between">
            <button
              type="button"
              disabled={step === 0}
              onClick={() => setStep((s) => s - 1)}
              className="rounded-full bg-white/10 px-6 py-2 text-sm font-semibold text-white disabled:opacity-30"
            >
              {t({ zh: '上一步', en: 'Back' })}
            </button>
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(s + 1, STEPS.length - 1))}
              className="rounded-full bg-agentrix-electric px-6 py-2 text-sm font-bold text-agentrix-ink"
            >
              {step === STEPS.length - 1 ? t({ zh: '提交审核', en: 'Submit' }) : t({ zh: '下一步', en: 'Next' })}
            </button>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
