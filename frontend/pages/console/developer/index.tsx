import React from 'react';
import Link from 'next/link';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { apiClient } from '../../../lib/api/client';

interface DeveloperDashboard {
  developer?: { id?: string; name?: string; email?: string; status?: string; verified?: boolean };
  apiKeys?: { active?: number; total?: number };
  webhooks?: { active?: number; total?: number };
  skills?: { published?: number; draft?: number; pending?: number };
  earnings?: { totalCents?: number; last30dCents?: number; mrrCents?: number };
  recentEvents?: Array<{ id: string; type?: string; createdAt?: string; status?: string }>;
}

export default function ConsoleDeveloperHome(): React.ReactElement {
  const [dash, setDash] = React.useState<DeveloperDashboard | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await apiClient.get<DeveloperDashboard>('/developer-accounts/dashboard');
        if (alive) setDash(r);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const earningsTotal = (dash?.earnings?.totalCents ?? 0) / 100;
  const earnings30d = (dash?.earnings?.last30dCents ?? 0) / 100;
  const mrr = (dash?.earnings?.mrrCents ?? 0) / 100;

  return (
    <ConsoleLayout title="Developer Console">
      <p style={{ color: '#9aa3b2', fontSize: 14, marginBottom: 16 }}>
        Manage your skills, API keys, webhooks and earnings. Backed by{' '}
        <code>/developer-accounts/dashboard</code>.
      </p>

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', background: '#11141a', border: '1px solid #1f242d', borderRadius: 10, color: '#9aa3b2' }}>
          Loading…
        </div>
      ) : !dash ? (
        <div style={{ padding: 24, background: '#11141a', border: '1px solid #1f242d', borderRadius: 10 }}>
          <p style={{ color: '#9aa3b2', marginBottom: 12 }}>You don&apos;t have a developer account yet.</p>
          <Link href="/developers" style={{ padding: '8px 16px', background: '#22D3FF', color: '#07080B', borderRadius: 6, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
            Apply for one →
          </Link>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
            <Stat label="Total Earnings" value={`$${earningsTotal.toFixed(2)}`} accent />
            <Stat label="Last 30 days" value={`$${earnings30d.toFixed(2)}`} />
            <Stat label="MRR" value={`$${mrr.toFixed(2)}`} />
            <Stat label="Published Skills" value={String(dash.skills?.published ?? 0)} />
            <Stat label="Active API Keys" value={String(dash.apiKeys?.active ?? 0)} />
            <Stat label="Active Webhooks" value={String(dash.webhooks?.active ?? 0)} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
            <NavCard href="/console/developer/skills" title="My Skills" subtitle="Publish & monetize" />
            <NavCard href="/console/developer/workflows" title="Workflows" subtitle="Compose skill graphs" />
            <NavCard href="/console/developer/earnings" title="Earnings" subtitle="80/20 revenue share" />
            <NavCard href="/developers/console" title="API Keys & Webhooks" subtitle="Full developer console" />
          </div>

          {dash.recentEvents && dash.recentEvents.length > 0 && (
            <section>
              <h2 style={{ fontSize: 13, color: '#9aa3b2', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Recent Events</h2>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr><Th>Type</Th><Th>Status</Th><Th>Time</Th></tr></thead>
                <tbody>
                  {dash.recentEvents.slice(0, 10).map((e) => (
                    <tr key={e.id} style={{ borderTop: '1px solid #1f242d' }}>
                      <Td>{e.type ?? '—'}</Td>
                      <Td>{e.status ?? '—'}</Td>
                      <Td style={{ fontSize: 11, color: '#6c7689' }}>{e.createdAt ? new Date(e.createdAt).toLocaleString() : '—'}</Td>
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
function Th({ children }: { children: React.ReactNode }): React.ReactElement {
  return <th style={{ textAlign: 'left', padding: '10px 8px', fontSize: 11, color: '#6c7689', textTransform: 'uppercase', fontWeight: 600 }}>{children}</th>;
}
function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }): React.ReactElement {
  return <td style={{ padding: '10px 8px', ...style }}>{children}</td>;
}
