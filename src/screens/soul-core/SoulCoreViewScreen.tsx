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
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity, Share, Modal, Linking, BackHandler } from 'react-native';
import { useRoute, useNavigation, useFocusEffect, type RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useColors, useThemedStyles, type Palette } from '../../theme/useTheme';
import { useI18n } from '../../stores/i18nStore';
import { useAuthStore } from '../../stores/authStore';
import {
  fetchSoulCoreView, fetchAgentDid, fetchReputationVcs, fetchReputationVerification, txExplorerUrl,
  SOUL_CORE_DID_ENABLED, SOUL_CORE_VC_ENABLED, SOUL_CORE_VERIFY_ENABLED,
  type SoulCoreViewDTO, type AnchorState, type EnforcedBy, type AgentDidDto, type ReputationVcItem,
  type ReputationVerificationDto,
} from '../../services/soulCoreApi';
import { AgentEconomicIdentityCard } from '../../components/agent/AgentEconomicIdentityCard';
import { SoulCoreNfcDevelopmentCard } from './SoulCoreNfcDevelopmentCard';
import type { MeStackParamList } from '../../navigation/types';

type SoulCoreRoute = RouteProp<MeStackParamList, 'SoulCoreView'>;

const FOUNDING_ACCESS_URL = 'https://agentrix.top/soul-core/founding-access?utm_source=mobile&utm_medium=product&utm_campaign=soul_core_founding_access';

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
  // A deep link or restored route can make SoulCoreView the first route in
  // MeStack. In that state the native Android back action would exit instead
  // of returning to Me, so route it to Profile when no history exists.
  useFocusEffect(
    React.useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (navigation.canGoBack()) return false;
        navigation.navigate('Profile');
        return true;
      });
      return () => subscription.remove();
    }, [navigation]),
  );


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
  // W3/W4：开放复验材料(复验抽屉数据源;404/失败 → 不显示复验入口)
  const verifyQ = useQuery({
    queryKey: ['soul-core-verify', agentId],
    queryFn: () => fetchReputationVerification(agentId as string),
    enabled: !!agentId && SOUL_CORE_VERIFY_ENABLED,
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
        <SoulCoreContent agentId={agentId as string} v={v} styles={styles} c={c} t={t} did={didQ.data ?? null} vcs={vcQ.data?.items ?? null} verify={verifyQ.data ?? null} onEditLimit={() => navigation.navigate('SovereigntyControlPlane', { agentAccountId: agentId })} />
      )}
    </ScrollView>
  );
}

function SoulCoreContent({
  agentId, v, styles, c, t, did, vcs, verify, onEditLimit,
}: {
  agentId: string;
  v: SoulCoreViewDTO;
  styles: ReturnType<typeof makeStyles>;
  c: Palette;
  t: (d: { en: string; zh: string }) => string;
  did: AgentDidDto | null;
  vcs: ReputationVcItem[] | null;
  verify: ReputationVerificationDto | null;
  onEditLimit: () => void;
}) {
  const [verifyOpen, setVerifyOpen] = React.useState(false);
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
      <View style={styles.hero} testID="soul-core-l0-hero">
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
        <View key={a.key} style={styles.card} testID={`soul-core-anchor-${a.key}`}>
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
            <AnchorSummary anchor={a} styles={styles} t={t} did={did} vcs={vcs}
              canVerify={!!(verify && verify.items && verify.items.length > 0)}
              onOpenVerify={() => setVerifyOpen(true)} />
          )}
        </View>
      ))}

      {/* T11 真卡入口仅在 debug build 暴露；开发卡证据不得升级 production SE。 */}
      {__DEV__ ? <SoulCoreNfcDevelopmentCard agentId={agentId} /> : null}

      {/* Founding Access：兴趣登记，不是订单或支付 */}
      <View style={styles.foundingCard}>
        <Text style={styles.foundingKicker}>SC-C · PoC ROADMAP</Text>
        <Text style={styles.foundingTitle}>{t({ en: 'Soul Core Card Founding Access', zh: '元神芯 Founding Access' })}</Text>
        <Text style={styles.foundingBody}>{t({
          en: 'Join the no-payment waitlist for PoC demos, research interviews and future conditional pre-order updates. This is not a purchase or delivery commitment.',
          zh: '加入无支付候补，优先获得 PoC 演示、研究访谈与未来条件式预售通知；这不是购买或交付承诺。',
        })}</Text>
        <TouchableOpacity
          accessibilityRole="link"
          accessibilityLabel={t({ en: 'Open Soul Core Card Founding Access', zh: '打开元神芯 Founding Access' })}
          onPress={() => { void Linking.openURL(FOUNDING_ACCESS_URL); }}
          style={styles.foundingButton}
          testID="soul-core-founding-access"
        >
          <Text style={styles.foundingButtonText}>{t({ en: 'Join Founding Access →', zh: '加入 Founding Access →' })}</Text>
        </TouchableOpacity>
      </View>

      {/* 合规披露 */}
      <View style={{ paddingHorizontal: 4, paddingTop: 4, gap: 4 }}>
        {v.compliance.disclosures.map((d, i) => (
          <Text key={i} style={styles.disclosure}>· {d}</Text>
        ))}
      </View>

      {/* 开放复验抽屉(与 web VerifyDrawer + tools/verify-reputation 对齐) */}
      <VerifyModal visible={verifyOpen} onClose={() => setVerifyOpen(false)} data={verify} t={t} styles={styles} />
    </>
  );
}

