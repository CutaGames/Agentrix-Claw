/**
 * SoulCoreViewScreen — 元神 Soul Core L0 视图（soul-core-l0 / M1，mobile）。
 *
 * 只读六锚（身份/金库/权柄/信誉/灵魂钥/归属）+ 权柄 enforcedBy 诚实徽章
 * （🟢链上强制 / ⚪软件建议 / 🔒芯片硬强制·路线图）+ roadmap 占位 + 分享。
 *
 * flag 关 / 端点 404 / 出错 → 回退渲染既有 `AgentEconomicIdentityCard`（零回归，design Property 4）。
 * "改上限" → 导航既有授权中枢 `SovereigntyControlPlane`（不新增写路径）。
 *
 * agent id 解析：route param → activeInstance.agentAccountId。
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity, Share } from 'react-native';
import { useRoute, useNavigation, type RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useColors, useThemedStyles, type Palette } from '../../theme/useTheme';
import { useI18n } from '../../stores/i18nStore';
import { useAuthStore } from '../../stores/authStore';
import {
  fetchSoulCoreView, fetchAgentDid, fetchReputationVcs,
  SOUL_CORE_DID_ENABLED, SOUL_CORE_VC_ENABLED,
  type SoulCoreViewDTO, type AnchorState, type EnforcedBy, type AgentDidDto, type ReputationVcItem,
} from '../../services/soulCoreApi';
import { AgentEconomicIdentityCard } from '../../components/agent/AgentEconomicIdentityCard';
import type { MeStackParamList } from '../../navigation/types';

type SoulCoreRoute = RouteProp<MeStackParamList, 'SoulCoreView'>;

const ANCHOR_ICON: Record<string, string> = {
  identity: '🪪', vault: '👛', authority: '🛡️', reputation: '🎯', soulKey: '🔑', ownership: '🫱',
};

export function SoulCoreViewScreen() {
  const route = useRoute<SoulCoreRoute>();
  const navigation = useNavigation<any>();
  const c = useColors();
  const styles = useThemedStyles(makeStyles);
  const { t } = useI18n();

  const activeInstance = useAuthStore((s) => s.activeInstance);
  const agentId =
    route.params?.agentId ??
    activeInstance?.agentAccountId ??
    activeInstance?.metadata?.agentAccountId;

  const q = useQuery({
    queryKey: ['soul-core-view', agentId],
    queryFn: () => fetchSoulCoreView(agentId as string),
    enabled: !!agentId,
    retry: 0, // 404（flag 关）不重试，直接回退
  });

  // M2：flag 开时拉真实 DID / VC（404/失败 → 保持 roadmap 占位）
  const didQ = useQuery({
    queryKey: ['soul-core-did', agentId],
    queryFn: () => fetchAgentDid(agentId as string),
    enabled: !!agentId && SOUL_CORE_DID_ENABLED,
    retry: 0,
  });
  const vcQ = useQuery({
    queryKey: ['soul-core-vcs', agentId],
    queryFn: () => fetchReputationVcs(agentId as string),
    enabled: !!agentId && SOUL_CORE_VC_ENABLED,
    retry: 0,
  });

  if (!agentId) {
    return (
      <View style={[styles.container, styles.centered]} testID="soul-core-view-screen">
        <Text style={styles.empty}>{t({ en: 'No agent linked yet.', zh: '尚未绑定 Agent。' })}</Text>
      </View>
    );
  }

  // flag 关 / 404 / 出错 → 回退既有经济身份卡（零回归）
  if (q.isError) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content} testID="soul-core-view-screen">
        <AgentEconomicIdentityCard agentId={agentId as string} />
      </ScrollView>
    );
  }

  const v = q.data;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      testID="soul-core-view-screen"
      refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={() => q.refetch()} tintColor={c.accent} />}
    >
      {q.isLoading || !v ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 24 }} />
      ) : (
        <SoulCoreContent v={v} styles={styles} c={c} t={t} did={didQ.data ?? null} vcs={vcQ.data?.items ?? null} onEditLimit={() => navigation.navigate('SovereigntyControlPlane', { agentAccountId: agentId })} />
      )}
    </ScrollView>
  );
}

function SoulCoreContent({
  v, styles, c, t, did, vcs, onEditLimit,
}: {
  v: SoulCoreViewDTO;
  styles: ReturnType<typeof makeStyles>;
  c: Palette;
  t: (d: { en: string; zh: string }) => string;
  did: AgentDidDto | null;
  vcs: ReputationVcItem[] | null;
  onEditLimit: () => void;
}) {
  const share = async () => {
    const lines = [
      '这是我拥有的 agent 本体 · 元神 🔮',
      `身份 ${v.agentUniqueId}`,
      v.authority.some((a) => a.hard) ? '花钱上限：链上强制' : '',
      'https://polymarket.agentrix.top',
    ].filter(Boolean);
    try { await Share.share({ message: lines.join('\n') }); } catch { /* ignore */ }
  };

  return (
    <>
      {/* 元神 Hero + 主权强度标签 */}
      <View style={styles.hero}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={styles.heroKicker}>元神 · SOUL CORE</Text>
          <TouchableOpacity onPress={share} style={styles.shareBtn}><Text style={styles.shareBtnText}>{t({ en: 'Share', zh: '分享' })}</Text></TouchableOpacity>
        </View>
        <Text style={styles.heroTitle}>{v.agentUniqueId}</Text>
        <Text style={styles.heroSub}>{t({ en: 'Owned by you', zh: '归属：你' })}</Text>
        <View style={styles.sovBox}><Text style={styles.sovText}>🛡️ {t({ en: 'Sovereignty', zh: '主权强度' })} {v.sovereignty.tier}：{v.sovereignty.note}</Text></View>
      </View>

      {/* 六锚 */}
      {v.anchors.map((a) => (
        <View key={a.key} style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>{ANCHOR_ICON[a.key]} {a.title}</Text>
            <AnchorBadge state={a.state} c={c} styles={styles} t={t} />
          </View>

          {a.key === 'authority' ? (
            v.authority.length > 0 ? (
              <>
                {v.authority.map((it, i) => (
                  <View key={i} style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowValue}>{it.label}</Text>
                      <EnforcedByTag enforcedBy={it.enforcedBy} styles={styles} />
                    </View>
                    <Text style={styles.rowValue}>{it.value}</Text>
                  </View>
                ))}
                <Text style={styles.roadmapChip}>🔒 {t({ en: 'Chip-enforced cap (Soul Chip L1)', zh: '芯片硬强制（元神芯 L1）' })} · {t({ en: 'roadmap', zh: '路线图' })}</Text>
                <TouchableOpacity onPress={onEditLimit} style={styles.linkBtn}><Text style={styles.linkBtnText}>{t({ en: 'Edit limits (Authorization Center) →', zh: '改上限（前往授权中枢）→' })}</Text></TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity onPress={onEditLimit}><Text style={styles.linkBtnText}>{t({ en: 'No limit set — set a spending cap →', zh: '尚未设置花钱上限——去设置上限 →' })}</Text></TouchableOpacity>
            )
          ) : a.state === 'roadmap' ? (
            <Text style={styles.roadmapNote}>{a.roadmapNote || t({ en: 'Roadmap capability.', zh: '路线图能力，敬请期待。' })}</Text>
          ) : (
            <AnchorSummary anchor={a} styles={styles} t={t} did={did} vcs={vcs} />
          )}
        </View>
      ))}

      {/* 合规披露 */}
      <View style={{ paddingHorizontal: 4, paddingTop: 4, gap: 4 }}>
        {v.compliance.disclosures.map((d, i) => (
          <Text key={i} style={styles.disclosure}>· {d}</Text>
        ))}
      </View>
    </>
  );
}

