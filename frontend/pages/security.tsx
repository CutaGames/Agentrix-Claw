import { MarketingLayout } from '../components/marketing/MarketingLayout';
import { buildSeo } from '../lib/seo';
import { useLocalization } from '../contexts/LocalizationContext';
import { ShieldCheck, KeyRound, Smartphone, Server, Lock, FileSearch } from 'lucide-react';

const PILLARS = [
  {
    icon: KeyRound,
    title: { zh: 'MPC 三方分片', en: 'MPC 3-share' },
    desc: {
      zh: '密钥拆分为 Mobile / Server / Recovery 三片。任意单方都无法独立签名。',
      en: 'Keys split across Mobile / Server / Recovery. No single party can sign alone.',
    },
  },
  {
    icon: Smartphone,
    title: { zh: 'Mobile-First 签名', en: 'Mobile-first signing' },
    desc: {
      zh: 'L2 / L3 操作必须在手机端 push 弹窗审批，生物识别 + 阈值二次确认。',
      en: 'L2 / L3 actions require a Mobile push prompt with biometric + threshold confirmation.',
    },
  },
  {
    icon: Lock,
    title: { zh: '权限分级', en: 'Permission tiers' },
    desc: {
      zh: 'L0 公开 / L1 默认 / L2 阈值 / L3 高额 / L4 风控冷藏，对应不同审批路径。',
      en: 'L0 public · L1 default · L2 threshold · L3 high-value · L4 cold storage — distinct approval flows.',
    },
  },
  {
    icon: Server,
    title: { zh: 'Server 零长留态', en: 'Server zero-state' },
    desc: {
      zh: 'Server share 仅做协同签名，不缓存可还原私钥的中间态。',
      en: 'Server share is co-sign only. No reconstructable intermediate state cached.',
    },
  },
  {
    icon: FileSearch,
    title: { zh: '可审计', en: 'Auditable' },
    desc: {
      zh: '所有 Agent 操作（聊天 / 调用 / 支付）都写入用户私有 audit log，可导出可存证。',
      en: 'Every action (chat / call / payment) is written to user-private audit log, exportable for evidence.',
    },
  },
  {
    icon: ShieldCheck,
    title: { zh: '合规对齐', en: 'Compliance aligned' },
    desc: {
      zh: 'GDPR、SOC2、ISO27001 路线图同步推进；Enterprise 支持私有云部署。',
      en: 'GDPR, SOC2, ISO27001 roadmap in flight. Enterprise supports private-cloud deployment.',
    },
  },
];

export default function SecurityPage() {
  const { t } = useLocalization();
  const seo = buildSeo({
    title: t({ zh: '安全与 MPC · Agentrix', en: 'Security & MPC · Agentrix' }),
    description: t({
      zh: 'MPC 三方分片、Mobile-first 签名、权限分级、Server 零长留态。Agentrix 把钱包安全做成产品的第一原则。',
      en: 'MPC 3-share, Mobile-first signing, permission tiers, Server zero-state. Wallet safety as a first-class product principle.',
    }),
    path: '/security',
  });
  return (
    <MarketingLayout seo={seo}>
      <section className="bg-agentrix-ink py-20">
        <div className="container mx-auto max-w-3xl px-6 text-center">
          <h1 className="text-4xl font-extrabold md:text-5xl">
            {t({ zh: '钱包安全是产品的第一原则', en: 'Wallet safety is the first product principle' })}
          </h1>
          <p className="mt-4 text-agentrix-fog">
            {t({
              zh: 'Agent 能替你赚钱的前提，是它永远拿不走属于你的资产。',
              en: 'An agent can earn for you only when it can never walk away with your assets.',
            })}
          </p>
        </div>
      </section>

      <section className="bg-agentrix-ink pb-20">
        <div className="container mx-auto px-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {PILLARS.map((p) => {
              const Icon = p.icon;
              return (
                <div key={p.title.en} className="rounded-2xl border border-agentrix-inkLine bg-agentrix-inkSoft p-6">
                  <Icon size={24} className="text-agentrix-electric" />
                  <h3 className="mt-4 text-lg font-bold text-white">{t(p.title)}</h3>
                  <p className="mt-2 text-sm text-agentrix-fog">{t(p.desc)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
