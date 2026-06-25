import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { v1Api, type BudgetPool } from '../../../lib/api/v1.api';

function formatCents(cents?: number): string {
  if (cents == null) return '—';
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ConsoleBudgets(): React.ReactElement {
  const [pools, setPools] = React.useState<BudgetPool[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    const load = async (): Promise<void> => {
      try {
        const r = await v1Api.budgetPools.list();
        if (!alive) return;
        setPools(r);
      } catch (e: unknown) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'load failed');
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <ConsoleLayout title="Budget Pools">
      <p style={{ color: '#9aa3b2', fontSize: 14, marginBottom: 24 }}>
        Monthly spending caps for agents and skills. Over-limit calls are
        rejected with HTTP 400. Backed by <code>/api/v1/budget-pools</code>.
      </p>

      {error && (
        <div style={{ marginBottom: 16, padding: 12, background: '#3a1414', border: '1px solid #7f1d1d', borderRadius: 8, fontSize: 13, color: '#fca5a5' }}>{error}</div>
      )}

      {(pools ?? []).length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', background: '#11141a', border: '1px solid #1f242d', borderRadius: 12, color: '#9aa3b2' }}>
          {pools === null ? 'Loading…' : 'No budget pools yet.'}
        </div>
      ) : (
        (pools ?? []).map((p) => {
          const pct = p.monthly_limit_cents > 0 ? (p.spent_this_month_cents / p.monthly_limit_cents) * 100 : 0;
          const danger = pct >= 90;
          return (
            <div key={p.id} style={{ padding: 20, background: '#11141a', border: '1px solid #1f242d', borderRadius: 12, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: '#6c7689' }}>{p.id} · {p.status}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{formatCents(p.spent_this_month_cents)} / {formatCents(p.monthly_limit_cents)}</div>
                  <div style={{ fontSize: 11, color: danger ? '#fca5a5' : '#6c7689' }}>{pct.toFixed(1)}% used</div>
                </div>
              </div>
              <div style={{ marginTop: 12, height: 6, background: '#1f242d', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: danger ? '#fca5a5' : '#22D3FF' }} />
              </div>
            </div>
          );
        })
      )}
    </ConsoleLayout>
  );
}
