import React from 'react';
import Link from 'next/link';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { apiClient } from '../../../lib/api/client';

interface MerchantStats {
  totalRevenue?: number;
  totalRevenueCents?: number;
  totalOrders?: number;
  pendingOrders?: number;
  activeProducts?: number;
  conversionRate?: number;
  customers?: number;
  topProducts?: Array<{ id: string; name: string; revenue?: number; orders?: number }>;
}

export default function ConsoleMerchantHome(): React.ReactElement {
  const [stats, setStats] = React.useState<MerchantStats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [days, setDays] = React.useState(7);

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await apiClient.get<MerchantStats>('/merchant/stats', { params: { days } });
        if (alive) setStats(r);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [days]);

  const revenue = (stats?.totalRevenueCents ?? (stats?.totalRevenue ? stats.totalRevenue * 100 : 0)) / 100;

  return (
    <ConsoleLayout title="Merchant Console">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <p style={{ color: '#9aa3b2', fontSize: 14, margin: 0 }}>
          Storefront performance for the last {days} days. Backed by <code>/merchant/stats</code>.
        </p>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ background: '#11141a', border: '1px solid #1f242d', color: '#E2E8F0', padding: '8px 12px', borderRadius: 6, fontSize: 13 }}>
          {[1, 7, 30, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </select>
      </div>

      {loading ? (
        <Empty msg="Loading…" />
      ) : !stats ? (
        <div style={{ padding: 24, background: '#11141a', border: '1px solid #1f242d', borderRadius: 10 }}>
          <p style={{ color: '#9aa3b2', marginBottom: 12 }}>No merchant account found.</p>
          <Link href="/merchants" style={btnPrimary}>Apply for merchant access →</Link>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
            <Stat label="Revenue" value={`$${revenue.toFixed(2)}`} accent />
            <Stat label="Orders" value={String(stats.totalOrders ?? 0)} />
            <Stat label="Pending" value={String(stats.pendingOrders ?? 0)} />
            <Stat label="Active Products" value={String(stats.activeProducts ?? 0)} />
            <Stat label="Customers" value={String(stats.customers ?? 0)} />
            <Stat label="Conversion" value={`${((stats.conversionRate ?? 0) * 100).toFixed(1)}%`} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
            <NavCard href="/console/merchant/products" title="Products" subtitle="Manage catalog" />
            <NavCard href="/console/merchant/orders" title="Orders" subtitle="Fulfill & ship" />
            <NavCard href="/console/merchant/settlements" title="Settlements" subtitle="Payouts & fees" />
            <NavCard href="/merchants/dashboard" title="Full Merchant Dashboard" subtitle="Auto-order, AI customer service…" />
          </div>

          {stats.topProducts && stats.topProducts.length > 0 && (
            <section>
              <h2 style={{ fontSize: 13, color: '#9aa3b2', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Top Products</h2>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr><Th>Name</Th><Th>Revenue</Th><Th>Orders</Th></tr></thead>
                <tbody>
                  {stats.topProducts.slice(0, 10).map((p) => (
                    <tr key={p.id} style={{ borderTop: '1px solid #1f242d' }}>
                      <Td>{p.name}</Td>
                      <Td><strong style={{ color: '#22D3FF' }}>${(p.revenue ?? 0).toFixed(2)}</strong></Td>
                      <Td>{p.orders ?? 0}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </ConsoleLayout>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }): React.ReactElement {
  return (
    <div style={{ padding: 16, background: '#11141a', border: '1px solid #1f242d', borderRadius: 10 }}>
      <div style={{ fontSize: 11, color: '#6c7689', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, color: accent ? '#22D3FF' : '#E2E8F0' }}>{value}</div>
    </div>
  );
}
function NavCard({ href, title, subtitle }: { href: string; title: string; subtitle: string }): React.ReactElement {
  return (
    <Link href={href} style={{ padding: 16, background: '#11141a', border: '1px solid #1f242d', borderRadius: 10, textDecoration: 'none', color: '#E2E8F0', display: 'block' }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{title} →</div>
      <div style={{ fontSize: 12, color: '#9aa3b2', marginTop: 4 }}>{subtitle}</div>
    </Link>
  );
}
const btnPrimary: React.CSSProperties = { padding: '8px 16px', background: '#22D3FF', color: '#07080B', borderRadius: 6, fontSize: 13, fontWeight: 600, textDecoration: 'none' };
function Empty({ msg }: { msg: string }): React.ReactElement {
  return <div style={{ padding: 32, textAlign: 'center', background: '#11141a', border: '1px solid #1f242d', borderRadius: 10, color: '#9aa3b2', fontSize: 13 }}>{msg}</div>;
}
function Th({ children }: { children: React.ReactNode }): React.ReactElement {
  return <th style={{ textAlign: 'left', padding: '10px 8px', fontSize: 11, color: '#6c7689', textTransform: 'uppercase', fontWeight: 600 }}>{children}</th>;
}
function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }): React.ReactElement {
  return <td style={{ padding: '10px 8px', ...style }}>{children}</td>;
}
