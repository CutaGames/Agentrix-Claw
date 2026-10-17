/**
 * TwinChannelsScreen — 分身 → 渠道对话 (A2, E98; channelInbox.ts). Only in builds with `EXPO_PUBLIC_CHANNEL_INBOX=1`.
 *
 * Lists the Telegram / WhatsApp chats connected to this agent: platform, chat name, status and what it does now
 * (`effectiveTier`; a stepped-down tier says why). Opening one shows its messages and the drafts waiting for the
 * owner. "断开" disconnects a chat (a tightening, two taps). Connecting a chat and changing the tier stay on the
 * web for now (the bind code and the PATCH body are web 3 / contract v0.1).
 */
import React from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { useAuthStore } from '../../stores/authStore';
import { useThemedStyles, type Palette } from '../../theme/useTheme';
import {
  CHANNEL_BINDING_STATUS_COPY,
  CHANNEL_INBOX_FAILURE_COPY,
  CHANNEL_PLATFORM_COPY,
  ChannelInboxError,
  channelChatLabel,
  channelTierLine,
} from '../../services/channelInbox';
import { mobileChannelInboxClient } from '../../services/channelInboxSession';

type Lang = 'zh' | 'en';

export const channelBindingsQueryKey = (agentAccountId: string) => ['four-zone', 'channel-bindings', agentAccountId] as const;

export function TwinChannelsScreen() {
  const { t, language } = useI18n();
  const lang: Lang = language === 'zh' ? 'zh' : 'en';
  const styles = useThemedStyles(makeStyles);
  const navigation = useNavigation<any>();
  const queryClient = useQueryClient();
  const activeInstance = useAuthStore((state) => state.activeInstance);
  const agentAccountId: string = activeInstance?.agentAccountId ?? activeInstance?.metadata?.agentAccountId ?? '';
  const key = channelBindingsQueryKey(agentAccountId);
  const bindings = useQuery({
    queryKey: key,
    queryFn: () => mobileChannelInboxClient().listBindings(agentAccountId),
    enabled: !!agentAccountId,
    retry: 0,
    staleTime: 15_000,
  });
  const revoke = useMutation({
    mutationFn: (bindingRef: string) => mobileChannelInboxClient().revokeBinding(bindingRef),
    onError: (error: unknown) => {
      const failure = error instanceof ChannelInboxError ? error.failure : 'unavailable';
      Alert.alert(t({ en: 'Not recorded', zh: '没有生效' }), t(CHANNEL_INBOX_FAILURE_COPY[failure]));
    },
    // The list shows the server's read-back, not what we sent.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
  });
  const confirmRevoke = (bindingRef: string, label: string) =>
    Alert.alert(t({ en: 'Disconnect this chat?', zh: '断开这个聊天？' }), label, [
      { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
      { text: t({ en: 'Disconnect', zh: '断开' }), style: 'destructive', onPress: () => revoke.mutate(bindingRef) },
    ]);
  const failure = bindings.isError ? (bindings.error instanceof ChannelInboxError ? bindings.error.failure : 'unavailable') : null;
  const list = bindings.data?.items ?? [];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={bindings.isRefetching} onRefresh={() => void bindings.refetch()} />}
      testID="twin-channels-screen"
    >
      <Text style={styles.title} accessibilityRole="header">
        {t({ en: 'Chats', zh: '渠道对话' })}
      </Text>
      <Text style={styles.muted}>
        {t({
          en: 'Telegram and WhatsApp chats connected to your agent. Messages it sends are always marked as AI.',
          zh: '接到你的 Agent 上的 Telegram、WhatsApp 聊天。它发出的消息都会标明是 AI。',
        })}
      </Text>
      {bindings.isLoading && !!agentAccountId ? <ActivityIndicator /> : null}
      {failure ? (
        <Text style={styles.problem} testID="twin-channels-error">
          {t(CHANNEL_INBOX_FAILURE_COPY[failure])}
        </Text>
      ) : null}
      {bindings.data && list.length === 0 ? (
        <Text style={styles.muted} testID="twin-channels-empty">
          {t({ en: 'No chats are connected yet. Connecting a chat is done on the web for now.', zh: '还没有接上的聊天。接聊天暂时在网页上做。' })}
        </Text>
      ) : null}
      {bindings.data && bindings.data.unreadable > 0 ? (
        <Text style={styles.muted} testID="twin-channels-unreadable">
          {t({ en: `${bindings.data.unreadable} more could not be read.`, zh: `另有 ${bindings.data.unreadable} 个读不出来，没有列出。` })}
        </Text>
      ) : null}
      {list.map((binding) => {
        const label = channelChatLabel(binding, lang);
        return (
          <View key={binding.bindingRef} style={styles.card} testID={`twin-channel-${binding.bindingRef}`}>
            <TouchableOpacity
              onPress={() => navigation.navigate('TwinChannelMessages', { bindingRef: binding.bindingRef, platform: binding.platform })}
              accessibilityRole="button"
              accessibilityLabel={`${CHANNEL_PLATFORM_COPY[binding.platform][lang]} ${label}`}
              testID={`twin-channel-open-${binding.bindingRef}`}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.kind}>
                  {t(CHANNEL_PLATFORM_COPY[binding.platform])} · {binding.mode === 'twin' ? t({ en: 'Twin', zh: '分身' }) : 'Agent'}
                </Text>
                <Text style={binding.status === 'active' ? styles.ok : styles.muted}>{t(CHANNEL_BINDING_STATUS_COPY[binding.status])}</Text>
              </View>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {label}
              </Text>
              <Text style={styles.detail}>{channelTierLine(binding, lang)}</Text>
            </TouchableOpacity>
            {binding.status === 'active' ? (
              <TouchableOpacity
                style={styles.revokeButton}
                onPress={() => confirmRevoke(binding.bindingRef, label)}
                disabled={revoke.isPending}
                accessibilityRole="button"
                accessibilityLabel={`${t({ en: 'Disconnect', zh: '断开' })} ${label}`}
                testID={`twin-channel-revoke-${binding.bindingRef}`}
              >
                <Text style={styles.revokeText}>{t({ en: 'Disconnect', zh: '断开' })}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bgPrimary },
    content: { padding: 20, gap: 10 },
    title: { color: c.textPrimary, fontSize: 24, fontWeight: '800' },
    muted: { color: c.textMuted, fontSize: 13, lineHeight: 19 },
    ok: { color: c.accent, fontSize: 12, fontWeight: '800' },
    problem: { color: c.danger, fontSize: 13 },
    card: { backgroundColor: c.bgCard, borderColor: c.border, borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
    kind: { color: c.textSecondary, fontSize: 12, fontWeight: '700', flexShrink: 1 },
    cardTitle: { color: c.textPrimary, fontSize: 15, fontWeight: '700', marginTop: 4 },
    detail: { color: c.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 2 },
    revokeButton: {
      alignSelf: 'flex-end',
      minHeight: 44,
      paddingHorizontal: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    revokeText: { color: c.danger, fontSize: 14, fontWeight: '800' },
  });
