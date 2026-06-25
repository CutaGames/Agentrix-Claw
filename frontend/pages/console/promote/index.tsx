/**
 * Promote Center — unified hub for all growth / referral / co-raising tools.
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { Card, CardHeader, CardBody, Stat } from '../../../components/ui/ax';
import { coRaisingApi } from '../../../lib/api/coraising.api';
import {
  Sprout,
  Gift,
  Link as LinkIcon,
  TrendingUp,
  Coins,
  ArrowRight,
  ClipboardList,
} from 'lucide-react';

export default function PromoteCenterPage() {
  const { t } = useLocalization();
  const [coRaisingCount, setCoRaisingCount] = useState<number | null>(null);

  useEffect(() => {
    // Graceful fetch — if backend not ready, silently show 0
    coRaisingApi
      .listMyInvites(50)
      .then((data) => setCoRaisingCount((data.items ?? []).length))
      .catch(() => setCoRaisingCount(0));
  }, []);

  return (
    <ConsoleLayout title={t({ zh: '🔗 推广中心', en: '🔗 Promote Center' })}>
      <p className="mb-6 text-sm text-agentrix-fog">
        {t({
          zh: '推广链接 + 佣金 + 共养邀请 + 贺卡收件 + AXP 收入，一屏管理。',
          en: 'Referral links + commissions + co-raising invites + greeting inbox + AXP income, all in one.',
        })}
      </p>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat
          label={t({ zh: '推广链接', en: 'Referral Links' })}
          value="12"
          icon={<LinkIcon size={16} />}
        />
        <Stat
          label={t({ zh: '本月佣金', en: 'Monthly Commission' })}
          value="$34.50"
          icon={<TrendingUp size={16} />}
          accent="success"
        />
        <Stat
          label={t({ zh: '共养邀请', en: 'Co-Raising Invites' })}
          value={coRaisingCount == null ? '—' : String(coRaisingCount)}
          icon={<Sprout size={16} />}
          accent="accent"
        />
        <Stat
          label={t({ zh: 'AXP 推广收入', en: 'AXP Referral Income' })}
          value="4,500"
          icon={<Coins size={16} />}
          accent="warm"
        />
      </div>

      {/* Quick links */}
      <div className="grid gap-4 md:grid-cols-2">
        <QuickLinkCard
          href="/console/promote/co-raising"
          icon={<Sprout size={20} className="text-agentrix-electric" />}
          title={t({ zh: '我的共养', en: 'My Co-Raising' })}
          desc={t({
            zh: '管理共养邀请、查看好友喂养活动',
            en: 'Manage invites, view friend feeding activity',
          })}
          badge={coRaisingCount != null ? `${coRaisingCount}` : undefined}
        />
        <QuickLinkCard
          href="/console/promote/greeting-inbox"
          icon={<Gift size={20} className="text-agentrix-solar" />}
          title={t({ zh: '贺卡收件', en: 'Greeting Inbox' })}
          desc={t({ zh: '查看收到的贺卡、回复', en: 'View received cards, reply' })}
        />
        <QuickLinkCard
          href="/console/wallet/commission"
          icon={<TrendingUp size={20} className="text-agentrix-success" />}
          title={t({ zh: '佣金记录', en: 'Commission Records' })}
          desc={t({
            zh: '查看分佣明细、结算批次',
            en: 'View commission details, settlement batches',
          })}
        />
        <QuickLinkCard
          href="/console/wallet/referral"
          icon={<LinkIcon size={20} className="text-agentrix-purpleSoft" />}
          title={t({ zh: '推广链接', en: 'Referral Links' })}
          desc={t({ zh: '生成推广链接，复制分享', en: 'Generate referral links, copy & share' })}
        />
      </div>

      {/* How it works */}
      <Card className="mt-8">
        <CardHeader
          icon={<ClipboardList size={18} className="text-agentrix-electric" />}
          title={t({ zh: '推广玩法', en: 'How it works' })}
        />
        <CardBody>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                n: '1',
                title: t({ zh: '生成链接', en: 'Generate link' }),
                desc: t({
                  zh: '创建共养邀请或推广链接，支持自定义分成比例。',
                  en: 'Create a co-raising invite or referral link with custom split.',
                }),
              },
              {
                n: '2',
                title: t({ zh: '分享给朋友', en: 'Share with friends' }),
                desc: t({
                  zh: '通过社交媒体、私信或扫码分享。对方无需注册即可预览。',
                  en: 'Share via socials, DMs or QR code. Friends can preview without signup.',
                }),
              },
              {
                n: '3',
                title: t({ zh: '自动分成 AXP', en: 'Auto AXP split' }),
                desc: t({
                  zh: '好友互动、注册、消费后，AXP 按比例自动分账。',
                  en: 'When friends engage / signup / purchase, AXP splits automatically.',
                }),
              },
            ].map((step) => (
              <div
                key={step.n}
                className="rounded-xl border border-agentrix-inkLine bg-agentrix-ink/40 p-4"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-agentrix-electric/30 to-agentrix-purpleSoft/30 text-sm font-bold text-white">
                  {step.n}
                </div>
                <h4 className="mt-3 text-sm font-bold text-white">{step.title}</h4>
                <p className="mt-1 text-xs text-agentrix-mist leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </ConsoleLayout>
  );
}

function QuickLinkCard({
  href,
  icon,
  title,
  desc,
  badge,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  badge?: string;
}): React.ReactElement {
  return (
    <Link
      href={href}
      className="group relative block rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft p-5 transition-all hover:border-agentrix-electric/40 hover:shadow-lg hover:shadow-agentrix-electric/5 hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            {icon}
            <h3 className="text-base font-bold text-white">{title}</h3>
            {badge != null && (
              <span className="rounded-full bg-agentrix-electric/20 px-2 py-0.5 text-[10px] font-bold text-agentrix-electric">
                {badge}
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-agentrix-mist leading-relaxed">{desc}</p>
        </div>
        <ArrowRight
          size={16}
          className="text-agentrix-mist transition-transform group-hover:translate-x-1 group-hover:text-agentrix-electric"
        />
      </div>
    </Link>
  );
}
