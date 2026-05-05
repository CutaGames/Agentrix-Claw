import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { v1Api, type MemoryItem, type MemoryStats, type MemoryTier } from '../../../lib/api/v1.api';

const TIERS: MemoryTier[] = ['working', 'episodic', 'semantic', 'procedural'];

export default function ConsoleSettingsMemory(): React.ReactElement {
  const [stats, setStats] = React.useState<MemoryStats | null>(null);
  const [tier, setTier] = React.useState<MemoryTier>('episodic');
  const [items, setItems] = React.useState<MemoryItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');

  const load = React.useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const [s, list] = await Promise.all([
        v1Api.memory.stats().catch((): null => null),
        search.trim()
          ? v1Api.memory.search(search.trim(), tier, 50).catch((): null => null)
          : v1Api.memory.list(tier, { limit: 50 }).catch((): null => null),
      ]);
      setStats(s);
      setItems(list ?? []);
    } finally {
      setLoading(false);
    }
  }, [tier, search]);

  React.useEffect(() => {
    const t = setTimeout(() => { void load(); }, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  return (
    <ConsoleLayout title="Memory Tiers">
      <p style={{ color: '#9aa3b2', fontSize: 14, marginBottom: 16 }}>
        4-tier memory store — working (30min TTL) / episodic / semantic / procedural.
        Backed by <code>/api/v1/memory/*</code>.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
        {TIERS.map((t) => (
          <button
            key={t}
            onClick={() => setTier(t)}
            style={{
              padding: 14,
              background: tier === t ? '#11141a' : '#0a0c11',
              border: tier === t ? '1px solid #22D3FF' : '1px solid #1f242d',
              borderRadius: 10,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div style={{ fontSize: 11, color: '#6c7689', textTransform: 'uppercase' }}>{t}</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: tier === t ? '#22D3FF' : '#E2E8F0' }}>
              {stats ? (stats[t] ?? 0) : '—'}
            </div>
          </button>
        ))}
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={`Search ${tier} memories…`}
        style={{ width: '100%', background: '#0a0c11', border: '1px solid #1f242d', color: '#E2E8F0', padding: '10px 14px', borderRadius: 6, fontSize: 13, marginBottom: 16 }}
      />

      {loading && items.length === 0 ? (
        <Empty msg="Loading…" />
      ) : items.length === 0 ? (
        <Empty msg={search ? 'No matches.' : `No ${tier} memories yet.`} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((it) => (
            <div key={it.id} style={{ padding: 12, background: '#11141a', border: '1px solid #1f242d', borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  {it.key && <span style={{ fontSize: 11, color: '#22D3FF', fontFamily: 'monospace' }}>{it.key}</span>}
                  {it.tags?.slice(0, 3).map((t) => (
                    <span key={t} style={{ fontSize: 9, padding: '1px 6px', background: '#1f242d', color: '#9aa3b2', borderRadius: 999 }}>{t}</span>
                  ))}
                </div>
                <span style={{ fontSize: 10, color: '#6c7689' }}>{new Date(it.created_at).toLocaleDateString()}</span>
              </div>
              <div style={{ fontSize: 13, color: '#E2E8F0', lineHeight: 1.5 }}>{it.text}</div>
            </div>
          ))}
        </div>
      )}
    </ConsoleLayout>
  );
}

function Empty({ msg }: { msg: string }): React.ReactElement {
  return <div style={{ padding: 24, textAlign: 'center', background: '#11141a', border: '1px solid #1f242d', borderRadius: 10, color: '#9aa3b2', fontSize: 13 }}>{msg}</div>;
}
