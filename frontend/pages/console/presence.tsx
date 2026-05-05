import React from 'react';
import { ConsoleLayout } from '../../components/console/ConsoleLayout';
import { v1Api, type ApprovalRequest, type HandoffRecord, type PetState } from '../../lib/api/v1.api';

export default function ConsolePresence(): React.ReactElement {
  const [pet, setPet] = React.useState<PetState | null>(null);
  const [handoffs, setHandoffs] = React.useState<HandoffRecord[] | null>(null);
  const [approvals, setApprovals] = React.useState<ApprovalRequest[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async (): Promise<void> => {
    try {
      const [p, h, a] = await Promise.all([
        v1Api.pet.getState().catch((): null => null),
        v1Api.handoff.list().catch((): null => null),
        v1Api.approval.list('pending').catch((): null => null),
      ]);
      setPet(p);
      setHandoffs(h);
      setApprovals(a);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'load failed');
    }
  }, []);

  React.useEffect(() => {
    void load();
    const handle = window.setInterval(load, 8_000);
    return () => window.clearInterval(handle);
  }, [load]);

  const onApprove = async (id: string): Promise<void> => {
    setBusy(id);
    try {
      await v1Api.approval.approve(id, 'web');
      await load();
    } finally {
      setBusy(null);
    }
  };
  const onReject = async (id: string): Promise<void> => {
    setBusy(id);
    try {
      await v1Api.approval.reject(id);
      await load();
    } finally {
      setBusy(null);
    }
  };
  const onAcceptHandoff = async (id: string, mode: 'handoff' | 'mirror' = 'handoff'): Promise<void> => {
    setBusy(id);
    try {
      await v1Api.handoff.accept(id, 'web', mode);
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <ConsoleLayout title="Presence">
      {error && (
        <div style={{ marginBottom: 16, padding: 12, background: '#3a1414', border: '1px solid #7f1d1d', borderRadius: 8, fontSize: 13, color: '#fca5a5' }}>
          {error}
        </div>
      )}

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <Panel title="Living Pet">
          {pet ? (
            <div>
              <div style={{ fontSize: 32, fontWeight: 700 }}>{petEmoji(pet.emotion)} {pet.emotion}</div>
              <div style={{ color: '#9aa3b2', marginTop: 8, fontSize: 13 }}>
                Intensity {pet.emotion_intensity} · Intimacy L{pet.intimacy_level} ({pet.intimacy_xp} xp)
              </div>
              {pet.primary_agent_id && (
                <div style={{ color: '#6c7689', marginTop: 4, fontSize: 11 }}>Engine: {pet.primary_agent_id}</div>
              )}
            </div>
          ) : (
            <div style={{ color: '#6c7689', fontSize: 13 }}>Pet state unavailable.</div>
          )}
        </Panel>

        <Panel title="Recent Handoffs">
          {(handoffs ?? []).length === 0 ? (
            <div style={{ color: '#6c7689', fontSize: 13 }}>No handoffs in flight.</div>
          ) : (
            (handoffs ?? []).slice(0, 6).map((h) => (
              <div key={h.id} style={{ padding: '10px 0', borderBottom: '1px solid #1f242d', fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{h.from_device_id} → {h.to_device_id ?? '?'} <span style={{ color: '#6c7689' }}>· {h.mode}</span></span>
                  <span style={{ color: statusColor(h.status) }}>{h.status}</span>
                </div>
                {h.status === 'pending' && (
                  <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
                    <button disabled={busy === h.id} onClick={() => onAcceptHandoff(h.id, 'handoff')} style={btn('#22D3FF')}>Accept</button>
                    <button disabled={busy === h.id} onClick={() => onAcceptHandoff(h.id, 'mirror')} style={btn('#7C3AED')}>Mirror</button>
                  </div>
                )}
              </div>
            ))
          )}
        </Panel>
      </section>

      <Panel title={`Pending Approvals (${approvals?.length ?? 0})`}>
        {(approvals ?? []).length === 0 ? (
          <div style={{ color: '#6c7689', fontSize: 13 }}>No items waiting for you.</div>
        ) : (
          (approvals ?? []).map((a) => (
            <div key={a.id} style={{ padding: '12px 0', borderBottom: '1px solid #1f242d' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div>
                  <div style={{ fontSize: 14 }}>{a.action?.kind ?? 'action'}</div>
                  <div style={{ color: '#6c7689', fontSize: 11, marginTop: 2 }}>{new Date(a.created_at).toLocaleString()}</div>
                </div>
                <span style={{ color: '#22D3FF', fontSize: 12, fontWeight: 700 }}>{a.risk_level}</span>
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button disabled={busy === a.id} onClick={() => onApprove(a.id)} style={btn('#22D3FF')}>Approve</button>
                <button disabled={busy === a.id} onClick={() => onReject(a.id)} style={btn('#fca5a5')}>Reject</button>
              </div>
            </div>
          ))
        )}
      </Panel>
    </ConsoleLayout>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ padding: 20, background: '#11141a', border: '1px solid #1f242d', borderRadius: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function btn(color: string): React.CSSProperties {
  return {
    padding: '6px 12px',
    background: 'transparent',
    border: `1px solid ${color}`,
    borderRadius: 6,
    color,
    fontSize: 12,
    cursor: 'pointer',
  };
}

function statusColor(s: string): string {
  switch (s) {
    case 'pending':
      return '#f59e0b';
    case 'accepted':
    case 'approved':
      return '#22D3FF';
    case 'rejected':
    case 'cancelled':
    case 'expired':
      return '#fca5a5';
    default:
      return '#9aa3b2';
  }
}

function petEmoji(e: PetState['emotion']): string {
  switch (e) {
    case 'happy':
      return '😊';
    case 'love':
      return '😍';
    case 'excited':
      return '🤩';
    case 'focused':
      return '🤓';
    case 'concerned':
      return '😟';
    case 'tired':
      return '😪';
    case 'sad':
      return '😢';
    case 'angry':
      return '😠';
    case 'sleepy':
      return '😴';
    case 'calm':
    default:
      return '😌';
  }
}
