import React from 'react';
import Link from 'next/link';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { apiClient } from '../../../lib/api/client';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { L } from '../../../lib/console.i18n';
import { T, cardStyle, selectStyle, btnPrimaryStyle, emptyStateStyle } from '../../../lib/console.theme';

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
  const { t } = useLocalization();
  const [stats, setStats] = React.useState<MerchantStats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [days, setDays] = React.useState(7);

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await apiClient.get<MerchantStats>('/merchant/stats', { params: { days } });
        if (alive) setStats(r);
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [days]);

  const revenue = (stats?.totalRevenueCents ?? (stats?.totalRevenue ? stats.totalRevenue * 100 : 0)) / 100;
  const desc = t(L.merchant.desc).replace('{days}', String(days));
  const dayLabels: Record<number, string> = {
    1: t(L.merchant.last1d), 7: t(L.merchant.last7d), 30: t(L.merchant.last30d), 90: t(L.merchant.last90d),
  };

  return (
    <ConsoleLayout title={t(L.merchant.title)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <p style={{ color: T.text.secondary, fontSize: T.font.sizeBody, margin: 0 }}>{desc}</p>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={selectStyle}>
          {[1, 7, 30, 90].map((d) => <option key={d} value={d}>{dayLabels[d]}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={emptyStateStyle}>{t(L.common.loading)}</div>
      ) : !stats ? (
        <div style={cardStyle}>
          <p style={{ color: T.text.secondary, marginBottom: 12 }}>{t(L.merchant.noAccount)}</p>
          <Link href="/merchants" style={{ ...btnPrimaryStyle, textDecoration: 'none', display: 'inline-block' }}>{t(L.merchant.apply)}</Link>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
            <Stat label={t(L.merchant.revenue)} value={`$${revenue.toFixed(2)}`} accent />
            <Stat label={t(L.merchant.orders)} value={String(stats.totalOrders ?? 0)} />
            <Stat label={t(L.merchant.pending)} value={String(stats.pendingOrders ?? 0)} />
            <Stat label={t(L.merchant.activeProducts)} value={String(stats.activeProducts ?? 0)} />
            <Stat label={t(L.merchant.customers)} value={String(stats.customers ?? 0)} />
            <Stat label={t(L.merchant.conversion)} value={`${((stats.conversionRate ?? 0) * 100).toFixed(1)}%`} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
            <NavCard href="/console/merchant/products" title={t(L.nav.products)} subtitle={t({ zh: '管理商品目录', en: 'Manage catalog' })} />
            <NavCard href="/console/merchant/orders" title={t(L.nav.orders)} subtitle={t({ zh: '履约 & 发货', en: 'Fulfill & ship' })} />
            <NavCard href="/console/merchant/settlements" title={t(L.nav.settlements)} subtitle={t({ zh: '账期 & 手续费', en: 'Payouts & fees' })} />
            <NavCard href="/merchants/dashboard" title={t({ zh: '完整商家面板', en: 'Full Merchant Dashboard' })} subtitle={t({ zh: '自动接单 / AI 客服…', en: 'Auto-order, AI customer service…' })} />
          </div>

          {stats.topProducts && stats.topProducts.length > 0 && (
            <section>
              <h2 style={H2}>{t(L.merchant.topProducts)}</h2>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: T.font.sizeSmall }}>
                <thead><tr><Th>{t(L.common.name)}</Th><Th>{t(L.merchant.revenue)}</Th><Th>{t(L.merchant.orders)}</Th></tr></thead>
                <tbody>
                  {stats.topProducts.slice(0, 10).map((p) => (
                    <tr key={p.id} style={{ borderTop: `1px solid ${T.border.subtle}` }}>
                      <Td>{p.name}</Td>
                      <Td><strong style={{ color: T.text.accent }}>${(p.revenue ?? 0).toFixed(2)}</strong></Td>
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

const H2: React.CSSProperties = { fontSize: T.font.sizeCaption, color: T.text.secondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, fontWeight: 600 };
function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }): React.ReactElement {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: T.font.sizeTiny, color: T.text.muted, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, color: accent ? T.text.accent : T.text.primary }}>{value}</div>
    </div>
  );
}
function NavCard({ href, title, subtitle }: { href: string; title: string; subtitle: string }): React.ReactElement {
  return (
    <Link href={href} style={{ ...cardStyle, textDecoration: 'none', color: T.text.primary, display: 'block' }}>
      <div style={{ fontSize: T.font.sizeBody, fontWeight: 700 }}>{title} →</div>
      <div style={{ fontSize: T.font.sizeCaption, color: T.text.secondary, marginTop: 4 }}>{subtitle}</div>
    </Link>
  );
}
function Th({ children }: { children: React.ReactNode }): React.ReactElement {
  return <th style={{ textAlign: 'left', padding: '10px 8px', fontSize: T.font.sizeTiny, color: T.text.muted, textTransform: 'uppercase', fontWeight: 600 }}>{children}</th>;
}
function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }): React.ReactElement {
  return <td style={{ padding: '10px 8px', color: T.text.primary, ...style }}>{children}</td>;
}
