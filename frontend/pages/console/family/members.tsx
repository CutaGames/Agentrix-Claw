import React from 'react';
import { useRouter } from 'next/router';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { v1Api, type FamilyAccount } from '../../../lib/api/v1.api';

export default function ConsoleFamilyMembers(): React.ReactElement {
  const router = useRouter();
  const familyId = (router.query.id as string) || undefined;
  const [families, setFamilies] = React.useState<FamilyAccount[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | undefined>(familyId);
  const [role, setRole] = React.useState<'admin' | 'member' | 'child'>('member');
  const [code, setCode] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      const list = (await v1Api.family.list().catch((): null => null)) ?? [];
      if (!alive) return;
      setFamilies(list);
      if (!selectedId && list[0]) setSelectedId(list[0].id);
    })();
    return () => { alive = false; };
  }, [selectedId]);

  const selected = families.find((f) => f.id === selectedId);

  const generateInvite = async (): Promise<void> => {
    if (!selectedId) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await v1Api.family.invite(selectedId, role);
      setCode(r?.invitation_code ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Invite failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConsoleLayout title="Family Members">
      <p style={{ color: '#9aa3b2', fontSize: 14, marginBottom: 16 }}>
        Invite family members. Backed by <code>/api/v1/family/:id/invite</code>.
      </p>

      {families.length === 0 ? (
        <Empty msg="Create a family first on the Family Overview page." />
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} style={selectStyle}>
              {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <select value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'member' | 'child')} style={selectStyle}>
              <option value="admin">Admin</option>
              <option value="member">Member</option>
              <option value="child">Child</option>
            </select>
            <button onClick={generateInvite} disabled={busy || !selectedId} style={btnPrimary}>
              {busy ? 'Generating…' : '+ Generate Invite Code'}
            </button>
          </div>

          {err && <div style={errStyle}>{err}</div>}

          {code && (
            <div style={{ padding: 16, background: '#0d3a2c', border: '1px solid #34d399', borderRadius: 10, marginBottom: 24 }}>
              <div style={{ fontSize: 12, color: '#34d399' }}>Invitation code (expires in 7 days)</div>
              <code style={{ fontSize: 22, fontWeight: 700, color: '#fff', display: 'block', marginTop: 6 }}>{code}</code>
            </div>
          )}

          <h2 style={{ fontSize: 13, color: '#9aa3b2', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
            Current Members ({selected?.members?.length ?? 0})
          </h2>
          {!selected?.members || selected.members.length === 0 ? (
            <Empty msg="No members yet — generate an invite code above." />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr><Th>Display name</Th><Th>Role</Th><Th>User ID</Th></tr></thead>
              <tbody>
                {selected.members.map((m) => (
                  <tr key={m.user_id} style={{ borderTop: '1px solid #1f242d' }}>
                    <Td>{m.display_name ?? '—'}</Td>
                    <Td><Pill text={m.role} /></Td>
                    <Td style={{ fontFamily: 'monospace', fontSize: 11, color: '#6c7689' }}>{m.user_id.slice(0, 16)}…</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </ConsoleLayout>
  );
}

const selectStyle: React.CSSProperties = { background: '#0a0c11', border: '1px solid #1f242d', color: '#E2E8F0', padding: '8px 12px', borderRadius: 6, fontSize: 13 };
const btnPrimary: React.CSSProperties = { padding: '8px 16px', background: '#22D3FF', color: '#07080B', border: 0, borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' };
const errStyle: React.CSSProperties = { padding: 12, background: '#3a1414', border: '1px solid #7f1d1d', borderRadius: 8, fontSize: 13, color: '#fca5a5', marginBottom: 16 };
function Empty({ msg }: { msg: string }): React.ReactElement {
  return <div style={{ padding: 32, textAlign: 'center', background: '#11141a', border: '1px solid #1f242d', borderRadius: 10, color: '#9aa3b2', fontSize: 13 }}>{msg}</div>;
}
function Pill({ text }: { text: string }): React.ReactElement {
  return <span style={{ fontSize: 10, padding: '2px 8px', background: '#1f242d', color: '#22D3FF', borderRadius: 999 }}>{text}</span>;
}
function Th({ children }: { children: React.ReactNode }): React.ReactElement {
  return <th style={{ textAlign: 'left', padding: '10px 8px', fontSize: 11, color: '#6c7689', textTransform: 'uppercase', fontWeight: 600 }}>{children}</th>;
}
function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }): React.ReactElement {
  return <td style={{ padding: '10px 8px', ...style }}>{children}</td>;
}
