import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { v1Api, type PrivacyItem, type PrivacyAuditEntry, type PrivacyCategory } from '../../../lib/api/v1.api';

const CATEGORIES: PrivacyCategory[] = ['financial', 'health', 'relationship', 'location'];

export default function ConsoleSettingsPrivacy(): React.ReactElement {
  const [items, setItems] = React.useState<PrivacyItem[]>([]);
  const [audit, setAudit] = React.useState<PrivacyAuditEntry[]>([]);
  const [category, setCategory] = React.useState<PrivacyCategory | ''>('');
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      setLoading(true);
      try {
        const [it, au] = await Promise.all([
          v1Api.privacy.listItems(category || undefined).catch((): null => null),
          v1Api.privacy.audit(20).catch((): null => null),
        ]);
        if (!alive) return;
        setItems(it ?? []);
        setAudit(au ?? []);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [category]);

  return (
    <ConsoleLayout title="Privacy Fence">
      <p style={{ color: '#9aa3b2', fontSize: 14, marginBottom: 16 }}>
        Sensitive memories — financial / health / relationship / location — with TTL grants and revocation.
        Backed by <code>/api/v1/privacy/*</code>.
      </p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        <Tab active={category === ''} onClick={() => setCategory('')} label="All" />
        {CATEGORIES.map((c) => (
          <Tab key={c} active={category === c} onClick={() => setCategory(c)} label={c} />
        ))}
      </div>

      <h2 style={sectionH}>Items ({items.length})</h2>
      {loading && items.length === 0 ? (
        <Empty msg="Loading…" />
      ) : items.length === 0 ? (
        <Empty msg="No sensitive items in this category." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 24 }}>
          {items.map((it) => (
            <div key={it.id} style={{ padding: 14, background: '#11141a', border: '1px solid #1f242d', borderRadius: 10 }}>
              <Pill text={it.category} />
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8 }}>{it.key}</div>
              {it.preview && <div style={{ fontSize: 11, color: '#9aa3b2', marginTop: 4 }}>{it.preview}</div>}
              <div style={{ fontSize: 10, color: '#6c7689', marginTop: 6 }}>{new Date(it.created_at).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}

      <h2 style={sectionH}>Recent Access ({audit.length})</h2>
      {audit.length === 0 ? (
        <Empty msg="No access events." />
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr><Th>Action</Th><Th>Actor</Th><Th>Item</Th><Th>Time</Th></tr></thead>
          <tbody>
            {audit.map((a) => (
              <tr key={a.id} style={{ borderTop: '1px solid #1f242d' }}>
                <Td><Pill text={a.action} /></Td>
                <Td style={{ fontFamily: 'monospace', fontSize: 11, color: '#6c7689' }}>{a.actor_id.slice(0, 12)}…</Td>
                <Td style={{ fontFamily: 'monospace', fontSize: 11, color: '#6c7689' }}>{(a.item_id ?? a.grant_id ?? '').slice(0, 12)}…</Td>
                <Td style={{ fontSize: 11, color: '#6c7689' }}>{new Date(a.created_at).toLocaleString()}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ConsoleLayout>
  );
}

const sectionH: React.CSSProperties = { fontSize: 13, color: '#9aa3b2', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 };
function Tab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }): React.ReactElement {
  return (
    <button onClick={onClick} style={{ padding: '6px 14px', background: active ? '#22D3FF' : '#11141a', color: active ? '#07080B' : '#9aa3b2', border: '1px solid #1f242d', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>{label}</button>
  );
}
function Pill({ text }: { text: string }): React.ReactElement {
  return <span style={{ fontSize: 10, padding: '2px 8px', background: '#1f242d', color: '#22D3FF', borderRadius: 999 }}>{text}</span>;
}
function Empty({ msg }: { msg: string }): React.ReactElement {
  return <div style={{ padding: 24, textAlign: 'center', background: '#11141a', border: '1px solid #1f242d', borderRadius: 10, color: '#9aa3b2', fontSize: 13, marginBottom: 24 }}>{msg}</div>;
}
function Th({ children }: { children: React.ReactNode }): React.ReactElement {
  return <th style={{ textAlign: 'left', padding: '8px', fontSize: 10, color: '#6c7689', textTransform: 'uppercase', fontWeight: 600 }}>{children}</th>;
}
function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }): React.ReactElement {
  return <td style={{ padding: '8px', ...style }}>{children}</td>;
}
