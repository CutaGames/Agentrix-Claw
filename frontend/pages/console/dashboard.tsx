/**
 * Console Dashboard v4 — Tailwind + Stat tiles + AXP card + skeleton loading.
 *
 * Wires real data:
 *  - v1Api.pet.getState() → pet emotion + level
 *  - v1Api.wallet.getProjection() → balances + recent txs
 *  - v1Api.approval.list('pending') → approval queue
 *  - axpApi.getBalance() → AXP balance + expiring
 */
import React from 'react';
import Link from 'next/link';
import {
  Heart, Bell, Wallet, TrendingUp, Coins, ShoppingCart, Radio, Users, ArrowRight, Clock, Activity,
} from 'lucide-react';
import { ConsoleLayout } from '../../components/console/ConsoleLayout';
import { v1Api, type PetState, type WalletProjection, type ApprovalRequest, type AutoEarnEvent } from '../../lib/api/v1.api';
import { axpApi, type AxpBalance } from '../../lib/api/axp.api';
import { useLocalization } from '../../contexts/LocalizationContext';
import { L } from '../../lib/console.i18n';
import {
  Card, CardHeader, Badge, Stat, Skeleton, SkeletonStat, SkeletonRow,
  TrendChart, RingProgress, type TrendDatum,
} from '../../components/ui/ax';

