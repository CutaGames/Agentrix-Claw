/**
 * /market/become-creator — Creator onboarding (Sprint W-4 Day 5).
 *
 * Targeting: artists / IP holders / creative tinkerers who want to
 * sell skins on Agentrix Marketplace. Walks through the 5-step
 * journey from PetCreator output to first sale.
 */
import Link from 'next/link';
import { motion } from 'framer-motion';
import { MarketingLayout } from '../../components/marketing/MarketingLayout';
import { buildSeo } from '../../lib/seo';
import { useLocalization } from '../../contexts/LocalizationContext';
import {
  Sparkles, Camera, Tag, Wallet, Trophy,
  ArrowRight, ChevronRight, Mail, Check, X,
} from 'lucide-react';

const STEPS = [
  {
    n: 1,
    icon: Camera,
    title: { zh: '生成你的第一只皮肤', en: 'Generate your first skin' },
    desc: {
      zh: '在 Mobile / Desktop PetCreator 用文生 / 图生 / 双图融合，30 秒出 .vrm。Free 用户每月 3 次，Pro 用户 30 次，Pro+ 无限。',
      en: 'Use PetCreator text-to-pet / image / breed in Mobile or Desktop. .vrm in 30s. Free 3/mo, Pro 30/mo, Pro+ unlimited.',
    },
    cta: { label: { zh: '打开 PetCreator', en: 'Open PetCreator' }, href: '/console/pet/create' },
  },
  {
    n: 2,
    icon: Sparkles,
    title: { zh: '调整 / 命名 / 加 description', en: 'Tune / name / describe' },
    desc: {
      zh: '在 Wardrobe 里给皮肤命名,写 1-2 句 description (会显示在 Marketplace)。建议加 tag(科幻/萌系/限定/Q版) 提升搜索曝光。',
      en: 'Name + 1-2 sentence description (shown on Marketplace). Add tags (sci-fi / kawaii / limited / chibi) to boost search visibility.',
    },
    cta: { label: { zh: '前往衣柜', en: 'Open Wardrobe' }, href: '/console/pet' },
  },
  {
    n: 3,
    icon: Tag,
    title: { zh: '上架 5 步向导', en: 'List in 5 steps' },
    desc: {
      zh: '/market/sell 5 步向导:① 选皮肤 ② 选模式(一口价/拍卖/租赁) ③ 设价格 ④ 设 Remix royalty (10-50%) ⑤ 确认。审核通过后(< 4 小时)自动上架。',
      en: '/market/sell 5-step wizard: 1) pick skin 2) pick mode (fixed/auction/rental) 3) set price 4) set Remix royalty (10-50%) 5) confirm. Listed < 4h after review.',
    },
    cta: { label: { zh: '5 步上架', en: '5-step listing' }, href: '/market/sell' },
  },
  {
    n: 4,
    icon: Trophy,
    title: { zh: '推广 / 反狙击 / Cinderella Boost', en: 'Promote / anti-snipe / Cinderella Boost' },
    desc: {
      zh: '分享你的拍卖到 Twitter / Discord。首位出价者拿 +5% Cinderella Boost(成交后退还出价者),最后 5 分钟有出价自动延 2 分钟,反狙击。',
      en: 'Share auction to Twitter / Discord. First bidder gets +5% Cinderella Boost (refunded on win). Anti-snipe extends 2 minutes if a bid lands in the last 5 minutes.',
    },
    cta: { label: { zh: '查看拍卖大厅', en: 'See auction hall' }, href: '/market/auction' },
  },
  {
    n: 5,
    icon: Wallet,
    title: { zh: '收益自动入 MPC 钱包', en: 'Earnings flow to MPC wallet' },
    desc: {
      zh: '70% GMV 给创作者 / 10% Cinderella Boost / 5-15% 平台抽成(按 Tier)。USDC 自动入金,可导出。被他人 Remix 出售你按 royalty 比例持续分账。',
      en: '70% GMV to creator / 10% Cinderella Boost / 5-15% platform (tier-based). USDC auto-credited; exportable. You earn royalty shares continuously when others Remix and sell.',
    },
    cta: { label: { zh: '钱包总览', en: 'Wallet overview' }, href: '/console/wallet' },
  },
];

