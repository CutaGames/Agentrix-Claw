import { MarketingLayout } from '../components/marketing/MarketingLayout';
import { ThreeLayerVision, DownloadCallout } from '../components/marketing/sections';
import { buildSeo } from '../lib/seo';
import { useLocalization } from '../contexts/LocalizationContext';

export default function ManifestoPage() {
  const { t } = useLocalization();
  const seo = buildSeo({
    title: t({ zh: '宣言 · Living / Doer / Economy', en: 'Manifesto · Living / Doer / Economy' }),
    description: t({
      zh: 'Agentrix v3 的产品哲学：Living 是 Agent 的灵魂，Doer 是双手，Economy 是钱包。',
      en: 'The philosophy behind Agentrix v3: Living is the soul, Doer is the hands, Economy is the wallet.',
    }),
    path: '/manifesto',
  });
  return (
    <MarketingLayout seo={seo}>
      <section className="bg-agentrix-ink pt-20 pb-10">
        <div className="container mx-auto max-w-3xl px-6 text-center">
          <h1 className="text-4xl font-extrabold leading-tight md:text-5xl">
            {t({
              zh: 'Agent 不是工具，是数字生命体',
              en: 'An agent is not a tool. It is a digital being.',
            })}
          </h1>
          <p className="mt-5 text-lg text-agentrix-fog">
            {t({
              zh: '过去十年，AI 是 Chat。未来十年，AI 是 Agent —— 它有人格、有记忆、有钱包，跨越屏幕陪伴你、执行任务、为你赚钱。',
              en: 'For the past decade AI was Chat. The next decade is the Agent — with persona, memory and wallet, crossing screens to companion you, execute for you, and earn for you.',
            })}
          </p>
        </div>
      </section>

      <ThreeLayerVision />

      <section className="bg-agentrix-inkSoft py-20">
        <div className="container mx-auto max-w-3xl px-6">
          <h2 className="text-2xl font-bold text-white">
            {t({ zh: '我们的承诺', en: 'Our commitments' })}
          </h2>
          <ul className="mt-6 space-y-4 text-agentrix-fog">
            <li>
              <strong className="text-white">{t({ zh: '人格永远归你所有。', en: 'The persona is yours forever.' })}</strong>
              {' '}
              {t({
                zh: '记忆与人设可导出、可迁移、可销毁，模型可换。',
                en: 'Memory and persona are exportable, portable and deletable. Models are swappable.',
              })}
            </li>
            <li>
              <strong className="text-white">{t({ zh: '签名永远在 Mobile。', en: 'Signing always lives on Mobile.' })}</strong>
              {' '}
              {t({
                zh: 'L2/L3 阈值审批必须经过手机端 MPC share，Web 与 Server 都不持有独立可签名 share。',
                en: 'L2/L3 threshold actions require Mobile MPC share. Web and Server hold no independently signable share.',
              })}
            </li>
            <li>
              <strong className="text-white">{t({ zh: '收益分润透明。', en: 'Revenue share is transparent.' })}</strong>
              {' '}
              {t({
                zh: 'Skill / 任务集市分润比例公开在合约层，可链上审计。',
                en: 'Marketplace splits are codified on-chain and auditable.',
              })}
            </li>
            <li>
              <strong className="text-white">{t({ zh: '协议优先。', en: 'Protocols first.' })}</strong>
              {' '}
              {t({
                zh: 'X402 / ERC-8004 / A2A / MCP 全部开源参与，不做围墙花园。',
                en: 'X402 / ERC-8004 / A2A / MCP — fully open. No walled garden.',
              })}
            </li>
          </ul>
        </div>
      </section>

      <DownloadCallout />
    </MarketingLayout>
  );
}
