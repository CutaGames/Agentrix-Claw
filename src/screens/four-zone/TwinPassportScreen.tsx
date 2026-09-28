/**
 * TwinPassportScreen — 分身 → Agent 护照 (M4-a, D10 / D16, product doc 5.4).
 *
 * - Read-only card: the same projection and shared card builder as Web
 *   (`src/services/agentPassport.ts`, taken from v7 38b3102e), so the phone
 *   prints the same six stamps and `AGX-` number. Unreadable facts show as
 *   unconfirmed, never guessed.
 * - Tightening only (D16 / 8.3): the owner sees every share link receipt and
 *   can revoke one; it takes effect at once and the backend read-back is what
 *   the list shows. New shares, more fields, longer expiry and editing the
 *   introduction open Web.
 */
import React from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAgentPassport } from '../../hooks/useAgentPassport';
import { buildMobileAgentPassportCard, type AgentPassportReadState } from '../../services/agentPassport';
import { listPassportShares, revokePassportShare, type MobilePassportShare } from '../../services/passportShares';
import { getPassportWebUrl } from '../../services/webHandoff';
import { useAuthStore } from '../../stores/authStore';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import type { AgentPassportFact, PassportFactTone } from '../../../shared/types/agent-passport-card';

type Lang = 'zh' | 'en';

function readStateCopy(state: AgentPassportReadState, lang: Lang): { title: string; detail: string } | null {
  const pick = (zh: string, en: string) => (lang === 'zh' ? zh : en);
  switch (state.kind) {
    case 'ready':
      return null;
    case 'unknown':
      return { title: pick('正在读取护照…', 'Reading the passport…'), detail: pick('读到之前，下面的章都按「尚未确认」显示。', 'Until it arrives every stamp below reads as unconfirmed.') };
    case 'unauthorized':
      return { title: pick('登录后才能读取护照', 'Sign in to read the passport'), detail: pick('只有主人能读到确认过的信息。', 'Only the owner can read the confirmed facts.') };
    case 'forbidden':
      return { title: pick('这个 Agent 不在你的名下', 'This Agent is not yours'), detail: pick('护照只对主人展示确认过的信息。', 'The passport shows confirmed facts to its owner only.') };
    case 'error':
      return { title: pick('护照暂时读不到', 'The passport could not be read'), detail: `${pick('原因', 'reason')}: ${state.reason}` };
    default:
      return { title: pick('护照暂时不可用', 'Passport unavailable'), detail: `${pick('原因', 'reason')}: ${'reason' in state ? state.reason : state.kind}` };
  }
}

function toneLabel(tone: PassportFactTone, lang: Lang): string {
  if (tone === 'ready') return lang === 'zh' ? '已盖章' : 'stamped';
  if (tone === 'todo') return lang === 'zh' ? '待补' : 'to do';
  return lang === 'zh' ? '未确认' : 'unconfirmed';
}

function statusLabel(share: MobilePassportShare, lang: Lang): string {
  if (share.status === 'revoked') return lang === 'zh' ? '已收回' : 'Revoked';
  if (share.status === 'expired') return lang === 'zh' ? '已过期' : 'Expired';
  return lang === 'zh' ? '有效' : 'Active';
}

