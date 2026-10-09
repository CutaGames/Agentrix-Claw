/**
 * TwinMandateSection — 分身 → 公开状态 → 代表范围 (Representation Mandate,
 * REQ-backend-033, D16 / 8.3).
 *
 * Reads what the twin may do on the owner's behalf and offers only tightening:
 * drop one item (action, audience, channel, mode), end within 7 days, or
 * revoke. Each change is confirmed first and the section re-reads the backend
 * afterwards. Granting and widening open the web (preview + recent sign-in).
 */
import React from 'react';
import { ActivityIndicator, Alert, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  availableTwinMandateNarrowings,
  describeTwinMandateLimits,
  narrowTwinMandate,
  readTwinMandate,
  revokeTwinMandate,
  type TwinMandateNarrowing,
  type TwinMandateOutcome,
  type TwinMandateRead,
} from '../../services/twinMandate';
import { getTwinWebUrl } from '../../services/webHandoff';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import type {
  RepresentationActionV1,
  RepresentationAudienceV1,
  RepresentationChannelV1,
  RepresentationModeV1,
} from '../../../shared/types/representation-mandate';

type Lang = 'zh' | 'en';
type Label = { zh: string; en: string };

const ACTION_TEXT: Record<RepresentationActionV1, Label> = {
  answer: { zh: '回答访客', en: 'Answer visitors' },
  appointment: { zh: '预约', en: 'Bookings' },
  lead: { zh: '留联系方式', en: 'Take contact details' },
  paid_answer: { zh: '付费问答', en: 'Paid answers' },
  deposit: { zh: '收定金', en: 'Deposits' },
  handoff: { zh: '转给你本人', en: 'Hand off to you' },
};
const AUDIENCE_TEXT: Record<RepresentationAudienceV1, Label> = {
  public: { zh: '所有访客', en: 'Everyone' },
  partner: { zh: '合作方', en: 'Partners' },
  agent: { zh: '其他 Agent', en: 'Other Agents' },
};
const CHANNEL_TEXT: Record<RepresentationChannelV1, Label> = {
  web: { zh: '网页', en: 'Web' },
  wechat_h5: { zh: '微信内网页', en: 'WeChat pages' },
  a2a: { zh: 'Agent 之间', en: 'Agent to Agent' },
};
const MODE_TEXT: Record<RepresentationModeV1, Label> = {
  text: { zh: '文字', en: 'Text' },
  voice: { zh: '声音', en: 'Voice' },
  avatar: { zh: '形象', en: 'Avatar' },
};

function narrowingText(change: TwinMandateNarrowing, lang: Lang): string {
  switch (change.kind) {
    case 'remove_action':
      return lang === 'zh' ? `不再${ACTION_TEXT[change.action].zh}` : `Stop: ${ACTION_TEXT[change.action].en}`;
    case 'remove_audience':
      return lang === 'zh' ? `不再面向${AUDIENCE_TEXT[change.audience].zh}` : `Not for: ${AUDIENCE_TEXT[change.audience].en}`;
    case 'remove_channel':
      return lang === 'zh' ? `不再用${CHANNEL_TEXT[change.channel].zh}` : `Not on: ${CHANNEL_TEXT[change.channel].en}`;
    case 'remove_mode':
      return lang === 'zh' ? `不再用${MODE_TEXT[change.mode].zh}` : `No ${MODE_TEXT[change.mode].en.toLowerCase()}`;
    case 'end_within_7d':
      return lang === 'zh' ? '7 天后失效' : 'End in 7 days';
  }
}

function narrowingKey(change: TwinMandateNarrowing): string {
  switch (change.kind) {
    case 'remove_action':
      return `action-${change.action}`;
    case 'remove_audience':
      return `audience-${change.audience}`;
    case 'remove_channel':
      return `channel-${change.channel}`;
    case 'remove_mode':
      return `mode-${change.mode}`;
    case 'end_within_7d':
      return 'end-7d';
  }
}

function outcomeProblem(outcome: TwinMandateOutcome, lang: Lang): string | null {
  const pick = (zh: string, en: string) => (lang === 'zh' ? zh : en);
  switch (outcome.kind) {
    case 'done':
      return null;
    case 'conflict':
      return pick('代表范围刚在别处改过，已重新读取，请再看一眼。', 'The mandate just changed elsewhere; it was read again, please check.');
    case 'needs_web':
      return pick('这个改动会放宽范围，要到网页上确认。', 'This change would widen the mandate; confirm it on the web.');
    case 'blocked':
      return `${pick('没有发出', 'Not sent')}: ${outcome.reason}`;
    case 'failed':
      return `${pick('没有生效', 'Not applied')}: ${outcome.reason}`;
  }
}

