import React from 'react';
import Link from 'next/link';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { useLocalization } from '../../../contexts/LocalizationContext';

export default function PromoteCenterPage() {
  const { t } = useLocalization();

  return (
    <ConsoleLayout title={t({ zh: '🔗 推广中心', en: '🔗 Promote Center' })}>
      <p className="mb-6 text-sm text-gray-400">
        {t({ zh: '推广链接 + 佣金 + 共养邀请 + 贺卡收件 + AXP 收入，一屏管理。', en: 'Referral links + commissions + co-raising invites + greeting inbox + AXP income, all in one.' })}
      </p>

      {/* Stats */}
      <div className="mb-8 grid gap-4 sm:grid-cols-4">
        {[
          { label: t({ zh: '推广链接', en: 'Referral Links' }), value: '12' },
          { label: t({ zh: '本月佣金', en: 'Monthly Commission' }), value: '$34.50' },
          { label: t({ zh: '共养邀请', en: 'Co-Raising Invites' }), value: '8' },
          { label: t({ zh: 'AXP 推广收入', en: 'AXP Referral Income' }), value: '4,500' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-gray-700 bg-gray-800/30 p-4 text-center">
            <p className="text-xs text-gray-500">{stat.label}</p>
            <p className="mt-1 text-xl font-bold">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Quick links */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/console/promote/co-raising" className="rounded-lg border border-gray-700 bg-gray-800/30 p-4 hover:border-indigo-500/50">
          <h3 className="font-bold">🌱 {t({ zh: '我的共养', en: 'My Co-Raising' })}</h3>
          <p className="mt-1 text-xs text-gray-400">{t({ zh: '管理共养邀请、查看好友喂养活动', en: 'Manage invites, view friend feeding activity' })}</p>
        </Link>
        <Link href="/console/promote/greeting-inbox" className="rounded-lg border border-gray-700 bg-gray-800/30 p-4 hover:border-indigo-500/50">
          <h3 className="font-bold">🎁 {t({ zh: '贺卡收件', en: 'Greeting Inbox' })}</h3>
          <p className="mt-1 text-xs text-gray-400">{t({ zh: '查看收到的贺卡、回复', en: 'View received cards, reply' })}</p>
        </Link>
      </div>

      {/* Commission history placeholder */}
      <h3 className="mt-8 mb-4 text-lg font-bold">{t({ zh: '佣金记录', en: 'Commission History' })}</h3>
      <div className="rounded-lg border border-gray-700 bg-gray-800/30 p-6 text-center text-sm text-gray-500">
        {t({ zh: '佣金记录将从 /console/wallet/commission 合并到此处（W4 完善）', en: 'Commission history will be merged here from /console/wallet/commission (W4)' })}
      </div>
    </ConsoleLayout>
  );
}