export function TwinPassportScreen() {
  const { t, language } = useI18n();
  const lang: Lang = language === 'zh' ? 'zh' : 'en';
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const activeInstance = useAuthStore((state) => state.activeInstance);
  const agentAccountId: string = activeInstance?.agentAccountId ?? activeInstance?.metadata?.agentAccountId ?? '';
  const { state, refetch } = useAgentPassport(agentAccountId || undefined);
  const projection = state.kind === 'ready' ? state.data : null;
  const card = React.useMemo(
    () => buildMobileAgentPassportCard({ name: activeInstance?.name ?? '', agentAccountId: agentAccountId || null, passport: projection }),
    [activeInstance?.name, agentAccountId, projection],
  );
  const notice = readStateCopy(state, lang);

  const sharesKey = ['four-zone', 'passport-shares', agentAccountId];
  const shares = useQuery({
    queryKey: sharesKey,
    queryFn: () => listPassportShares(agentAccountId),
    enabled: !!agentAccountId,
    retry: 0,
  });
  const revoke = useMutation({
    mutationFn: (shareId: string) => revokePassportShare(agentAccountId, shareId),
    // Show the backend read-back, not an optimistic guess.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: sharesKey }),
    onError: (error: any) =>
      Alert.alert(t({ en: 'Could not revoke', zh: '收回失败' }), error?.message || t({ en: 'Try again.', zh: '请重试。' })),
  });

  const confirmRevoke = (share: MobilePassportShare) => {
    Alert.alert(
      t({ en: 'Revoke this link?', zh: '收回这条分享链接？' }),
      t({ en: 'Anyone opening it will see that it was revoked. This takes effect now.', zh: '之后打开这个链接的人会看到"已收回"。立即生效。' }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        { text: t({ en: 'Revoke', zh: '收回' }), style: 'destructive', onPress: () => revoke.mutate(share.shareId) },
      ],
    );
  };

  const stampedLine =
    lang === 'zh' ? `${card.readyCount}/${card.facts.length} 项已盖章 · ${card.stage.zh}` : `${card.readyCount}/${card.facts.length} stamped · ${card.stage.en}`;
  const activeShares = (shares.data ?? []).filter((share) => share.status === 'active');
  const pastShares = (shares.data ?? []).filter((share) => share.status !== 'active');

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="twin-passport-screen">
      <Text style={styles.title} accessibilityRole="header">
        {t({ en: 'Agent passport', zh: 'Agent 护照' })}
      </Text>
      {notice ? (
        <View style={styles.notice} testID={`twin-passport-read-state-${state.kind}`}>
          <Text style={styles.noticeTitle}>{notice.title}</Text>
          <Text style={styles.noticeText}>{notice.detail}</Text>
          {state.kind === 'error' ? (
            <TouchableOpacity onPress={refetch} accessibilityRole="button" style={styles.linkButton}>
              <Text style={styles.linkText}>{t({ en: 'Read again', zh: '重新读取' })}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <View style={[styles.passport, { backgroundColor: card.theme.bg[1], borderColor: card.theme.line }]} testID="twin-passport-card">
        <Text style={[styles.passportName, { color: card.theme.ink }]}>{card.name}</Text>
        <Text style={[styles.passportNumber, { color: card.theme.accent }]}>{card.number}</Text>
        <Text style={[styles.passportHero, { color: card.theme.ink }]}>{card.hero[lang]}</Text>
        <Text style={[styles.passportMeta, { color: card.theme.inkMuted }]}>{stampedLine}</Text>
        <Text style={[styles.passportMeta, { color: card.theme.inkMuted }]}>{card.tagline[lang]}</Text>
      </View>

      <View style={styles.block}>
        {card.facts.map((fact: AgentPassportFact) => (
          <View key={fact.id} style={styles.fact}>
            <View style={styles.factHeader}>
              <Text style={styles.factLabel}>{fact.label[lang]}</Text>
              <Text style={fact.tone === 'ready' ? styles.toneReady : fact.tone === 'todo' ? styles.toneTodo : styles.toneUnknown}>
                {toneLabel(fact.tone, lang)}
              </Text>
            </View>
            <Text style={styles.factValue}>{fact.value[lang]}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.section}>{t({ en: 'Share links', zh: '分享链接' })}</Text>
      <View style={styles.block} testID="twin-passport-shares">
        {shares.isLoading ? <ActivityIndicator /> : null}
        {shares.isError ? (
          <Text style={styles.muted}>{t({ en: 'Could not load share links.', zh: '分享链接加载失败。' })}</Text>
        ) : null}
        {shares.data && shares.data.length === 0 ? (
          <Text style={styles.muted}>{t({ en: 'No share links yet.', zh: '还没有分享链接。' })}</Text>
        ) : null}
        {[...activeShares, ...pastShares].map((share) => (
          <View key={share.shareId} style={styles.shareRow} testID={`twin-passport-share-${share.shareId}`}>
            <View style={{ flex: 1 }}>
              <Text style={styles.factLabel}>{share.label || share.audience}</Text>
              <Text style={styles.factValue}>
                {statusLabel(share, lang)}
                {share.expiresAt ? ` · ${t({ en: 'until', zh: '到期' })} ${share.expiresAt.slice(0, 10)}` : ''}
                {` · ${t({ en: 'opened', zh: '打开' })} ${share.accessCount}`}
              </Text>
            </View>
            {share.status === 'active' ? (
              <TouchableOpacity
                style={styles.revokeButton}
                onPress={() => confirmRevoke(share)}
                disabled={revoke.isPending}
                accessibilityRole="button"
                accessibilityLabel={t({ en: 'Revoke link', zh: '收回链接' })}
                testID={`twin-passport-revoke-${share.shareId}`}
              >
                <Text style={styles.revokeText}>{t({ en: 'Revoke', zh: '收回' })}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => void Linking.openURL(getPassportWebUrl(agentAccountId)).catch(() => undefined)}
        accessibilityRole="button"
        testID="twin-passport-open-web"
      >
        <Text style={styles.secondaryButtonText}>{t({ en: 'Edit or share on the web', zh: '到网页上编辑或新建分享' })}</Text>
      </TouchableOpacity>
      <Text style={styles.helper}>
        {t({
          en: 'On the phone you can only narrow what is shared (revoke a link). New links, more fields and longer expiry need the web preview and confirmation.',
          zh: '手机上只能收紧（收回链接）。新建链接、公开更多字段、延长有效期要在网页上预览并确认。',
        })}
      </Text>
    </ScrollView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bgPrimary },
    content: { padding: 18, paddingBottom: 48, gap: 14 },
    title: { color: c.textPrimary, fontSize: 26, fontWeight: '800' },
    section: { color: c.textSecondary, fontSize: 13, fontWeight: '700', marginTop: 4 },
    notice: { backgroundColor: c.bgCard, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: c.warning, gap: 4 },
    noticeTitle: { color: c.textPrimary, fontSize: 14, fontWeight: '800' },
    noticeText: { color: c.textSecondary, fontSize: 12, lineHeight: 18 },
    linkButton: { alignSelf: 'flex-start', marginTop: 6, minHeight: 32, justifyContent: 'center' },
    linkText: { color: c.accent, fontSize: 13, fontWeight: '800' },
    passport: { borderRadius: 22, padding: 18, borderWidth: 1, gap: 6 },
    passportName: { fontSize: 22, fontWeight: '800' },
    passportNumber: { fontSize: 12, fontWeight: '800', letterSpacing: 1.4 },
    passportHero: { fontSize: 16, fontWeight: '700', lineHeight: 22, marginTop: 6 },
    passportMeta: { fontSize: 12, lineHeight: 18 },
    block: { backgroundColor: c.bgCard, borderRadius: 16, padding: 15, borderWidth: 1, borderColor: c.border, gap: 12 },
    fact: { gap: 3 },
    factHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
    factLabel: { color: c.textPrimary, fontSize: 14, fontWeight: '800' },
    factValue: { color: c.textSecondary, fontSize: 13, lineHeight: 20 },
    toneReady: { color: c.success, fontSize: 11, fontWeight: '800' },
    toneTodo: { color: c.warning, fontSize: 11, fontWeight: '800' },
    toneUnknown: { color: c.textMuted, fontSize: 11, fontWeight: '800' },
    muted: { color: c.textMuted, fontSize: 13 },
    shareRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    revokeButton: {
      minHeight: 40,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    revokeText: { color: c.danger, fontSize: 13, fontWeight: '800' },
    secondaryButton: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border },
    secondaryButtonText: { color: c.textPrimary, fontSize: 15, fontWeight: '700' },
    helper: { color: c.textMuted, fontSize: 12, lineHeight: 17, textAlign: 'center' },
  });
