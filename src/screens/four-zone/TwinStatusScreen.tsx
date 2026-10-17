/**
 * TwinStatusScreen — 分身 → 公开状态与急停 (M4-b; product doc 5.3 / 5.4,
 * D16 / 8.3).
 *
 * - Shows 私密 / 公开 / 已暂停 from the backend read-back (stop record first,
 *   then the publish record). A stop whose targets are not all confirmed reads
 *   "正在停止" and lists what is outstanding; `unknown` never counts as done.
 * - Tightening only: 立即停止分身 (always offered while the twin is not
 *   stopped) and 撤回公开 (while public). Both take effect at once; the screen
 *   re-reads the status instead of assuming the result.
 * - Publishing and resuming open access again, so they open the Web twin
 *   workspace (`getTwinWebUrl`), where the exact preview and confirmation live.
 * - M0 builds with the phone key (D16, owner 10-07): after 撤回公开 the twin can be put back with the same topics from
 *   here: the screen shows what goes public, and face / fingerprint + the device key confirm it (twinRepublish.ts).
 */
import React from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchTwinStatus,
  tightenTwin,
  type MobileTwinStatus,
  type TwinCommandOutcome,
  type TwinStatusReadState,
  type TwinTighteningAction,
  type TwinVisibility,
} from '../../services/twinStatus';
import { getTwinWebUrl } from '../../services/webHandoff';
import { MOBILE_M0_ENABLED } from '../../services/mobileM0';
import { PHONE_DEVICE_KEY_ENABLED } from '../../services/phoneDeviceKeyNative';
import { previewTwinRepublish, republishTwin, twinRepublishTopics, type TwinRepublishOutcome, type TwinRepublishPreview } from '../../services/twinRepublish';
import { deviceKeyStepUpDeps } from '../../services/deviceKeyStepUpSession';
import { TwinMandateSection } from './TwinMandateSection';
import { useAuthStore } from '../../stores/authStore';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import type { DigitalTwinStopTargetIdV1, DigitalTwinStopTargetStatusV1 } from '../../../shared/types/digital-twin-stop';

type Lang = 'zh' | 'en';
const pick = (lang: Lang, zh: string, en: string) => (lang === 'zh' ? zh : en);

const TARGET_LABELS: Record<DigitalTwinStopTargetIdV1, { zh: string; en: string }> = {
  public_ingress: { zh: '公开页提问', en: 'Public page questions' },
  private_answers: { zh: '私下回答', en: 'Private answers' },
  review_digest: { zh: '每周复核摘要', en: 'Weekly review digest' },
  body_voice: { zh: '声音', en: 'Voice' },
  body_avatar: { zh: '形象', en: 'Avatar' },
  mandate_actions: { zh: '代办授权', en: 'Delegated actions' },
  visitor_sessions: { zh: '访客会话', en: 'Visitor sessions' },
  projection_cache: { zh: '公开页缓存', en: 'Public page cache' },
};

function targetStatusLabel(status: DigitalTwinStopTargetStatusV1, lang: Lang): string {
  if (status === 'converged') return pick(lang, '已停止', 'stopped');
  if (status === 'pending') return pick(lang, '进行中', 'in progress');
  if (status === 'not_applicable') return pick(lang, '不适用', 'not applicable');
  return pick(lang, '未确认', 'unconfirmed');
}

function visibilityCopy(status: MobileTwinStatus, lang: Lang): { label: string; detail: string } {
  const byState: Record<TwinVisibility, { label: string; detail: string }> = {
    private: {
      label: pick(lang, '私密', 'Private'),
      detail: status.publicAvailable
        ? pick(lang, '只有你能和分身对话。公开要在网页上完成，每一项都要你确认。', 'Only you can talk to the twin. Publishing happens on the web, where you confirm each item.')
        : pick(lang, '只有你能和分身对话。公开页暂未开放。', 'Only you can talk to the twin. The public page is not open yet.'),
    },
    public: {
      label: pick(lang, '公开', 'Public'),
      detail: pick(
        lang,
        '任何人打开你的分享页都能向分身提问；回答都标注为 AI 分身。',
        'Anyone opening your share page can ask the twin; every answer is labelled as an AI twin.',
      ),
    },
    paused: {
      label: pick(lang, '已暂停', 'Paused'),
      detail: pick(
        lang,
        `分身已停止（第 ${status.stopEpoch} 次），不再回答，也不发摘要。公开页显示"已暂停"。恢复要在网页上完成。`,
        `The twin is stopped (epoch ${status.stopEpoch}). It answers nothing and sends nothing; the public page shows "paused". Resume on the web.`,
      ),
    },
    stopping: {
      label: pick(lang, '正在停止', 'Stopping'),
      detail: pick(
        lang,
        `已发出停止（第 ${status.stopEpoch} 次），还有 ${status.outstanding.length} 项没确认完成。`,
        `Stop sent (epoch ${status.stopEpoch}); ${status.outstanding.length} item(s) not confirmed yet.`,
      ),
    },
  };
  return byState[status.visibility];
}

