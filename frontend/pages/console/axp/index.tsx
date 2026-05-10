import React from 'react';
import Link from 'next/link';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { useLocalization } from '../../../contexts/LocalizationContext';

export default function AxpCenterPage() {
  const { t } = useLocalization();

  // Mock data — W3 real API: GET /api/v1/axp/balance + /history
  const balance = { balance: 12340, lifetimeEarned: 45600, lifetimeSpent: 33260, expiringSoon: 2000, expiringAt: '2026-06-15' };
  const history = [
    { id: '1', amount: 20, source: 'daily_checkin', created_at: '2026-05-10T08:00:00Z' },
    { id: '2', amount: 20, source: 'chat_rounds', created_at: '2026-05-10T09:30:00Z' },
    { id: '3', amount: -2000, source: 'subscription_redeem', created_at: '2026-05-09T12:00:00Z' },
    { id: '4', amount: 500, source: 'referral_signup', created_at: '2026-05-08T15:00:00Z' },
    { id: '5', amount: 5, source: 'co_raising_feed', created_at: '2026-05-08T10:00:00Z' },
  ];

  return (
    <ConsoleLayout title={t({ zh: '💎 AXP 中心', en: '💎 AXP Center' })}>
      {/* Balance card */}
      <div className="mb-8 rounded-xl border border-gray-700 bg-gradient-to-r from-purple-900/30 to-cyan-900/20 p-6">
        <div className="flex items-end gap-2">
          <span className="text-4xl font-extrabold">{balance.balance.toLocaleString()}</span>
          <span className="pb-1 text-sm text-gray-400">AXP</span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-gray-500">{t({ zh: '累计获得', en: 'Lifetime earned' })}</p>
            <p className="font-bold text-green-400">+{balance.lifetimeEarned.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-gray-500">{t({ zh: '累计消耗', en: 'Lifetime spent' })}</p>
            <p className="font-bold text-orange-400">-{balance.lifetimeSpent.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-gray-500">{t({ zh: '即将过期', en: 'Expiring soon' })}</p>
            <p className="font-bold text-red-400">{balance.expiringSoon.toLocaleString()}</p>
            <p className="text-xs text-gray-600">{balance.expiringAt}</p>
          </div>
        </div>
        <div className="mt-4 flex gap-3">
          <Link href="/console/axp/shop" className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700">
            {t({ zh: '兑换商店', en: 'Reward Shop' })}
          </Link>
          <button className="rounded-lg bg-gray-700 px-4 py-2 text-xs font-bold text-white hover:bg-gray-600">
            {t({ zh: '每日签到 +20', en: 'Daily check-in +20' })}
          </button>
        </div>
      </div>

      {/* History */}
      <h3 className="mb-4 text-lg font-bold">{t({ zh: '流水记录', en: 'Transaction History' })}</h3>
      <div className="space-y-2">
        {history.map((entry) => (
          <div key={entry.id} className="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-800/30 px-4 py-3">
            <div>
              <p className="text-sm font-medium">{entry.source.replace(/_/g, ' ')}</p>
              <p className="text-xs text-gray-500">{new Date(entry.created_at).toLocaleString()}</p>
            </div>
            <span className={`text-sm font-bold ${entry.amount > 0 ? 'text-green-400' : 'text-orange-400'}`}>
              {entry.amount > 0 ? '+' : ''}{entry.amount} AXP
            </span>
          </div>
        ))}
      </div>
    </ConsoleLayout>
  );
}
