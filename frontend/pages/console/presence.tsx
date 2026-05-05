import React from 'react';
import { ConsoleLayout } from '../../components/console/ConsoleLayout';
import { v1Api, type PetState, type HandoffRecord, type ApprovalRequest } from '../../lib/api/v1.api';
import { useLocalization } from '../../contexts/LocalizationContext';
import { L } from '../../lib/console.i18n';
import { T, cardStyle, btnPrimaryStyle, btnDangerStyle, pillStyle } from '../../lib/console.theme';

export default function ConsolePresence(): React.ReactElement {
  const { t } = useLocalization();
  const [pet, setPet] = React.useState<PetState | null>(null);
  const [handoffs, setHandoffs] = React.useState<HandoffRecord[]>([]);
  const [approvals, setApprovals] = React.useState<ApprovalRequest[]>([]);
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async (): Promise<void> => {
    const [p, h, a] = await Promise.all([
      v1Api.pet.getState().catch((): null => null),
      v1Api.handoff.list().catch((): null => null),
      v1Api.approval.list('pending').catch((): null => null),
    ]);
    setPet(p);
    setHandoffs(h ?? []);
    setApprovals(a ?? []);
  }, []);

  React.useEffect(() => {
    void load();
    const id = window.setInterval(load, 8_000);
    return () => window.clearInterval(id);
  }, [load]);

  const acceptHandoff = async (id: string): Promise<void> => {
    setBusy(id);
    try { await v1Api.handoff.accept(id, 'web'); await load(); } finally { setBusy(null); }
  };
  const cancelHandoff = async (id: string): Promise<void> => {
    setBusy(id);
    try { await v1Api.handoff.cancel(id); await load(); } finally { setBusy(null); }
  };
  const approve = async (id: string): Promise<void> => {
    setBusy(id);
    try { await v1Api.approval.approve(id, 'web', 'password'); await load(); } finally { setBusy(null); }
  };
  const reject = async (id: string): Promise<void> => {
    setBusy(id);
    try { await v1Api.approval.reject(id, 'user-rejected'); await load(); } finally { setBusy(null); }
  };

  return (
    <ConsoleLayout title={t(L.presence.title)}>
      <p style={{ color: T.text.secondary, marginBottom: 24 }}>{t(L.presence.desc)}</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={cardStyle}>
          <h3 style={H3}>{t(L.presence.petCard)}</h3>
          {pet ? (
            <>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🐾</div>
              <div style={{ fontSize: T.font.sizeBody, color: T.text.primary }}>
                {t({ zh: '情绪', en: 'Emotion' })}: <strong style={{ color: T.text.accent }}>{pet.emotion}</strong> ({pet.emotion_intensity})
              </div>
              <div style={{ fontSize: T.font.sizeSmall, color: T.text.secondary, marginTop: 4 }}>
                {t({ zh: '亲密度', en: 'Intimacy' })}: L{pet.intimacy_level} · XP {pet.intimacy_xp}
              </div>
            </>
          ) : (
            <div style={{ color: T.text.muted, fontSize: T.font.sizeSmall }}>{t(L.common.loading)}</div>
          )}
        </div>
      </div>

      <h2 style={{ ...H3, fontSize: T.font.sizeH2, marginBottom: 14 }}>{t(L.presence.handoffs)} ({handoffs.length})</h2>
      {handoffs.length === 0 ? (
        <Empty msg={t(L.presence.noHandoffs)} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {handoffs.map((h) => (
            <div key={h.id} style={{ ...cardStyle, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: T.font.sizeSmall, color: T.text.primary }}>
                  {h.from_device_id} → {h.to_device_id ?? '—'} <span style={pillStyle('subtle')}>{h.mode}</span>
                </div>
                <div style={{ fontSize: T.font.sizeTiny, color: T.text.muted, marginTop: 4 }}>{new Date(h.created_at).toLocaleString()}</div>
              </div>
              {h.status === 'pending' && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => acceptHandoff(h.id)} disabled={busy === h.id} style={btnPrimaryStyle}>{t(L.presence.accept)}</button>
                  <button onClick={() => cancelHandoff(h.id)} disabled={busy === h.id} style={btnDangerStyle}>{t(L.presence.cancel)}</button>
                </div>
              )}
              {h.status !== 'pending' && <span style={pillStyle(h.status === 'accepted' ? 'success' : 'subtle')}>{h.status}</span>}
            </div>
          ))}
        </div>
      )}

      <h2 style={{ ...H3, fontSize: T.font.sizeH2, marginBottom: 14 }}>{t(L.presence.approvals)} ({approvals.length})</h2>
      {approvals.length === 0 ? (
        <Empty msg={t(L.presence.noApprovals)} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {approvals.map((a) => (
            <div key={a.id} style={{ ...cardStyle, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: T.font.sizeSmall, color: T.text.primary }}>
                  {a.action?.kind ?? '—'} <span style={pillStyle(a.risk_level === 'L3' ? 'danger' : a.risk_level === 'L2' ? 'warning' : 'subtle')}>{a.risk_level}</span>
                </div>
                <div style={{ fontSize: T.font.sizeTiny, color: T.text.muted, marginTop: 4 }}>{new Date(a.created_at).toLocaleString()}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => approve(a.id)} disabled={busy === a.id} style={btnPrimaryStyle}>{t(L.common.approve)}</button>
                <button onClick={() => reject(a.id)} disabled={busy === a.id} style={btnDangerStyle}>{t(L.common.reject)}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </ConsoleLayout>
  );
}

const H3: React.CSSProperties = { fontSize: T.font.sizeH2, fontWeight: T.font.weightSemibold, marginBottom: 12, color: T.text.primary };
function Empty({ msg }: { msg: string }): React.ReactElement {
  return <div style={{ padding: 28, textAlign: 'center', background: T.bg.panel, border: `1px dashed ${T.border.subtle}`, borderRadius: T.radius.lg, color: T.text.muted, fontSize: T.font.sizeSmall, marginBottom: 24 }}>{msg}</div>;
}