function readStateCopy(state: TwinStatusReadState, lang: Lang): { title: string; detail: string } | null {
  switch (state.kind) {
    case 'ready':
    case 'unknown':
      // `unknown` = still loading; the spinner covers it.
      return null;
    case 'unauthorized':
      return { title: pick(lang, '登录后才能查看', 'Sign in to see this'), detail: pick(lang, '只有主人能查看和停止分身。', 'Only the owner can see or stop the twin.') };
    case 'forbidden':
      return { title: pick(lang, '这个 Agent 不在你的名下', 'This Agent is not yours'), detail: pick(lang, '只有主人能查看和停止分身。', 'Only the owner can see or stop the twin.') };
    case 'unavailable':
      if (state.reason === 'profile_not_found') {
        return { title: pick(lang, '还没有分身', 'No twin yet'), detail: pick(lang, '先创建分身，之后这里显示它是否公开。', 'Create the twin first; this page then shows whether it is public.') };
      }
      if (state.reason === 'agent_account_required') {
        return { title: pick(lang, '先选择一个 Agent', 'Pick an Agent first'), detail: pick(lang, '分身属于某一个 Agent。', 'A twin belongs to one Agent.') };
      }
      if (state.reason === 'not_found') {
        return { title: pick(lang, '读不到这个分身', 'Twin not found'), detail: pick(lang, '这个 Agent 不在你的名下，或还没开通分身。', 'This Agent is not yours, or has no twin yet.') };
      }
      return { title: pick(lang, '分身功能暂未开放', 'Twin is not available yet'), detail: `${pick(lang, '原因', 'reason')}: ${state.reason}` };
    case 'unsupported_schema':
      return { title: pick(lang, '版本不匹配', 'Version mismatch'), detail: pick(lang, '请更新 App 后再查看。', 'Update the app to see this.') };
    case 'error':
      return { title: pick(lang, '暂时读不到', 'Could not read the status'), detail: `${pick(lang, '原因', 'reason')}: ${state.reason}` };
    default:
      return { title: pick(lang, '暂时读不到', 'Could not read the status'), detail: `${pick(lang, '原因', 'reason')}: ${'reason' in state ? state.reason : state.kind}` };
  }
}

/** Republishing from the phone needs M0 and the phone key module (D16); every other build keeps the web path. */
export const TWIN_REPUBLISH_ON_PHONE = MOBILE_M0_ENABLED && PHONE_DEVICE_KEY_ENABLED;

function republishProblem(outcome: TwinRepublishOutcome, lang: Lang): string | null {
  if (outcome.kind === 'done') return null;
  if (outcome.kind === 'changed') return pick(lang, '公开内容和预览不一样了，请重新预览。', 'What would go public changed; preview again.');
  if (outcome.kind === 'rejected') return `${pick(lang, '后端拒绝', 'Rejected')}: ${outcome.reason}`;
  if (outcome.kind === 'failed') return `${pick(lang, '失败', 'Failed')}: ${outcome.reason}`;
  const result = outcome.result;
  if (result.kind === 'cancelled') return pick(lang, '已取消，没有公开。', 'Cancelled; nothing was published.');
  if (result.kind === 'refused') return pick(lang, '设备钥匙没通过确认，没有公开。', 'The device key was not accepted; nothing was published.');
  if (result.kind === 'unavailable') {
    return result.reason === 'not_registered'
      ? pick(lang, '这台手机还没登记设备钥匙：到 我的 → 设备 → 这台手机 登记后再试。', 'This phone has no device key yet: register it in My → Devices → This phone, then try again.')
      : pick(lang, '现在不能用手机确认，请到网页上公开。', 'Confirming on the phone is not available now; publish on the web.');
  }
  if (result.kind === 'rate_limited') return pick(lang, `试太多次了，${result.retryAfterSeconds} 秒后再试。`, `Too many tries; wait ${result.retryAfterSeconds} s.`);
  return `${pick(lang, '失败', 'Failed')}: ${result.reason}`;
}