/**
 * 复验抽屉(RN Modal):展示 DID / issuer 公钥历史 / 每条锚点引用(batchId/tx/merkleProof)
 * + "如何独立复验"说明(指向 tools/verify-reputation,不依赖平台)。含空/未锚诚实标注。
 */
function VerifyModal({
  visible, onClose, data, t, styles,
}: {
  visible: boolean;
  onClose: () => void;
  data: ReputationVerificationDto | null;
  t: (d: { en: string; zh: string }) => string;
  styles: ReturnType<typeof makeStyles>;
}) {
  const items = data?.items ?? [];
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>🔍 {t({ en: 'How to verify independently', zh: '如何独立复验' })}</Text>
            <TouchableOpacity onPress={onClose} testID="verify-close"><Text style={styles.linkBtnText}>{t({ en: 'Close', zh: '关闭' })}</Text></TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ gap: 10, paddingVertical: 8 }}>
            {data?.did ? (
              <View>
                <Text style={styles.rowLabel}>DID</Text>
                <Text style={styles.mono} selectable>{data.did}</Text>
              </View>
            ) : null}
            {data?.issuerKeyHistory?.length ? (
              <View>
                <Text style={styles.rowLabel}>{t({ en: 'Issuer public keys', zh: 'issuer 公钥历史' })}</Text>
                {data.issuerKeyHistory.map((k, i) => (
                  <Text key={i} style={styles.mono} selectable>{k.version}: {k.address}</Text>
                ))}
              </View>
            ) : null}

            {items.length === 0 ? (
              <Text style={styles.rowLabel}>{t({ en: 'No verifiable credentials yet.', zh: '暂无可复验凭证。' })}</Text>
            ) : items.slice(0, 8).map((m, i) => {
              const url = txExplorerUrl(m.chainId, m.anchorTxHash);
              return (
                <View key={i} style={styles.verifyItem}>
                  <Text style={styles.rowValue}>
                    {(m.publicCredential?.kind === 'settlement' ? t({ en: 'Settlement', zh: '结算' }) : t({ en: 'Fulfillment', zh: '履约' }))}
                    {'  '}
                    <Text style={{ color: m.anchorStatus === 'anchored' ? '#16a34a' : '#d97706' }}>
                      {m.anchorStatus === 'anchored' ? '✓ ' + t({ en: 'anchored', zh: '已锚定' }) : t({ en: 'not anchored', zh: '未锚定' })}
                    </Text>
                  </Text>
                  {m.batchId ? <Text style={styles.miniMono} selectable>batch #{m.batchId}</Text> : null}
                  {m.leaf ? <Text style={styles.miniMono} selectable>leaf {m.leaf.slice(0, 18)}…</Text> : null}
                  {url ? (
                    <TouchableOpacity onPress={() => Linking.openURL(url)}>
                      <Text style={styles.linkBtnText}>{t({ en: 'View anchor tx on explorer →', zh: '在区块浏览器看锚点 tx →' })}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })}

            {items[0]?.howToVerify ? (
              <View style={styles.howToBox}>
                <Text style={styles.rowLabel}>{t({ en: 'Verify steps (no platform trust)', zh: '复验步骤(不依赖平台)' })}</Text>
                <Text style={styles.disclosure}>{items[0].howToVerify}</Text>
                <Text style={styles.disclosure}>tools/verify-reputation</Text>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
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

function AnchorSummary({ anchor, styles, t, did, vcs, canVerify, onOpenVerify }: { anchor: SoulCoreViewDTO['anchors'][number]; styles: ReturnType<typeof makeStyles>; t: (d: { en: string; zh: string }) => string; did?: AgentDidDto | null; vcs?: ReputationVcItem[] | null; canVerify?: boolean; onOpenVerify?: () => void }) {
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
          {canVerify ? (
            <TouchableOpacity onPress={onOpenVerify} style={styles.linkBtn} testID="open-verify-drawer">
              <Text style={styles.linkBtnText}>🔍 {t({ en: 'How to verify independently →', zh: '如何独立复验 →' })}</Text>
            </TouchableOpacity>
          ) : null}
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
    foundingCard: { backgroundColor: c.bgCard, borderRadius: 14, padding: 16, gap: 8, borderWidth: 1, borderColor: '#d5b97e66' },
    foundingKicker: { fontSize: 10, letterSpacing: 1.5, color: '#d5b97e', fontWeight: '800' },
    foundingTitle: { fontSize: 17, color: c.textPrimary, fontWeight: '800' },
    foundingBody: { fontSize: 12, color: c.textSecondary, lineHeight: 18 },
    foundingButton: { marginTop: 4, alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: '#d5b97e22', borderWidth: 1, borderColor: '#d5b97e88' },
    foundingButtonText: { fontSize: 12, fontWeight: '800', color: '#d5b97e' },
    linkBtn: { marginTop: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: c.accent + '22', borderWidth: 1, borderColor: c.accent + '55' },
    linkBtnText: { fontSize: 12, fontWeight: '800', color: c.accent },
    disclosure: { fontSize: 11, color: c.textMuted, lineHeight: 16 },
    modalBackdrop: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'flex-end' },
    modalCard: { backgroundColor: c.bgCard, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, borderWidth: 1, borderColor: c.border, gap: 8 },
    verifyItem: { padding: 10, borderRadius: 10, backgroundColor: c.bgPrimary, borderWidth: 1, borderColor: c.border, gap: 4 },
    miniMono: { fontSize: 11, color: c.textSecondary, fontFamily: 'monospace' },
    howToBox: { padding: 10, borderRadius: 10, backgroundColor: c.accent + '12', borderWidth: 1, borderColor: c.accent + '33', gap: 4 },
  });
}

export default SoulCoreViewScreen;