function EnforcedByTag({ enforcedBy, styles }: { enforcedBy: EnforcedBy; styles: ReturnType<typeof makeStyles> }) {
  const map: Record<EnforcedBy, { icon: string; label: string; style: any }> = {
    'onchain-AA': { icon: '🟢', label: '链上强制 · 连运营方都改不了', style: styles.tagOnchain },
    software: { icon: '⚪', label: '软件建议 · 平台可改，非硬保证', style: styles.tagSoftware },
    SE: { icon: '🔒', label: '芯片硬强制 · 路线图', style: styles.tagSE },
  };
  const m = map[enforcedBy] ?? map.software;
  return <Text style={[styles.enforcedTag, m.style]}>{m.icon} {m.label}</Text>;
}

function AnchorSummary({ anchor, styles, t, did, vcs }: { anchor: SoulCoreViewDTO['anchors'][number]; styles: ReturnType<typeof makeStyles>; t: (d: { en: string; zh: string }) => string; did?: AgentDidDto | null; vcs?: ReputationVcItem[] | null }) {
  const s = anchor.summary || {};
  switch (anchor.key) {
    case 'identity':
      return (
        <View style={{ gap: 4 }}>
          {s.chain ? <Text style={styles.rowValue}>{t({ en: 'Chain', zh: '链' })}: {s.chain}</Text> : null}
          {/* M2：flag 开且有真实 DID → 展示 DID；否则 roadmap 占位 */}
          {did ? (
            <Text style={[styles.mono, { color: '#22d3ee' }]} selectable>{did.did}</Text>
          ) : (
            <Text style={styles.roadmapChip}>🔮 {t({ en: 'Exportable/verifiable DID', zh: '可导出/可验证 DID' })} · {t({ en: 'roadmap', zh: '路线图' })}</Text>
          )}
        </View>
      );
    case 'vault':
      return (
        <View style={{ gap: 4 }}>
          {s.address ? <Text style={styles.mono}>{String(s.address).slice(0, 8)}…{String(s.address).slice(-6)}</Text> : <Text style={styles.rowLabel}>{t({ en: 'No wallet', zh: '无钱包' })}</Text>}
          {s.balances ? <Text style={styles.rowValue}>{t({ en: 'Balance', zh: '余额' })}: {s.balances.platform} {s.balances.currency}</Text> : null}
        </View>
      );
    case 'reputation':
      return (
        <View style={{ gap: 4 }}>
          <Text style={styles.rowValue}>{t({ en: 'Credit', zh: '信用' })}: {s.level} ({s.creditScore})</Text>
          {/* M2：flag 开且有真实 VC → 展示凭证列表；否则 roadmap 占位 */}
          {vcs && vcs.length > 0 ? (
            <View style={{ gap: 6, marginTop: 4 }}>
              <Text style={styles.rowLabel}>{t({ en: 'Reputation credentials (VC)', zh: '信誉凭证（VC）' })}</Text>
              {vcs.slice(0, 5).map((vc, i) => (
                <View key={i} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowValue}>{vc.credentialSubject?.kind === 'settlement' ? t({ en: 'Settlement', zh: '结算' }) : t({ en: 'Fulfillment', zh: '履约' })}</Text>
                    <Text style={{ fontSize: 11, color: vc.verified ? '#16a34a' : '#dc2626' }}>{vc.verified ? '✓ ' + t({ en: 'verified', zh: '已验签' }) : '✗ ' + t({ en: 'invalid', zh: '验签失败' })} · {vc.anchor?.status}</Text>
                  </View>
                  <Text style={styles.rowValue}>{vc.credentialSubject?.amount ?? ''}</Text>
                </View>
              ))}
            </View>
          ) : vcs && vcs.length === 0 ? (
            <Text style={styles.rowLabel}>{t({ en: 'No credentials yet — issued after transactions.', zh: '暂无信誉凭证——完成交易后自动签发。' })}</Text>
          ) : (
            <Text style={styles.roadmapChip}>🎖️ {t({ en: 'Hardware-backed reputation VC', zh: '硬件背书信誉凭证 VC' })} · {t({ en: 'roadmap', zh: '路线图' })}</Text>
          )}
        </View>
      );
    case 'ownership':
      return (
        <View style={{ gap: 4 }}>
          <Text style={styles.rowValue}>{t({ en: 'Owned by you', zh: '归属：你' })}</Text>
          <Text style={styles.roadmapChip}>🎁 {t({ en: 'Transfer / gift / inherit', zh: '转让 / 赠礼 / 传家' })} · {t({ en: 'roadmap', zh: '路线图' })}</Text>
        </View>
      );
    default:
      return null;
  }
}

