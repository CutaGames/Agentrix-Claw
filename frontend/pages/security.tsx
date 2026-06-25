/**
 * /security — Security & MPC architecture page (Sprint W-4 Day 4 expansion).
 *
 * Replaces the 6-pillar grid with deeper architectural explanations:
 *   §1 Pillars (carry-over)
 *   §2 MPC 3-share architecture diagram (text-based)
 *   §3 ERC-8004 identity model
 *   §4 X402 micropay protocol
 *   §5 Privacy fence — 4 sensitive zones
 *   §6 Audit log + transparency
 *   §7 Compliance roadmap
 *   §8 Reporting / disclosure contact
 */
import Link from 'next/link';
import { MarketingLayout } from '../components/marketing/MarketingLayout';
import { buildSeo } from '../lib/seo';
import { useLocalization } from '../contexts/LocalizationContext';
import {
  ShieldCheck, KeyRound, Smartphone, Server, Lock, FileSearch,
  Mail, ArrowRight, AlertTriangle, ScrollText, Layers, Wallet, Eye,
} from 'lucide-react';

const PILLARS = [
  { icon: KeyRound, title: { zh: 'MPC 三方分片', en: 'MPC 3-share' }, desc: { zh: '密钥拆分为 Mobile / Server / Recovery 三片。任意单方都无法独立签名。', en: 'Keys split across Mobile / Server / Recovery. No single party can sign alone.' } },
  { icon: Smartphone, title: { zh: 'Mobile-First 签名', en: 'Mobile-first signing' }, desc: { zh: 'L2 / L3 操作必须在手机端 push 弹窗审批，生物识别 + 阈值二次确认。', en: 'L2 / L3 actions require Mobile push prompt with biometric + threshold confirmation.' } },
  { icon: Lock, title: { zh: '权限分级', en: 'Permission tiers' }, desc: { zh: 'L0 公开 / L1 默认 / L2 阈值 / L3 高额 / L4 风控冷藏，对应不同审批路径。', en: 'L0 public · L1 default · L2 threshold · L3 high-value · L4 cold storage.' } },
  { icon: Server, title: { zh: 'Server 零长留态', en: 'Server zero-state' }, desc: { zh: 'Server share 仅做协同签名，不缓存可还原私钥的中间态。', en: 'Server share is co-sign only. No reconstructable intermediate state cached.' } },
  { icon: FileSearch, title: { zh: '可审计', en: 'Auditable' }, desc: { zh: '所有 Agent 操作都写入用户私有 audit log，可导出可存证。', en: 'All actions written to user-private audit log, exportable for evidence.' } },
  { icon: ShieldCheck, title: { zh: '合规对齐', en: 'Compliance aligned' }, desc: { zh: 'GDPR、SOC2、ISO27001 路线图同步推进；Enterprise 支持私有云部署。', en: 'GDPR, SOC2, ISO27001 roadmap. Enterprise supports private-cloud deploy.' } },
];