function fmt(cents?: number): string {
  if (cents == null) return '—';
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const EMOTION_EMOJI: Record<string, string> = {
  calm: '😌', happy: '😊', excited: '🤩', focused: '🧐', concerned: '😟',
  tired: '😴', love: '🥰', sad: '😢', angry: '😠', sleepy: '💤',
};

export default function ConsoleDashboard(): React.ReactElement {
  const { t, language } = useLocalization();
  const [pet, setPet] = React.useState<PetState | null>(null);
  const [wallet, setWallet] = React.useState<WalletProjection | null>(null);
  const [approvals, setApprovals] = React.useState<ApprovalRequest[]>([]);
  const [axp, setAxp] = React.useState<AxpBalance | null>(null);
  const [timeline, setTimeline] = React.useState<AutoEarnEvent[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    const load = async (): Promise<void> => {
      const [p, w, a, axpRes, tl] = await Promise.allSettled([
        v1Api.pet.getState(),
        v1Api.wallet.getProjection(),
        v1Api.approval.list('pending'),
        axpApi.getBalance(),
        v1Api.autoEarn.timeline(50).then((r): AutoEarnEvent[] => r ?? []),
      ]);
      if (!alive) return;
      setPet(p.status === 'fulfilled' ? p.value : null);
      setWallet(w.status === 'fulfilled' ? w.value : null);
      setApprovals(a.status === 'fulfilled' ? a.value ?? [] : []);
      setAxp(axpRes.status === 'fulfilled' ? axpRes.value : null);
      setTimeline(tl.status === 'fulfilled' ? tl.value ?? [] : []);
      setLoading(false);
    };
    void load();
    const id = window.setInterval(load, 15_000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  // Bucket auto-earn events into 7 daily buckets (today + last 6)
  const trendData = React.useMemo<TrendDatum[]>(() => {
    const buckets: Record<string, number> = {};
    const dayMs = 24 * 60 * 60 * 1000;
    const now = Date.now();
    // Initialize last 7 days
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * dayMs);
      const key = d.toISOString().slice(0, 10);
      buckets[key] = 0;
    }
    for (const e of timeline) {
      const key = (e.created_at ?? '').slice(0, 10);
      if (key in buckets) buckets[key] += e.amount_cents ?? 0;
    }
    return Object.entries(buckets).map(([key, cents]) => {
      const d = new Date(key);
      const label = d.toLocaleDateString(language === 'zh' ? 'zh-CN' : undefined, { month: 'short', day: 'numeric' });
      return { label, value: cents / 100 }; // dollars
    });
  }, [timeline, language]);

  // AXP ring progress: percent of balance NOT expiring soon (i.e. healthy AXP %)
  const axpHealthPercent = axp && axp.balance > 0
    ? Math.max(0, Math.min(100, Math.round(((axp.balance - axp.expiring_soon) / axp.balance) * 100)))
    : 0;

  const petValue = pet ? `${EMOTION_EMOJI[pet.emotion] ?? '🐾'} L${pet.intimacy_level}` : '—';
  const petHint = pet ? t({
    zh: `情绪：${pet.emotion} · XP ${pet.intimacy_xp}`,
    en: `${pet.emotion} · XP ${pet.intimacy_xp}`,
  }) : t({ zh: '尚未创建', en: 'Not created yet' });

  return (
    <ConsoleLayout
      title={t(L.dashboard.title)}
      subtitle={t(L.dashboard.welcome)}
    >
      {/* KPI grid */}
      <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          <>
            <SkeletonStat /><SkeletonStat /><SkeletonStat /><SkeletonStat />
          </>
        ) : (
          <>
            <Stat
              label={t(L.dashboard.pet)}
              value={petValue}
              hint={petHint}
              icon={<Heart />}
              accent="purple"
            />
            <Stat
              label={t(L.dashboard.pendingApprovals)}
              value={approvals.length}
              hint={approvals.length > 0
                ? t({ zh: '需要你确认', en: 'awaiting you' })
                : t({ zh: '一切就绪', en: 'all clear' })}
              icon={<Bell />}
              accent={approvals.length > 0 ? 'warm' : 'default'}
            />
            <Stat
              label={t(L.dashboard.walletBalance)}
              value={fmt(wallet?.total_balance_cents ?? wallet?.available_balance_cents)}
              hint={t({ zh: '法币 + 加密统计', en: 'fiat + crypto combined' })}
              icon={<Wallet />}
              accent="accent"
            />
            <Stat
              label={t(L.dashboard.autoEarn30d)}
              value={fmt(wallet?.auto_earn?.last_24h_cents)}
              hint={t({ zh: '过去 24 小时', en: 'last 24 hours' })}
              icon={<TrendingUp />}
              accent="success"
            />
          </>
        )}
      </section>

      {/* AXP banner — second row */}
      {(loading || axp) && (
        <section className="mb-8">
          <Link href="/console/axp">
            <Card variant="accent" padding="md" hoverable className="group relative overflow-hidden">
              <div className="pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full bg-ax-warm/10 blur-2xl" />
              <div className="relative flex items-center gap-4">
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-ax-md bg-ax-warm/15 text-ax-warm">
                  <Coins className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ax-mist">
                      {t({ zh: 'AXP 积分', en: 'AXP Points' })}
                    </span>
                    {axp && axp.expiring_soon > 0 && (
                      <Badge variant="warning" size="sm">
                        <Clock className="h-3 w-3" />
                        {t({ zh: `${axp.expiring_soon.toLocaleString()} 即将过期`, en: `${axp.expiring_soon.toLocaleString()} expiring` })}
                      </Badge>
                    )}
                  </div>
                  {loading ? (
                    <Skeleton className="h-7 w-32" />
                  ) : (
                    <div className="flex items-baseline gap-2">
                      <span className="ax-text-gradient text-2xl font-extrabold tabular-nums">
                        {(axp?.balance ?? 0).toLocaleString()}
                      </span>
                      <span className="text-xs font-bold text-ax-fog">AXP</span>
                      <span className="text-xs text-ax-mist">
                        ≈ ${((axp?.balance ?? 0) / 1000).toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
                <ArrowRight className="h-5 w-5 shrink-0 text-ax-mist transition-transform group-hover:translate-x-1 group-hover:text-ax-accent" />
              </div>
            </Card>
          </Link>
        </section>
      )}

      {/* Quick actions */}
      <h2 className="mb-4 text-lg font-bold text-ax-ink">{t(L.dashboard.quickActions)}</h2>
      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Quick href="/console/marketplace/skills" icon={<ShoppingCart />}     label={t(L.dashboard.viewMarketplace)} />
        <Quick href="/console/wallet"             icon={<Wallet />}            label={t(L.dashboard.viewWallet)} />
        <Quick href="/console/presence"           icon={<Radio />}             label={t(L.dashboard.viewPresence)} />
        <Quick href="/console/family"             icon={<Users />}             label={t(L.dashboard.viewFamily)} />
      </div>

      {/* Charts row — Auto-Earn 7d trend + AXP health ring */}
      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Auto-Earn trend (spans 2 cols on desktop) */}
        <Card variant="elevated" padding="md" className="lg:col-span-2">
          <CardHeader
            icon={<TrendingUp />}
            title={t({ zh: '7 日 Auto-Earn 收入', en: 'Auto-Earn · Last 7 Days' })}
            badge={
              !loading && (
                <span className="text-xs text-ax-mist">
                  {t({ zh: '总计', en: 'Total' })}
                  {' '}
                  <span className="font-bold text-ax-accent tabular-nums">
                    ${trendData.reduce((acc, d) => acc + d.value, 0).toFixed(2)}
                  </span>
                </span>
              )
            }
          />
          {loading ? (
            <Skeleton className="h-[200px] w-full rounded-ax-md" />
          ) : (
            <TrendChart
              data={trendData}
              accent="accent"
              height={200}
              formatValue={(n: number): string => `$${n.toFixed(2)}`}
            />
          )}
        </Card>

        {/* AXP health ring */}
        <Card variant="elevated" padding="md">
          <CardHeader
            icon={<Coins />}
            title={t({ zh: 'AXP 健康度', en: 'AXP Health' })}
          />
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Skeleton className="h-32 w-32 rounded-full" />
            </div>
          ) : axp ? (
            <div className="flex flex-col items-center gap-3 py-2">
              <RingProgress
                value={axpHealthPercent}
                size={128}
                accent={axpHealthPercent < 30 ? 'danger' : axpHealthPercent < 60 ? 'warm' : 'success'}
                label={
                  <div className="flex flex-col items-center">
                    <span className="text-xl font-extrabold tabular-nums text-ax-ink">{axpHealthPercent}%</span>
                    <span className="text-[10px] text-ax-mist">{t({ zh: '不会过期', en: 'safe' })}</span>
                  </div>
                }
              />
              <div className="w-full space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-ax-mist">
                  <span>{t({ zh: '余额', en: 'Balance' })}</span>
                  <span className="tabular-nums font-semibold text-ax-ink">{axp.balance.toLocaleString()}</span>
                </div>
                {axp.expiring_soon > 0 && (
                  <div className="flex items-center justify-between text-ax-warm">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {t({ zh: '即将过期', en: 'Expiring' })}
                    </span>
                    <span className="tabular-nums font-semibold">{axp.expiring_soon.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<Coins />}
              text={t({ zh: '尚未开始累积 AXP', en: 'No AXP balance yet' })}
            />
          )}
        </Card>
      </section>

      {/* Two-column lower panels */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Pending approvals */}
        <Card variant="elevated" padding="md">
          <CardHeader
            icon={<Bell />}
            title={t(L.dashboard.pendingApprovals)}
            badge={approvals.length > 0 ? <Badge variant="warm" size="sm">{approvals.length}</Badge> : null}
          />
          {loading ? (
            <div className="space-y-1">
              <SkeletonRow /><SkeletonRow /><SkeletonRow />
            </div>
          ) : approvals.length === 0 ? (
            <EmptyState
              icon={<Bell />}
              text={t({ zh: '暂无待审批操作', en: 'No items waiting for you.' })}
            />
          ) : (
            <div className="divide-y divide-ax-line/60">
              {approvals.slice(0, 5).map((a) => (
                <div key={a.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="text-ax-ink truncate">{a.action?.kind ?? 'action'}</span>
                  <Badge
                    variant={
                      a.risk_level === 'L3' ? 'danger' :
                      a.risk_level === 'L2' ? 'warning' :
                      'accent'
                    }
                    size="sm"
                  >
                    {a.risk_level}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Recent wallet activity */}
        <Card variant="elevated" padding="md">
          <CardHeader
            icon={<Activity />}
            title={t({ zh: '最近钱包活动', en: 'Recent Wallet Activity' })}
          />
          {loading ? (
            <div className="space-y-1">
              <SkeletonRow /><SkeletonRow /><SkeletonRow />
            </div>
          ) : (wallet?.recent_txs ?? []).length === 0 ? (
            <EmptyState
              icon={<Wallet />}
              text={t({ zh: '暂无近期交易', en: 'No recent transactions.' })}
            />
          ) : (
            <div className="divide-y divide-ax-line/60">
              {(wallet?.recent_txs ?? []).slice(0, 5).map((tx) => (
                <div key={tx.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="text-ax-ink truncate">{tx.kind}</span>
                  <span className="text-ax-accent font-semibold tabular-nums">{fmt(tx.amount_cents)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>
    </ConsoleLayout>
  );
}

function Quick({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }): React.ReactElement {
  return (
    <Link href={href}>
      <Card variant="default" padding="md" hoverable className="group h-full">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-ax-md bg-ax-accent/10 text-ax-accent transition-colors group-hover:bg-ax-accent/15 [&>svg]:h-5 [&>svg]:w-5">
            {icon}
          </span>
          <span className="text-sm font-semibold text-ax-ink flex-1 min-w-0 truncate">{label}</span>
          <ArrowRight className="h-4 w-4 shrink-0 text-ax-mist transition-transform group-hover:translate-x-0.5 group-hover:text-ax-accent" />
        </div>
      </Card>
    </Link>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: React.ReactNode }) {
  return (
    <div className="py-8 text-center">
      <div className="mx-auto mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.04] text-ax-mist [&>svg]:h-5 [&>svg]:w-5">
        {icon}
      </div>
      <p className="text-sm text-ax-fog">{text}</p>
    </div>
  );
}
