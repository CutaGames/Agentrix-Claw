import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { apiClient } from '../../../lib/api/client';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { L } from '../../../lib/console.i18n';
import { T, cardStyle, inputStyle, selectStyle, emptyStateStyle } from '../../../lib/console.theme';

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
  const { t } = useLocalization();
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

  React.useEffect(() => { void reload(); }, [reload]);

  return (
    <ConsoleLayout title={t(L.market.resourcesTitle)}>
      <p style={{ color: T.text.secondary, fontSize: T.font.sizeBody, marginBottom: 16 }}>{t(L.market.resourcesDesc)}</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t(L.common.search)} style={{ ...inputStyle, flex: 1, minWidth: 200 }} />
        <select value={type} onChange={(e) => setType(e.target.value)} style={selectStyle}>
          {TYPE_OPTIONS.map((tp) => <option key={tp} value={tp}>{tp || t(L.market.allTypes)}</option>)}
        </select>
      </div>

      {loading && assets.length === 0 ? (
        <div style={emptyStateStyle}>{t(L.common.loading)}</div>
      ) : assets.length === 0 ? (
        <div style={emptyStateStyle}>{t(L.market.noAssets)}</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
          {assets.map((a) => (
            <article key={a.id} style={{ ...cardStyle, padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <h3 style={{ fontSize: T.font.sizeBody, fontWeight: T.font.weightBold, margin: 0, color: T.text.primary }}>{a.name}</h3>
              <div style={{ fontSize: T.font.sizeTiny, color: T.text.muted }}>{a.type ?? '—'}{a.chain ? ` · ${a.chain}` : ''}</div>
              {a.description && <div style={{ fontSize: T.font.sizeCaption, color: T.text.secondary, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{a.description}</div>}
              <div style={{ marginTop: 'auto', paddingTop: 8, fontSize: T.font.sizeCaption, color: T.text.accent, fontWeight: T.font.weightSemibold }}>
                {a.price != null ? `${a.currency ?? '$'}${a.price}` : t(L.market.free)}
              </div>
            </article>
          ))}
        </div>
      )}
    </ConsoleLayout>
  );
}
