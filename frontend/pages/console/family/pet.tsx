import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { v1Api, type FamilyAccount, type PetEmotion } from '../../../lib/api/v1.api';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { L } from '../../../lib/console.i18n';
import { T, cardStyle, inputStyle, selectStyle, btnPrimaryStyle, emptyStateStyle } from '../../../lib/console.theme';

const EMOTIONS: PetEmotion[] = ['calm', 'happy', 'excited', 'focused', 'concerned', 'tired', 'love', 'sad', 'angry', 'sleepy'];

export default function ConsoleFamilyPet(): React.ReactElement {
  const { t } = useLocalization();
  const [families, setFamilies] = React.useState<FamilyAccount[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | undefined>();
  const [name, setName] = React.useState('');
  const [emotion, setEmotion] = React.useState<PetEmotion>('happy');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const reload = React.useCallback(async (): Promise<void> => {
    const list = (await v1Api.family.list().catch((): null => null)) ?? [];
    setFamilies(list);
    if (!selectedId && list[0]) setSelectedId(list[0].id);
  }, [selectedId]);

  React.useEffect(() => { void reload(); }, [reload]);

  const selected = families.find((f) => f.id === selectedId);

  const onSubmit = async (): Promise<void> => {
    if (!selectedId || !name.trim()) return;
    setBusy(true); setErr(null);
    try {
      await v1Api.family.setupPet(selectedId, name.trim(), emotion);
      setName('');
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Setup pet failed');
    } finally { setBusy(false); }
  };

  return (
    <ConsoleLayout title={t(L.family.petTitle)}>
      <p style={{ color: T.text.secondary, fontSize: T.font.sizeBody, marginBottom: 16 }}>{t(L.family.petDesc)}</p>

      {families.length === 0 ? (
        <div style={emptyStateStyle}>{t({ zh: '请先创建一个家庭。', en: 'Create a family first.' })}</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} style={selectStyle}>
              {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>

          {selected?.pet ? (
            <div style={{ ...cardStyle, padding: 24, marginBottom: 24 }}>
              <div style={{ fontSize: T.font.sizeTiny, color: T.text.muted, textTransform: 'uppercase', letterSpacing: 0.6 }}>{t(L.family.currentPet)}</div>
              <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6, color: T.text.primary }}>🐾 {selected.pet.name}</div>
              <div style={{ marginTop: 8, fontSize: T.font.sizeSmall, color: T.text.accent }}>{t(L.family.emotion)}: <strong>{selected.pet.emotion ?? '—'}</strong></div>
              <div style={{ fontSize: T.font.sizeTiny, color: T.text.muted, marginTop: 6, fontFamily: 'monospace' }}>{selected.pet.pet_id}</div>
            </div>
          ) : (
            <div style={emptyStateStyle}>{t(L.family.noPet)}</div>
          )}

          <div style={cardStyle}>
            <h3 style={{ fontSize: T.font.sizeH2, fontWeight: T.font.weightSemibold, marginBottom: 14, color: T.text.primary }}>{selected?.pet ? t(L.family.updatePet) : t(L.family.setupPet)}</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t(L.family.petName)} style={{ ...inputStyle, flex: 1, minWidth: 200 }} />
              <select value={emotion} onChange={(e) => setEmotion(e.target.value as PetEmotion)} style={selectStyle}>
                {EMOTIONS.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
              <button onClick={onSubmit} disabled={busy || !name.trim() || !selectedId} style={btnPrimaryStyle}>
                {busy ? t(L.common.saving) : t(L.common.save)}
              </button>
            </div>
            {err && <div style={{ marginTop: 12, padding: 10, background: '#3a1414', border: '1px solid #7f1d1d', borderRadius: 8, fontSize: T.font.sizeCaption, color: T.text.danger }}>{err}</div>}
          </div>
        </>
      )}
    </ConsoleLayout>
  );
}
