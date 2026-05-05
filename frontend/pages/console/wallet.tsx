import React from 'react';
import Link from 'next/link';
import { ConsoleLayout } from '../../components/console/ConsoleLayout';
import { v1Api, type WalletProjection } from '../../lib/api/v1.api';

function formatCents(cents?: number): string {
  if (cents == null) return '—';
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ConsoleWallet(): React.ReactElement {
  const [proj, setProj] = React.useState<WalletProjection | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    const load = async (): Promise<void> => {
      try {
        const r = await v1Api.wallet.getProjection();
        if (!alive) return;
        setProj(r);
        setLoading(false);
      } catch (e: unknown) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'load failed');
        setLoading(false);
      }
    };
    void load();
    const handle = window.setInterval(load, 10_000);
    return () => {
      alive = false;
      window.clearInterval(handle);
    };
  }, []);

  const subnav = [
    { href: '/console/wallet/checkout', label: 'Checkout' },
    { href: '/console/wallet/commission', label: 'Commission V4' },
    { href: '/console/wallet/split-plans', label: 'Split Plans' },
    { href: '/console/wallet/budgets', label: 'Budgets' },
    { href: '/console/wallet/auto-earn', label: 'Auto-Earn' },
    { href: '/console/wallet/audit', label: 'Audit' },
    { href: '/console/billing', label: 'Subscription' },
  ];

  return (
    <ConsoleLayout title="Wallet">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        {subnav.map((n) => (
          <Link key={n.href} href={n.href} style={{ padding: '6px 12px', borderRadius: 999, background: '#11141a', border: '1px solid #1f242d', color: '#9aa3b2', fontSize: 12, textDecoration: 'none' }}>
            {n.label}
          </Link>
        ))}
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: 12, background: '#3a1414', border: '1px solid #7f1d1d', borderRadius: 8, fontSize: 13, color: '#fca5a5' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        <Stat label="Total" value={formatCents(proj?.total_balance_cents)} loading={loading} />
        <Stat label="Available" value={formatCents(proj?.available_balance_cents)} loading={loading} />
        <Stat label="Pending" value={formatCents(proj?.pending_balance_cents)} loading={loading} />
        <Stat label="Auto-Earn MRR" value={formatCents(proj?.auto_earn?.mrr_cents)} loading={loading} />
      </div>

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ padding: 20, background: '#11141a', border: '1px solid #1f242d', borderRadius: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Crypto Balances</div>
          {(proj?.crypto ?? []).length === 0 ? (
            <div style={{ color: '#6c7689', fontSize: 13 }}>No on-chain balances yet.</div>
          ) : (
            (proj!.crypto ?? []).map((c, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1f242d', fontSize: 13 }}>
                <span>{c.symbol} · {c.chain}</span>
                <span>{c.balance} <span style={{ color: '#6c7689' }}>(${c.usd_value.toFixed(2)})</span></span>
              </div>
            ))
          )}
        </div>

        <div style={{ padding: 20, background: '#11141a', border: '1px solid #1f242d', borderRadius: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Recent Transactions</div>
          {(proj?.recent_txs ?? []).length === 0 ? (
            <div style={{ color: '#6c7689', fontSize: 13 }}>No transactions yet.</div>
          ) : (
            (proj!.recent_txs ?? []).slice(0, 8).map((tx) => (
              <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1f242d', fontSize: 13 }}>
                <div>
                  <div>{tx.kind}</div>
                  <div style={{ color: '#6c7689', fontSize: 11 }}>{tx.status} · {new Date(tx.created_at).toLocaleString()}</div>
                </div>
                <div style={{ color: '#22D3FF', fontWeight: 600 }}>{formatCents(tx.amount_cents)}</div>
              </div>
            ))
          )}
        </div>
      </section>
    </ConsoleLayout>
  );
}

function Stat({ label, value, loading }: { label: string; value: string; loading: boolean }): React.ReactElement {
  return (
    <div style={{ padding: 20, background: '#11141a', border: '1px solid #1f242d', borderRadius: 12 }}>
      <div style={{ fontSize: 12, color: '#6c7689', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{loading ? '…' : value}</div>
    </div>
  );
}