const TIERS = [
  { id: 'L0', label: { zh: 'L0 公开', en: 'L0 Public' }, value: { zh: '只读 / 无签名', en: 'Read-only / no signature' }, examples: { zh: '查看资产 / 浏览 Marketplace', en: 'View assets / browse marketplace' } },
  { id: 'L1', label: { zh: 'L1 默认', en: 'L1 Default' }, value: { zh: '< $5 等额', en: '< $5 equivalent' }, examples: { zh: '签到、领取 AXP、点赞', en: 'Check-in, claim AXP, like' } },
  { id: 'L2', label: { zh: 'L2 阈值', en: 'L2 Threshold' }, value: { zh: '$5 - $100', en: '$5 - $100' }, examples: { zh: 'Skin 购买、Skill 调用大批量', en: 'Skin purchase, batch skill calls' } },
  { id: 'L3', label: { zh: 'L3 高额', en: 'L3 High-value' }, value: { zh: '> $100 或链上转账', en: '> $100 or on-chain transfer' }, examples: { zh: 'NFT 铸造、跨链转账、合作分账', en: 'NFT mint, bridge, partner split' } },
  { id: 'L4', label: { zh: 'L4 冷藏', en: 'L4 Cold storage' }, value: { zh: '7×24 风控延时', en: 'Risk-control 7×24 delay' }, examples: { zh: '提现 > $1000、紧急冻结', en: 'Withdraw > $1000, emergency freeze' } },
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
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-agentrix-inkLine bg-agentrix-ink py-16 md:py-20">
        <div className="pointer-events-none absolute -top-32 left-1/4 h-[480px] w-[480px] rounded-full bg-emerald-500/12 blur-3xl" />
        <div className="container mx-auto max-w-4xl px-6 text-center relative">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-1 text-xs font-semibold text-emerald-300">
            <ShieldCheck size={12} /> {t({ zh: '安全 & MPC 钱包', en: 'Security & MPC' })}
          </div>
          <h1 className="text-4xl font-extrabold md:text-5xl leading-tight">
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

      {/* §1 Pillars */}
      <section className="bg-agentrix-ink py-20">
        <div className="container mx-auto max-w-5xl px-6">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold md:text-4xl">{t({ zh: '6 个安全支柱', en: '6 security pillars' })}</h2>
          </div>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {PILLARS.map((p) => {
              const Icon = p.icon;
              return (
                <div key={p.title.en} className="rounded-2xl border border-agentrix-inkLine bg-agentrix-inkSoft p-6">
                  <Icon size={24} className="text-agentrix-electric" />
                  <h3 className="mt-4 text-lg font-bold text-white">{t(p.title)}</h3>
                  <p className="mt-2 text-sm text-agentrix-fog leading-relaxed">{t(p.desc)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* §2 MPC architecture */}
      <section id="mpc" className="border-y border-agentrix-inkLine bg-agentrix-inkSoft/30 py-20">
        <div className="container mx-auto max-w-4xl px-6">
          <h2 className="text-3xl font-bold md:text-4xl">
            {t({ zh: '§2 · MPC 三方分片架构', en: '§2 · MPC 3-share architecture' })}
          </h2>
          <p className="mt-3 text-agentrix-fog">
            {t({
              zh: '密钥永远不被任意一方持有完整副本。所有签名由两方协作完成。',
              en: 'No single party ever holds a complete key. All signatures require two-party cooperation.',
            })}
          </p>

          <pre className="mt-6 overflow-x-auto rounded-2xl border border-agentrix-inkLine bg-black/60 p-6 text-xs leading-relaxed text-agentrix-fog md:text-sm">
{`                  ┌─────────────────────────┐
                  │     User secret         │
                  │  (sk = sk1 ⊕ sk2 ⊕ sk3) │
                  └────────────┬────────────┘
                               │
       ┌───────────────────────┼───────────────────────┐
       │                       │                       │
       ▼                       ▼                       ▼
 ┌──────────┐          ┌────────────┐         ┌──────────────┐
 │  sk1     │          │   sk2      │         │   sk3        │
 │ Mobile   │          │  Server    │         │  Recovery    │
 │ Secure   │          │  HSM       │         │  Encrypted   │
 │ Enclave  │          │  enclave   │         │  cold backup │
 └──────────┘          └────────────┘         └──────────────┘
       │                       │                       │
       │   2-of-3 协作签名      │                       │
       └───────────────────────┴───────────────────────┘`}
          </pre>

          <ul className="mt-6 space-y-2 text-sm text-agentrix-fog">
            <li>• <strong className="text-white">sk1 (Mobile)</strong>: {t({ zh: '存于设备 Secure Enclave，生物识别保护，永远不离开手机', en: 'Stored in device Secure Enclave, biometric-locked, never leaves phone' })}</li>
            <li>• <strong className="text-white">sk2 (Server)</strong>: {t({ zh: '存于 HSM，仅响应 Mobile 已签名的请求才参与协同签名', en: 'Stored in HSM, only co-signs upon a Mobile-signed request' })}</li>
            <li>• <strong className="text-white">sk3 (Recovery)</strong>: {t({ zh: '加密冷备份，社会化恢复或硬件备份卡持有，平时不参与签名', en: 'Encrypted cold backup; social recovery or hardware card; idle in normal flow' })}</li>
          </ul>

          <div className="mt-6 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm text-agentrix-fog">
            <AlertTriangle size={14} className="inline-block mr-2 -mt-0.5 text-amber-300" />
            <span>
              {t({
                zh: '即使我们的服务端被入侵，攻击者拿到 sk2 也无法独立签名 — 必须先骗到用户的 Mobile 解锁。这是 MPC 设计相对硬件钱包的关键优势。',
                en: 'Even if our backend is compromised and sk2 is leaked, the attacker cannot sign alone — they must first compromise the user\'s phone. This is the key advantage of MPC over hardware wallets.',
              })}
            </span>
          </div>
        </div>
      </section>

      {/* §3 ERC-8004 identity */}
      <section id="erc-8004" className="bg-agentrix-ink py-20">
        <div className="container mx-auto max-w-4xl px-6">
          <h2 className="text-3xl font-bold md:text-4xl">
            {t({ zh: '§3 · ERC-8004 身份模型', en: '§3 · ERC-8004 identity model' })}
          </h2>
          <p className="mt-3 text-agentrix-fog">
            {t({
              zh: '每个 Agent 有自己的链上身份，独立于人类用户钱包。这让 Agent 真正拥有"自我"。',
              en: 'Each agent has its own on-chain identity, independent of the human user wallet — letting the agent truly "own itself."',
            })}
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-agentrix-inkLine bg-agentrix-inkSoft p-5">
              <Wallet size={20} className="text-agentrix-electric" />
              <h3 className="mt-3 text-base font-bold text-white">{t({ zh: '人类用户钱包', en: 'Human user wallet' })}</h3>
              <ul className="mt-3 space-y-1.5 text-sm text-agentrix-fog">
                <li>• EIP-7702 兼容</li>
                <li>• MPC 3-share 签名</li>
                <li>• 拥有 Agent 实例 + Skin 资产</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-agentrix-inkLine bg-agentrix-inkSoft p-5">
              <Layers size={20} className="text-agentrix-solar" />
              <h3 className="mt-3 text-base font-bold text-white">{t({ zh: 'Agent 链上身份', en: 'Agent on-chain identity' })}</h3>
              <ul className="mt-3 space-y-1.5 text-sm text-agentrix-fog">
                <li>• ERC-8004 标准</li>
                <li>• 独立钱包地址 + 余额</li>
                <li>• 父用户授权范围内的自主签名</li>
              </ul>
            </div>
          </div>

          <p className="mt-6 text-sm text-agentrix-fog leading-relaxed">
            {t({
              zh: '这种分离让"Agent 替你赚钱"成为可能：Agent 有独立钱包接受 X402 微支付，定期把累计收益按用户配置的策略转回主钱包。',
              en: 'This separation enables "agent earns for you": agent has its own wallet to receive X402 micropayments, periodically sweeping earnings back to the user wallet per user-configured policy.',
            })}
          </p>
        </div>
      </section>

      {/* §4 X402 protocol */}
      <section id="x402" className="border-y border-agentrix-inkLine bg-agentrix-inkSoft/30 py-20">
        <div className="container mx-auto max-w-4xl px-6">
          <h2 className="text-3xl font-bold md:text-4xl">
            {t({ zh: '§4 · X402 微支付', en: '§4 · X402 Micropay' })}
          </h2>
          <p className="mt-3 text-agentrix-fog">
            {t({
              zh: 'HTTP 402 Payment Required 的复活。Agent 调用 API → 收到 402 + 价格 → 自动用 USDC 微支付 → 服务端验签 → 返回结果。',
              en: 'HTTP 402 Payment Required, revived. Agent calls API → receives 402 + price → auto-pays USDC micropayment → server verifies → returns result.',
            })}
          </p>

          <div className="mt-6 rounded-2xl border border-agentrix-inkLine bg-agentrix-inkSoft p-6">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-agentrix-electric">
              {t({ zh: '一次调用的全过程', en: 'A single call, end-to-end' })}
            </p>
            <ol className="space-y-3 text-sm text-agentrix-fog">
              <li className="flex gap-3"><span className="font-mono text-xs text-agentrix-electric font-bold">1.</span> Agent → POST /skill/translate</li>
              <li className="flex gap-3"><span className="font-mono text-xs text-agentrix-electric font-bold">2.</span> Server → 402 {t({ zh: '需付费', en: 'payment required' })} (price=$0.005, address=0x..., nonce=...)</li>
              <li className="flex gap-3"><span className="font-mono text-xs text-agentrix-electric font-bold">3.</span> Agent → {t({ zh: '签名 USDC 转账意向', en: 'sign USDC transfer intent' })} (EIP-712)</li>
              <li className="flex gap-3"><span className="font-mono text-xs text-agentrix-electric font-bold">4.</span> Agent → POST /skill/translate (X-Payment: signed_intent)</li>
              <li className="flex gap-3"><span className="font-mono text-xs text-agentrix-electric font-bold">5.</span> Server → {t({ zh: '验签 + facilitator 提交链上', en: 'verify + facilitator submits on-chain' })}</li>
              <li className="flex gap-3"><span className="font-mono text-xs text-agentrix-electric font-bold">6.</span> Server → 200 {t({ zh: '返回结果', en: 'returns result' })}</li>
            </ol>
            <p className="mt-4 text-xs text-agentrix-mist">
              {t({
                zh: '链上结算可异步完成，不阻塞调用。失败会自动退款。',
                en: 'On-chain settlement is async; calls are not blocked. Failures auto-refund.',
              })}
            </p>
          </div>
        </div>
      </section>

      {/* §5 Permission tiers */}
      <section id="tiers" className="bg-agentrix-ink py-20">
        <div className="container mx-auto max-w-4xl px-6">
          <h2 className="text-3xl font-bold md:text-4xl">
            {t({ zh: '§5 · 权限分级', en: '§5 · Permission tiers' })}
          </h2>
          <p className="mt-3 text-agentrix-fog">
            {t({
              zh: 'L0 - L4 五级。等级越高，审批路径越严。',
              en: 'L0 to L4 — higher tier, stricter approval path.',
            })}
          </p>

          <div className="mt-6 overflow-x-auto rounded-2xl border border-agentrix-inkLine bg-agentrix-inkSoft">
            <table className="w-full text-sm">
              <thead className="border-b border-agentrix-inkLine text-xs uppercase tracking-wider text-agentrix-mist">
                <tr>
                  <th className="px-4 py-3 text-left">Tier</th>
                  <th className="px-4 py-3 text-left">{t({ zh: '阈值', en: 'Threshold' })}</th>
                  <th className="px-4 py-3 text-left">{t({ zh: '示例操作', en: 'Examples' })}</th>
                </tr>
              </thead>
              <tbody>
                {TIERS.map((tier) => (
                  <tr key={tier.id} className="border-t border-agentrix-inkLine/50">
                    <td className="px-4 py-3"><strong className="text-white">{t(tier.label)}</strong></td>
                    <td className="px-4 py-3 text-agentrix-fog font-mono text-xs">{t(tier.value)}</td>
                    <td className="px-4 py-3 text-agentrix-fog">{t(tier.examples)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* §6 Privacy fence */}
      <section id="privacy-fence" className="border-y border-agentrix-inkLine bg-agentrix-inkSoft/30 py-20">
        <div className="container mx-auto max-w-4xl px-6">
          <h2 className="text-3xl font-bold md:text-4xl">
            {t({ zh: '§6 · 隐私围栏 · 4 类敏感分区', en: '§6 · Privacy fence · 4 sensitive zones' })}
          </h2>
          <p className="mt-3 text-agentrix-fog">
            {t({
              zh: '不是所有数据都该平等对待。我们把 4 类敏感数据隔离存储，独立授权 + TTL + 一键撤回。',
              en: 'Not all data deserves equal access. 4 sensitive zones are isolated, with TTL grants + one-click revoke.',
            })}
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {[
              { name: { zh: '财务', en: 'Financial' }, desc: { zh: '账单、交易记录、税务', en: 'Bills, transactions, tax' } },
              { name: { zh: '健康', en: 'Health' }, desc: { zh: '运动、心率、用药', en: 'Activity, heart rate, medications' } },
              { name: { zh: '关系', en: 'Relationships' }, desc: { zh: '通讯录、聊天记录、社交', en: 'Contacts, chat history, social' } },
              { name: { zh: '位置', en: 'Location' }, desc: { zh: '实时 GPS、地理围栏', en: 'Live GPS, geofences' } },
            ].map((p) => (
              <div key={p.name.en} className="rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft p-5">
                <Eye size={20} className="text-agentrix-purpleSoft" />
                <h3 className="mt-3 text-base font-bold text-white">{t(p.name)}</h3>
                <p className="mt-1 text-sm text-agentrix-fog">{t(p.desc)}</p>
                <p className="mt-3 text-xs text-agentrix-mist">
                  {t({
                    zh: '需用户为每次调用单独授权(可设默认 24h),Agent 看不到未授权部分。',
                    en: 'Per-call authorization (or default 24h grant). Agent cannot see unauthorized data.',
                  })}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* §7 Audit log */}
      <section id="audit" className="bg-agentrix-ink py-20">
        <div className="container mx-auto max-w-4xl px-6">
          <h2 className="text-3xl font-bold md:text-4xl">
            {t({ zh: '§7 · 审计日志 + 可解释性', en: '§7 · Audit log + explainability' })}
          </h2>
          <p className="mt-3 text-agentrix-fog">
            {t({
              zh: '每个 Agent 操作都会写入用户私有的 audit log:谁、何时、调用了什么、传了什么、得到什么、花了多少钱。',
              en: 'Every action writes to user-private audit log: who, when, what call, what payload, what result, how much it cost.',
            })}
          </p>
          <ul className="mt-4 space-y-2 text-sm text-agentrix-fog">
            <li>• {t({ zh: '完整保留 90 天 / 用户可主动延长 / 一键导出 JSON', en: 'Full 90 day retention / user can extend / one-click JSON export' })}</li>
            <li>• {t({ zh: '本地端可查询 + 服务端 mirror', en: 'Searchable on-device + server mirror' })}</li>
            <li>• {t({ zh: '高额操作(L3+) 强制写双向签名链', en: 'High-value (L3+) actions enforce bidirectional signature chain' })}</li>
            <li>• {t({ zh: '可作为合规 / 仲裁证据', en: 'Usable as compliance / arbitration evidence' })}</li>
          </ul>
        </div>
      </section>

      {/* §8 Compliance roadmap */}
      <section id="compliance" className="border-y border-agentrix-inkLine bg-agentrix-inkSoft/30 py-20">
        <div className="container mx-auto max-w-4xl px-6">
          <h2 className="text-3xl font-bold md:text-4xl">
            {t({ zh: '§8 · 合规路线图', en: '§8 · Compliance roadmap' })}
          </h2>
          <ul className="mt-6 space-y-3 text-sm">
            {[
              { status: '✅', label: 'GDPR / CCPA', desc: { zh: '数据导出 / 删除已生效;`/privacy` 公开政策', en: 'Export / deletion live; `/privacy` public policy' } },
              { status: '✅', label: 'SOC 2 Type 1', desc: { zh: '内部审计准备中,2026-Q4 提交', en: 'Internal audit prep; 2026-Q4 submission' } },
              { status: '🟡', label: 'ISO 27001', desc: { zh: '2027-Q2 路线图', en: '2027-Q2 roadmap' } },
              { status: '🟡', label: 'HIPAA', desc: { zh: '健康类敏感数据准备分级合规', en: 'Health-data grade compliance prep' } },
              { status: '⏳', label: { zh: '第三方渗透测试', en: 'Third-party pen test' }, desc: { zh: 'GA 前完成 1 次小型 / GA 后年度', en: '1 pre-GA small + annual post-GA' } },
            ].map((r) => (
              <li key={r.label as any} className="flex items-start gap-3 rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft p-4">
                <span className="text-lg">{r.status}</span>
                <div>
                  <strong className="text-white">{typeof r.label === 'string' ? r.label : t(r.label)}</strong>
                  <p className="mt-1 text-xs text-agentrix-fog">{t(r.desc)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* §9 Disclosure */}
      <section className="bg-agentrix-ink py-16">
        <div className="container mx-auto max-w-3xl px-6 text-center">
          <ScrollText size={32} className="mx-auto mb-4 text-agentrix-electric" />
          <h2 className="text-2xl font-bold md:text-3xl">
            {t({ zh: '发现安全问题?', en: 'Found a security issue?' })}
          </h2>
          <p className="mt-3 text-agentrix-fog">
            {t({
              zh: '我们有 Bug Bounty 计划。负责任的披露 → 24 小时内回应 → 视严重程度发放奖励 + 致谢。',
              en: 'We have a bug bounty. Responsible disclosure → < 24h response → reward + credit per severity.',
            })}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <a
              href="mailto:security@agentrix.top?subject=Security Disclosure"
              className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-6 py-3 text-sm font-bold text-agentrix-ink hover:opacity-90"
            >
              <Mail size={14} /> security@agentrix.top
            </a>
            <Link
              href="/privacy"
              className="inline-flex items-center gap-2 rounded-full border border-agentrix-inkLine bg-white/5 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              {t({ zh: '隐私政策', en: 'Privacy policy' })} <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