function AnchorBadge({ state, c, styles, t }: { state: AnchorState; c: Palette; styles: ReturnType<typeof makeStyles>; t: (d: { en: string; zh: string }) => string }) {
  const map: Record<AnchorState, { color: string; label: string }> = {
    enabled: { color: c.success, label: t({ en: 'Ready', zh: '已具备' }) },
    pending: { color: c.warning ?? '#d97706', label: t({ en: 'Pending', zh: '待确认' }) },
    failed: { color: c.error, label: t({ en: 'Failed', zh: '失败' }) },
    not_enabled: { color: c.textMuted, label: t({ en: 'Not enabled', zh: '未启用' }) },
    roadmap: { color: '#8b5cf6', label: t({ en: 'Roadmap', zh: '路线图' }) },
  };
  const m = map[state] ?? map.not_enabled;
  return <View style={[styles.badge, { backgroundColor: m.color + '22', borderColor: m.color + '66' }]}><Text style={[styles.badgeText, { color: m.color }]}>{m.label}</Text></View>;
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bgPrimary },
    centered: { alignItems: 'center', justifyContent: 'center', padding: 24 },
    content: { padding: 16, paddingBottom: 40, gap: 12 },
    empty: { fontSize: 13, color: c.textMuted, textAlign: 'center', padding: 24 },
    hero: { backgroundColor: c.bgCard, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: c.border, gap: 4 },
    heroKicker: { fontSize: 11, letterSpacing: 2, color: c.accent, fontWeight: '800' },
    heroTitle: { fontSize: 17, fontWeight: '800', color: c.textPrimary, marginTop: 2 },
    heroSub: { fontSize: 12, color: c.textMuted },
    sovBox: { marginTop: 10, padding: 10, backgroundColor: c.accent + '18', borderColor: c.accent + '44', borderWidth: 1, borderRadius: 10 },
    sovText: { fontSize: 12, color: c.textSecondary, lineHeight: 18 },
    shareBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: c.accent + '22', borderWidth: 1, borderColor: c.accent + '55' },
    shareBtnText: { fontSize: 12, fontWeight: '800', color: c.accent },
    card: { backgroundColor: c.bgCard, borderRadius: 14, padding: 14, gap: 8, borderWidth: 1, borderColor: c.border },
    cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardTitle: { fontSize: 15, fontWeight: '700', color: c.textPrimary },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 4 },
    rowLabel: { fontSize: 13, color: c.textMuted },
    rowValue: { fontSize: 13, color: c.textPrimary, fontWeight: '600' },
    mono: { fontSize: 13, color: c.textPrimary, fontWeight: '700', fontFamily: 'monospace' },
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
    badgeText: { fontSize: 11, fontWeight: '800' },
    enforcedTag: { fontSize: 11, fontWeight: '700', marginTop: 2 },
    tagOnchain: { color: '#16a34a' },
    tagSoftware: { color: c.textMuted },
    tagSE: { color: '#8b5cf6' },
    roadmapChip: { fontSize: 11, fontWeight: '700', color: '#a78bfa', marginTop: 6 },
    roadmapNote: { fontSize: 12, color: '#a78bfa', lineHeight: 18 },
    linkBtn: { marginTop: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: c.accent + '22', borderWidth: 1, borderColor: c.accent + '55' },
    linkBtnText: { fontSize: 12, fontWeight: '800', color: c.accent },
    disclosure: { fontSize: 11, color: c.textMuted, lineHeight: 16 },
  });
}

export default SoulCoreViewScreen;
