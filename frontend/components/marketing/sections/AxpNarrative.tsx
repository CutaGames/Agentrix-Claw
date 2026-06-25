/**
 * AXP narrative — points system intro (6 earn + 5 spend + cashback ladder).
 */
import Link from 'next/link';
import {
  Gift, MessageCircle, Users, Rocket, Coins, Trophy, Check, ArrowRight,
} from 'lucide-react';
import { useLocalization } from '../../../contexts/LocalizationContext';

const AXP_EARN_SOURCES = [
  { icon: Gift,           label: { zh: '🎁 每日签到 +20 AXP',          en: '🎁 Daily check-in +20 AXP' } },
  { icon: MessageCircle,  label: { zh: '💬 聊 10 轮 +20 AXP',          en: '💬 Chat 10 rounds +20 AXP' } },
  { icon: Users,          label: { zh: '👬 共养好友宠物 +5 AXP',         en: '👬 Co-raise friend\'s pet +5 AXP' } },
  { icon: Rocket,         label: { zh: '🔗 推广新用户 +500 AXP',        en: '🔗 Refer new user +500 AXP' } },
  { icon: Coins,          label: { zh: '💰 消费返现（按档位 5-20%）',    en: '💰 Cashback (5-20% by tier)' } },
  { icon: Trophy,         label: { zh: '🏆 游戏大赛 / 成就解锁',          en: '🏆 Game contests / achievements' } },
];

const AXP_SPEND_USES = [
  { label: { zh: '💳 订阅续费抵扣（≤20%）',           en: '💳 Subscription redeem (≤20%)' } },
  { label: { zh: '⚡ 技能购买抵扣（≤20%）',            en: '⚡ Skill purchase redeem (≤20%)' } },
  { label: { zh: '👕 皮肤购买抵扣（≤20%）',            en: '👕 Skin purchase redeem (≤20%)' } },
  { label: { zh: '🎯 集市置顶 / A2A 优先匹配',          en: '🎯 Marketplace boost / A2A priority' } },
  { label: { zh: '🎰 抽奖 / 限定兑换',                  en: '🎰 Lottery / exclusive redemption' } },
];

const AXP_CASHBACK_TABLE = [
  { tier: 'Free',  rate: '0%' },
  { tier: 'Lite',  rate: '5%' },
  { tier: 'Plus',  rate: '10%' },
  { tier: 'Pro',   rate: '15%' },
  { tier: 'Elite', rate: '20%' },
];

export function AxpNarrative() {
  const { t } = useLocalization();
  return (
    <section id="axp" className="border-t border-agentrix-inkLine bg-agentrix-ink py-20 md:py-28">
      <div className="container mx-auto px-6">
        <div className="mx-auto mb-14 max-w-3xl text-center">
          <h2 className="text-3xl font-bold md:text-4xl">
            {t({ zh: '💎 AXP 积分体系', en: '💎 AXP Points System' })}
          </h2>
          <p className="mt-3 text-agentrix-fog">
            {t({
              zh: '1 AXP = $0.001 · 轻度通缩 · 12 个月过期 FIFO · 中国区友好（软积分非证券）',
              en: '1 AXP = $0.001 · mildly deflationary · 12-month FIFO expiry · China-friendly (soft points, not securities)',
            })}
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Earn */}
          <div className="rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft p-6">
            <h3 className="mb-4 text-lg font-bold text-white">
              {t({ zh: '6 大获得方式', en: '6 ways to earn' })}
            </h3>
            <ul className="space-y-3">
              {AXP_EARN_SOURCES.map((s) => (
                <li key={s.label.en} className="flex items-center gap-3 text-sm text-agentrix-fog">
                  <s.icon size={16} className="shrink-0 text-agentrix-solar" />
                  <span>{t(s.label)}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Spend */}
          <div className="rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft p-6">
            <h3 className="mb-4 text-lg font-bold text-white">
              {t({ zh: '5 大使用场景', en: '5 ways to spend' })}
            </h3>
            <ul className="space-y-3">
              {AXP_SPEND_USES.map((s) => (
                <li key={s.label.en} className="flex items-center gap-3 text-sm text-agentrix-fog">
                  <Check size={14} className="shrink-0 text-agentrix-electric" />
                  <span>{t(s.label)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Cashback ladder */}
        <div className="mx-auto mt-10 max-w-md rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft p-6">
          <h3 className="mb-4 text-center text-base font-bold text-white">
            {t({ zh: '消费返现阶梯（买 $100 返 AXP）', en: 'Cashback ladder (buy $100 → AXP)' })}
          </h3>
          <div className="space-y-2">
            {AXP_CASHBACK_TABLE.map((row) => (
              <div key={row.tier} className="flex items-center justify-between rounded-lg bg-white/5 px-4 py-2 text-sm">
                <span className="font-medium text-white">{row.tier}</span>
                <span className={`font-bold ${row.rate === '10%' ? 'text-agentrix-solar' : 'text-agentrix-fog'}`}>
                  {row.rate === '0%' ? t({ zh: '无返现', en: 'No cashback' }) : row.rate}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 text-center">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-1 text-xs font-semibold text-agentrix-electric hover:underline"
            >
              {t({ zh: '查看完整定价 →', en: 'View full pricing →' })} <ArrowRight size={12} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
