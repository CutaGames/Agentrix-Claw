/**
 * Three-Side Ecosystem — supply / consume / connect identities.
 */
import Link from 'next/link';
import { Store, Users, Handshake, ArrowRight } from 'lucide-react';
import { useLocalization } from '../../../contexts/LocalizationContext';

const THREE_SIDES = [
  {
    icon: Store,
    title: { zh: '🔧 我是供给方', en: '🔧 I supply' },
    desc: {
      zh: '发布技能 / 皮肤 / 商品 / 硬件 / 游戏。订阅档位越高，发布配额越大，曝光权重越高。',
      en: 'Publish skills / skins / products / hardware / games. Higher tier = more quota + more exposure.',
    },
    cta: { zh: '了解创作者分成 →', en: 'Learn creator revenue →' },
    ctaHref: '/developers',
  },
  {
    icon: Users,
    title: { zh: '👥 我是需求方', en: '👥 I consume' },
    desc: {
      zh: '陪伴 AI 宠物 + 让宠物接任务赚钱 + 在集市消费。订阅档位越高，LLM 预算越大，宠物越多。',
      en: 'Companion AI pets + let pets earn via tasks + shop in marketplace. Higher tier = more LLM budget + more pets.',
    },
    cta: { zh: '开始养宠 →', en: 'Start raising →' },
    ctaHref: '/downloads',
  },
  {
    icon: Handshake,
    title: { zh: '🤝 我是关系方', en: '🤝 I connect' },
    desc: {
      zh: '推广赚佣金 + 共养好友宠物 + 建公会 + 做 KOL。订阅档位越高，佣金比例越高，裂变 AXP 越多。',
      en: 'Earn referral commissions + co-raise friends\' pets + build guilds + be a KOL. Higher tier = higher commission + more AXP.',
    },
    cta: { zh: '加入推广 →', en: 'Join referral →' },
    ctaHref: '/invite',
  },
];

export function ThreeSideEcosystem() {
  const { t } = useLocalization();
  return (
    <section className="bg-agentrix-ink py-20 md:py-28">
      <div className="container mx-auto px-6">
        <div className="mx-auto mb-14 max-w-3xl text-center">
          <h2 className="text-3xl font-bold md:text-4xl">
            {t({ zh: '一个账号，所有能力', en: 'One account. Every capability.' })}
          </h2>
          <p className="mt-3 text-agentrix-fog">
            {t({
              zh: '在 Agentrix 里，你同时是消费者 / 创作者 / 商家 / 推广者 / 家长。订阅升级 = 配额提升，不是"买新身份"。',
              en: 'In Agentrix you are simultaneously consumer / creator / merchant / promoter / parent. Upgrading = more quota, not a new identity.',
            })}
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {THREE_SIDES.map((side) => {
            const Icon = side.icon;
            return (
              <div
                key={side.title.en}
                className="rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft p-6 transition-colors hover:border-agentrix-electric/50"
              >
                <Icon size={28} className="text-agentrix-electric" />
                <h3 className="mt-4 text-lg font-bold text-white">{t(side.title)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-agentrix-fog">{t(side.desc)}</p>
                <Link
                  href={side.ctaHref}
                  className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-agentrix-electric hover:underline"
                >
                  {t(side.cta)} <ArrowRight size={12} />
                </Link>
              </div>
            );
          })}
        </div>
        <p className="mt-10 text-center text-sm text-agentrix-mist">
          {t({
            zh: '所有交互以宠物 Agent 为载体 · 结算 = MPC + X402 + Commission V4 · 激励 = AXP 积分',
            en: 'All interactions via Pet Agents · Settlement = MPC + X402 + Commission V4 · Incentive = AXP points',
          })}
        </p>
      </div>
    </section>
  );
}
