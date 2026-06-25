import { MarketingLayout } from '../components/marketing/MarketingLayout';
import { buildSeo } from '../lib/seo';
import { useLocalization } from '../contexts/LocalizationContext';
import { ShieldCheck, Server, Users, FileText } from 'lucide-react';

const PILLARS = [
  { icon: Server, title: { zh: '私有云 / VPC 部署', en: 'Private cloud / VPC' }, desc: { zh: '在你自己的 AWS / GCP / 阿里云中部署完整 Agentrix 栈。', en: 'Deploy full Agentrix stack in your own AWS / GCP / Aliyun.' } },
  { icon: ShieldCheck, title: { zh: 'MPC HSM 托管', en: 'MPC HSM custody' }, desc: { zh: '钱包 share 由企业自己的 HSM 持有，符合内部审计。', en: 'Wallet shares held in your HSM, audit-friendly.' } },
  { icon: Users, title: { zh: 'SSO / 角色权限', en: 'SSO / RBAC' }, desc: { zh: 'OIDC / SAML / Entra ID 登录，部门级数据隔离。', en: 'OIDC / SAML / Entra ID, department-level isolation.' } },
  { icon: FileText, title: { zh: '合规与审计', en: 'Compliance & audit' }, desc: { zh: 'GDPR / SOC2 / ISO27001 路线图，可签 DPA / BAA。', en: 'GDPR / SOC2 / ISO27001 roadmap. DPA / BAA available.' } },
];

export default function EnterprisePage() {
  const { t } = useLocalization();
  const seo = buildSeo({
    title: t({ zh: '企业方案 · Agentrix', en: 'Enterprise · Agentrix' }),
    description: t({
      zh: '私有部署、MPC HSM 托管、SSO / RBAC、合规审计 —— 为企业打造的 Agent OS。',
      en: 'Private deploy, MPC HSM custody, SSO / RBAC, compliance audit — Agent OS for the enterprise.',
    }),
    path: '/enterprise',
  });
  return (
    <MarketingLayout seo={seo}>
      <section className="bg-agentrix-ink py-20">
        <div className="container mx-auto max-w-5xl px-6">
          <h1 className="text-4xl font-extrabold md:text-5xl">{t({ zh: '为企业打造的 Agent OS', en: 'Agent OS for the enterprise' })}</h1>
          <p className="mt-4 max-w-2xl text-agentrix-fog">
            {t({
              zh: '把 Agentrix 部署在你自己的 VPC，员工与客户共享同一身份与钱包基础设施。',
              en: 'Deploy Agentrix inside your VPC. Employees and customers share the same identity & wallet infra.',
            })}
          </p>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
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
          <div className="mt-12 rounded-2xl border border-agentrix-inkLine bg-gradient-to-br from-agentrix-purple/30 to-agentrix-electric/20 p-8 text-center">
            <h2 className="text-2xl font-bold text-white">{t({ zh: '约一次架构对话', en: 'Book an architecture call' })}</h2>
            <p className="mt-2 text-agentrix-fog">{t({ zh: '我们的 SA 团队会基于你的合规与规模出具部署方案。', en: 'Our SA team designs a deployment plan tailored to your compliance and scale.' })}</p>
            <a href="mailto:enterprise@agentrix.top" className="mt-6 inline-block rounded-full bg-agentrix-solar px-6 py-3 text-sm font-bold text-agentrix-ink">
              enterprise@agentrix.top
            </a>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
