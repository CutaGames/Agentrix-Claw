import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { apiClient } from '../../../lib/api/client';

interface CommissionRecord {
  id: string;
  amount?: number;
  amountCents?: number;
  currency?: string;
  status?: string;
  createdAt?: string;
  recipient?: string;
  source?: string;
}

interface SettlementRecord {
  id: string;
  totalAmount?: number;
  totalAmountCents?: number;
  currency?: string;
  status?: string;
  createdAt?: string;
  settledAt?: string;
}

export default function ConsoleWalletCommission(): React.ReactElement {
  const [commissions, setCommissions] = React.useState<CommissionRecord[]>([]);
  const [settlements, setSettlements] = React.useState<SettlementRecord[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    const load = async (): Promise<void> => {
      setLoading(true);
      try {
        const [c, s] = await Promise.all([
          apiClient.get<CommissionRecord[] | { items?: CommissionRecord[] }>('/commissions').catch((): null => null),
          apiClient.get<SettlementRecord[] | { items?: SettlementRecord[] }>('/commissions/settlements').catch((): null => null),
        ]);
        if (!alive) return;
        setCommissions(Array.isArray(c) ? c : c?.items ?? []);
        setSettlements(Array.isArray(s) ? s : s?.items ?? []);
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    return () => { alive = false; };
  }, []);

  const fmt = (cents?: number, amt?: number, ccy?: string): string => {
    const v = cents != null ? cents / 100 : amt ?? 0;
    return `${ccy ?? 'USD'} $${v.toFixed(2)}`;
  };

  return (
    <ConsoleLayout title="Commission V4">
      <p style={{ color: '#9aa3b2', fontSize: 14, marginBottom: 16 }}>
        Commission earnings from skill invocations, marketplace orders and referrals.
        Backed by <code>/commissions</code> + <code>/commissions/settlements</code>.
      </p>

      <Section title="Recent Commissions">
        {loading && commissions.length === 0 ? (
          <Empty msg="Loading…" />
        ) : commissions.length === 0 ? (
          <Empty msg="No commission records yet." />
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr><Th>Source</Th><Th>Amount</Th><Th>Status</Th><Th>Created</Th></tr>
            </thead>
            <tbody>
              {commissions.slice(0, 20).map((c) => (
                <tr key={c.id} style={rowStyle}>
                  <Td>{c.source ?? c.recipient ?? '—'}</Td>
                  <Td><strong style={{ color: '#22D3FF' }}>{fmt(c.amountCents, c.amount, c.currency)}</strong></Td>
                  <Td><Pill status={c.status ?? 'pending'} /></Td>
                  <Td style={{ fontSize: 11, color: '#6c7689' }}>{c.createdAt ? new Date(c.createdAt).toLocaleString() : '—'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Settlement Batches">
        {settlements.length === 0 ? (
          <Empty msg="No settlements yet." />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {settlements.slice(0, 12).map((s) => (
              <div key={s.id} style={{ padding: 14, background: '#11141a', border: '1px solid #1f242d', borderRadius: 10 }}>
                <div style={{ fontSize: 11, color: '#6c7689' }}>Settlement</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#22D3FF', marginTop: 4 }}>{fmt(s.totalAmountCents, s.totalAmount, s.currency)}</div>
                <div style={{ fontSize: 11, color: '#6c7689', marginTop: 6 }}>{s.status ?? '—'} · {s.settledAt ?? s.createdAt ?? ''}</div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </ConsoleLayout>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 13, color: '#9aa3b2', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>{title}</h2>
      {children}
    </section>
  );
}
function Empty({ msg }: { msg: string }): React.ReactElement {
  return <div style={{ padding: 32, textAlign: 'center', background: '#11141a', border: '1px solid #1f242d', borderRadius: 10, color: '#9aa3b2', fontSize: 13 }}>{msg}</div>;
}
function Pill({ status }: { status: string }): React.ReactElement {
  const ok = status === 'paid' || status === 'settled' || status === 'success';
  return <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: ok ? '#0d3a2c' : '#3a2c0d', color: ok ? '#34d399' : '#fbbf24' }}>{status}</span>;
}
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const rowStyle: React.CSSProperties = { borderTop: '1px solid #1f242d' };
function Th({ children }: { children: React.ReactNode }): React.ReactElement {
  return <th style={{ textAlign: 'left', padding: '10px 8px', fontSize: 11, color: '#6c7689', textTransform: 'uppercase', fontWeight: 600 }}>{children}</th>;
}
function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }): React.ReactElement {
  return <td style={{ padding: '10px 8px', ...style }}>{children}</td>;
}
