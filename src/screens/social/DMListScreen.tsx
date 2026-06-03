import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { apiFetch } from '../../services/api';
import type { SocialStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<SocialStackParamList>;

interface Conversation {
  partnerId: string;
  partnerName: string;
  partnerAvatar?: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
}

async function fetchConversations(): Promise<Conversation[]> {
  const res = await apiFetch<{ success: boolean; data: Conversation[] }>('/messaging/conversations');
  return res.data ?? [];
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function DMListScreen() {
  const navigation = useNavigation<Nav>();

  const { data: conversations = [], isLoading, refetch } = useQuery({
    queryKey: ['conversations'],
    queryFn: fetchConversations,
    retry: false,
  });

  const renderItem = ({ item }: { item: Conversation }) => (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.75}
      onPress={() =>
        navigation.navigate('DirectMessage', {
          userId: item.partnerId,
          userName: item.partnerName,
          userAvatar: item.partnerAvatar,
        })
      }
    >
      <View style={styles.avatarBubble}>
        <Text style={styles.avatarText}>
          {item.partnerAvatar || item.partnerName?.[0]?.toUpperCase() || '👤'}
        </Text>
        {item.unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {item.unreadCount > 9 ? '9+' : item.unreadCount}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.info}>
        <View style={styles.rowTop}>
          <Text style={styles.name} numberOfLines={1}>{item.partnerName}</Text>
          <Text style={styles.time}>{timeAgo(item.lastMessageAt)}</Text>
        </View>
        <Text style={styles.preview} numberOfLines={1}>{item.lastMessage}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {isLoading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 60 }} />
      ) : conversations.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>✉️</Text>
          <Text style={styles.emptyTitle}>No messages yet</Text>
          <Text style={styles.emptySubtitle}>
            Start a conversation by visiting someone's profile.
          </Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(c) => c.partnerId}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.accent} />
          }
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  list: { paddingVertical: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  avatarBubble: { width: 48, height: 48, borderRadius: 24, position: 'relative', justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border },
  avatarText: { fontSize: 22 },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { fontSize: 10, color: '#fff', fontWeight: '700' },
  info: { flex: 1, gap: 3 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  time: { fontSize: 12, color: colors.textMuted },
  preview: { fontSize: 13, color: colors.textMuted },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, padding: 40 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  emptySubtitle: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
