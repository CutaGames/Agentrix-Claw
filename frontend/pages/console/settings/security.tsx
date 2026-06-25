import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { v1Api, type CoSignRequest } from '../../../lib/api/v1.api';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { L } from '../../../lib/console.i18n';
import { T, cardStyle, btnPrimaryStyle, btnDangerStyle, emptyStateStyle } from '../../../lib/console.theme';

const SURFACES = ['mobile', 'desktop', 'wearable', 'web'];

export default function ConsoleSettingsSecurity(): React.ReactElement {
  const { t } = useLocalization();
  const [requests, setRequests] = React.useState<CoSignRequest[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<'pending' | 'signed' | 'rejected'>('pending');
  const [busy, setBusy] = React.useState<string | null>(null);

  const reload = React.useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const r = await v1Api.cosign.list(filter);
      setRequests(r ?? []);
    } finally { setLoading(false); }
  }, [filter]);

  React.useEffect(() => { void reload(); }, [reload]);

  const sign = async (id: string, surface: string): Promise<void> => {
    setBusy(id);
    try { await v1Api.cosign.sign(id, surface); await reload(); } finally { setBusy(null); }
  };
  const reject = async (id: string): Promise<void> => {
    setBusy(id);
    try { await v1Api.cosign.reject(id, 'user-rejected'); await reload(); } finally { setBusy(null); }
  };

  const filterLabels: Record<string, string> = {
    pending: t(L.common.pending),
    signed: t(L.common.signed),
    rejected: t(L.common.rejected),
  };

  return (
    <ConsoleLayout title={t(L.settings.securityTitle)}>
      <p style={{ color: T.text.secondary, fontSize: T.font.sizeBody, marginBottom: 16 }}>{t(L.settings.securityDesc)}</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['pending', 'signed', 'rejected'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            style={{
              padding: '8px 16px',
              background: filter === f ? T.text.accent : T.bg.panel,
              color: filter === f ? T.text.inverted : T.text.secondary,
              border: `1px solid ${filter === f ? T.text.accent : T.border.subtle}`,
              borderRadius: T.radius.sm,
              fontSize: T.font.sizeCaption,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: T.font.family,
            }}>
            {filterLabels[f]}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={emptyStateStyle}>{t(L.common.loading)}</div>
      ) : requests.length === 0 ? (
        <div style={emptyStateStyle}>{t(L.settings.noPendingCosign).replace('{filter}', filterLabels[filter])}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {requests.map((r) => (
            <div key={r.id} style={{ ...cardStyle, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: T.font.sizeBody, fontWeight: 700, color: T.text.primary }}>{r.action?.kind ?? '—'}</div>
                  <div style={{ fontSize: T.font.sizeTiny, color: T.text.muted, marginTop: 4 }}>
                    {t({ zh: '需签', en: 'Required' })}: {r.required_surfaces?.join(', ') ?? '—'} · {t({ zh: '已签', en: 'Signed' })}: {r.signed_surfaces?.length ?? 0} / {r.required_surfaces?.length ?? 0}
                  </div>
                  <div style={{ fontSize: T.font.sizeTiny, color: T.text.muted, marginTop: 2 }}>{new Date(r.created_at).toLocaleString()}</div>
                </div>
                {filter === 'pending' && (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                    {SURFACES.filter((s) => r.required_surfaces?.includes(s) && !r.signed_surfaces?.includes(s)).map((s) => (
                      <button key={s} onClick={() => sign(r.id, s)} disabled={busy === r.id}
                        style={{ ...btnPrimaryStyle, padding: '7px 12px', fontSize: T.font.sizeTiny }}>
                        {t(L.settings.signOnSurface).replace('{surface}', s)}
                      </button>
                    ))}
                    <button onClick={() => reject(r.id)} disabled={busy === r.id} style={btnDangerStyle}>{t(L.common.reject)}</button>
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
