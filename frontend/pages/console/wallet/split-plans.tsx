import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { v1Api, type SplitPlan } from '../../../lib/api/v1.api';

function bpsToPct(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

export default function ConsoleSplitPlans(): React.ReactElement {
  const [plans, setPlans] = React.useState<SplitPlan[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [previewing, setPreviewing] = React.useState<string | null>(null);
  const [previewAmount, setPreviewAmount] = React.useState(1000);
  const [previewResult, setPreviewResult] = React.useState<Array<{ recipient_id: string; amount_cents: number }> | null>(null);

  const load = React.useCallback(async (): Promise<void> => {
    try {
      const r = await v1Api.splitPlans.list();
      setPlans(r);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'load failed');
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const onPreview = async (id: string): Promise<void> => {
    setPreviewing(id);
    setPreviewResult(null);
    try {
      const r = await v1Api.splitPlans.preview(id, previewAmount * 100);
      setPreviewResult(r?.allocations ?? null);
    } finally {
      // keep previewing for UI display
    }
  };

  return (
    <ConsoleLayout title="Split Plans">
      <p style={{ color: '#9aa3b2', fontSize: 14, marginBottom: 24 }}>
        Configure revenue-sharing split plans (basis points must sum to 10000).
        Preview against a sample amount before activating. Backed by{' '}
        <code>/api/v1/split-plans</code>.
      </p>

      {error && (
        <div style={{ marginBottom: 16, padding: 12, background: '#3a1414', border: '1px solid #7f1d1d', borderRadius: 8, fontSize: 13, color: '#fca5a5' }}>{error}</div>
      )}

      {(plans ?? []).length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', background: '#11141a', border: '1px solid #1f242d', borderRadius: 12, color: '#9aa3b2' }}>
          {plans === null ? 'Loading…' : 'No split plans yet. Use the API or CLI to create one (UI editor in W23 R3-4).'}
        </div>
      ) : (
        (plans ?? []).map((p) => (
          <div key={p.id} style={{ padding: 20, background: '#11141a', border: '1px solid #1f242d', borderRadius: 12, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: '#6c7689' }}>{p.id} · {p.status}</div>
              </div>
              <button onClick={() => onPreview(p.id)} style={{ padding: '6px 12px', background: 'transparent', border: '1px solid #22D3FF', color: '#22D3FF', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
                Preview
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              {p.recipients.map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13 }}>
                  <span>{r.label ?? r.recipient_id}</span>
                  <span style={{ color: '#9aa3b2' }}>{bpsToPct(r.bps)}</span>
                </div>
              ))}
            </div>

            {previewing === p.id && previewResult && (
              <div style={{ marginTop: 12, padding: 12, background: '#0a0c11', border: '1px solid #1f242d', borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: '#6c7689', marginBottom: 8 }}>
                  Preview at $
                  <input
                    type="number"
                    value={previewAmount}
                    onChange={(e) => setPreviewAmount(Number(e.target.value))}
                    style={{ background: 'transparent', border: '1px solid #1f242d', color: '#E2E8F0', padding: '2px 6px', borderRadius: 4, width: 80, marginLeft: 4 }}
                  />
                  <button onClick={() => onPreview(p.id)} style={{ marginLeft: 8, padding: '2px 8px', fontSize: 11, background: 'transparent', border: '1px solid #22D3FF', color: '#22D3FF', borderRadius: 4, cursor: 'pointer' }}>
                    re-run
                  </button>
                </div>
                {previewResult.map((a, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                    <span>{a.recipient_id}</span>
                    <span style={{ color: '#22D3FF' }}>${(a.amount_cents / 100).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </ConsoleLayout>
  );
}
