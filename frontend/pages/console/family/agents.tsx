import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { v1Api, type FamilyAccount } from '../../../lib/api/v1.api';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { L } from '../../../lib/console.i18n';
import { T, cardStyle, inputStyle, selectStyle, btnPrimaryStyle, emptyStateStyle } from '../../../lib/console.theme';

const ROLE_OPTIONS = ['butler', 'tutor', 'concierge', 'chef', 'driver', 'doctor', 'custom'];
const VISIBLE_ROLES = ['owner', 'admin', 'member', 'child'];

export default function ConsoleFamilyAgents(): React.ReactElement {
  const { t } = useLocalization();
  const [families, setFamilies] = React.useState<FamilyAccount[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | undefined>();
  const [name, setName] = React.useState('');
  const [role, setRole] = React.useState('butler');
  const [visibleTo, setVisibleTo] = React.useState<string[]>(['owner', 'admin', 'member']);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const reload = React.useCallback(async (): Promise<void> => {
    const list = (await v1Api.family.list().catch((): null => null)) ?? [];
    setFamilies(list);
    if (!selectedId && list[0]) setSelectedId(list[0].id);
  }, [selectedId]);

  React.useEffect(() => { void reload(); }, [reload]);

  const selected = families.find((f) => f.id === selectedId);

  const toggle = (r: string): void => {
    setVisibleTo((cur) => cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]);
  };

  const onSubmit = async (): Promise<void> => {
    if (!selectedId || !name.trim()) return;
    setBusy(true); setErr(null);
    try {
      await v1Api.family.createHouseholdAgent(selectedId, { name: name.trim(), role, visible_to_roles: visibleTo });
      setName('');
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Create agent failed');
    } finally { setBusy(false); }
  };

  return (
    <ConsoleLayout title={t(L.family.agentsTitle)}>
      <p style={{ color: T.text.secondary, fontSize: T.font.sizeBody, marginBottom: 16 }}>{t(L.family.agentsDesc)}</p>

      {families.length === 0 ? (
        <div style={emptyStateStyle}>{t({ zh: '请先创建一个家庭。', en: 'Create a family first.' })}</div>
      ) : (
        <>
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} style={{ ...selectStyle, marginBottom: 16 }}>
            {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>

          {selected?.household_agents && selected.household_agents.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
              {selected.household_agents.map((a) => (
                <div key={a.id} style={{ ...cardStyle, padding: 14 }}>
                  <div style={{ fontSize: T.font.sizeBody, fontWeight: 700, color: T.text.primary }}>🤖 {a.name}</div>
                  <div style={{ fontSize: T.font.sizeTiny, color: T.text.muted, marginTop: 4 }}>{a.role ?? '—'}</div>
                </div>
              ))}
            </div>
          )}

          <div style={cardStyle}>
            <h3 style={{ fontSize: T.font.sizeH2, fontWeight: T.font.weightSemibold, marginBottom: 14, color: T.text.primary }}>{t(L.family.newAgent)}</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t(L.family.agentName)} style={{ ...inputStyle, flex: 1, minWidth: 180 }} />
              <select value={role} onChange={(e) => setRole(e.target.value)} style={selectStyle}>
                {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: T.font.sizeTiny, color: T.text.muted, marginBottom: 6 }}>{t(L.family.visibleTo)}</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {VISIBLE_ROLES.map((r) => (
                  <label key={r} style={{ fontSize: T.font.sizeCaption, color: T.text.secondary, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <input type="checkbox" checked={visibleTo.includes(r)} onChange={() => toggle(r)} />
                    {r}
                  </label>
                ))}
              </div>
            </div>
            <button onClick={onSubmit} disabled={busy || !name.trim() || !selectedId} style={btnPrimaryStyle}>
              {busy ? t(L.common.creating) : t(L.common.create)}
            </button>
            {err && <div style={{ marginTop: 12, padding: 10, background: '#3a1414', border: '1px solid #7f1d1d', borderRadius: 8, fontSize: T.font.sizeCaption, color: T.text.danger }}>{err}</div>}
          </div>
        </>
      )}
    </ConsoleLayout>
  );
}