const REVENUE_BREAKDOWN = [
  { label: { zh: '创作者拿', en: 'Creator' }, pct: 70, color: 'bg-emerald-500' },
  { label: { zh: 'Cinderella Boost (首位出价者)', en: 'Cinderella Boost (first bidder)' }, pct: 10, color: 'bg-amber-400' },
  { label: { zh: '平台抽成 5-15% (按 Tier)', en: 'Platform fee 5-15% (tier-based)' }, pct: 15, color: 'bg-violet-500' },
  { label: { zh: 'Remix 分成 (10-50% 由你设定)', en: 'Remix royalty (you set 10-50%)' }, pct: 5, color: 'bg-rose-400' },
];

const TIPS = [
  {
    yes: { zh: '设置 7-15 天有效期 + 起拍价低', en: 'Use 7-15 day expiry + low starting bid' },
    no: { zh: '一开始就开高价', en: "Don't start with high price" },
    why: { zh: '低门槛吸引第一批关注 + Cinderella Boost', en: 'Lower friction → first bidders + Cinderella Boost' },
  },
  {
    yes: { zh: '同时上 3-5 只不同风格', en: 'List 3-5 in different styles' },
    no: { zh: '只上 1 只就期待爆款', en: 'Don\'t hope one piece will explode' },
    why: { zh: '不同 tag 吸引不同人群,提升整体曝光', en: 'Different tags reach different audiences' },
  },
  {
    yes: { zh: 'Twitter / 小红书发幕后视频 + 设计稿', en: 'Tweet / post design process + WIP' },
    no: { zh: '只发成品和价格', en: "Don't post only finished work + price" },
    why: { zh: '过程内容比结果内容传播率高 4x', en: 'Process content gets 4x more reach than finished pieces' },
  },
  {
    yes: { zh: '加 #Agentrix #PetSkin tag', en: 'Add #Agentrix #PetSkin tags' },
    no: { zh: '只加自己的 IP 标签', en: "Don't only use your IP-only tag" },
    why: { zh: '我们的运营团队按这两个 tag 找 KOL 资源', en: 'Our growth team scouts these tags for KOL features' },
  },
];

const FAQS = [
  {
    q: { zh: '我没有美术功底,能做创作者吗?', en: 'I have no art skill — can I still create?' },
    a: { zh: '可以。PetCreator 文生模式只需要文字描述。系统会用 Hunyuan3D / Meshy 自动生成 .vrm。我们 80% 的内测创作者从文生开始。', en: 'Yes. Text-to-pet only needs a prompt. System auto-generates .vrm via Hunyuan3D / Meshy. 80% of our beta creators started this way.' },
  },
  {
    q: { zh: '版权问题怎么办?', en: 'What about copyright?' },
    a: { zh: '上架内容必须是原创或获得合法授权。我们会自动 pHash 反查重 + 人工抽审,违规下架并冻结收益。如果你拥有 IP 想做联名,走 /partners 渠道。', en: 'All listings must be original or properly licensed. Auto pHash dedup + manual review. Violations are taken down and earnings frozen. IP-collab? See /partners.' },
  },
  {
    q: { zh: '抽成 5-15% 怎么定?', en: 'How is platform fee 5-15% determined?' },
    a: { zh: '看你的订阅 Tier:Free 15% / Lite 12% / Plus 10% / Pro 7% / Elite 5%。订阅越高,抽成越低。', en: 'Tied to subscription: Free 15% / Lite 12% / Plus 10% / Pro 7% / Elite 5%. Higher tier = lower fee.' },
  },
  {
    q: { zh: '我的皮肤被 Remix 后怎么收钱?', en: 'How am I paid when my skin is Remixed?' },
    a: { zh: '上架时设 Remix royalty (10-50%)。每当衍生作品出售,你的设定比例直接到账。永久,不限时。', en: 'Set Remix royalty (10-50%) on listing. When a derivative sells, your share is auto-paid. Forever, no time limit.' },
  },
];

