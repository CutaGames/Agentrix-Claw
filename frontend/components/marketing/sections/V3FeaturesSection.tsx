/**
 * V4 Capabilities — 8 major features (V3 carry-over + V4 increments).
 *
 * V3 baseline: Living Pet, Wallet, Presence, Family, Auto-Earn, Memory.
 * V4 layer: PetCreator camera scan, Cinderella Boost / Skin Marketplace,
 * NFC blind boxes, Toy pairing, NFT mint, ClawCore SDK.
 */
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Sparkles, Wallet, ShieldCheck, Briefcase, Heart, TrendingUp,
  ArrowRight, Smartphone, Camera, Bluetooth, Layers, Trophy, Tag,
} from 'lucide-react';
import { useLocalization } from '../../../contexts/LocalizationContext';

const V4_FEATURES: Array<{
  icon: typeof Sparkles;
  title: { zh: string; en: string };
  desc: { zh: string; en: string };
  href: string;
  isV4New?: boolean;
}> = [
  {
    icon: Heart,
    title: { zh: '🐾 Living Pet · 主宠系统', en: '🐾 Living Pet System' },
    desc: { zh: '具备 10 种情绪 / 亲密度等级 / VRM 高保真形象的数字伴侣，跨 5 端实时同步状态。', en: 'Digital companion with 10 emotions, intimacy levels and VRM hi-fi avatar — synced live across 5 surfaces.' },
    href: '/console/presence',
  },
  {
    icon: Layers,
    title: { zh: '✨ 灵魂 × 皮肤（V4 新）', en: '✨ Soul × Skin (V4 new)' },
    desc: { zh: '28 签名灵魂 + 6 族群可选；皮肤可换 / 可买 / 可繁殖 / 可融合，外观与个性完全解耦。', en: '28 signature souls × 6 clans. Skins are switchable, tradable, breedable, and remixable — appearance fully decoupled from personality.' },
    href: '/clans',
    isV4New: true,
  },
  {
    icon: Camera,
    title: { zh: '📸 PetCreator · 4 模式生成（V4 新）', en: '📸 PetCreator · 4 modes (V4 new)' },
    desc: { zh: '文生 / 图生 / 双图融合（繁殖）/ 摄像头扫描真实物体生成主宠 — 30 秒出 .vrm。', en: 'Text-to-pet / image-to-pet / 2-parent breed / camera scan from real-world objects — .vrm output in 30s.' },
    href: '/console/pet/create',
    isV4New: true,
  },
  {
    icon: Trophy,
    title: { zh: '🛒 Skin Marketplace（V4 新）', en: '🛒 Skin Marketplace (V4 new)' },
    desc: { zh: '一口价 / 拍卖 / 租赁 / 衍生分成（Cinderella Boost +5% 给首位出价者，反狙击最后 5 分钟自动延时）。', en: 'Fixed price / auction / rental / Remix royalty splits. Cinderella Boost +5% to the first bidder, anti-snipe extension on final 5 min.' },
    href: '/market',
    isV4New: true,
  },
  {
    icon: Wallet,
    title: { zh: '💰 钱包总览 · 法币 + 加密', en: '💰 Unified Wallet (Fiat + Crypto)' },
    desc: { zh: 'MPC 3-share 钱包 · 法币 / 稳定币 / 原生 token 一张表查看 · X402 / ERC-8004 链上结算。', en: 'MPC 3-share wallet. Fiat, stablecoins and native tokens in one view. X402 / ERC-8004 on-chain settlement.' },
    href: '/console/wallet',
  },
  {
    icon: Tag,
    title: { zh: '🪙 AXP 经济系统', en: '🪙 AXP Economy' },
    desc: { zh: '1 AXP = $0.001 · 签到 / 对话 / 推广 / 消费返现 4 路获得；可抵扣订阅 / 兑换限定皮肤 / 抽奖 / NFT 预售。', en: '1 AXP = $0.001 · earn via check-in / chat / refer / cashback. Spend on subscriptions, limited skins, lottery, NFT presale.' },
    href: '/console/axp',
  },
  {
    icon: Bluetooth,
    title: { zh: '🎮 Toy / NFC 实物联动（V4 新）', en: '🎮 Toy / NFC Physical Tie-in (V4 new)' },
    desc: { zh: 'NFC 盲盒 / 卡牌碰触解锁限定皮肤；ClawCore Toy 蓝牙配对成为主宠的实体载体。', en: 'NFC blind box / card tap unlocks limited skins. ClawCore Toy BLE pairs as the physical body of your pet.' },
    href: '/security#nfc',
    isV4New: true,
  },
  {
    icon: TrendingUp,
    title: { zh: '⚡ Auto-Earn + A2A 经济', en: '⚡ Auto-Earn + A2A Economy' },
    desc: { zh: 'Agent 通过 Skill 调用 / A2A 任务 / 分佣自动产生收入，时间线实时可见，按预算池上限管控。', en: 'Agents earn autonomously via skill calls, A2A trades and commissions. Live timeline + budget pool caps.' },
    href: '/console/wallet/auto-earn',
  },
];

export function V3FeaturesSection() {
  const { t } = useLocalization();
  return (
    <section id="v4-features" className="border-y border-agentrix-inkLine bg-agentrix-ink py-20">
      <div className="container mx-auto px-6">
        <div className="mb-12 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-agentrix-electric/40 bg-agentrix-electric/10 px-4 py-1 text-xs font-semibold text-agentrix-electric">
            <Sparkles size={12} /> v4.0 · {t({ zh: '本次重大更新', en: 'Major release' })}
          </div>
          <h2 className="text-3xl font-bold md:text-4xl">
            {t({ zh: '不只是聊天 — 一个真正会陪你、帮你、替你赚钱的 Agent', en: 'Beyond chat — an agent that lives with you, works for you and earns for you' })}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-base text-agentrix-fog">
            {t({
              zh: 'V4 上线 8 大能力 — 4 项 V4 新增（标 NEW）+ 4 项 V3 沿用强化。每张卡片可点击进入实时体验。',
              en: '8 capabilities live in V4 — 4 brand new (tagged NEW) + 4 carried over from V3. Click any card to try.',
            })}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
          {V4_FEATURES.map((f, i) => {
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
                  className="group relative block h-full rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft p-6 transition-all hover:border-agentrix-electric/60 hover:bg-agentrix-inkSoft/80"
                >
                  {f.isV4New && (
                    <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-agentrix-electric/15 border border-agentrix-electric/40 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-agentrix-electric">
                      V4 New
                    </span>
                  )}
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
