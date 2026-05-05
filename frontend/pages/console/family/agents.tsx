import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { v1Api, type FamilyAccount } from '../../../lib/api/v1.api';

const ROLE_OPTIONS = ['butler', 'tutor', 'concierge', 'chef', 'driver', 'doctor', 'custom'];
const VISIBLE_ROLES = ['owner', 'admin', 'member', 'child'];

export default function ConsoleFamilyAgents(): React.ReactElement {
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
    setBusy(true);
    setErr(null);
    try {
      await v1Api.family.createHouseholdAgent(selectedId, { name: name.trim(), role, visible_to_roles: visibleTo });
      setName('');
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Create agent failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConsoleLayout title="Household Agents">
      <p style={{ color: '#9aa3b2', fontSize: 14, marginBottom: 16 }}>
        Shared household agents (Butler / Tutor / Chef…) with per-role RBAC.
        Backed by <code>POST /api/v1/family/:id/agents</code>.
      </p>

      {families.length === 0 ? (
        <Empty msg="Create a family first." />
      ) : (
        <>
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} style={{ ...selectStyle, marginBottom: 16 }}>
            {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>

          {selected?.household_agents && selected.household_agents.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
              {selected.household_agents.map((a) => (
                <div key={a.id} style={{ padding: 14, background: '#11141a', border: '1px solid #1f242d', borderRadius: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>🤖 {a.name}</div>
                  <div style={{ fontSize: 11, color: '#6c7689', marginTop: 4 }}>{a.role ?? '—'}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ padding: 20, background: '#11141a', border: '1px solid #1f242d', borderRadius: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>+ New Household Agent</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Agent name (e.g. Alfred)" style={{ flex: 1, minWidth: 180, ...selectStyle }} />
              <select value={role} onChange={(e) => setRole(e.target.value)} style={selectStyle}>
                {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#6c7689', marginBottom: 6 }}>Visible to roles:</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {VISIBLE_ROLES.map((r) => (
                  <label key={r} style={{ fontSize: 12, color: '#9aa3b2', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <input type="checkbox" checked={visibleTo.includes(r)} onChange={() => toggle(r)} />
                    {r}
                  </label>
                ))}
              </div>
            </div>
            <button onClick={onSubmit} disabled={busy || !name.trim() || !selectedId} style={btnPrimary}>
              {busy ? 'Creating…' : 'Create'}
            </button>
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
