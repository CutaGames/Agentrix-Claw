import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { v1Api, type AutoEarnSummary, type AutoEarnEvent } from '../../../lib/api/v1.api';

function formatCents(cents?: number): string {
  if (cents == null) return '—';
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ConsoleAutoEarn(): React.ReactElement {
  const [summary, setSummary] = React.useState<AutoEarnSummary | null>(null);
  const [events, setEvents] = React.useState<AutoEarnEvent[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    const load = async (): Promise<void> => {
      try {
        const [s, e] = await Promise.all([
          v1Api.autoEarn.summary().catch((): null => null),
          v1Api.autoEarn.timeline(50).catch((): null => null),
        ]);
        if (!alive) return;
        setSummary(s);
        setEvents(e);
      } catch (e: unknown) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'load failed');
      }
    };
    void load();
    const handle = window.setInterval(load, 6_000);
    return () => {
      alive = false;
      window.clearInterval(handle);
    };
  }, []);

  return (
    <ConsoleLayout title="Auto-Earn Timeline">
      <p style={{ color: '#9aa3b2', fontSize: 14, marginBottom: 24 }}>
        Earnings from skill invocations, A2A trades, and commission settlements.
        Backed by <code>/api/v1/auto-earn/{`{summary,timeline}`}</code>.
      </p>

      {error && (
        <div style={{ marginBottom: 16, padding: 12, background: '#3a1414', border: '1px solid #7f1d1d', borderRadius: 8, fontSize: 13, color: '#fca5a5' }}>{error}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        <Stat label="Total" value={formatCents(summary?.total_cents)} />
        <Stat label="Last 24h" value={formatCents(summary?.last_24h_cents)} />
        <Stat label="Last 30d" value={formatCents(summary?.last_30d_cents)} />
        <Stat label="MRR" value={formatCents(summary?.mrr_cents)} />
      </div>

      <div style={{ padding: 20, background: '#11141a', border: '1px solid #1f242d', borderRadius: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Timeline</div>
        {(events ?? []).length === 0 ? (
          <div style={{ color: '#6c7689', fontSize: 13 }}>No events yet.</div>
        ) : (
          (events ?? []).map((ev) => (
            <div key={ev.id} style={{ padding: '10px 0', borderBottom: '1px solid #1f242d', fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div>
                  <span style={{ color: tagColor(ev.source), fontWeight: 600 }}>{ev.source}</span>
                  {ev.description && <span style={{ color: '#9aa3b2', marginLeft: 8 }}>{ev.description}</span>}
                </div>
                <div style={{ color: '#6c7689', fontSize: 11, marginTop: 2 }}>{new Date(ev.created_at).toLocaleString()}</div>
              </div>
              <div style={{ color: '#22D3FF', fontWeight: 600 }}>+{formatCents(ev.amount_cents)}</div>
            </div>
          ))
        )}
      </div>
    </ConsoleLayout>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div style={{ padding: 16, background: '#11141a', border: '1px solid #1f242d', borderRadius: 12 }}>
      <div style={{ fontSize: 11, color: '#6c7689', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>{value}</div>
    </div>
  );
}

function tagColor(source: string): string {
  switch (source) {
    case 'skill_invoke':
      return '#22D3FF';
    case 'a2a_trade':
      return '#7C3AED';
    case 'commission':
      return '#f59e0b';
    default:
      return '#9aa3b2';
  }
}
