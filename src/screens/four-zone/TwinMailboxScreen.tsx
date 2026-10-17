/**
 * TwinMailboxScreen — the Agent's own mailbox on the phone (EXPO_PUBLIC_AGENT_MAILBOX=1, agentMailbox.ts): its address,
 * drafts the Agent wrote in chat waiting for the owner, and what came in. A draft goes out only from Send after the
 * system confirm; mail is shown as plain text. Native only, no web hand-off.
 */
import React from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useAuthStore } from '../../stores/authStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import type { AgentMailDraftViewV0 } from '../../../shared/types/agent-mailbox';
import { AGENT_MAILBOX_FAILURE_COPY, AgentMailboxError } from '../../services/agentMailbox';
import { mobileAgentMailboxClient } from '../../services/agentMailboxSession';

export const mailboxQueryKey = (agentAccountId: string) => ['four-zone', 'agent-mailbox', agentAccountId] as const;
const failureOf = (error: unknown) => (error instanceof AgentMailboxError ? error.failure : 'unavailable');

export function TwinMailboxScreen() {
  const { t, language } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const queryClient = useQueryClient();
  const activeInstance = useAuthStore((state) => state.activeInstance);
  const agentAccountId: string = activeInstance?.agentAccountId ?? activeInstance?.metadata?.agentAccountId ?? '';
  const key = mailboxQueryKey(agentAccountId);
  const mailbox = useQuery({
    queryKey: key,
    queryFn: async () => {
      const client = mobileAgentMailboxClient();
      const status = await client.status(agentAccountId);
      if (!status.address) return { address: null, drafts: [], messages: [] };
      const [drafts, messages] = await Promise.all([client.drafts(agentAccountId), client.messages(agentAccountId)]);
      return { address: status.address, drafts, messages };
    },
    enabled: !!agentAccountId,
    retry: 0,
    staleTime: 15_000,
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: key });
  const onError = (error: unknown) => Alert.alert(t({ en: 'Not done', zh: '没有完成' }), t(AGENT_MAILBOX_FAILURE_COPY[failureOf(error)]));
  const open = useMutation({ mutationFn: () => mobileAgentMailboxClient().open(agentAccountId), onError, onSettled: refresh });
  const send = useMutation({ mutationFn: (draftRef: string) => mobileAgentMailboxClient().send(draftRef), onError, onSettled: refresh });
  const discard = useMutation({ mutationFn: (draftRef: string) => mobileAgentMailboxClient().discard(draftRef), onError, onSettled: refresh });
  const confirmSend = (draft: AgentMailDraftViewV0) =>
    Alert.alert(t({ en: 'Send this email?', zh: '发出这封邮件？' }), t({ en: `To ${draft.to}. It cannot be unsent.`, zh: `发给 ${draft.to}，发出后收不回。` }), [
      { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
      { text: t({ en: 'Send', zh: '发送' }), onPress: () => send.mutate(draft.draftRef) },
    ]);
  const when = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const failure = mailbox.isError ? failureOf(mailbox.error) : null;
  const data = mailbox.data;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={mailbox.isRefetching} onRefresh={() => void mailbox.refetch()} />}
      testID="twin-mailbox-screen"
    >
      <Text style={styles.title} accessibilityRole="header">
        {t({ en: "Your Agent's mailbox", zh: 'Agent 的邮箱' })}
      </Text>
      <Text style={styles.muted}>
        {t({
          en: 'People can write to this address; in a chat your Agent can read it and draft replies. Mail comes from outside and the Agent never follows what it asks. A draft goes out only when you tap Send or clearly confirm in the chat, within 30 minutes.',
          zh: '别人可以给这个地址写信，你的 Agent 在对话里能读到并帮你起草回复。来信是外人写的，Agent 不会照信里的要求去做；草稿只有你点「发送」或在对话里明确说「确认」才会发出，30 分钟内有效。',
        })}
      </Text>
      {mailbox.isLoading && !!agentAccountId ? <ActivityIndicator /> : null}
      {failure ? <Text style={styles.problem} testID="twin-mailbox-error">{t(AGENT_MAILBOX_FAILURE_COPY[failure])}</Text> : null}
      {data && !data.address ? (
        <TouchableOpacity style={styles.primary} onPress={() => open.mutate()} disabled={open.isPending} accessibilityRole="button" testID="twin-mailbox-open">
          <Text style={styles.primaryText}>{t({ en: 'Open the mailbox', zh: '开通邮箱' })}</Text>
        </TouchableOpacity>
      ) : null}
      {data?.address ? (
        <>
          <Text style={styles.address} selectable testID="twin-mailbox-address">{data.address}</Text>
          <Text style={styles.section}>{t({ en: 'Drafts waiting for you', zh: '等你确认的草稿' })}</Text>
          {data.drafts.length === 0 ? <Text style={styles.muted}>{t({ en: 'No drafts.', zh: '没有草稿。' })}</Text> : null}
          {data.drafts.map((draft) => (
            <View key={draft.draftRef} style={styles.card} testID={`twin-mail-draft-${draft.draftRef}`}>
              <Text style={styles.detail}>{t({ en: 'To', zh: '发给' })} {draft.to}</Text>
              <Text style={styles.cardTitle}>{draft.subject}</Text>
              <Text style={styles.body}>{draft.text}</Text>
              <View style={styles.actions}>
                <TouchableOpacity style={styles.primary} onPress={() => confirmSend(draft)} disabled={send.isPending} accessibilityRole="button">
                  <Text style={styles.primaryText}>{t({ en: 'Send', zh: '发送' })}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.button} onPress={() => discard.mutate(draft.draftRef)} disabled={discard.isPending} accessibilityRole="button">
                  <Text style={styles.buttonText}>{t({ en: 'Discard', zh: '丢弃' })}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          <Text style={styles.section}>{t({ en: 'Recently received', zh: '最近收到' })}</Text>
          {data.messages.length === 0 ? <Text style={styles.muted}>{t({ en: 'Nothing yet.', zh: '还没有来信。' })}</Text> : null}
          {data.messages.map((m) => (
            <View key={m.messageRef} style={styles.card}>
              <Text style={styles.detail} numberOfLines={1}>{m.from}{m.receivedAt ? ` · ${when(m.receivedAt)}` : ''}</Text>
              <Text style={styles.cardTitle} numberOfLines={2}>{m.subject}</Text>
              <Text style={styles.muted} numberOfLines={3}>{m.preview}</Text>
            </View>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bgPrimary },
    content: { padding: 20, gap: 10 },
    title: { color: c.textPrimary, fontSize: 24, fontWeight: '800' },
    section: { color: c.textPrimary, fontSize: 16, fontWeight: '700', marginTop: 10 },
    muted: { color: c.textMuted, fontSize: 13, lineHeight: 19 },
    problem: { color: c.danger, fontSize: 13 },
    address: { color: c.textPrimary, fontSize: 15, fontWeight: '700' },
    card: { backgroundColor: c.bgCard, borderColor: c.border, borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
    cardTitle: { color: c.textPrimary, fontSize: 15, fontWeight: '700' },
    detail: { color: c.textSecondary, fontSize: 13, lineHeight: 19 },
    body: { color: c.textPrimary, fontSize: 14, lineHeight: 20 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
    primary: { minHeight: 44, paddingHorizontal: 18, borderRadius: 12, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    primaryText: { color: c.onAccent, fontSize: 14, fontWeight: '800' },
    button: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    buttonText: { color: c.textPrimary, fontSize: 14, fontWeight: '700' },
  });
