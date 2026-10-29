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
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'react-native-qrcode-svg';
import { useI18n } from '../../stores/i18nStore';
import { useAuthStore } from '../../stores/authStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import { getTwinWebUrl } from '../../services/webHandoff';
import {
  canShareTwinCard,
  fetchTwinOverview,
  fetchTwinPublicCard,
  twinCardAttributedLink,
  twinCardShareMessage,
  twinCardShareUrl,
  type MobileTwinPublicCard,
} from '../../services/twinCard';
import { fetchTwinReviewQueue } from '../../services/twinReviewQueue';
import { fetchTwinStatus, isSafeTwinAgentId, type TwinVisibility } from '../../services/twinStatus';
import { TwinCreationProgress } from './TwinCreationProgress';
import { CHANNEL_INBOX_ENABLED } from '../../services/channelInbox';
import { AGENT_AUTOMATIONS_ENABLED } from '../../services/agentAutomations';
import { AGENT_MAILBOX_ENABLED } from '../../services/agentMailbox';
import { RELATIONSHIP_BOOK_ENABLED } from '../../services/relationshipBook';
import { CARD_EXCHANGE_ENABLED } from '../../services/cardExchange';
import { TWIN_VOICE_ENABLED } from '../../services/twinVoice';
import { MOBILE_M0_ENABLED } from '../../services/mobileM0';
import { GLOBAL_PTT_SCROLL_INSET } from '../../services/pushToTalk';
import { createTwinEveryone, fetchTwinEveryoneHome, getTwinEveryoneWebUrl } from '../../services/twinEveryone';

