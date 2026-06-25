/**
 * AXP Center — v4 page with real API integration.
 *
 * Endpoints:
 *  - GET  /api/v1/axp/balance
 *  - GET  /api/v1/axp/history
 *  - GET  /api/v1/axp/checkin/status
 *  - POST /api/v1/axp/checkin
 *
 * Graceful degradation: if the backend is not yet ready (W3 rollout),
 * the page falls back to read-only mock data so users don't see a crash.
 */
import React from 'react';
import { Coins, Gift, TrendingUp, TrendingDown, Clock, Sparkles, ShoppingBag, Flame, AlertCircle } from 'lucide-react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { useToast } from '../../../contexts/ToastContext';
import { Button, Badge, Skeleton, SkeletonRow } from '../../../components/ui/ax';
import { axpApi, AXP_SOURCE_LABELS, type AxpBalance, type AxpLedgerEntry, type CheckinStatus } from '../../../lib/api/axp.api';

// Mock fallback used only when backend is unavailable (W3 rollout buffer)
const MOCK_BALANCE: AxpBalance = {
  balance: 12340,
  lifetime_earned: 45600,
  lifetime_spent: 33260,
  expiring_soon: 2000,
  expiring_at: '2026-06-15',
};
const MOCK_HISTORY: AxpLedgerEntry[] = [
  { id: '1', amount: 20,   source: 'daily_checkin',        created_at: '2026-05-10T08:00:00Z' },
  { id: '2', amount: 20,   source: 'chat_rounds',          created_at: '2026-05-10T09:30:00Z' },
  { id: '3', amount: -2000,source: 'subscription_redeem',  created_at: '2026-05-09T12:00:00Z' },
  { id: '4', amount: 500,  source: 'referral_signup',      created_at: '2026-05-08T15:00:00Z' },
  { id: '5', amount: 5,    source: 'co_raising_feed',      created_at: '2026-05-08T10:00:00Z' },
];

