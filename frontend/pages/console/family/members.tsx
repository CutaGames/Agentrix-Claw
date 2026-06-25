import React from 'react';
import { useRouter } from 'next/router';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';
import { v1Api, type FamilyAccount } from '../../../lib/api/v1.api';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { L } from '../../../lib/console.i18n';
import { T, selectStyle, btnPrimaryStyle, emptyStateStyle, pillStyle } from '../../../lib/console.theme';

export default function ConsoleFamilyMembers(): React.ReactElement {
  const { t } = useLocalization();
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
    setBusy(true); setErr(null);
    try {
      const r = await v1Api.family.invite(selectedId, role);
      setCode(r?.invitation_code ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Invite failed');
    } finally { setBusy(false); }
  };

  const roleLabels: Record<string, string> = {
    admin: t({ zh: '管理员', en: 'Admin' }),
    member: t({ zh: '成员', en: 'Member' }),
    child: t({ zh: '儿童', en: 'Child' }),
  };

  return (
    <ConsoleLayout title={t(L.family.membersTitle)}>
      <p style={{ color: T.text.secondary, fontSize: T.font.sizeBody, marginBottom: 16 }}>{t(L.family.membersDesc)}</p>

      {families.length === 0 ? (
        <div style={emptyStateStyle}>{t({ zh: '请先在「家庭账号」页面创建一个家庭。', en: 'Create a family first on the Family Overview page.' })}</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} style={selectStyle}>
              {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <select value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'member' | 'child')} style={selectStyle}>
              {(['admin', 'member', 'child'] as const).map((r) => <option key={r} value={r}>{roleLabels[r]}</option>)}
            </select>
            <button onClick={generateInvite} disabled={busy || !selectedId} style={btnPrimaryStyle}>
              {busy ? t(L.common.creating) : t(L.family.generateInvite)}
            </button>
          </div>

          {err && <div style={{ padding: 12, background: '#3a1414', border: '1px solid #7f1d1d', borderRadius: 8, fontSize: T.font.sizeSmall, color: T.text.danger, marginBottom: 16 }}>{err}</div>}

          {code && (
            <div style={{ padding: 16, background: '#0d3a2c', border: `1px solid ${T.text.success}`, borderRadius: T.radius.md, marginBottom: 24 }}>
              <div style={{ fontSize: T.font.sizeCaption, color: T.text.success }}>{t(L.family.inviteCode)}</div>
              <code style={{ fontSize: 22, fontWeight: 700, color: '#fff', display: 'block', marginTop: 6 }}>{code}</code>
            </div>
          )}

          <h2 style={H2}>{t(L.family.currentMembers)} ({selected?.members?.length ?? 0})</h2>
          {!selected?.members || selected.members.length === 0 ? (
            <div style={emptyStateStyle}>{t({ zh: '暂无成员 — 在上方生成邀请码。', en: 'No members yet — generate an invite code above.' })}</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: T.font.sizeSmall }}>
              <thead><tr><Th>{t(L.common.name)}</Th><Th>{t(L.common.role)}</Th><Th>User ID</Th></tr></thead>
              <tbody>
                {selected.members.map((m) => (
                  <tr key={m.user_id} style={{ borderTop: `1px solid ${T.border.subtle}` }}>
                    <Td>{m.display_name ?? '—'}</Td>
                    <Td><span style={pillStyle('accent')}>{roleLabels[m.role] ?? m.role}</span></Td>
                    <Td style={{ fontFamily: 'monospace', fontSize: T.font.sizeTiny, color: T.text.muted }}>{m.user_id.slice(0, 16)}…</Td>
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

const H2: React.CSSProperties = { fontSize: T.font.sizeCaption, color: T.text.secondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, fontWeight: 600 };
function Th({ children }: { children: React.ReactNode }): React.ReactElement {
  return <th style={{ textAlign: 'left', padding: '10px 8px', fontSize: T.font.sizeTiny, color: T.text.muted, textTransform: 'uppercase', fontWeight: 600 }}>{children}</th>;
}
function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }): React.ReactElement {
  return <td style={{ padding: '10px 8px', color: T.text.primary, ...style }}>{children}</td>;
}
