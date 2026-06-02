/**
 * MessagingScreen — Sprint E6. Unified DM hub for Plaza.
 *
 * Replaces the placeholder `PlazaMessagingStub`. Consolidates the 4 old
 * DM screens (DMListScreen / DirectMessageScreen / ChatListScreen /
 * DMChatScreen) into one list-of-conversations entry point — tapping a
 * row pushes to the existing `DirectMessage` route (kept in PlazaStack)
 * for the single-thread view.
 */
import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { listConversations, Conversation } from '../../services/messaging.api';

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(ts).toISOString().slice(0, 10);
}

export function MessagingScreen() {
  const navigation = useNavigation<any>();
  const { t } = useI18n();

  const q = useQuery({
    queryKey: ['messaging-conversations'],
    queryFn: listConversations,
    staleTime: 15_000,
    retry: 1,
  });

  const items = q.data?.items ?? [];

  const openThread = useCallback(
    (c: Conversation) => {
      navigation.navigate('DirectMessage', {
        userId: c.partner_id,
        userName: c.partner_name,
        userAvatar: c.partner_avatar ?? undefined,
      });
    },
    [navigation],
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>💬 {t({ en: 'Messages', zh: '私信' })}</Text>
        <Text style={styles.subtitle}>
          {t({
            en: 'Direct messages with other pet owners and A2A matches',
            zh: '与其他宠主、A2A 撮合的对话',
          })}
        </Text>
      </View>

      {q.isLoading && items.length === 0 ? (
        <ActivityIndicator color={colors.accent} style={styles.spinner} size="large" />
      ) : q.isError ? (
        <View style={styles.center}>
          <Text style={styles.emoji}>📭</Text>
          <Text style={styles.muted}>
            {t({
              en: 'Failed to load messages. Pull to retry.',
              zh: '加载失败，下拉重试。',
            })}
          </Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emoji}>💬</Text>
          <Text style={styles.muted}>
            {t({
              en: 'No conversations yet. Tap a pet owner in the Feed to say hi.',
              zh: '还没有对话。在广场给宠主留言开启聊天。',
            })}
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.partner_id}
          refreshControl={
            <RefreshControl
              refreshing={q.isRefetching}
              onRefresh={() => q.refetch()}
              tintColor={colors.accent}
            />
          }
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => openThread(item)}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {item.partner_name?.charAt(0)?.toUpperCase() ?? '?'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.rowHead}>
                  <Text style={styles.name} numberOfLines={1}>{item.partner_name}</Text>
                  <Text style={styles.time}>{formatTime(item.last_message_at)}</Text>
                </View>
                <View style={styles.rowBody}>
                  <Text
                    style={[styles.preview, item.unread_count > 0 && styles.previewUnread]}
                    numberOfLines={1}
                  >
                    {item.last_message}
                  </Text>
                  {item.unread_count > 0 ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>
                        {item.unread_count > 99 ? '99+' : item.unread_count}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  subtitle: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  spinner: { marginTop: 60 },
  center: { alignItems: 'center', paddingHorizontal: 24, marginTop: 60 },
  emoji: { fontSize: 48, marginBottom: 12 },
  muted: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 18 },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  name: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  time: { fontSize: 11, color: colors.textMuted, marginLeft: 8 },
  rowBody: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  preview: { flex: 1, fontSize: 13, color: colors.textMuted },
  previewUnread: { color: colors.textPrimary, fontWeight: '600' },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
