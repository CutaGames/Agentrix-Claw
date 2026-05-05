import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { v1Api, type FamilyAccount } from '../../../lib/api/v1.api';

export default function ConsoleFamily(): React.ReactElement {
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

  React.useEffect(() => {
    void load();
  }, [load]);

  const onCreate = async (): Promise<void> => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await v1Api.family.create(newName.trim());
      setNewName('');
      await load();
    } finally {
      setCreating(false);
    }
  };

  return (
    <ConsoleLayout title="Family Account">
      <p style={{ color: '#9aa3b2', fontSize: 14, marginBottom: 24 }}>
        Households with shared pet, household agents, and allowance budgets.
        Backed by <code>/api/v1/family/*</code>.
      </p>

      {error && (
        <div style={{ marginBottom: 16, padding: 12, background: '#3a1414', border: '1px solid #7f1d1d', borderRadius: 8, fontSize: 13, color: '#fca5a5' }}>{error}</div>
      )}

      <div style={{ padding: 16, background: '#11141a', border: '1px solid #1f242d', borderRadius: 12, marginBottom: 16, display: 'flex', gap: 8 }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New family name (e.g. Smith Family)"
          style={{ flex: 1, background: '#0a0c11', border: '1px solid #1f242d', color: '#E2E8F0', padding: '8px 12px', borderRadius: 6, fontSize: 13 }}
        />
        <button
          onClick={onCreate}
          disabled={creating || !newName.trim()}
          style={{ padding: '8px 16px', background: '#22D3FF', color: '#07080B', border: 0, borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: creating ? 'wait' : 'pointer' }}
        >
          + Create
        </button>
      </div>

      {(families ?? []).length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', background: '#11141a', border: '1px solid #1f242d', borderRadius: 12, color: '#9aa3b2' }}>
          {families === null ? 'Loading…' : 'No families yet. Create one above to start sharing a pet and household agents with family members.'}
        </div>
      ) : (
        (families ?? []).map((f) => (
          <div key={f.id} style={{ padding: 20, background: '#11141a', border: '1px solid #1f242d', borderRadius: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{f.name}</div>
            <div style={{ fontSize: 11, color: '#6c7689', marginBottom: 12 }}>{f.id}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, fontSize: 13 }}>
              <Stat label="Members" value={String(f.members?.length ?? 0)} />
              <Stat label="Pet" value={f.pet?.name ?? '—'} />
              <Stat label="Agents" value={String(f.household_agents?.length ?? 0)} />
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
      <div style={{ fontSize: 11, color: '#6c7689', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  );
}
