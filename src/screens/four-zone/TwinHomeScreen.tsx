/**
 * TwinHomeScreen — 分身 zone root (flag `mobile.four_zone_ia`).
 *
 * No twin yet (product doc 1.9 step 1): explain "private first, about 10
 * minutes, confirm each item before anything goes public", with one primary
 * button that opens the Web twin flow for the current Agent (the same single
 * draft on every device, DT-R03.5).
 *
 * Twin exists (M4-c, 5.4 "开通后首屏"): the visitor's view of the 分身名片,
 * read from the anonymous public projection, with 分享 / 二维码 only while a
 * visitor can actually open it; the open review count; entries to 公开状态与急停
 * and Agent 护照. Visitors, bookings and income appear only once the backend
 * has them (DT-G2); nothing is invented here.
 */
import React, { useCallback } from 'react';
import { ActivityIndicator, Linking, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'react-native-qrcode-svg';
import { useI18n } from '../../stores/i18nStore';
import { useAuthStore } from '../../stores/authStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import { getTwinWebUrl } from '../../services/webHandoff';
import {
  canShareTwinCard,
  fetchTwinOverview,
  fetchTwinPublicCard,
  twinCardShareMessage,
  twinCardShareUrl,
  type MobileTwinPublicCard,
} from '../../services/twinCard';
import { fetchTwinReviewQueue } from '../../services/twinReviewQueue';
import { fetchTwinStatus, isSafeTwinAgentId, type TwinVisibility } from '../../services/twinStatus';
import { TwinCreationProgress } from './TwinCreationProgress';

type Lang = 'zh' | 'en';

function visibilityLabel(visibility: TwinVisibility, lang: Lang): string {
  const labels: Record<TwinVisibility, { zh: string; en: string }> = {
    private: { zh: '私密', en: 'Private' },
    public: { zh: '公开', en: 'Public' },
    paused: { zh: '已暂停', en: 'Paused' },
    stopping: { zh: '正在停止', en: 'Stopping' },
  };
  return labels[visibility][lang];
}

function visitorSeesLine(card: MobileTwinPublicCard, lang: Lang): string {
  if (card.state === 'available') return lang === 'zh' ? '访客现在能打开你的分身名片并提问。' : 'Visitors can open your twin card and ask it now.';
  if (card.state === 'paused') return lang === 'zh' ? '访客打开链接会看到"已暂停"。' : 'Visitors opening the link see "paused".';
  return lang === 'zh' ? '还没公开。访客打开链接会看到"暂不可用"。' : 'Not public yet. Visitors opening the link see "unavailable".';
}

export function TwinHomeScreen() {
  const { t, language } = useI18n();
  const lang: Lang = language === 'zh' ? 'zh' : 'en';
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<any>();
  const signedIn = useAuthStore((state) => !!state.token);
  const activeInstance = useAuthStore((state) => state.activeInstance);
  const agentAccountId: string = activeInstance?.agentAccountId ?? activeInstance?.metadata?.agentAccountId ?? '';
  const canRead = signedIn && isSafeTwinAgentId(agentAccountId);

  const overview = useQuery({
    queryKey: ['four-zone', 'twin-overview', agentAccountId],
    queryFn: () => fetchTwinOverview(agentAccountId),
    enabled: canRead,
    retry: 0,
    staleTime: 30_000,
  });
  const hasTwin = overview.data?.kind === 'ready' && overview.data.data.hasProfile;
  // Same query keys as TwinStatusScreen / MattersHomeScreen so the reads are shared.
  const status = useQuery({
    queryKey: ['four-zone', 'twin-status', agentAccountId],
    queryFn: () => fetchTwinStatus(agentAccountId),
    enabled: canRead && hasTwin,
    retry: 0,
  });
  const review = useQuery({
    queryKey: ['four-zone', 'twin-review', agentAccountId],
    queryFn: () => fetchTwinReviewQueue(agentAccountId),
    enabled: canRead && hasTwin,
    retry: 0,
    staleTime: 30_000,
  });
  const publicCard = useQuery({
    queryKey: ['four-zone', 'twin-public-card', agentAccountId],
    queryFn: () => fetchTwinPublicCard(agentAccountId),
    enabled: canRead && hasTwin,
    retry: 0,
    staleTime: 30_000,
  });

  const openWeb = useCallback(() => {
    void Linking.openURL(getTwinWebUrl(agentAccountId || null)).catch(() => undefined);
  }, [agentAccountId]);

  const card = publicCard.data?.kind === 'ready' ? publicCard.data.data : null;
  // T6: the server's shareRoute (external id) once the status is read; the UUID page until then.
  const shareRoute = status.data?.kind === 'ready' ? status.data.data.shareRoute : null;
  const shareUrl = canShareTwinCard(card, agentAccountId) ? twinCardShareUrl(agentAccountId, { shareRoute }) : null;
  const share = useCallback(() => {
    if (!card || !shareUrl) return;
    void Share.share({ message: twinCardShareMessage(card, lang, shareUrl) }).catch(() => undefined);
  }, [card, lang, shareUrl]);

  const entryRows = (
    <>
      <TouchableOpacity
        style={styles.row}
        onPress={() => navigation.navigate('TwinStatus', { tab: 'status' })}
        accessibilityRole="button"
        accessibilityLabel={t({ en: 'Visibility and stop', zh: '公开状态与急停' })}
        testID="twin-open-status"
      >
        <Text style={styles.rowLabel}>{t({ en: 'Visibility and stop', zh: '公开状态与急停' })}</Text>
        <Text style={styles.rowHint}>{t({ en: 'Private · public · paused · stop the twin at once', zh: '私密 · 公开 · 已暂停 · 一键停止分身' })}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.row}
        onPress={() => navigation.navigate('TwinPassport', { tab: 'passport' })}
        accessibilityRole="button"
        accessibilityLabel={t({ en: 'Agent passport', zh: 'Agent 护照' })}
        testID="twin-open-passport"
      >
        <Text style={styles.rowLabel}>{t({ en: 'Agent passport', zh: 'Agent 护照' })}</Text>
        <Text style={styles.rowHint}>{t({ en: 'For agents and partners · revoke shares here', zh: '给 Agent 与合作方看 · 可在这里收回分享' })}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.row}
        onPress={() => navigation.navigate('TwinIncome', { tab: 'income' })}
        accessibilityRole="button"
        accessibilityLabel={t({ en: 'Income', zh: '收入与回执' })}
        testID="twin-open-income"
      >
        <Text style={styles.rowLabel}>{t({ en: 'Income', zh: '收入与回执' })}</Text>
        <Text style={styles.rowHint}>{t({ en: 'Orders your twin took · deliver a saved answer', zh: '分身接的单 · 交付已保存的回答' })}</Text>
      </TouchableOpacity>
    </>
  );

  if (hasTwin) {
    const visibility = status.data?.kind === 'ready' ? status.data.data.visibility : null;
    const openReviews = review.data?.kind === 'ready' ? review.data.data.open.length : null;
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="twin-home-screen">
        <View style={styles.headerRow}>
          <Text style={styles.title} accessibilityRole="header">
            {t({ en: 'Your twin', zh: '分身' })}
          </Text>
          {visibility ? (
            <Text style={styles.badge} testID={`twin-home-visibility-${visibility}`}>
              {visibilityLabel(visibility, lang)}
            </Text>
          ) : null}
        </View>
        {/* T5 (1.9): the nine-step creation progress, read-only; shows nothing once every open step is done. */}
        <TwinCreationProgress agentAccountId={agentAccountId} />
        <Text style={styles.section}>{t({ en: 'This week', zh: '本周' })}</Text>
        <TouchableOpacity
          style={styles.row}
          onPress={openWeb}
          accessibilityRole="button"
          accessibilityLabel={t({ en: 'Open review items on the web', zh: '到网页上处理待复核' })}
          testID="twin-home-review"
        >
          <Text style={styles.rowLabel}>
            {t({ en: 'To review', zh: '待复核' })} {openReviews === null ? '—' : openReviews}
          </Text>
          <Text style={styles.rowHint}>
            {t({ en: 'Unanswered questions and inferences to confirm · on the web', zh: '未答问题与待确认的推断 · 在网页上处理' })}
          </Text>
        </TouchableOpacity>
        <Text style={styles.section}>{t({ en: 'Twin card (what visitors see)', zh: '分身名片（访客看到的）' })}</Text>
        <View style={styles.card} testID="twin-card-preview">
          {publicCard.isLoading ? <ActivityIndicator /> : null}
          {publicCard.data && publicCard.data.kind !== 'ready' ? (
            <Text style={styles.muted}>{t({ en: 'Could not read the public card.', zh: '读不到公开名片。' })}</Text>
          ) : null}
          {card ? (
            <>
              <Text style={styles.muted} testID={`twin-card-state-${card.state}`}>
                {visitorSeesLine(card, lang)}
              </Text>
              {card.creatorName ? <Text style={styles.cardName}>{card.creatorName}</Text> : null}
              {card.topics.length > 0 ? (
                <Text style={styles.cardLine}>
                  {t({ en: 'Ask about: ', zh: '可以问：' })}
                  {card.topics.join(lang === 'zh' ? '、' : ', ')}
                </Text>
              ) : null}
              {card.offers.length > 0 ? (
                <Text style={styles.cardLine}>
                  {t({ en: 'Services: ', zh: '服务：' })}
                  {card.offers.join(lang === 'zh' ? '；' : '; ')}
                </Text>
              ) : null}
              <Text style={styles.disclosure}>{card.aiDisclosure[lang]}</Text>
              {shareUrl ? (
                <>
                  <View style={styles.qr} accessible accessibilityLabel={t({ en: 'QR code for your twin card', zh: '分身名片二维码' })} testID="twin-card-qr">
                    <QRCode value={shareUrl} size={152} />
                  </View>
                  <TouchableOpacity
                    style={styles.primary}
                    onPress={share}
                    accessibilityRole="button"
                    accessibilityLabel={t({ en: 'Share twin card', zh: '分享分身名片' })}
                    testID="twin-card-share"
                  >
                    <Text style={styles.primaryText}>{t({ en: 'Share twin card', zh: '分享分身名片' })}</Text>
                  </TouchableOpacity>
                </>
              ) : null}
            </>
          ) : null}
        </View>
        {entryRows}
        <TouchableOpacity style={styles.secondary} onPress={openWeb} accessibilityRole="button" testID="twin-home-open-web">
          <Text style={styles.secondaryText}>{t({ en: 'Edit or publish on the web', zh: '到网页上整理或公开' })}</Text>
        </TouchableOpacity>
        <Text style={styles.helper}>
          {t({
            en: 'Visitors, bookings and income show up here once they exist. Publishing and editing what the twin says happen on the web.',
            zh: '来访、预约和收入有了数据才会显示在这里。公开和修改分身说的内容在网页上完成。',
          })}
        </Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="twin-home-screen">
      <Text style={styles.title} accessibilityRole="header">
        {t({ en: 'Your twin', zh: '分身' })}
      </Text>
      {overview.isLoading && canRead ? <ActivityIndicator /> : null}
      <Text style={styles.lead}>
        {t({
          en: 'A twin answers for you using what you confirm. It starts private, takes about 10 minutes, and nothing goes public until you check each item.',
          zh: '分身会用你确认过的内容替你回答。一开始只有你自己能看，大约 10 分钟，公开前每一条都要你确认。',
        })}
      </Text>
      <View style={styles.steps}>
        {[
          t({ en: 'Bring in 1–5 things you wrote', zh: '带入 1–5 份你写的内容' }),
          t({ en: 'Answer 5 questions', zh: '回答 5 个问题' }),
          t({ en: 'Try one question, then decide', zh: '试问一句，再决定要不要公开' }),
        ].map((line, index) => (
          <Text key={line} style={styles.step}>
            {index + 1}. {line}
          </Text>
        ))}
      </View>
      <TouchableOpacity
        style={styles.primary}
        onPress={openWeb}
        accessibilityRole="button"
        accessibilityLabel={t({ en: 'Start creating', zh: '开始创建' })}
        testID="twin-start-button"
      >
        <Text style={styles.primaryText}>{t({ en: 'Start creating', zh: '开始创建' })}</Text>
      </TouchableOpacity>
      <Text style={styles.helper}>
        {t({
          en: 'Opens the web flow for now. The same draft continues on any device.',
          zh: '目前会打开网页继续。同一份草稿在任何设备上都能接着做。',
        })}
      </Text>
      {overview.data && overview.data.kind !== 'ready' && overview.data.kind !== 'unavailable' ? (
        <Text style={styles.muted} testID="twin-home-read-error">
          {t({ en: 'Could not check whether you already have a twin.', zh: '读不到你是否已经有分身。' })}
        </Text>
      ) : null}
      {entryRows}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bgPrimary },
    content: { padding: 24, gap: 14 },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    title: { color: c.textPrimary, fontSize: 26, fontWeight: '800' },
    badge: {
      color: c.textPrimary,
      fontSize: 13,
      fontWeight: '800',
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 4,
      overflow: 'hidden',
    },
    section: { color: c.textSecondary, fontSize: 13, fontWeight: '700', marginTop: 4 },
    lead: { color: c.textSecondary, fontSize: 15, lineHeight: 22 },
    steps: { gap: 6, marginTop: 4 },
    step: { color: c.textPrimary, fontSize: 15, lineHeight: 22 },
    primary: {
      marginTop: 12,
      backgroundColor: c.primary,
      borderRadius: 14,
      paddingVertical: 14,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Token pair: text on the primary fill is onAccent (11.4).
    primaryText: { color: c.onAccent, fontSize: 16, fontWeight: '700' },
    secondary: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border },
    secondaryText: { color: c.textPrimary, fontSize: 15, fontWeight: '700' },
    helper: { color: c.textMuted, fontSize: 13, lineHeight: 18 },
    muted: { color: c.textMuted, fontSize: 13, lineHeight: 18 },
    card: { backgroundColor: c.bgCard, borderColor: c.border, borderWidth: 1, borderRadius: 18, padding: 16, gap: 8 },
    cardName: { color: c.textPrimary, fontSize: 20, fontWeight: '800' },
    cardLine: { color: c.textSecondary, fontSize: 14, lineHeight: 20 },
    disclosure: { color: c.textMuted, fontSize: 12, lineHeight: 17 },
    // The QR code stays dark-on-white in every theme so scanners can read it.
    qr: { alignSelf: 'center', padding: 12, borderRadius: 12, backgroundColor: '#ffffff', marginTop: 6 },
    row: {
      minHeight: 56,
      backgroundColor: c.bgCard,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 4,
    },
    rowLabel: { color: c.textPrimary, fontSize: 15, fontWeight: '700' },
    rowHint: { color: c.textMuted, fontSize: 12 },
  });
