import React from 'react';
import Link from 'next/link';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { apiClient } from '../../../lib/api/client';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { L } from '../../../lib/console.i18n';
import { T, cardStyle, btnPrimaryStyle, emptyStateStyle } from '../../../lib/console.theme';

interface DeveloperDashboard {
  developer?: { id?: string; name?: string; email?: string; status?: string; verified?: boolean };
  apiKeys?: { active?: number; total?: number };
  webhooks?: { active?: number; total?: number };
  skills?: { published?: number; draft?: number; pending?: number };
  earnings?: { totalCents?: number; last30dCents?: number; mrrCents?: number };
  recentEvents?: Array<{ id: string; type?: string; createdAt?: string; status?: string }>;
}

export default function ConsoleDeveloperHome(): React.ReactElement {
  const { t } = useLocalization();
  const [dash, setDash] = React.useState<DeveloperDashboard | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await apiClient.get<DeveloperDashboard>('/developer-accounts/dashboard');
        if (alive) setDash(r);
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  const earningsTotal = (dash?.earnings?.totalCents ?? 0) / 100;
  const earnings30d = (dash?.earnings?.last30dCents ?? 0) / 100;
  const mrr = (dash?.earnings?.mrrCents ?? 0) / 100;

  return (
    <ConsoleLayout title={t(L.developer.title)}>
      <p style={{ color: T.text.secondary, fontSize: T.font.sizeBody, marginBottom: 16 }}>{t(L.developer.desc)}</p>

      {loading ? (
        <div style={emptyStateStyle}>{t(L.common.loading)}</div>
      ) : !dash ? (
        <div style={cardStyle}>
          <p style={{ color: T.text.secondary, marginBottom: 12 }}>{t(L.developer.noAccount)}</p>
          <Link href="/developers" style={{ ...btnPrimaryStyle, textDecoration: 'none', display: 'inline-block' }}>{t(L.developer.apply)}</Link>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
            <Stat label={t(L.developer.totalEarnings)} value={`$${earningsTotal.toFixed(2)}`} accent />
            <Stat label={t(L.developer.last30d)} value={`$${earnings30d.toFixed(2)}`} />
            <Stat label={t(L.developer.mrr)} value={`$${mrr.toFixed(2)}`} />
            <Stat label={t(L.developer.publishedSkills)} value={String(dash.skills?.published ?? 0)} />
            <Stat label={t(L.developer.activeKeys)} value={String(dash.apiKeys?.active ?? 0)} />
            <Stat label={t(L.developer.activeWebhooks)} value={String(dash.webhooks?.active ?? 0)} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
            <NavCard href="/console/developer/skills" title={t(L.nav.mySkills)} subtitle={t({ zh: '发布与变现', en: 'Publish & monetize' })} />
            <NavCard href="/console/developer/workflows" title={t(L.nav.workflows)} subtitle={t({ zh: '编排 Skill 图', en: 'Compose skill graphs' })} />
            <NavCard href="/console/developer/earnings" title={t(L.nav.earnings)} subtitle={t({ zh: '80/20 分成', en: '80/20 revenue share' })} />
            <NavCard href="/developers/console" title={t(L.nav.apiKeys)} subtitle={t({ zh: '完整开发者控制台', en: 'Full developer console' })} />
          </div>

          {dash.recentEvents && dash.recentEvents.length > 0 && (
            <section>
              <h2 style={H2}>{t(L.developer.recentEvents)}</h2>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: T.font.sizeSmall }}>
                <thead><tr><Th>{t(L.common.type)}</Th><Th>{t(L.common.status)}</Th><Th>{t(L.common.createdAt)}</Th></tr></thead>
                <tbody>
                  {dash.recentEvents.slice(0, 10).map((e) => (
                    <tr key={e.id} style={{ borderTop: `1px solid ${T.border.subtle}` }}>
                      <Td>{e.type ?? '—'}</Td>
                      <Td>{e.status ?? '—'}</Td>
                      <Td style={{ fontSize: T.font.sizeTiny, color: T.text.muted }}>{e.createdAt ? new Date(e.createdAt).toLocaleString() : '—'}</Td>
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
