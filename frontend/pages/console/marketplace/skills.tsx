import React from 'react';
import Link from 'next/link';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { unifiedMarketplaceApi, type UnifiedSkillInfo } from '../../../lib/api/unified-marketplace.api';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { L } from '../../../lib/console.i18n';
import { T, cardStyle, inputStyle, selectStyle, btnPrimaryStyle, emptyStateStyle, pillStyle } from '../../../lib/console.theme';

const LAYERS = ['infra', 'resource', 'logic', 'composite'] as const;
const CATEGORIES = ['payment', 'commerce', 'data', 'utility', 'integration', 'custom'] as const;

export default function ConsoleMarketplaceSkills(): React.ReactElement {
  const { t } = useLocalization();
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

  React.useEffect(() => { void reload(); }, [reload]);

  return (
    <ConsoleLayout title={t(L.market.skillsTitle)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <p style={{ color: T.text.secondary, fontSize: T.font.sizeBody, margin: 0, flex: 1, minWidth: 240 }}>
          {total > 0 ? `${total} ${t({ zh: '个 Skill · ', en: 'skills · ' })}` : ''}
          {t(L.market.skillsDesc)}
        </p>
        <Link href="/console/developer/skills" style={{ ...btnPrimaryStyle, textDecoration: 'none', display: 'inline-block' }}>
          {t(L.market.publishSkill)}
        </Link>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t(L.common.search)} style={{ ...inputStyle, flex: 1, minWidth: 200 }} />
        <select value={layer} onChange={(e) => setLayer(e.target.value)} style={selectStyle}>
          <option value="">{t(L.market.allLayers)}</option>
          {LAYERS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={selectStyle}>
          <option value="">{t(L.market.allCategories)}</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {loading && skills.length === 0 ? (
        <div style={emptyStateStyle}>{t(L.common.loading)}</div>
      ) : skills.length === 0 ? (
        <div style={emptyStateStyle}>{t(L.market.noMatch)}</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {skills.map((s) => (
            <article key={s.id} style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <h3 style={{ fontSize: T.font.sizeBody, fontWeight: T.font.weightBold, margin: 0, flex: 1, color: T.text.primary }}>{s.displayName || s.name}</h3>
                <span style={pillStyle('accent')}>{s.layer}</span>
              </div>
              <div style={{ fontSize: T.font.sizeTiny, color: T.text.muted }}>@{s.authorInfo?.name ?? 'unknown'} · {s.source}</div>
              {s.description && (
                <div style={{ fontSize: T.font.sizeSmall, color: T.text.secondary, lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {s.description}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 8 }}>
                <span style={{ fontSize: T.font.sizeCaption, color: T.text.accent, fontWeight: T.font.weightSemibold }}>
                  {s.pricing?.pricePerCall ? `$${s.pricing.pricePerCall} ${t(L.market.perCall)}` : t(L.market.free)}
                </span>
                <span style={{ fontSize: T.font.sizeTiny, color: T.text.muted }}>★ {s.rating?.toFixed(1) ?? '—'} · {s.callCount ?? 0} {t(L.market.calls)}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </ConsoleLayout>
  );
}
