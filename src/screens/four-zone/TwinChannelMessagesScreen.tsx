/**
 * TwinChannelMessagesScreen — one connected chat (A2, E98; channelInbox.ts). Only with `EXPO_PUBLIC_CHANNEL_INBOX=1`.
 *
 * - Drafts waiting for the owner come first: send as written, edit then send, or reject (each two taps).
 *   WhatsApp can only answer within 24 hours of the visitor's last message (`agentChannelWhatsAppCanReplyV0`);
 *   past that the phone does not offer "send".
 * - Then the conversation, oldest first, with who sent each message and its state. Everything other people wrote is
 *   plain text: no links, no control or direction characters.
 * - After a decision the list is read again; nothing is shown as sent until the server says so.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import { agentChannelWhatsAppCanReplyV0, type AgentChannelMessageViewV0 } from '../../../shared/types/agent-channel';
import {
  CHANNEL_INBOX_FAILURE_COPY,
  CHANNEL_MESSAGE_STATE_COPY,
  ChannelInboxError,
  channelMessageText,
  channelSenderLabel,
  isChannelBindingRef,
  pendingDrafts,
} from '../../services/channelInbox';
import { mobileChannelInboxClient } from '../../services/channelInboxSession';

type Lang = 'zh' | 'en';
type Decision = { kind: 'send'; draftRef: string; text?: string } | { kind: 'reject'; draftRef: string };

export function TwinChannelMessagesScreen() {
  const { t, language } = useI18n();
  const lang: Lang = language === 'zh' ? 'zh' : 'en';
  const styles = useThemedStyles(makeStyles);
  const route = useRoute<any>();
  const queryClient = useQueryClient();
  const bindingRef: string | null = isChannelBindingRef(route.params?.bindingRef) ? route.params.bindingRef : null;
  const platform: string = route.params?.platform === 'whatsapp' ? 'whatsapp' : 'telegram';
  const key = ['four-zone', 'channel-messages', bindingRef ?? ''] as const;
  const [editing, setEditing] = useState<{ draftRef: string; text: string } | null>(null);
  const messages = useQuery({
    queryKey: key,
    queryFn: () => mobileChannelInboxClient().listMessages(bindingRef as string),
    enabled: !!bindingRef,
    retry: 0,
    staleTime: 10_000,
  });
  const decide = useMutation({
    mutationFn: (decision: Decision) =>
      decision.kind === 'send'
        ? mobileChannelInboxClient().approveDraft(decision.draftRef, decision.text)
        : mobileChannelInboxClient().rejectDraft(decision.draftRef),
    onSuccess: () => setEditing(null),
    onError: (error: unknown) => {
      const failure = error instanceof ChannelInboxError ? error.failure : 'unavailable';
      Alert.alert(t({ en: 'Not recorded', zh: '没有生效' }), t(CHANNEL_INBOX_FAILURE_COPY[failure]));
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
  });
  const confirm = (decision: Decision) => {
    const send = decision.kind === 'send';
    Alert.alert(
      send ? t({ en: 'Send this reply?', zh: '发出这条回复？' }) : t({ en: 'Reject this draft?', zh: '拒绝这条草稿？' }),
      send ? t({ en: 'It will be marked as sent by AI.', zh: '它会标明是 AI 发的。' }) : undefined,
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        { text: send ? t({ en: 'Send', zh: '发出' }) : t({ en: 'Reject', zh: '拒绝' }), style: send ? 'default' : 'destructive', onPress: () => decide.mutate(decision) },
      ],
    );
  };

  const items = messages.data?.items ?? [];
  const drafts = pendingDrafts(items);
  const thread = items.filter((m) => m.state !== 'draft_pending').sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const lastInbound = items.filter((m) => m.direction === 'inbound').reduce<string | null>((latest, m) => (!latest || Date.parse(m.createdAt) > Date.parse(latest) ? m.createdAt : latest), null);
  const canSend = platform !== 'whatsapp' || agentChannelWhatsAppCanReplyV0(lastInbound, Date.now());
  const failure = messages.isError ? (messages.error instanceof ChannelInboxError ? messages.error.failure : 'unavailable') : null;

  const draftCard = (draft: AgentChannelMessageViewV0) => {
    const draftRef = draft.draftRef as string;
    const isEditing = editing?.draftRef === draftRef;
    const busy = decide.isPending && decide.variables?.draftRef === draftRef;
    return (
      <View key={draft.messageRef} style={styles.draft} testID={`channel-draft-${draftRef}`}>
        <Text style={styles.kind}>{t({ en: 'Draft reply, waiting for you', zh: '草稿回复，等你确认' })}</Text>
        {isEditing ? (
          <TextInput
            style={styles.input}
            value={editing.text}
            onChangeText={(text) => setEditing({ draftRef, text })}
            multiline
            maxLength={4096}
            accessibilityLabel={t({ en: 'Edit the reply', zh: '修改回复' })}
            testID={`channel-draft-input-${draftRef}`}
          />
        ) : (
          <Text style={styles.body}>{channelMessageText(draft, lang)}</Text>
        )}
        {!canSend ? (
          <Text style={styles.hint} testID="channel-whatsapp-window-closed">
            {t({ en: 'WhatsApp only allows a reply within 24 hours of the visitor’s last message; that time has passed.', zh: 'WhatsApp 只能在访客最后一条消息后 24 小时内回复，已经过了。' })}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.rejectButton} onPress={() => confirm({ kind: 'reject', draftRef })} disabled={busy} accessibilityRole="button" testID={`channel-draft-reject-${draftRef}`}>
            <Text style={styles.rejectText}>{t({ en: 'Reject', zh: '拒绝' })}</Text>
          </TouchableOpacity>
          {canSend && !isEditing ? (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setEditing({ draftRef, text: draft.text ?? '' })}
              disabled={busy}
              accessibilityRole="button"
              testID={`channel-draft-edit-${draftRef}`}
            >
              <Text style={styles.secondaryText}>{t({ en: 'Edit', zh: '改一下' })}</Text>
            </TouchableOpacity>
          ) : null}
          {canSend ? (
            <TouchableOpacity
              style={styles.sendButton}
              onPress={() => confirm(isEditing ? { kind: 'send', draftRef, text: editing.text } : { kind: 'send', draftRef })}
              disabled={busy}
              accessibilityRole="button"
              testID={`channel-draft-send-${draftRef}`}
            >
              <Text style={styles.sendText}>{isEditing ? t({ en: 'Send edited', zh: '发出改过的' }) : t({ en: 'Send', zh: '发出' })}</Text>
            </TouchableOpacity>
          ) : null}
          {busy ? <ActivityIndicator /> : null}
        </View>
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={messages.isRefetching} onRefresh={() => void messages.refetch()} />}
      testID="twin-channel-messages-screen"
    >
      {!bindingRef ? <Text style={styles.problem}>{t(CHANNEL_INBOX_FAILURE_COPY.not_found)}</Text> : null}
      {messages.isLoading && bindingRef ? <ActivityIndicator /> : null}
      {failure ? <Text style={styles.problem} testID="channel-messages-error">{t(CHANNEL_INBOX_FAILURE_COPY[failure])}</Text> : null}
      {drafts.map(draftCard)}
      {messages.data && items.length === 0 ? <Text style={styles.muted}>{t({ en: 'No messages yet.', zh: '还没有消息。' })}</Text> : null}
      {messages.data && messages.data.unreadable > 0 ? (
        <Text style={styles.muted}>{t({ en: `${messages.data.unreadable} more could not be read.`, zh: `另有 ${messages.data.unreadable} 条读不出来，没有列出。` })}</Text>
      ) : null}
      {thread.map((message) => (
        <View key={message.messageRef} style={message.direction === 'outbound' ? styles.outbound : styles.inbound} testID={`channel-message-${message.messageRef}`}>
          <Text style={styles.kind}>
            {channelSenderLabel(message, lang)} · {t(CHANNEL_MESSAGE_STATE_COPY[message.state])}
          </Text>
          <Text style={styles.body}>{channelMessageText(message, lang)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bgPrimary },
    content: { padding: 16, gap: 10 },
    muted: { color: c.textMuted, fontSize: 13 },
    problem: { color: c.danger, fontSize: 13 },
    hint: { color: c.textMuted, fontSize: 12, lineHeight: 17 },
    kind: { color: c.textSecondary, fontSize: 12, fontWeight: '700' },
    body: { color: c.textPrimary, fontSize: 14, lineHeight: 20 },
    draft: { backgroundColor: c.bgCard, borderColor: c.accent, borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
    inbound: { backgroundColor: c.bgCard, borderColor: c.border, borderWidth: 1, borderRadius: 12, padding: 12, gap: 4, marginRight: 32 },
    outbound: { backgroundColor: c.bgCard, borderColor: c.border, borderWidth: 1, borderRadius: 12, padding: 12, gap: 4, marginLeft: 32 },
    input: { minHeight: 88, borderColor: c.border, borderWidth: 1, borderRadius: 10, padding: 10, color: c.textPrimary, fontSize: 14, textAlignVertical: 'top' },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
    rejectButton: { minHeight: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: c.danger, alignItems: 'center', justifyContent: 'center' },
    rejectText: { color: c.danger, fontSize: 14, fontWeight: '800' },
    secondaryButton: { minHeight: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    secondaryText: { color: c.textPrimary, fontSize: 14, fontWeight: '700' },
    // Token pair: text on the primary fill is onAccent (11.4).
    sendButton: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' },
    sendText: { color: c.onAccent, fontSize: 14, fontWeight: '800' },
  });
