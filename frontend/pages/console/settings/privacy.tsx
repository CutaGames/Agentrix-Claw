import React from 'react';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { v1Api, type PrivacyItem, type PrivacyAuditEntry, type PrivacyCategory } from '../../../lib/api/v1.api';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { L } from '../../../lib/console.i18n';
import { T, cardStyle, emptyStateStyle, pillStyle } from '../../../lib/console.theme';

const CATEGORIES: PrivacyCategory[] = ['financial', 'health', 'relationship', 'location'];

export default function ConsoleSettingsPrivacy(): React.ReactElement {
  const { t } = useLocalization();
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
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [category]);

  const catLabels: Record<string, string> = {
    financial: t({ zh: '财务', en: 'Financial' }),
    health: t({ zh: '健康', en: 'Health' }),
    relationship: t({ zh: '关系', en: 'Relationship' }),
    location: t({ zh: '位置', en: 'Location' }),
  };

  return (
    <ConsoleLayout title={t(L.settings.privacyTitle)}>
      <p style={{ color: T.text.secondary, fontSize: T.font.sizeBody, marginBottom: 16 }}>{t(L.settings.privacyDesc)}</p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        <Tab active={category === ''} onClick={() => setCategory('')} label={t(L.common.all)} />
        {CATEGORIES.map((c) => (
          <Tab key={c} active={category === c} onClick={() => setCategory(c)} label={catLabels[c]} />
        ))}
      </div>

      <h2 style={H2}>{t(L.settings.items)} ({items.length})</h2>
      {loading && items.length === 0 ? (
        <div style={emptyStateStyle}>{t(L.common.loading)}</div>
      ) : items.length === 0 ? (
        <div style={emptyStateStyle}>{t({ zh: '该分类下没有敏感条目。', en: 'No sensitive items in this category.' })}</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 24 }}>
          {items.map((it) => (
            <div key={it.id} style={{ ...cardStyle, padding: 14 }}>
              <span style={pillStyle('accent')}>{catLabels[it.category] ?? it.category}</span>
              <div style={{ fontSize: T.font.sizeSmall, fontWeight: 600, marginTop: 8, color: T.text.primary }}>{it.key}</div>
              {it.preview && <div style={{ fontSize: T.font.sizeTiny, color: T.text.secondary, marginTop: 4 }}>{it.preview}</div>}
              <div style={{ fontSize: T.font.sizeTiny, color: T.text.muted, marginTop: 6 }}>{new Date(it.created_at).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}

      <h2 style={H2}>{t(L.settings.recentAccess)} ({audit.length})</h2>
      {audit.length === 0 ? (
        <div style={emptyStateStyle}>{t({ zh: '暂无访问记录。', en: 'No access events.' })}</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: T.font.sizeCaption }}>
          <thead><tr><Th>{t({ zh: '动作', en: 'Action' })}</Th><Th>{t({ zh: '操作者', en: 'Actor' })}</Th><Th>{t({ zh: '条目', en: 'Item' })}</Th><Th>{t(L.common.createdAt)}</Th></tr></thead>
          <tbody>
            {audit.map((a) => (
              <tr key={a.id} style={{ borderTop: `1px solid ${T.border.subtle}` }}>
                <Td><span style={pillStyle('subtle')}>{a.action}</span></Td>
                <Td style={{ fontFamily: 'monospace', fontSize: T.font.sizeTiny, color: T.text.muted }}>{a.actor_id.slice(0, 12)}…</Td>
                <Td style={{ fontFamily: 'monospace', fontSize: T.font.sizeTiny, color: T.text.muted }}>{(a.item_id ?? a.grant_id ?? '').slice(0, 12)}…</Td>
                <Td style={{ fontSize: T.font.sizeTiny, color: T.text.muted }}>{new Date(a.created_at).toLocaleString()}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ConsoleLayout>
  );
}

const H2: React.CSSProperties = { fontSize: T.font.sizeCaption, color: T.text.secondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, fontWeight: 600 };
function Tab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }): React.ReactElement {
  return (
    <button onClick={onClick} style={{
      padding: '7px 14px',
      background: active ? T.text.accent : T.bg.panel,
      color: active ? T.text.inverted : T.text.secondary,
      border: `1px solid ${active ? T.text.accent : T.border.subtle}`,
      borderRadius: T.radius.sm,
      fontSize: T.font.sizeCaption,
      fontWeight: 600,
      cursor: 'pointer',
      fontFamily: T.font.family,
    }}>{label}</button>
  );
}
function Th({ children }: { children: React.ReactNode }): React.ReactElement {
  return <th style={{ textAlign: 'left', padding: 8, fontSize: T.font.sizeTiny, color: T.text.muted, textTransform: 'uppercase', fontWeight: 600 }}>{children}</th>;
}
function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }): React.ReactElement {
  return <td style={{ padding: 8, color: T.text.primary, ...style }}>{children}</td>;
}