function outcomeProblem(outcome: TwinCommandOutcome, lang: Lang): string | null {
  if (outcome.kind === 'done') return null;
  if (outcome.kind === 'rejected') return `${pick(lang, '后端拒绝', 'Rejected')}: ${outcome.reasonCode}`;
  if (outcome.kind === 'blocked') return `${pick(lang, '没有发出', 'Not sent')}: ${outcome.reason}`;
  return `${pick(lang, '失败', 'Failed')}: ${outcome.reason}`;
}

export function TwinStatusScreen() {
  const { t, language } = useI18n();
  const lang: Lang = language === 'zh' ? 'zh' : 'en';
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const token = useAuthStore((state) => state.token);
  const activeInstance = useAuthStore((state) => state.activeInstance);
  const agentAccountId: string = activeInstance?.agentAccountId ?? activeInstance?.metadata?.agentAccountId ?? '';
  const statusKey = ['four-zone', 'twin-status', agentAccountId];
  const query = useQuery({
    queryKey: statusKey,
    queryFn: () => fetchTwinStatus(agentAccountId),
    enabled: Boolean(token),
    retry: 0,
  });
  const state: TwinStatusReadState = !token
    ? { kind: 'unauthorized', reason: 'authentication_required' }
    : query.data ?? (query.isError ? { kind: 'error', retryable: true, reason: 'unexpected' } : { kind: 'unknown', reason: 'loading' });
  const tighten = useMutation({
    mutationFn: (action: TwinTighteningAction) => tightenTwin(agentAccountId, action),
    onSuccess: (outcome) => {
      const problem = outcomeProblem(outcome, lang);
      if (problem) Alert.alert(t({ en: 'Not changed', zh: '没有生效' }), problem);
    },
    onError: (error: any) => Alert.alert(t({ en: 'Not changed', zh: '没有生效' }), error?.message || t({ en: 'Try again.', zh: '请重试。' })),
    // What the list shows is always the backend read-back.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: statusKey }),
  });
  const openWeb = () => void Linking.openURL(getTwinWebUrl(agentAccountId || null)).catch(() => undefined);
  const [republishPreview, setRepublishPreview] = React.useState<TwinRepublishPreview | null>(null);
  const confirmPrompt = t({ en: 'Confirm it is you to put the twin back on the public page', zh: '确认是你本人，把分身重新公开' });
  const previewRepublish = useMutation({
    mutationFn: async (topics: string[]) => {
      const deps = await deviceKeyStepUpDeps(confirmPrompt);
      if (!deps) return { kind: 'failed' as const, reason: 'phone_key_unavailable' };
      return previewTwinRepublish(agentAccountId, topics, deps);
    },
    onSuccess: (result) => {
      if ('previewDigest' in result) setRepublishPreview(result);
      else Alert.alert(t({ en: 'Not changed', zh: '没有生效' }), `${t({ en: 'Failed', zh: '失败' })}: ${result.reason}`);
    },
  });
  const republish = useMutation({
    mutationFn: async (preview: TwinRepublishPreview): Promise<TwinRepublishOutcome> => {
      const deps = await deviceKeyStepUpDeps(confirmPrompt);
      if (!deps) return { kind: 'failed', reason: 'phone_key_unavailable' };
      return republishTwin(agentAccountId, preview, deps);
    },
    onSuccess: (outcome) => {
      setRepublishPreview(null);
      const problem = republishProblem(outcome, lang);
      if (problem) Alert.alert(t({ en: 'Not published', zh: '没有公开' }), problem);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: statusKey }),
  });

  const confirmStop = () =>
    Alert.alert(
      t({ en: 'Stop the twin now?', zh: '立即停止分身？' }),
      t({
        en: 'It stops answering anyone and sends nothing. The public page shows "paused". Resuming happens on the web.',
        zh: '停止后它不再回答任何人，也不发摘要；公开页显示"已暂停"。恢复要在网页上完成。',
      }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        { text: t({ en: 'Stop now', zh: '立即停止' }), style: 'destructive', onPress: () => tighten.mutate('stop') },
      ],
    );
  const confirmUnpublish = () =>
    Alert.alert(
      t({ en: 'Take the twin off the public page?', zh: '撤回公开？' }),
      t({
        en: 'Visitors can no longer ask it; the page shows "paused". It stays available to you in private.',
        zh: '访客不能再向它提问，公开页显示"已暂停"；你自己仍然可以私下使用。',
      }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        { text: t({ en: 'Unpublish', zh: '撤回公开' }), style: 'destructive', onPress: () => tighten.mutate('unpublish') },
      ],
    );

  const notice = readStateCopy(state, lang);
  const status = state.kind === 'ready' ? state.data : null;
  const copy = status ? visibilityCopy(status, lang) : null;
  const stopped = status ? status.visibility === 'paused' || status.visibility === 'stopping' : false;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="twin-status-screen">
      <Text style={styles.title} accessibilityRole="header">
        {t({ en: 'Visibility', zh: '公开状态' })}
      </Text>
      {state.kind === 'unknown' ? <ActivityIndicator /> : null}
      {notice ? (
        <View style={styles.notice} testID={`twin-status-read-state-${state.kind}`}>
          <Text style={styles.noticeTitle}>{notice.title}</Text>
          <Text style={styles.noticeText}>{notice.detail}</Text>
          {state.kind === 'error' ? (
            <TouchableOpacity onPress={() => void query.refetch()} accessibilityRole="button" style={styles.linkButton}>
              <Text style={styles.linkText}>{t({ en: 'Read again', zh: '重新读取' })}</Text>
            </TouchableOpacity>
          ) : null}
          {state.kind === 'unavailable' && state.reason === 'profile_not_found' ? (
            <TouchableOpacity onPress={() => navigation.navigate('TwinHome')} accessibilityRole="button" style={styles.linkButton}>
              <Text style={styles.linkText}>{t({ en: 'Create the twin', zh: '去创建分身' })}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      {status && copy ? (
        <>
          <View
            style={styles.stateCard}
            testID={`twin-status-state-${status.visibility}`}
            accessible
            accessibilityLabel={`${t({ en: 'Visibility', zh: '公开状态' })}: ${copy.label}`}
          >
            <Text style={styles.stateLabel}>{copy.label}</Text>
            <Text style={styles.stateDetail}>{copy.detail}</Text>
            {status.visibility === 'public' && status.publishedAt ? (
              <Text style={styles.muted}>{`${t({ en: 'Public since', zh: '公开于' })} ${status.publishedAt.slice(0, 10)}`}</Text>
            ) : null}
          </View>
          {!stopped ? (
            <TouchableOpacity
              style={styles.stopButton}
              onPress={confirmStop}
              disabled={tighten.isPending}
              accessibilityRole="button"
              accessibilityLabel={t({ en: 'Stop twin now', zh: '立即停止分身' })}
              testID="twin-stop-now"
            >
              <Text style={styles.stopText}>{t({ en: 'Stop twin now', zh: '立即停止分身' })}</Text>
            </TouchableOpacity>
          ) : null}
          {status.visibility === 'public' ? (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={confirmUnpublish}
              disabled={tighten.isPending}
              accessibilityRole="button"
              accessibilityLabel={t({ en: 'Unpublish', zh: '撤回公开' })}
              testID="twin-unpublish"
            >
              <Text style={styles.secondaryButtonText}>{t({ en: 'Unpublish', zh: '撤回公开' })}</Text>
            </TouchableOpacity>
          ) : null}
          {TWIN_REPUBLISH_ON_PHONE && twinRepublishTopics(status) && !republishPreview ? (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => previewRepublish.mutate(twinRepublishTopics(status) ?? [])}
              disabled={previewRepublish.isPending}
              accessibilityRole="button"
              testID="twin-republish-preview"
            >
              <Text style={styles.secondaryButtonText}>{t({ en: 'Put it back on the public page', zh: '重新公开' })}</Text>
            </TouchableOpacity>
          ) : null}
          {TWIN_REPUBLISH_ON_PHONE && republishPreview ? (
            <View style={styles.block} testID="twin-republish-confirm">
              <Text style={styles.stateDetail}>
                {t({ en: 'Anyone with your share page can ask the twin again, about:', zh: '重新公开后，打开你分享页的人又能向分身提问，范围是：' })}
              </Text>
              {republishPreview.topics.map((topic) => (
                <Text key={topic} style={styles.targetLabel}>
                  · {topic}
                </Text>
              ))}
              <TouchableOpacity
                style={styles.stopButton}
                onPress={() => republish.mutate(republishPreview)}
                disabled={republish.isPending}
                accessibilityRole="button"
                testID="twin-republish-confirm-button"
              >
                <Text style={styles.stopText}>{t({ en: 'Confirm with face / fingerprint', zh: '用面容 / 指纹确认并公开' })}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setRepublishPreview(null)} accessibilityRole="button" style={styles.linkButton}>
                <Text style={styles.linkText}>{t({ en: 'Not now', zh: '先不' })}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {tighten.isPending || previewRepublish.isPending || republish.isPending ? <ActivityIndicator /> : null}
          <Text style={styles.section}>{stopped ? t({ en: 'What the stop covers', zh: '停止覆盖的范围' }) : t({ en: 'A stop would cover', zh: '停止会覆盖' })}</Text>
          <View style={styles.block} testID="twin-status-targets">
            {status.targets.map((target) => (
              <View key={target.target} style={styles.targetRow}>
                <Text style={styles.targetLabel}>{TARGET_LABELS[target.target][lang]}</Text>
                <Text style={target.status === 'converged' ? styles.toneReady : target.status === 'not_applicable' ? styles.toneMuted : styles.toneTodo}>
                  {targetStatusLabel(target.status, lang)}
                </Text>
              </View>
            ))}
          </View>
          {/* REQ-backend-033: narrow or revoke the Representation Mandate; granting stays on the web. */}
          <TwinMandateSection agentAccountId={agentAccountId} />
        </>
      ) : null}
      <TouchableOpacity style={styles.secondaryButton} onPress={openWeb} accessibilityRole="button" testID="twin-status-open-web">
        <Text style={styles.secondaryButtonText}>
          {stopped
            ? t({ en: 'Resume on the web', zh: '到网页上恢复' })
            : t({ en: 'Publish or change on the web', zh: '到网页上公开或修改' })}
        </Text>
      </TouchableOpacity>
      <Text style={styles.helper}>
        {t({
          en: 'On the phone you can only narrow: stop the twin, take it off the public page, or narrow or revoke what it may do for you. Publishing, resuming and widening need the web preview and confirmation.',
          zh: '手机上只能收紧：停止分身、撤回公开、收窄或撤销代表范围。公开、恢复和放宽要在网页上预览并确认。',
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
    stateCard: { backgroundColor: c.bgCard, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: c.border, gap: 6 },
    stateLabel: { color: c.textPrimary, fontSize: 22, fontWeight: '800' },
    stateDetail: { color: c.textSecondary, fontSize: 14, lineHeight: 20 },
    muted: { color: c.textMuted, fontSize: 12 },
    // Token pair: text on the danger fill is onDanger (11.4).
    stopButton: { minHeight: 52, borderRadius: 14, backgroundColor: c.danger, alignItems: 'center', justifyContent: 'center' },
    stopText: { color: c.onDanger, fontSize: 16, fontWeight: '800' },
    block: { backgroundColor: c.bgCard, borderRadius: 16, padding: 15, borderWidth: 1, borderColor: c.border, gap: 10 },
    targetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
    targetLabel: { color: c.textPrimary, fontSize: 14, fontWeight: '700', flex: 1 },
    toneReady: { color: c.success, fontSize: 12, fontWeight: '800' },
    toneTodo: { color: c.warning, fontSize: 12, fontWeight: '800' },
    toneMuted: { color: c.textMuted, fontSize: 12, fontWeight: '700' },
    secondaryButton: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border },
    secondaryButtonText: { color: c.textPrimary, fontSize: 15, fontWeight: '700' },
    helper: { color: c.textMuted, fontSize: 12, lineHeight: 17, textAlign: 'center' },
  });