/** E116 「它懂你多少」 levels (same words as the Web home). */
const KNOWLEDGE_LEVEL: Record<0 | 1 | 2 | 3, { zh: string; en: string }> = {
  0: { zh: '还不了解你', en: 'Doesn’t know you yet' },
  1: { zh: '刚认识你', en: 'Just met you' },
  2: { zh: '有点了解你', en: 'Knows you a little' },
  3: { zh: '挺懂你了', en: 'Knows you well' },
};

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

  // E116 人人都有分身: the server decides (`DIGITAL_TWIN_EVERYONE_V1_ENABLED`); `absent` keeps this screen as it was.
  const everyone = useQuery({
    queryKey: ['four-zone', 'twin-everyone'],
    queryFn: () => fetchTwinEveryoneHome(),
    enabled: signedIn,
    retry: 0,
    staleTime: 30_000,
  });
  const everyoneHome = everyone.data?.kind === 'ready' ? everyone.data.home : null;
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [createFailed, setCreateFailed] = useState(false);
  const openEveryoneWeb = useCallback(() => {
    void Linking.openURL(getTwinEveryoneWebUrl()).catch(() => undefined);
  }, []);
  const createTwin = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    setCreateFailed(false);
    try {
      const result = await createTwinEveryone(isSafeTwinAgentId(agentAccountId) ? agentAccountId : null);
      if (result.kind === 'ready') {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['four-zone', 'twin-overview'] }),
          queryClient.invalidateQueries({ queryKey: ['four-zone', 'twin-everyone'] }),
        ]);
      } else if (result.kind === 'choice_required') {
        openEveryoneWeb();
      } else {
        setCreateFailed(true);
      }
    } finally {
      setCreating(false);
    }
  }, [agentAccountId, creating, openEveryoneWeb, queryClient]);

  const openWeb = useCallback(() => {
    void Linking.openURL(getTwinWebUrl(agentAccountId || null)).catch(() => undefined);
  }, [agentAccountId]);
  const everyoneTwin = everyoneHome?.status === 'ready' ? everyoneHome.twin ?? null : null;
  const [showMore, setShowMore] = useState(false);
  // Room under the last row for the floating mic (GLOBAL_PTT_SCROLL_INSET, T7 r1).
  const scrollContent = [styles.content, { paddingBottom: 24 + GLOBAL_PTT_SCROLL_INSET }];

  const card = publicCard.data?.kind === 'ready' ? publicCard.data.data : null;
  // T6: the server's shareRoute (external id) once the status is read; the UUID page until then.
  const shareRoute = status.data?.kind === 'ready' ? status.data.data.shareRoute : null;
  const shareUrl = canShareTwinCard(card, agentAccountId) ? twinCardShareUrl(agentAccountId, { shareRoute }) : null;
  // REQ-mobile-022 part 1: where the visitor came from (share sheet or QR code), nothing about who.
  const shareLink = shareUrl ? twinCardAttributedLink(shareUrl, 'mobile') : null;
  const qrLink = shareUrl ? twinCardAttributedLink(shareUrl, 'qr') : null;
  const share = useCallback(() => {
    if (!card || !shareLink) return;
    void Share.share({ message: twinCardShareMessage(card, lang, shareLink) }).catch(() => undefined);
  }, [card, lang, shareLink]);

  const entryRows = (
    <>
      {MOBILE_M0_ENABLED && hasTwin ? (
        <TouchableOpacity
          style={styles.row}
          onPress={() => navigation.navigate('TwinAnswers')}
          accessibilityRole="button"
          accessibilityLabel={t({ en: 'Answers and services', zh: '问答与服务' })}
          testID="twin-open-answers"
        >
          <Text style={styles.rowLabel}>{t({ en: 'Answers and services', zh: '问答与服务' })}</Text>
          <Text style={styles.rowHint}>{t({ en: 'Intro · services · booking · common questions · contact', zh: '一句话介绍 · 服务 · 预约 · 常见问答 · 联系方式' })}</Text>
        </TouchableOpacity>
      ) : null}
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
      {CHANNEL_INBOX_ENABLED ? (
        <TouchableOpacity
          style={styles.row}
          onPress={() => navigation.navigate('TwinChannels')}
          accessibilityRole="button"
          accessibilityLabel={t({ en: 'Chats', zh: '渠道对话' })}
          testID="twin-open-channels"
        >
          <Text style={styles.rowLabel}>{t({ en: 'Chats', zh: '渠道对话' })}</Text>
          <Text style={styles.rowHint}>{t({ en: 'Telegram · WhatsApp · drafts waiting for you', zh: 'Telegram · WhatsApp · 等你确认的草稿' })}</Text>
        </TouchableOpacity>
      ) : null}
      {AGENT_AUTOMATIONS_ENABLED ? (
        <TouchableOpacity
          style={styles.row}
          onPress={() => navigation.navigate('TwinAutomations')}
          accessibilityRole="button"
          accessibilityLabel={t({ en: 'Automations', zh: '自动化' })}
          testID="twin-open-automations"
        >
          <Text style={styles.rowLabel}>{t({ en: 'Automations', zh: '自动化' })}</Text>
          <Text style={styles.rowHint}>{t({ en: 'Scheduled tasks you confirmed · run history', zh: '你确认过的定时任务 · 运行记录' })}</Text>
        </TouchableOpacity>
      ) : null}
      {RELATIONSHIP_BOOK_ENABLED ? (
        <TouchableOpacity
          style={styles.row}
          onPress={() => navigation.navigate('TwinRelationships')}
          accessibilityRole="button"
          accessibilityLabel={t({ en: 'Relationship book', zh: '关系簿' })}
          testID="twin-open-relationships"
        >
          <Text style={styles.rowLabel}>{t({ en: 'Relationship book', zh: '关系簿' })}</Text>
          <Text style={styles.rowHint}>{t({ en: 'Everyone you have dealt with · only you can see it', zh: '你打过交道的人 · 只有你看得到' })}</Text>
        </TouchableOpacity>
      ) : null}
      {CARD_EXCHANGE_ENABLED ? (
        <TouchableOpacity
          style={styles.row}
          onPress={() => navigation.navigate('TwinCardExchange')}
          accessibilityRole="button"
          accessibilityLabel={t({ en: 'Swap cards', zh: '交换名片' })}
          testID="twin-open-card-exchange"
        >
          <Text style={styles.rowLabel}>{t({ en: 'Swap cards', zh: '交换名片' })}</Text>
          <Text style={styles.rowHint}>{t({ en: 'Meet in person · both confirm · each book gets one entry', zh: '当面互扫 · 双方确认 · 各记一条' })}</Text>
        </TouchableOpacity>
      ) : null}
      {AGENT_MAILBOX_ENABLED ? (
        <TouchableOpacity
          style={styles.row}
          onPress={() => navigation.navigate('TwinMailbox')}
          accessibilityRole="button"
          accessibilityLabel={t({ en: 'Mailbox', zh: '邮箱' })}
          testID="twin-open-mailbox"
        >
          <Text style={styles.rowLabel}>{t({ en: 'Mailbox', zh: '邮箱' })}</Text>
          <Text style={styles.rowHint}>{t({ en: "Your Agent's own address · drafts waiting for you", zh: 'Agent 自己的地址 · 等你确认的草稿' })}</Text>
        </TouchableOpacity>
      ) : null}
      {TWIN_VOICE_ENABLED ? (
        <TouchableOpacity
          style={styles.row}
          onPress={() => navigation.navigate('TwinVoice')}
          accessibilityRole="button"
          accessibilityLabel={t({ en: 'Twin voice', zh: '分身的声音' })}
          testID="twin-open-voice"
        >
          <Text style={styles.rowLabel}>{t({ en: 'Twin voice', zh: '分身的声音' })}</Text>
          <Text style={styles.rowHint}>{t({ en: 'Your own ElevenLabs voice · hear an answer in it', zh: '你自己的 ElevenLabs 声音 · 用它听分身的回答' })}</Text>
        </TouchableOpacity>
      ) : null}
    </>
  );

  if (hasTwin) {
    const visibility = status.data?.kind === 'ready' ? status.data.data.visibility : null;
    const openReviews = review.data?.kind === 'ready' ? review.data.data.open.length : null;
    return (
      <ScrollView style={styles.screen} contentContainerStyle={scrollContent} testID="twin-home-screen">
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
        {everyoneTwin ? (
          // E116: no nine steps to finish; the twin works now and grows with what the owner adds.
          <TouchableOpacity
            style={styles.row}
            onPress={openEveryoneWeb}
            accessibilityRole="button"
            accessibilityLabel={t({ en: 'Add to your twin on the web', zh: '到网页上给分身补充' })}
            testID="twin-home-everyone-knowledge"
          >
            <Text style={styles.rowLabel}>
              {t({ en: 'How well it knows you: ', zh: '它懂你多少：' })}
              {KNOWLEDGE_LEVEL[everyoneTwin.knowledge.level][lang]}
            </Text>
            <Text style={styles.rowHint}>
              {t({ en: 'Add an intro, answer a question, tell it one thing · on the web', zh: '介绍一句、答一道题、告诉它一件事 · 在网页上' })}
            </Text>
          </TouchableOpacity>
        ) : (
          // T5 (1.9): the nine-step creation progress, read-only; shows nothing once every open step is done.
          <TwinCreationProgress agentAccountId={agentAccountId} />
        )}
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
              {shareUrl && qrLink ? (
                <>
                  {MOBILE_M0_ENABLED ? (
                    <TouchableOpacity
                      style={styles.primary}
                      onPress={() => navigation.navigate('TwinQr', { link: qrLink, name: card.creatorName })}
                      accessibilityRole="button"
                      testID="twin-card-show-qr"
                    >
                      <Text style={styles.primaryText}>{t({ en: 'Show my QR code', zh: '出示我的二维码' })}</Text>
                    </TouchableOpacity>
                  ) : null}
                  <View style={styles.qr} accessible accessibilityLabel={t({ en: 'QR code for your twin card', zh: '分身名片二维码' })} testID="twin-card-qr">
                    <QRCode value={qrLink} size={152} />
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
        <TouchableOpacity style={styles.secondary} onPress={everyoneTwin ? openEveryoneWeb : openWeb} accessibilityRole="button" testID="twin-home-open-web">
          <Text style={styles.secondaryText}>
            {MOBILE_M0_ENABLED ? t({ en: 'Publish or more on the web', zh: '到网页上公开或做更多' }) : t({ en: 'Edit or publish on the web', zh: '到网页上整理或公开' })}
          </Text>
        </TouchableOpacity>
        <Text style={styles.helper}>
          {MOBILE_M0_ENABLED
            ? t({
                en: 'Visitors, bookings and income show up here once they exist. Change answers and services in "Answers and services" above; publishing still happens on the web.',
                zh: '来访、预约和收入有了数据才会显示在这里。问答和服务在上面的「问答与服务」里改；公开还在网页上完成。',
              })
            : t({
                en: 'Visitors, bookings and income show up here once they exist. Publishing and editing what the twin says happen on the web.',
                zh: '来访、预约和收入有了数据才会显示在这里。公开和修改分身说的内容在网页上完成。',
              })}
        </Text>
      </ScrollView>
    );
  }

  // Still finding out whether a twin exists: no "create" call to action that would flash for an owner who has one.
  if (canRead && overview.isLoading) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={scrollContent} testID="twin-home-screen">
        <Text style={styles.title} accessibilityRole="header">
          {t({ en: 'Your twin', zh: '分身' })}
        </Text>
        <ActivityIndicator testID="twin-home-loading" />
      </ScrollView>
    );
  }

  // E116: the one-tap home is still being read; the same calm loading view, no button that could flash.
  if (signedIn && everyone.isLoading) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={scrollContent} testID="twin-home-screen">
        <Text style={styles.title} accessibilityRole="header">
          {t({ en: 'Your twin', zh: '分身' })}
        </Text>
        <ActivityIndicator testID="twin-home-loading-everyone" />
      </ScrollView>
    );
  }

  // E116 人人都有分身: one tap makes the twin here; adding to it and publishing happen on the Web home.
  if (everyoneHome && everyoneHome.status !== 'unavailable') {
    const made = everyoneHome.status === 'ready';
    const choose = everyoneHome.status === 'needs_agent_choice';
    return (
      <ScrollView style={styles.screen} contentContainerStyle={scrollContent} testID="twin-home-screen">
        <Text style={styles.title} accessibilityRole="header">
          {t({ en: 'Your twin', zh: '分身' })}
        </Text>
        <View style={styles.startCard} testID="twin-everyone-start-card">
          <Text style={styles.startTitle}>
            {made ? t({ en: 'Your twin is ready', zh: '你的分身已经做好了' }) : t({ en: 'Make your twin', zh: '做一个你的分身' })}
          </Text>
          <Text style={styles.lead}>
            {made
              ? t({ en: 'Tell it more any time: an intro, one question at a time, one thing about you.', zh: '随时给它补充：介绍一句、答一道题、告诉它一件事。' })
              : t({
                  en: 'One tap and it exists. At first only you can use it; add to it whenever you like.',
                  zh: '点一下就建好，先只给你自己用。以后随时补充。',
                })}
          </Text>
          <TouchableOpacity
            style={styles.primary}
            onPress={made || choose ? openEveryoneWeb : () => void createTwin()}
            disabled={creating}
            accessibilityRole="button"
            accessibilityState={{ busy: creating }}
            testID={made ? 'twin-everyone-open-home' : choose ? 'twin-everyone-choose' : 'twin-everyone-create'}
          >
            <Text style={styles.primaryText}>
              {made
                ? t({ en: 'Open my twin', zh: '打开我的分身' })
                : choose
                  ? t({ en: 'Pick the Agent for my twin', zh: '选一个 Agent 做分身' })
                  : creating
                    ? t({ en: 'Making it…', zh: '正在做…' })
                    : t({ en: 'Make my twin', zh: '做一个我的分身' })}
            </Text>
          </TouchableOpacity>
          <Text style={styles.helper}>
            {t({ en: 'Adding to it and publishing its card happen on the web.', zh: '补充内容和公开名片在网页上完成。' })}
          </Text>
          {createFailed ? (
            <Text style={styles.muted} testID="twin-everyone-create-failed">
              {t({ en: 'It could not be made right now; please try again.', zh: '暂时没建成，请再试一次。' })}
            </Text>
          ) : null}
        </View>
        <Text style={styles.rules} testID="twin-start-rules">
          {t({
            en: 'Only you can see it until you publish. Every answer says it is an AI twin; it only says what you told it and hands anything else to you.',
            zh: '公开以前只有你能用。回答都标明是 AI 分身；它只说你告诉过它的，别的都转给你。',
          })}
        </Text>
        <TouchableOpacity
          style={styles.moreToggle}
          onPress={() => setShowMore((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showMore }}
          testID="twin-home-more"
        >
          <Text style={styles.moreToggleText}>{showMore ? t({ en: 'Fewer ▴', zh: '收起 ▴' }) : t({ en: 'Other pages ▾', zh: '其他功能 ▾' })}</Text>
        </TouchableOpacity>
        {showMore ? entryRows : null}
      </ScrollView>
    );
  }

  // No twin yet (T7 r1, 10-16; same calm shape as the web 分身 page, 6bb7b7c6): one card with one button, the rules
  // in one line, and the other twin and Agent pages folded under 其他功能 instead of seven cards before anything exists.
  return (
    <ScrollView style={styles.screen} contentContainerStyle={scrollContent} testID="twin-home-screen">
      <Text style={styles.title} accessibilityRole="header">
        {t({ en: 'Your twin', zh: '分身' })}
      </Text>
      <View style={styles.startCard} testID="twin-start-card">
        <Text style={styles.startTitle}>{t({ en: 'Create your twin', zh: '做一个你的分身' })}</Text>
        <Text style={styles.lead}>
          {t({
            en: 'Teach it with your own words and material. At first it is only for you. About 10 minutes.',
            zh: '用你的话和资料教它，先只给你自己用。大约 10 分钟。',
          })}
        </Text>
        <Text style={styles.stages} testID="twin-start-stages">
          {t({ en: 'Give it material · Answer 5 questions · Ask it one thing', zh: '给它一份资料 · 回答 5 个问题 · 私下问它一句' })}
        </Text>
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
            en: 'Opens the web for now. The same draft continues on any device.',
            zh: '会打开网页继续，同一份草稿在任何设备上都能接着做。',
          })}
        </Text>
      </View>
      <Text style={styles.rules} testID="twin-start-rules">
        {t({
          en: 'Only you can see it. Every answer says it is an AI twin, and it never promises prices, contracts or refunds for you.',
          zh: '只对你自己可见，回答都标明是 AI 分身，不替你承诺价格、合同或退款。',
        })}
      </Text>
      {overview.data && overview.data.kind !== 'ready' && overview.data.kind !== 'unavailable' ? (
        <Text style={styles.muted} testID="twin-home-read-error">
          {t({ en: 'Could not check whether you already have a twin.', zh: '读不到你是否已经有分身。' })}
        </Text>
      ) : null}
      <TouchableOpacity
        style={styles.moreToggle}
        onPress={() => setShowMore((open) => !open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: showMore }}
        testID="twin-home-more"
      >
        <Text style={styles.moreToggleText}>{showMore ? t({ en: 'Fewer ▴', zh: '收起 ▴' }) : t({ en: 'Other pages ▾', zh: '其他功能 ▾' })}</Text>
      </TouchableOpacity>
      {showMore ? entryRows : null}
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
    startCard: { backgroundColor: c.bgCard, borderColor: c.border, borderWidth: 1, borderRadius: 18, padding: 20, gap: 10 },
    startTitle: { color: c.textPrimary, fontSize: 20, fontWeight: '800' },
    stages: { color: c.textPrimary, fontSize: 14, lineHeight: 20, fontWeight: '600' },
    rules: { color: c.textMuted, fontSize: 13, lineHeight: 19, paddingHorizontal: 4 },
    moreToggle: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
    moreToggleText: { color: c.accent, fontSize: 14, fontWeight: '700' },
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
