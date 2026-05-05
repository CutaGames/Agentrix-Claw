import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { v1Api, type FamilyAccount, type PetEmotion } from '../../../lib/api/v1.api';

const EMOTIONS: PetEmotion[] = ['calm', 'happy', 'excited', 'focused', 'concerned', 'tired', 'love', 'sad', 'angry', 'sleepy'];

export default function ConsoleFamilyPet(): React.ReactElement {
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

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const selected = families.find((f) => f.id === selectedId);

  const onSubmit = async (): Promise<void> => {
    if (!selectedId || !name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await v1Api.family.setupPet(selectedId, name.trim(), emotion);
      setName('');
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Setup pet failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConsoleLayout title="Family Pet">
      <p style={{ color: '#9aa3b2', fontSize: 14, marginBottom: 16 }}>
        Shared family pet — visible to every household member in real-time.
        Backed by <code>POST /api/v1/family/:id/pet</code>.
      </p>

      {families.length === 0 ? (
        <Empty msg="Create a family first." />
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} style={selectStyle}>
              {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>

          {selected?.pet ? (
            <div style={{ padding: 24, background: '#11141a', border: '1px solid #1f242d', borderRadius: 12, marginBottom: 24 }}>
              <div style={{ fontSize: 11, color: '#6c7689', textTransform: 'uppercase' }}>Current Pet</div>
              <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>🐾 {selected.pet.name}</div>
              <div style={{ marginTop: 8, fontSize: 13, color: '#22D3FF' }}>Emotion: <strong>{selected.pet.emotion ?? '—'}</strong></div>
              <div style={{ fontSize: 11, color: '#6c7689', marginTop: 6 }}>{selected.pet.pet_id}</div>
            </div>
          ) : (
            <Empty msg="No pet configured for this family yet." />
          )}

          <div style={{ padding: 20, background: '#11141a', border: '1px solid #1f242d', borderRadius: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>{selected?.pet ? 'Update Pet' : 'Setup Pet'}</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Pet name (e.g. Buddy)"
                style={{ flex: 1, minWidth: 200, ...selectStyle }}
              />
              <select value={emotion} onChange={(e) => setEmotion(e.target.value as PetEmotion)} style={selectStyle}>
                {EMOTIONS.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
              <button onClick={onSubmit} disabled={busy || !name.trim() || !selectedId} style={btnPrimary}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
            {err && <div style={errStyle}>{err}</div>}
          </div>
        </>
      )}
    </ConsoleLayout>
  );
}

const selectStyle: React.CSSProperties = { background: '#0a0c11', border: '1px solid #1f242d', color: '#E2E8F0', padding: '8px 12px', borderRadius: 6, fontSize: 13 };
const btnPrimary: React.CSSProperties = { padding: '8px 16px', background: '#22D3FF', color: '#07080B', border: 0, borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const errStyle: React.CSSProperties = { marginTop: 12, padding: 10, background: '#3a1414', border: '1px solid #7f1d1d', borderRadius: 8, fontSize: 12, color: '#fca5a5' };
function Empty({ msg }: { msg: string }): React.ReactElement {
  return <div style={{ padding: 32, textAlign: 'center', background: '#11141a', border: '1px solid #1f242d', borderRadius: 10, color: '#9aa3b2', fontSize: 13, marginBottom: 24 }}>{msg}</div>;
}
