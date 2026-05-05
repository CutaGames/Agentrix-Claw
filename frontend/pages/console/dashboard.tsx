import React from 'react';
import { ConsoleLayout } from '../../components/console/ConsoleLayout';
import { v1Api, type PetState, type WalletProjection, type ApprovalRequest } from '../../lib/api/v1.api';

interface DashboardData {
  pet: PetState | null;
  wallet: WalletProjection | null;
  approvals: ApprovalRequest[] | null;
  loading: boolean;
  error: string | null;
}

function formatCents(cents?: number): string {
  if (cents == null) return '—';
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ConsoleDashboard(): React.ReactElement {
  const [data, setData] = React.useState<DashboardData>({
    pet: null,
    wallet: null,
    approvals: null,
    loading: true,
    error: null,
  });

  React.useEffect(() => {
    let alive = true;
    const load = async (): Promise<void> => {
      try {
        const [pet, wallet, approvals] = await Promise.all([
          v1Api.pet.getState().catch((): null => null),
          v1Api.wallet.getProjection().catch((): null => null),
          v1Api.approval.list('pending').catch((): null => null),
        ]);
        if (!alive) return;
        setData({ pet, wallet, approvals, loading: false, error: null });
      } catch (e: unknown) {
        if (!alive) return;
        setData((d) => ({ ...d, loading: false, error: e instanceof Error ? e.message : 'load failed' }));
      }
    };
    void load();
    const handle = window.setInterval(load, 15_000);
    return () => {
      alive = false;
      window.clearInterval(handle);
    };
  }, []);

  const kpis = [
    { label: 'Pet Emotion', value: data.pet ? `${data.pet.emotion} · L${data.pet.intimacy_level}` : data.loading ? '…' : '—' },
    { label: 'Pending Approvals', value: data.approvals ? String(data.approvals.length) : data.loading ? '…' : '—' },
    { label: 'Wallet Balance', value: formatCents(data.wallet?.total_balance_cents ?? data.wallet?.available_balance_cents) },
    { label: 'Auto-Earn 24h', value: formatCents(data.wallet?.auto_earn?.last_24h_cents) },
  ];

  return (
    <ConsoleLayout title="Dashboard">
      <p style={{ color: '#9aa3b2', marginBottom: 24 }}>
        Cross-surface workspace — wired to <code>/api/v1/pet/state</code>,{' '}
        <code>/api/v1/wallet/projection</code>, <code>/api/v1/approval</code>.
      </p>

      {data.error && (
        <div style={{ marginBottom: 16, padding: 12, background: '#3a1414', border: '1px solid #7f1d1d', borderRadius: 8, fontSize: 13, color: '#fca5a5' }}>
          {data.error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 32 }}>
        {kpis.map((kpi) => (
          <div key={kpi.label} style={{ padding: 20, background: '#11141a', border: '1px solid #1f242d', borderRadius: 12 }}>
            <div style={{ fontSize: 12, color: '#6c7689', textTransform: 'uppercase' }}>{kpi.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card title="Pending Approvals" empty={(data.approvals ?? []).length === 0} emptyText="No items waiting for you.">
          {(data.approvals ?? []).slice(0, 5).map((a) => (
            <div key={a.id} style={{ padding: '10px 0', borderBottom: '1px solid #1f242d', fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#E2E8F0' }}>{a.action?.kind ?? 'action'}</span>
                <span style={{ color: '#22D3FF', fontWeight: 600 }}>{a.risk_level}</span>
              </div>
              <div style={{ color: '#6c7689', fontSize: 11, marginTop: 2 }}>{new Date(a.created_at).toLocaleString()}</div>
            </div>
          ))}
        </Card>

        <Card title="Recent Wallet Activity" empty={(data.wallet?.recent_txs ?? []).length === 0} emptyText="No recent transactions.">
          {(data.wallet?.recent_txs ?? []).slice(0, 5).map((tx) => (
            <div key={tx.id} style={{ padding: '10px 0', borderBottom: '1px solid #1f242d', fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#E2E8F0' }}>{tx.kind}</span>
                <span style={{ color: '#22D3FF' }}>{formatCents(tx.amount_cents)}</span>
              </div>
              <div style={{ color: '#6c7689', fontSize: 11, marginTop: 2 }}>{tx.status} · {new Date(tx.created_at).toLocaleString()}</div>
            </div>
          ))}
        </Card>
      </section>
    </ConsoleLayout>
  );
}

function Card({ title, empty, emptyText, children }: { title: string; empty: boolean; emptyText: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ padding: 20, background: '#11141a', border: '1px solid #1f242d', borderRadius: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>{title}</div>
      {empty ? <div style={{ color: '#6c7689', fontSize: 13 }}>{emptyText}</div> : children}
    </div>
  );
}
