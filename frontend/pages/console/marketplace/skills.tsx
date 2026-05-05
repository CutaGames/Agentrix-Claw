import React from 'react';
import Link from 'next/link';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { unifiedMarketplaceApi, type UnifiedSkillInfo } from '../../../lib/api/unified-marketplace.api';

const LAYERS = ['infra', 'resource', 'logic', 'composite'] as const;
const CATEGORIES = ['payment', 'commerce', 'data', 'utility', 'integration', 'custom'] as const;

export default function ConsoleMarketplaceSkills(): React.ReactElement {
  const [skills, setSkills] = React.useState<UnifiedSkillInfo[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [q, setQ] = React.useState('');
  const [layer, setLayer] = React.useState<string>('');
  const [category, setCategory] = React.useState<string>('');

  const reload = React.useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const r = await unifiedMarketplaceApi.search({
        q: q || undefined,
        layer: layer ? [layer as never] : undefined,
        category: category ? [category as never] : undefined,
        page: 1,
        limit: 48,
      });
      setSkills(r?.results ?? []);
      setTotal(r?.total ?? 0);
    } catch {
      setSkills([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [q, layer, category]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <ConsoleLayout title="Skill Marketplace">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <p style={{ color: '#9aa3b2', fontSize: 14, margin: 0, flex: 1, minWidth: 240 }}>
          {total > 0 ? `${total} skills` : 'Browse skills'} from OpenClaw / OpenHub. Backed by{' '}
          <code>/unified-marketplace/search</code>.
        </p>
        <Link
          href="/console/developer/skills"
          style={{ padding: '8px 16px', background: '#22D3FF', color: '#07080B', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
        >
          + Publish a Skill
        </Link>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search skills…"
          style={{ flex: 1, minWidth: 200, background: '#0a0c11', border: '1px solid #1f242d', color: '#E2E8F0', padding: '8px 12px', borderRadius: 6, fontSize: 13 }}
        />
        <select value={layer} onChange={(e) => setLayer(e.target.value)} style={selectStyle}>
          <option value="">All layers</option>
          {LAYERS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={selectStyle}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {loading && skills.length === 0 ? (
        <Empty msg="Loading…" />
      ) : skills.length === 0 ? (
        <Empty msg="No skills match your filters." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {skills.map((s) => (
            <article key={s.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, flex: 1 }}>{s.displayName || s.name}</h3>
                <Pill text={s.layer} />
              </div>
              <div style={{ fontSize: 11, color: '#6c7689' }}>@{s.authorInfo?.name ?? 'unknown'} · {s.source}</div>
              {s.description && (
                <div style={{ fontSize: 13, color: '#9aa3b2', lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {s.description}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 8 }}>
                <span style={{ fontSize: 12, color: '#22D3FF', fontWeight: 600 }}>
                  {s.pricing?.pricePerCall ? `$${s.pricing.pricePerCall} / call` : 'Free'}
                </span>
                <span style={{ fontSize: 11, color: '#6c7689' }}>★ {s.rating?.toFixed(1) ?? '—'} · {s.callCount ?? 0} calls</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </ConsoleLayout>
  );
}

const selectStyle: React.CSSProperties = { background: '#0a0c11', border: '1px solid #1f242d', color: '#E2E8F0', padding: '8px 12px', borderRadius: 6, fontSize: 13 };
const cardStyle: React.CSSProperties = { padding: 18, background: '#11141a', border: '1px solid #1f242d', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 8 };

function Pill({ text }: { text: string }): React.ReactElement {
  return <span style={{ fontSize: 10, padding: '2px 8px', background: '#1f242d', color: '#22D3FF', borderRadius: 999 }}>{text}</span>;
}

function Empty({ msg }: { msg: string }): React.ReactElement {
  return <div style={{ padding: 40, textAlign: 'center', background: '#11141a', border: '1px solid #1f242d', borderRadius: 12, color: '#9aa3b2' }}>{msg}</div>;
}
