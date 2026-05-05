import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { v1Api, type MemoryItem, type MemoryStats, type MemoryTier } from '../../../lib/api/v1.api';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { L } from '../../../lib/console.i18n';
import { T, cardStyle, inputStyle, emptyStateStyle } from '../../../lib/console.theme';

const TIERS: MemoryTier[] = ['working', 'episodic', 'semantic', 'procedural'];

export default function ConsoleSettingsMemory(): React.ReactElement {
  const { t } = useLocalization();
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
    } finally { setLoading(false); }
  }, [tier, search]);

  React.useEffect(() => {
    const tm = setTimeout(() => { void load(); }, search ? 300 : 0);
    return () => clearTimeout(tm);
  }, [load, search]);

  const tierLabels: Record<MemoryTier, string> = {
    working: t({ zh: '工作记忆', en: 'Working' }),
    episodic: t({ zh: '情景记忆', en: 'Episodic' }),
    semantic: t({ zh: '语义记忆', en: 'Semantic' }),
    procedural: t({ zh: '程序记忆', en: 'Procedural' }),
  };

  return (
    <ConsoleLayout title={t(L.settings.memoryTitle)}>
      <p style={{ color: T.text.secondary, fontSize: T.font.sizeBody, marginBottom: 16 }}>{t(L.settings.memoryDesc)}</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
        {TIERS.map((tt) => (
          <button key={tt} onClick={() => setTier(tt)}
            style={{
              padding: 14,
              background: T.bg.panel,
              border: tier === tt ? `1px solid ${T.text.accent}` : `1px solid ${T.border.subtle}`,
              borderRadius: T.radius.md,
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: T.font.family,
            }}>
            <div style={{ fontSize: T.font.sizeTiny, color: T.text.muted, textTransform: 'uppercase', letterSpacing: 0.6 }}>{tierLabels[tt]}</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: tier === tt ? T.text.accent : T.text.primary }}>
              {stats ? (stats[tt] ?? 0) : '—'}
            </div>
          </button>
        ))}
      </div>

      <input value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder={t({ zh: '搜索此层记忆…', en: `Search ${tier} memories…` })}
        style={{ ...inputStyle, width: '100%', padding: '12px 14px', marginBottom: 16 }} />

      {loading && items.length === 0 ? (
        <div style={emptyStateStyle}>{t(L.common.loading)}</div>
      ) : items.length === 0 ? (
        <div style={emptyStateStyle}>{search ? t({ zh: '无匹配结果。', en: 'No matches.' }) : t({ zh: '该层暂无记忆。', en: `No ${tier} memories yet.` })}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((it) => (
            <div key={it.id} style={{ ...cardStyle, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  {it.key && <span style={{ fontSize: T.font.sizeTiny, color: T.text.accent, fontFamily: 'monospace' }}>{it.key}</span>}
                  {it.tags?.slice(0, 3).map((tag) => (
                    <span key={tag} style={{ fontSize: 10, padding: '2px 8px', background: T.border.subtle, color: T.text.secondary, borderRadius: 999 }}>{tag}</span>
                  ))}
                </div>
                <span style={{ fontSize: T.font.sizeTiny, color: T.text.muted }}>{new Date(it.created_at).toLocaleDateString()}</span>
              </div>
              <div style={{ fontSize: T.font.sizeSmall, color: T.text.primary, lineHeight: 1.55 }}>{it.text}</div>
            </div>
          ))}
        </div>
      )}
    </ConsoleLayout>
  );
}