export default function AxpCenterPage() {
  const { t, language } = useLocalization();
  const toast = useToast();
  const [balance, setBalance] = React.useState<AxpBalance | null>(null);
  const [history, setHistory] = React.useState<AxpLedgerEntry[]>([]);
  const [checkinStatus, setCheckinStatus] = React.useState<CheckinStatus | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [usingMock, setUsingMock] = React.useState(false);
  const [checkingIn, setCheckingIn] = React.useState(false);

  const reload = React.useCallback(async () => {
    setLoading(true);
    try {
      const [b, h, s] = await Promise.allSettled([
        axpApi.getBalance(),
        axpApi.listHistory(undefined, 30),
        axpApi.getCheckinStatus(),
      ]);
      if (b.status === 'fulfilled' && h.status === 'fulfilled') {
        setBalance(b.value);
        setHistory(h.value.items);
        setCheckinStatus(s.status === 'fulfilled' ? s.value : null);
        setUsingMock(false);
      } else {
        // Fall back to mock so the UI is never blank during backend rollout
        setBalance(MOCK_BALANCE);
        setHistory(MOCK_HISTORY);
        setCheckinStatus({ canCheckin: true, streak: 3 });
        setUsingMock(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void reload(); }, [reload]);

  const handleCheckin = async () => {
    if (checkingIn || !checkinStatus?.canCheckin) return;
    setCheckingIn(true);
    try {
      const r = await axpApi.checkin();
      toast.success(t({ zh: `签到成功 +${r.earned} AXP · 连续 ${r.streak} 天`, en: `Check-in +${r.earned} AXP · ${r.streak} day streak` }));
      await reload();
    } catch (e) {
      const msg = (e as { message?: string })?.message;
      toast.error(msg || t({ zh: '签到失败，请稍后再试', en: 'Check-in failed, please retry' }));
    } finally {
      setCheckingIn(false);
    }
  };

  const fmt = (n: number) => n.toLocaleString();
  const monthsLeft = balance?.expiring_at
    ? Math.max(0, Math.ceil((new Date(balance.expiring_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30)))
    : 0;

  return (
    <ConsoleLayout
      title={t({ zh: 'AXP 中心', en: 'AXP Center' })}
      subtitle={t({ zh: '查看积分余额、流水与签到。1 AXP = $0.001 · 12 个月 FIFO 过期。', en: 'Track balance, ledger and check-ins. 1 AXP = $0.001 · 12-month FIFO expiry.' })}
      action={
        <div className="flex items-center gap-2">
          {usingMock && (
            <Badge variant="warning" size="sm">
              <AlertCircle className="h-3 w-3" />
              {t({ zh: '示例数据', en: 'Mock data' })}
            </Badge>
          )}
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<ShoppingBag />}
            onClick={() => { window.location.href = '/console/axp/shop'; }}
          >
            {t({ zh: '兑换商店', en: 'Shop' })}
          </Button>
        </div>
      }
    >
      {/* Hero balance card */}
      <section className="relative mb-8 overflow-hidden rounded-ax-xl border border-ax-line bg-gradient-to-br from-ax-purple/15 via-ax-panel to-ax-accent/10 p-6 md:p-8">
        {/* Decorative orbs */}
        <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-ax-accent/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-ax-purple/12 blur-3xl" />

        <div className="relative flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          {/* Balance */}
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-ax-mist uppercase tracking-[0.12em] font-semibold">
              <Coins className="h-3.5 w-3.5 text-ax-warm" />
              {t({ zh: '可用余额', en: 'Available balance' })}
            </div>
            <div className="mt-3 flex items-baseline gap-3">
              {loading ? (
                <Skeleton className="h-12 w-48" />
              ) : (
                <>
                  <span className="ax-text-gradient text-5xl font-extrabold tabular-nums tracking-tight md:text-6xl">
                    {fmt(balance?.balance ?? 0)}
                  </span>
                  <span className="text-base font-bold text-ax-fog">AXP</span>
                </>
              )}
            </div>
            <p className="mt-1.5 text-xs text-ax-mist">
              ≈ ${((balance?.balance ?? 0) / 1000).toFixed(2)} {t({ zh: '可抵扣价值', en: 'in redeemable value' })}
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2.5 md:items-end">
            <Button
              variant={checkinStatus?.canCheckin === false ? 'secondary' : 'warm'}
              size="lg"
              loading={checkingIn}
              disabled={loading || checkinStatus?.canCheckin === false}
              leftIcon={<Gift />}
              onClick={handleCheckin}
            >
              {checkinStatus?.canCheckin === false
                ? t({ zh: '今日已签到', en: 'Checked in today' })
                : t({ zh: '每日签到 +20', en: 'Daily check-in +20' })}
            </Button>
            {checkinStatus && checkinStatus.streak > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-ax-warm/12 px-3 py-1 text-xs font-semibold text-ax-warm">
                <Flame className="h-3.5 w-3.5" />
                {t({ zh: `连续签到 ${checkinStatus.streak} 天`, en: `${checkinStatus.streak} day streak` })}
              </span>
            )}
          </div>
        </div>

        {/* Quick stats */}
        <div className="relative mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MiniStat
            icon={<TrendingUp />}
            label={t({ zh: '累计获得', en: 'Lifetime earned' })}
            value={loading ? null : `+${fmt(balance?.lifetime_earned ?? 0)}`}
            accent="success"
          />
          <MiniStat
            icon={<TrendingDown />}
            label={t({ zh: '累计消耗', en: 'Lifetime spent' })}
            value={loading ? null : `-${fmt(balance?.lifetime_spent ?? 0)}`}
            accent="warm"
          />
          <MiniStat
            icon={<Clock />}
            label={t({ zh: '即将过期', en: 'Expiring soon' })}
            value={loading ? null : fmt(balance?.expiring_soon ?? 0)}
            hint={balance?.expiring_at
              ? t({ zh: `${monthsLeft} 个月后`, en: `in ~${monthsLeft} months` })
              : undefined}
            accent="danger"
          />
        </div>
      </section>

      {/* Ledger history */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ax-ink">{t({ zh: '流水记录', en: 'Transaction History' })}</h2>
          <span className="text-xs text-ax-mist">
            {t({ zh: `最近 ${history.length} 条`, en: `Recent ${history.length}` })}
          </span>
        </div>

        <div className="rounded-ax-lg border border-ax-line bg-ax-panel/60 backdrop-blur-sm">
          {loading ? (
            <div className="divide-y divide-ax-line/60 p-2">
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="px-3"><SkeletonRow /></div>)}
            </div>
          ) : history.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Sparkles className="mx-auto h-8 w-8 text-ax-mist mb-3" />
              <p className="text-sm text-ax-fog">{t({ zh: '暂无流水记录', en: 'No transactions yet' })}</p>
              <p className="mt-1 text-xs text-ax-mist">{t({ zh: '签到、对话、推广都能获得 AXP', en: 'Earn AXP by check-in, chatting and referring' })}</p>
            </div>
          ) : (
            <div className="divide-y divide-ax-line/60">
              {history.map((entry) => {
                const meta = AXP_SOURCE_LABELS[entry.source] ?? { zh: entry.source, en: entry.source, icon: '•' };
                const positive = entry.amount > 0;
                return (
                  <div key={entry.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.02]">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-ax-sm bg-white/[0.04] text-base">
                      {meta.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ax-ink">{language === 'zh' ? meta.zh : meta.en}</p>
                      <p className="text-xs text-ax-mist">
                        {new Date(entry.created_at).toLocaleString(language === 'zh' ? 'zh-CN' : undefined, {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <span className={`text-sm font-bold tabular-nums ${positive ? 'text-ax-success' : 'text-ax-warm'}`}>
                      {positive ? '+' : ''}{fmt(entry.amount)} AXP
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </ConsoleLayout>
  );
}

function MiniStat({
  icon, label, value, hint, accent,
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  accent: 'success' | 'warm' | 'danger';
}) {
  const ring =
    accent === 'success' ? 'text-ax-success bg-ax-success/10' :
    accent === 'warm'    ? 'text-ax-warm bg-ax-warm/10' :
                           'text-ax-danger bg-ax-danger/10';
  return (
    <div className="rounded-ax-md border border-ax-line/70 bg-white/[0.03] backdrop-blur-sm px-4 py-3">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-ax-mist font-semibold">
        <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full [&>svg]:h-3 [&>svg]:w-3 ${ring}`}>
          {icon}
        </span>
        {label}
      </div>
      <div className="mt-2 text-lg font-bold tabular-nums text-ax-ink">
        {value ?? <Skeleton className="h-6 w-24" />}
      </div>
      {hint && <p className="mt-0.5 text-[11px] text-ax-mist">{hint}</p>}
    </div>
  );
}
