import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { apiClient } from '../../../lib/api/client';

interface MarketplaceAsset {
  id: string;
  name: string;
  type?: string;
  chain?: string;
  price?: number;
  currency?: string;
  description?: string;
  category?: string;
}

const TYPE_OPTIONS = ['', 'dataset', 'model', 'compute', 'mcp_server', 'agent'] as const;

export default function ConsoleMarketplaceResources(): React.ReactElement {
  const [assets, setAssets] = React.useState<MarketplaceAsset[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [q, setQ] = React.useState('');
  const [type, setType] = React.useState<string>('');

  const reload = React.useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const r = await apiClient.get<{ items?: MarketplaceAsset[]; data?: MarketplaceAsset[] } | MarketplaceAsset[]>(
        '/marketplace/assets',
        { params: { search: q || undefined, type: type || undefined, page: 1, pageSize: 48 } },
      );
      const list = Array.isArray(r) ? r : r?.items ?? r?.data ?? [];
      setAssets(list);
    } catch {
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, [q, type]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <ConsoleLayout title="Resource Marketplace">
      <p style={{ color: '#9aa3b2', fontSize: 14, marginBottom: 16 }}>
        Datasets, models, compute and MCP servers contributed by the ecosystem.
        Backed by <code>/marketplace/assets</code>.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search assets…"
          style={{ flex: 1, minWidth: 200, background: '#0a0c11', border: '1px solid #1f242d', color: '#E2E8F0', padding: '8px 12px', borderRadius: 6, fontSize: 13 }}
        />
        <select value={type} onChange={(e) => setType(e.target.value)} style={{ background: '#0a0c11', border: '1px solid #1f242d', color: '#E2E8F0', padding: '8px 12px', borderRadius: 6, fontSize: 13 }}>
          {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t || 'All types'}</option>)}
        </select>
      </div>

      {loading && assets.length === 0 ? (
        <div style={emptyStyle}>Loading…</div>
      ) : assets.length === 0 ? (
        <div style={emptyStyle}>No assets match. Try a different filter.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
          {assets.map((a) => (
            <article key={a.id} style={{ padding: 16, background: '#11141a', border: '1px solid #1f242d', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{a.name}</h3>
              <div style={{ fontSize: 11, color: '#6c7689' }}>{a.type ?? '—'}{a.chain ? ` · ${a.chain}` : ''}</div>
              {a.description && <div style={{ fontSize: 12, color: '#9aa3b2', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{a.description}</div>}
              <div style={{ marginTop: 'auto', paddingTop: 8, fontSize: 12, color: '#22D3FF', fontWeight: 600 }}>
                {a.price != null ? `${a.currency ?? '$'}${a.price}` : 'Free'}
              </div>
            </article>
          ))}
        </div>
      )}
    </ConsoleLayout>
  );
}

const emptyStyle: React.CSSProperties = { padding: 40, textAlign: 'center', background: '#11141a', border: '1px solid #1f242d', borderRadius: 12, color: '#9aa3b2' };