export default function BecomeCreatorPage() {
  const { t } = useLocalization();
  const seo = buildSeo({
    title: t({ zh: '成为创作者 · Agentrix', en: 'Become a creator · Agentrix' }),
    description: t({
      zh: '5 步从生成到第一笔收益。70% GMV 给创作者 + Remix royalty 永久分成。',
      en: '5 steps from creation to first earning. 70% GMV to creators + perpetual Remix royalty share.',
    }),
    path: '/market/become-creator',
  });

  return (
    <MarketingLayout seo={seo}>
      <section className="relative overflow-hidden border-b border-agentrix-inkLine bg-agentrix-ink py-20">
        <div className="pointer-events-none absolute -top-32 left-1/4 h-[480px] w-[480px] rounded-full bg-violet-500/15 blur-3xl" />
        <div className="container mx-auto max-w-4xl px-6 text-center relative">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-400/10 px-4 py-1 text-xs font-semibold text-violet-300">
            <Sparkles size={12} /> {t({ zh: '创作者引导', en: 'Creator onboarding' })}
          </div>
          <h1 className="text-4xl font-extrabold md:text-5xl leading-tight">
            {t({ zh: '把你的创意变成可交易的数字主宠', en: 'Turn your creativity into tradable digital pets' })}
          </h1>
          <p className="mt-4 text-lg text-agentrix-fog">
            {t({
              zh: '5 步上架 · 70% 给创作者 · Remix 永久分成',
              en: '5 steps to list · 70% to creator · perpetual Remix royalty',
            })}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/market/sell"
              className="inline-flex items-center gap-2 rounded-full bg-violet-500 px-6 py-3 text-sm font-bold text-white hover:bg-violet-600"
            >
              {t({ zh: '直接开始上架', en: 'Start listing' })} <ArrowRight size={14} />
            </Link>
            <Link
              href="/market/leaderboard"
              className="inline-flex items-center gap-2 rounded-full border border-agentrix-inkLine bg-white/5 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              <Trophy size={14} /> {t({ zh: '看创作者排行', en: 'Creator leaderboard' })}
            </Link>
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="bg-agentrix-ink py-16">
        <div className="container mx-auto max-w-4xl px-6">
          <h2 className="mb-10 text-center text-3xl font-bold md:text-4xl">
            {t({ zh: '5 步从生成到第一笔收益', en: '5 steps from creation to first sale' })}
          </h2>
          <div className="space-y-4">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <motion.div
                  key={s.n}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-50px' }}
                  transition={{ duration: 0.4, delay: Math.min(i * 0.05, 0.2) }}
                  className="rounded-2xl border border-agentrix-inkLine bg-agentrix-inkSoft p-5 md:p-6"
                >
                  <div className="grid gap-4 md:grid-cols-[auto_1fr_auto] md:items-center">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-violet-500/15 text-base font-bold text-violet-300">
                        {s.n}
                      </span>
                      <Icon size={22} className="text-agentrix-electric" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white md:text-lg">{t(s.title)}</h3>
                      <p className="mt-1 text-sm text-agentrix-fog leading-relaxed">{t(s.desc)}</p>
                    </div>
                    <Link
                      href={s.cta.href}
                      className="inline-flex items-center gap-1.5 self-start rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/15 md:self-center"
                    >
                      {t(s.cta.label)} <ChevronRight size={12} />
                    </Link>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Revenue split */}
      <section className="border-y border-agentrix-inkLine bg-agentrix-inkSoft/30 py-20">
        <div className="container mx-auto max-w-3xl px-6">
          <h2 className="text-3xl font-bold md:text-4xl text-center">
            {t({ zh: '收入分成怎么算', en: 'Revenue split breakdown' })}
          </h2>
          <p className="mt-3 text-center text-agentrix-fog">
            {t({
              zh: '一笔 100 USDC 的拍卖成交,这是钱的去向:',
              en: 'For a 100 USDC auction sale, here\'s where the money goes:',
            })}
          </p>

          <div className="mt-8 overflow-hidden rounded-xl border border-agentrix-inkLine">
            <div className="flex h-12 w-full">
              {REVENUE_BREAKDOWN.map((b) => (
                <div key={b.label.en} className={`${b.color} relative`} style={{ width: `${b.pct}%` }}>
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">
                    {b.pct}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          <ul className="mt-6 space-y-2">
            {REVENUE_BREAKDOWN.map((b) => (
              <li key={b.label.en} className="flex items-center gap-3 text-sm">
                <span className={`inline-block h-3 w-3 rounded-sm ${b.color}`} />
                <span className="text-agentrix-fog">{t(b.label)}</span>
                <span className="ml-auto font-mono text-agentrix-mist">{b.pct}%</span>
              </li>
            ))}
          </ul>

          <p className="mt-6 text-xs text-agentrix-mist">
            {t({
              zh: '* 平台抽成按订阅 Tier:Free 15% / Lite 12% / Plus 10% / Pro 7% / Elite 5%。订阅越高抽成越低。',
              en: '* Platform fee tied to subscription: Free 15% / Lite 12% / Plus 10% / Pro 7% / Elite 5%. Higher tier, lower fee.',
            })}
          </p>
        </div>
      </section>

      {/* Tips */}
      <section className="bg-agentrix-ink py-20">
        <div className="container mx-auto max-w-4xl px-6">
          <h2 className="text-3xl font-bold md:text-4xl text-center">
            {t({ zh: '4 条来自爆款创作者的建议', en: '4 tips from top sellers' })}
          </h2>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {TIPS.map((tip, i) => (
              <div key={i} className="rounded-2xl border border-agentrix-inkLine bg-agentrix-inkSoft p-5">
                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <Check size={16} className="mt-0.5 flex-shrink-0 text-emerald-400" />
                    <span className="text-white">{t(tip.yes)}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <X size={16} className="mt-0.5 flex-shrink-0 text-rose-400" />
                    <span className="text-agentrix-mist">{t(tip.no)}</span>
                  </div>
                </div>
                <p className="mt-3 border-t border-agentrix-inkLine pt-3 text-xs text-agentrix-fog">
                  💡 {t(tip.why)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-y border-agentrix-inkLine bg-agentrix-inkSoft/30 py-20">
        <div className="container mx-auto max-w-3xl px-6">
          <h2 className="mb-10 text-center text-3xl font-bold">
            {t({ zh: '常见问题', en: 'Frequently asked' })}
          </h2>
          <div className="space-y-3">
            {FAQS.map((f, i) => (
              <details
                key={i}
                className="group rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft p-5 open:border-violet-400/40"
              >
                <summary className="flex cursor-pointer items-center justify-between text-base font-semibold text-white">
                  <span>{t(f.q)}</span>
                  <ChevronRight size={16} className="opacity-50 transition-transform group-open:rotate-90" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-agentrix-fog">{t(f.a)}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-agentrix-ink py-16">
        <div className="container mx-auto max-w-3xl px-6 text-center">
          <Trophy size={36} className="mx-auto mb-4 text-amber-400" />
          <h2 className="text-2xl font-bold md:text-3xl">
            {t({ zh: '准备好开始了?', en: 'Ready to start?' })}
          </h2>
          <p className="mt-3 text-agentrix-fog">
            {t({
              zh: '从创建你的第一只皮肤开始。我们替你处理所有的支付、抽成、Remix 链路。',
              en: 'Start by creating your first skin. We handle payments, fees, and Remix chains for you.',
            })}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/console/pet/create"
              className="inline-flex items-center gap-2 rounded-full bg-violet-500 px-6 py-3 text-sm font-bold text-white hover:bg-violet-600"
            >
              {t({ zh: '打开 PetCreator', en: 'Open PetCreator' })} <ArrowRight size={14} />
            </Link>
            <Link
              href="/partners#kol"
              className="inline-flex items-center gap-2 rounded-full border border-agentrix-inkLine bg-white/5 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              <Mail size={14} /> {t({ zh: '申请创作者大使', en: 'Apply as ambassador' })}
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
