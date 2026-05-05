import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { v1Api, type CoSignRequest } from '../../../lib/api/v1.api';

const SURFACES = ['mobile', 'desktop', 'wearable', 'web'];

export default function ConsoleSettingsSecurity(): React.ReactElement {
  const [requests, setRequests] = React.useState<CoSignRequest[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<'pending' | 'signed' | 'rejected'>('pending');
  const [busy, setBusy] = React.useState<string | null>(null);

  const reload = React.useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const r = await v1Api.cosign.list(filter);
      setRequests(r ?? []);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  React.useEffect(() => { void reload(); }, [reload]);

  const sign = async (id: string, surface: string): Promise<void> => {
    setBusy(id);
    try {
      await v1Api.cosign.sign(id, surface);
      await reload();
    } finally {
      setBusy(null);
    }
  };

  const reject = async (id: string): Promise<void> => {
    setBusy(id);
    try {
      await v1Api.cosign.reject(id, 'user-rejected');
      await reload();
    } finally {
      setBusy(null);
    }
  };

  return (
    <ConsoleLayout title="Security & Co-sign">
      <p style={{ color: '#9aa3b2', fontSize: 14, marginBottom: 16 }}>
        L2 / L3 multi-surface co-sign requests for high-risk actions.
        Backed by <code>/api/v1/cosign/*</code>.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['pending', 'signed', 'rejected'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 14px',
              background: filter === f ? '#22D3FF' : '#11141a',
              color: filter === f ? '#07080B' : '#9aa3b2',
              border: '1px solid #1f242d',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <Empty msg="Loading…" />
      ) : requests.length === 0 ? (
        <Empty msg={`No ${filter} co-sign requests.`} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {requests.map((r) => (
            <div key={r.id} style={{ padding: 16, background: '#11141a', border: '1px solid #1f242d', borderRadius: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{r.action?.kind ?? '—'}</div>
                  <div style={{ fontSize: 11, color: '#6c7689', marginTop: 4 }}>
                    Required: {r.required_surfaces?.join(', ') ?? '—'} · Signed: {r.signed_surfaces?.length ?? 0} / {r.required_surfaces?.length ?? 0}
                  </div>
                  <div style={{ fontSize: 11, color: '#6c7689', marginTop: 2 }}>{new Date(r.created_at).toLocaleString()}</div>
                </div>
                {filter === 'pending' && (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {SURFACES.filter((s) => r.required_surfaces?.includes(s) && !r.signed_surfaces?.includes(s)).map((s) => (
                      <button
                        key={s}
                        onClick={() => sign(r.id, s)}
                        disabled={busy === r.id}
                        style={{ padding: '6px 10px', background: '#22D3FF', color: '#07080B', border: 0, borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                      >
                        Sign on {s}
                      </button>
                    ))}
                    <button
                      onClick={() => reject(r.id)}
                      disabled={busy === r.id}
                      style={{ padding: '6px 10px', background: '#11141a', color: '#fca5a5', border: '1px solid #7f1d1d', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </ConsoleLayout>
  );
}

function Empty({ msg }: { msg: string }): React.ReactElement {
  return <div style={{ padding: 32, textAlign: 'center', background: '#11141a', border: '1px solid #1f242d', borderRadius: 10, color: '#9aa3b2', fontSize: 13 }}>{msg}</div>;
}
