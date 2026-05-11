/**
 * V3 Capabilities — 8 major new features (Pet × Wallet × Presence × Family × Auto-Earn × Memory × Privacy × Co-sign).
 */
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Sparkles, Wallet, ShieldCheck, Briefcase, Heart, TrendingUp,
  ArrowRight, Smartphone,
} from 'lucide-react';
import { useLocalization } from '../../../contexts/LocalizationContext';

const V3_FEATURES: Array<{
  icon: typeof Sparkles;
  title: { zh: string; en: string };
  desc: { zh: string; en: string };
  href: string;
}> = [
  {
    icon: Heart,
    title: { zh: '🐾 Living Pet · 主宠系统', en: '🐾 Living Pet System' },
    desc: { zh: '具备 10 种情绪 / 亲密度等级 / Live2D-3D 形象的数字伴侣，跨 5 端实时同步状态。', en: 'Digital companion with 10 emotions, intimacy levels and Live2D-3D avatar — synced live across 5 surfaces.' },
    href: '/console/presence',
  },
  {
    icon: Wallet,
    title: { zh: '💰 钱包总览 · 法币 + 加密', en: '💰 Unified Wallet (Fiat + Crypto)' },
    desc: { zh: '法币、稳定币、原生 token 一张表查看，每 10 秒自动刷新，支持 X402 / ERC-8004 链上结算。', en: 'Fiat, stablecoins and native tokens in one view. Auto-refreshes every 10s. X402 / ERC-8004 on-chain settlement.' },
    href: '/console/wallet',
  },
  {
    icon: Smartphone,
    title: { zh: '📡 在场感 · 设备接力', en: '📡 Presence & Device Handoff' },
    desc: { zh: '在 Mobile / Desktop / Web / Watch 之间无缝接力对话，待审批 L2/L3 操作多端协同签名。', en: 'Seamless conversation handoff between Mobile / Desktop / Web / Watch with multi-surface co-sign for L2/L3 actions.' },
    href: '/console/presence',
  },
  {
    icon: Briefcase,
    title: { zh: '👪 家庭账号 · 共享 Agent', en: '👪 Family Account · Shared Agents' },
    desc: { zh: '一只家庭宠物所有成员共享，按角色（owner / admin / member / child）控制家用 Agent 可见性。', en: 'One family pet shared by all members, with per-role RBAC for household agents (Butler / Tutor / Chef…).' },
    href: '/console/family',
  },
  {
    icon: TrendingUp,
    title: { zh: '⚡ Auto-Earn · 自动赚钱', en: '⚡ Auto-Earn Timeline' },
    desc: { zh: 'Agent 通过 Skill 调用 / A2A 任务 / 分佣自动产生收入，时间线实时可见，按预算池上限管控。', en: 'Agents earn autonomously via skill calls, A2A trades and commissions. Live timeline + budget pool caps.' },
    href: '/console/wallet/auto-earn',
  },
  {
    icon: Sparkles,
    title: { zh: '🧠 记忆分层 · 4 层架构', en: '🧠 4-Tier Memory Store' },
    desc: { zh: '工作记忆（30min TTL）/ 情景 / 语义 / 程序四层独立分级，向量检索 + 标签过滤。', en: 'Working (30min TTL) / Episodic / Semantic / Procedural — vector search + tag filters.' },
    href: '/console/settings/memory',
  },
  {
    icon: ShieldCheck,
    title: { zh: '🔒 隐私围栏 · 4 类敏感分区', en: '🔒 Privacy Fence · 4 Categories' },
    desc: { zh: '财务 / 健康 / 关系 / 位置 4 类敏感记忆，TTL 授权 + 一键撤回 + 完整审计日志。', en: 'Financial / Health / Relationship / Location — TTL grants, one-click revoke, full audit log.' },
    href: '/console/settings/privacy',
  },
  {
    icon: ShieldCheck,
    title: { zh: '✍️ 多端 Co-sign · 大额风控', en: '✍️ Multi-Surface Co-sign' },
    desc: { zh: 'L2/L3 高风险操作要求 Mobile + Desktop + Watch 多端独立签名，MPC 3-share 钱包硬件级安全。', en: 'High-risk actions require independent signatures from Mobile + Desktop + Watch. MPC 3-share wallet for hardware-grade security.' },
    href: '/console/settings/security',
  },
];

export function V3FeaturesSection() {
  const { t } = useLocalization();
  return (
    <section id="v3-features" className="border-y border-agentrix-inkLine bg-agentrix-ink py-20">
      <div className="container mx-auto px-6">
        <div className="mb-12 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-agentrix-electric/40 bg-agentrix-electric/10 px-4 py-1 text-xs font-semibold text-agentrix-electric">
            <Sparkles size={12} /> v3.0 · {t({ zh: '本次重大更新', en: 'Major release' })}
          </div>
          <h2 className="text-3xl font-bold md:text-4xl">
            {t({ zh: '不只是聊天 — 一个真正会陪你、帮你、替你赚钱的 Agent', en: 'Beyond chat — an agent that lives with you, works for you and earns for you' })}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-base text-agentrix-fog">
            {t({
              zh: 'v3 全新发布的 8 大能力 — 已在 Agent Console 上线，每项均可点击进入实时体验。',
              en: '8 brand-new v3 capabilities — all live in your Agent Console. Click any card to try it now.',
            })}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
          {V3_FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={f.href}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
              >
                <Link
                  href={f.href}
                  className="group block h-full rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft p-6 transition-all hover:border-agentrix-electric/60 hover:bg-agentrix-inkSoft/80"
                >
                  <Icon size={26} className="text-agentrix-electric" />
                  <h3 className="mt-4 text-base font-bold text-white">{t(f.title)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-agentrix-fog">{t(f.desc)}</p>
                  <div className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-agentrix-electric opacity-0 transition-opacity group-hover:opacity-100">
                    {t({ zh: '立即体验', en: 'Try it now' })} <ArrowRight size={12} />
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/console/dashboard"
            className="inline-flex items-center gap-2 rounded-full bg-agentrix-electric px-7 py-3 text-sm font-bold text-agentrix-ink transition-transform hover:scale-105"
          >
            {t({ zh: '进入 Agent 工作台 →', en: 'Open Agent Console →' })}
          </Link>
        </div>
      </div>
    </section>
  );
}
