import React from 'react';
import Link from 'next/link';
import { ConsoleLayout } from '../../components/console/ConsoleLayout';
import { v1Api, type PetState, type WalletProjection, type ApprovalRequest } from '../../lib/api/v1.api';
import { useLocalization } from '../../contexts/LocalizationContext';
import { L } from '../../lib/console.i18n';
import { T, cardStyle } from '../../lib/console.theme';

function fmt(cents?: number): string {
  if (cents == null) return '—';
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ConsoleDashboard(): React.ReactElement {
  const { t } = useLocalization();
  const [pet, setPet] = React.useState<PetState | null>(null);
  const [wallet, setWallet] = React.useState<WalletProjection | null>(null);
  const [approvals, setApprovals] = React.useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    const load = async (): Promise<void> => {
      const [p, w, a] = await Promise.all([
        v1Api.pet.getState().catch((): null => null),
        v1Api.wallet.getProjection().catch((): null => null),
        v1Api.approval.list('pending').catch((): null => null),
      ]);
      if (!alive) return;
      setPet(p);
      setWallet(w);
      setApprovals(a ?? []);
      setLoading(false);
    };
    void load();
    const id = window.setInterval(load, 15_000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  const kpis = [
    { label: t(L.dashboard.pet), value: pet ? `${pet.emotion} · L${pet.intimacy_level}` : loading ? '…' : '—' },
    { label: t(L.dashboard.pendingApprovals), value: String(approvals.length) },
    { label: t(L.dashboard.walletBalance), value: fmt(wallet?.total_balance_cents ?? wallet?.available_balance_cents) },
    { label: t(L.dashboard.autoEarn30d), value: fmt(wallet?.auto_earn?.last_24h_cents) },
  ];

  return (
    <ConsoleLayout title={t(L.dashboard.title)}>
      <p style={{ color: T.text.secondary, marginBottom: 28, fontSize: T.font.sizeBody }}>
        {t(L.dashboard.welcome)}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 32 }}>
        {kpis.map((kpi) => (
          <div key={kpi.label} style={cardStyle}>
            <div style={{ fontSize: T.font.sizeTiny, color: T.text.muted, textTransform: 'uppercase', letterSpacing: 0.6 }}>{kpi.label}</div>
            <div style={{ fontSize: 28, fontWeight: T.font.weightBold, marginTop: 10, color: T.text.primary }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: T.font.sizeH2, fontWeight: T.font.weightSemibold, color: T.text.primary, marginBottom: 14 }}>
        {t(L.dashboard.quickActions)}
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 32 }}>
        <Quick href="/console/marketplace/skills" icon="🛒" label={t(L.dashboard.viewMarketplace)} />
        <Quick href="/console/wallet" icon="💰" label={t(L.dashboard.viewWallet)} />
        <Quick href="/console/presence" icon="📡" label={t(L.dashboard.viewPresence)} />
        <Quick href="/console/family" icon="👪" label={t(L.dashboard.viewFamily)} />
      </div>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <Card title={t(L.dashboard.pendingApprovals)} empty={approvals.length === 0} emptyText={t({ zh: '暂无待审批操作', en: 'No items waiting for you.' })}>
          {approvals.slice(0, 5).map((a) => (
            <Row key={a.id}>
              <span>{a.action?.kind ?? 'action'}</span>
              <span style={{ color: T.text.accent, fontWeight: 600 }}>{a.risk_level}</span>
            </Row>
          ))}
        </Card>
        <Card title={t({ zh: '最近钱包活动', en: 'Recent Wallet Activity' })} empty={(wallet?.recent_txs ?? []).length === 0} emptyText={t({ zh: '暂无近期交易', en: 'No recent transactions.' })}>
          {(wallet?.recent_txs ?? []).slice(0, 5).map((tx) => (
            <Row key={tx.id}>
              <span>{tx.kind}</span>
              <span style={{ color: T.text.accent }}>{fmt(tx.amount_cents)}</span>
            </Row>
          ))}
        </Card>
      </section>
    </ConsoleLayout>
  );
}

function Quick({ href, icon, label }: { href: string; icon: string; label: string }): React.ReactElement {
  return (
    <Link href={href} style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: T.text.primary }}>
      <span style={{ fontSize: 24 }}>{icon}</span>
      <span style={{ fontSize: T.font.sizeBody, fontWeight: T.font.weightSemibold }}>{label} →</span>
    </Link>
  );
}
function Card({ title, empty, emptyText, children }: { title: string; empty: boolean; emptyText: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: T.font.sizeH2, fontWeight: T.font.weightSemibold, marginBottom: 14, color: T.text.primary }}>{title}</div>
      {empty ? <div style={{ color: T.text.muted, fontSize: T.font.sizeSmall }}>{emptyText}</div> : children}
    </div>
  );
}
function Row({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${T.border.subtle}`, fontSize: T.font.sizeSmall, color: T.text.primary }}>
      {children}
    </div>
  );
}