export function TwinMandateSection({ agentAccountId }: { agentAccountId: string }) {
  const { t, language } = useI18n();
  const lang: Lang = language === 'zh' ? 'zh' : 'en';
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const key = ['four-zone', 'twin-mandate', agentAccountId];
  const query = useQuery({ queryKey: key, queryFn: () => readTwinMandate(agentAccountId), retry: 0 });
  const read: TwinMandateRead = query.data ?? (query.isError ? { kind: 'error', reason: 'unexpected', retryable: true } : { kind: 'error', reason: 'loading', retryable: false });
  const onOutcome = (outcome: TwinMandateOutcome) => {
    const problem = outcomeProblem(outcome, lang);
    if (problem) Alert.alert(t({ en: 'Not changed', zh: '没有生效' }), problem);
  };
  const narrow = useMutation({
    mutationFn: (change: TwinMandateNarrowing) =>
      read.kind === 'ready' && read.mandate ? narrowTwinMandate(agentAccountId, read.mandate, change) : Promise.resolve<TwinMandateOutcome>({ kind: 'blocked', reason: 'no_mandate' }),
    onSuccess: onOutcome,
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
  });
  const revoke = useMutation({
    mutationFn: () => revokeTwinMandate(agentAccountId),
    onSuccess: onOutcome,
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
  });
  const busy = narrow.isPending || revoke.isPending;
  const openWeb = () => void Linking.openURL(getTwinWebUrl(agentAccountId || null)).catch(() => undefined);

  const confirmNarrow = (change: TwinMandateNarrowing) =>
    Alert.alert(narrowingText(change, lang), t({ en: 'Takes effect now. Widening it again happens on the web.', zh: '立即生效。以后要放宽，得到网页上确认。' }), [
      { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
      { text: t({ en: 'Narrow', zh: '收窄' }), style: 'destructive', onPress: () => narrow.mutate(change) },
    ]);
  const confirmRevoke = () =>
    Alert.alert(
      t({ en: 'Revoke the mandate?', zh: '撤销代表授权？' }),
      t({ en: 'The twin stops acting for you at once; visitors are told to contact you. Granting again happens on the web.', zh: '分身立即不再代表你办事，访客会被引导直接联系你。重新授权要到网页上完成。' }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        { text: t({ en: 'Revoke', zh: '撤销' }), style: 'destructive', onPress: () => revoke.mutate() },
      ],
    );

  const mandate = read.kind === 'ready' ? read.mandate : null;
  const active = mandate?.status === 'active';
  const options = mandate && active ? availableTwinMandateNarrowings(mandate) : [];
  const limits = mandate ? describeTwinMandateLimits(mandate) : null;

  return (
    <View style={styles.block} testID="twin-mandate-section">
      <Text style={styles.section} accessibilityRole="header">
        {t({ en: 'What the twin may do for you', zh: '代表范围' })}
      </Text>
      {query.isLoading ? <ActivityIndicator /> : null}
      {!query.isLoading && read.kind === 'unavailable' ? (
        <Text style={styles.muted} testID={`twin-mandate-unavailable-${read.reason}`}>
          {read.reason === 'not_enabled'
            ? t({ en: 'Delegation is not open yet; the twin only answers from what you confirmed.', zh: '代表授权暂未开放，分身只按你确认过的内容回答。' })
            : t({ en: 'Could not read the mandate for this Agent.', zh: '读不到这个 Agent 的代表授权。' })}
        </Text>
      ) : null}
      {!query.isLoading && read.kind === 'error' && read.reason !== 'loading' ? (
        <TouchableOpacity onPress={() => void query.refetch()} accessibilityRole="button" style={styles.linkButton}>
          <Text style={styles.linkText}>{t({ en: 'Read again', zh: '重新读取' })}</Text>
        </TouchableOpacity>
      ) : null}
      {read.kind === 'ready' && !mandate ? (
        <Text style={styles.muted} testID="twin-mandate-none">
          {t({ en: 'No mandate: the twin does not act for you. Grant one on the web.', zh: '还没有授权，分身不代表你办事。要授权请到网页上设置。' })}
        </Text>
      ) : null}
      {mandate ? (
        <View style={styles.summary} testID={`twin-mandate-${active ? 'active' : 'inactive'}`}>
          <Text style={styles.line}>{mandate.terms.actions.map((a) => ACTION_TEXT[a][lang]).join(lang === 'zh' ? '、' : ', ')}</Text>
          <Text style={styles.muted}>
            {[
              mandate.terms.audiences.map((a) => AUDIENCE_TEXT[a][lang]).join(' / '),
              mandate.terms.channels.map((c) => CHANNEL_TEXT[c][lang]).join(' / '),
              mandate.terms.validUntil ? `${t({ en: 'until', zh: '有效到' })} ${mandate.terms.validUntil.slice(0, 10)}` : t({ en: 'until revoked', zh: '直到撤销' }),
            ].join(' · ')}
          </Text>
          {limits ? (
            <View testID="twin-mandate-limits">
              <Text style={styles.muted}>
                {limits.collects && limits.perOrder
                  ? `${t({ en: 'May collect up to', zh: '每单最多代收' })} ${limits.perOrder}${limits.perDay ? ` · ${t({ en: 'per day', zh: '每天最多' })} ${limits.perDay}` : ''}`
                  : t({ en: 'Collects no money for you', zh: '不代你收钱' })}
              </Text>
              <Text style={styles.muted}>
                {limits.topics.length === 0
                  ? t({ en: 'Topics: every published topic', zh: '话题：全部已公开的话题' })
                  : `${t({ en: 'Topics', zh: '话题' })}: ${limits.topics.join(lang === 'zh' ? '、' : ', ')}`}
              </Text>
              {limits.handoffToOwnerInbox ? (
                <Text style={styles.muted}>{t({ en: 'Hands off to you: to your Matters inbox', zh: '转给你本人：转到你的事项收件箱' })}</Text>
              ) : limits.handoffContacts > 0 ? (
                <Text style={styles.muted}>{t({ en: `Hands off to you via ${limits.handoffContacts} confirmed contact(s)`, zh: `转给你本人：${limits.handoffContacts} 个确认过的联系方式` })}</Text>
              ) : null}
            </View>
          ) : null}
          {!active ? <Text style={styles.muted}>{t({ en: 'Not in effect.', zh: '现在不生效。' })}</Text> : null}
        </View>
      ) : null}
      {options.length > 0 ? (
        <View style={styles.chips}>
          {options.map((change) => (
            <TouchableOpacity
              key={narrowingKey(change)}
              style={styles.chip}
              onPress={() => confirmNarrow(change)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={narrowingText(change, lang)}
              testID={`twin-mandate-narrow-${narrowingKey(change)}`}
            >
              <Text style={styles.chipText}>{narrowingText(change, lang)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      {mandate && active ? (
        <TouchableOpacity style={styles.revokeButton} onPress={confirmRevoke} disabled={busy} accessibilityRole="button" testID="twin-mandate-revoke">
          <Text style={styles.revokeText}>{t({ en: 'Revoke mandate', zh: '撤销代表授权' })}</Text>
        </TouchableOpacity>
      ) : null}
      {busy ? <ActivityIndicator /> : null}
      <TouchableOpacity onPress={openWeb} accessibilityRole="button" style={styles.linkButton} testID="twin-mandate-open-web">
        <Text style={styles.linkText}>{t({ en: 'Grant or widen on the web', zh: '到网页上授权或放宽' })}</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    block: { backgroundColor: c.bgCard, borderRadius: 16, padding: 15, borderWidth: 1, borderColor: c.border, gap: 10 },
    section: { color: c.textSecondary, fontSize: 13, fontWeight: '700' },
    summary: { gap: 4 },
    line: { color: c.textPrimary, fontSize: 15, fontWeight: '700' },
    muted: { color: c.textMuted, fontSize: 12, lineHeight: 17 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { minHeight: 36, borderRadius: 18, paddingHorizontal: 12, justifyContent: 'center', borderWidth: 1, borderColor: c.border },
    chipText: { color: c.textPrimary, fontSize: 13, fontWeight: '600' },
    revokeButton: { minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.danger },
    revokeText: { color: c.danger, fontSize: 14, fontWeight: '800' },
    linkButton: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' },
    linkText: { color: c.accent, fontSize: 13, fontWeight: '800' },
  });
