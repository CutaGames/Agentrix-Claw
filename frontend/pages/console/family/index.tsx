import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { v1Api, type FamilyAccount } from '../../../lib/api/v1.api';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { L } from '../../../lib/console.i18n';
import { T, cardStyle, inputStyle, btnPrimaryStyle, emptyStateStyle } from '../../../lib/console.theme';

export default function ConsoleFamily(): React.ReactElement {
  const { t } = useLocalization();
  const [families, setFamilies] = React.useState<FamilyAccount[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState('');

  const load = React.useCallback(async (): Promise<void> => {
    try {
      const r = await v1Api.family.list();
      setFamilies(r);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'load failed');
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const onCreate = async (): Promise<void> => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await v1Api.family.create(newName.trim());
      setNewName('');
      await load();
    } finally { setCreating(false); }
  };

  return (
    <ConsoleLayout title={t(L.family.title)}>
      <p style={{ color: T.text.secondary, fontSize: T.font.sizeBody, marginBottom: 24 }}>{t(L.family.desc)}</p>

      {error && (
        <div style={{ marginBottom: 16, padding: 12, background: '#3a1414', border: '1px solid #7f1d1d', borderRadius: 8, fontSize: T.font.sizeSmall, color: T.text.danger }}>{error}</div>
      )}

      <div style={{ ...cardStyle, padding: 16, marginBottom: 16, display: 'flex', gap: 8 }}>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t(L.family.newPlaceholder)} style={{ ...inputStyle, flex: 1 }} />
        <button onClick={onCreate} disabled={creating || !newName.trim()} style={{ ...btnPrimaryStyle, cursor: creating ? 'wait' : 'pointer' }}>
          {creating ? t(L.common.creating) : t(L.family.createBtn)}
        </button>
      </div>

      {(families ?? []).length === 0 ? (
        <div style={emptyStateStyle}>
          {families === null ? t(L.common.loading) : t(L.family.noFamily)}
        </div>
      ) : (
        (families ?? []).map((f) => (
          <div key={f.id} style={{ ...cardStyle, marginBottom: 12 }}>
            <div style={{ fontSize: T.font.sizeH2, fontWeight: 700, color: T.text.primary }}>{f.name}</div>
            <div style={{ fontSize: T.font.sizeTiny, color: T.text.muted, marginBottom: 12, fontFamily: 'monospace' }}>{f.id}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, fontSize: T.font.sizeSmall }}>
              <Stat label={t(L.family.membersCount)} value={String(f.members?.length ?? 0)} />
              <Stat label={t(L.family.petLabel)} value={f.pet?.name ?? '—'} />
              <Stat label={t(L.family.agentsCount)} value={String(f.household_agents?.length ?? 0)} />
            </div>
          </div>
        ))
      )}
    </ConsoleLayout>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div>
      <div style={{ fontSize: T.font.sizeTiny, color: T.text.muted, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4, color: T.text.primary }}>{value}</div>
    </div>
  );
}
