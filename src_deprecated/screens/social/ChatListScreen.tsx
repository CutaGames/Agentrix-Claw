// 聊天列表 — 私信 + 群组入口
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  TextInput, RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { apiFetch } from '../../services/api';
import type { ChatStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<ChatStackParamList, 'ChatList'>;

type ChatEntry = {
  id: string;
  type: 'dm' | 'group';
  name: string;
  avatar: string;
  lastMessage: string;
  lastTime: string;
  unread: number;
  memberCount?: number;
};

const PLACEHOLDER_CHATS: ChatEntry[] = [
  { id: 'dm-1', type: 'dm', name: 'openclaw_fan', avatar: '🦀', lastMessage: 'Your agent script looks great!', lastTime: '2m', unread: 2 },
  { id: 'dm-2', type: 'dm', name: 'ai_builder', avatar: '🤖', lastMessage: 'Did you try the new MCP skill?', lastTime: '15m', unread: 0 },
  { id: 'grp-1', type: 'group', name: 'Agentrix Builders', avatar: '🏗️', lastMessage: 'claw_dev: Build 38 is live 🎉', lastTime: '1h', unread: 5, memberCount: 128 },
  { id: 'grp-2', type: 'group', name: 'Skill Creators', avatar: '⚡', lastMessage: 'New SDK docs are up', lastTime: '3h', unread: 0, memberCount: 64 },
  { id: 'grp-3', type: 'group', name: 'Task Hunters', avatar: '🎯', lastMessage: 'Bounty #23 has been claimed', lastTime: '1d', unread: 0, memberCount: 312 },
];

async function fetchChatList() {
  try { return apiFetch<ChatEntry[]>('/social/chats'); }
  catch { return []; }
}

export function ChatListScreen() {
  const navigation = useNavigation<Nav>();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'dm' | 'group'>('all');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['chat-list'],
    queryFn: fetchChatList,
    retry: false,
  });

  const chats: ChatEntry[] = (Array.isArray(data) && data.length > 0) ? data : PLACEHOLDER_CHATS;

  const filtered = chats.filter((c) => {
    const matchTab = tab === 'all' || c.type === tab;
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSearch;
  });

  const renderItem = ({ item }: { item: ChatEntry }) => (
    <TouchableOpacity
      style={styles.chatRow}
      onPress={() => {
        if (item.type === 'dm') {
          navigation.navigate('DirectMessage', { userId: item.id, userName: item.name });
        } else {
          navigation.navigate('GroupChat', { groupId: item.id, groupName: item.name });
        }
      }}
    >
      <View style={styles.avatarBox}>
        <Text style={styles.avatarEmoji}>{item.avatar}</Text>
        {item.type === 'group' && (
          <View style={styles.groupBadge}><Text style={styles.groupBadgeText}>G</Text></View>
        )}
      </View>
      <View style={styles.chatInfo}>
        <View style={styles.chatHeader}>
          <Text style={styles.chatName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.chatTime}>{item.lastTime}</Text>
        </View>
        <View style={styles.chatMeta}>
          <Text style={styles.lastMsg} numberOfLines={1}>{item.lastMessage}</Text>
          {item.unread > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{item.unread > 99 ? '99+' : item.unread}</Text>
            </View>
          )}
        </View>
        {item.memberCount && (
          <Text style={styles.memberCount}>{item.memberCount} members</Text>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.container}>
        {/* Search */}
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search chats..."
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          {(['all', 'dm', 'group'] as const).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.tab, tab === t && styles.tabActive]}
              onPress={() => setTab(t)}
            >
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                {t === 'all' ? 'All' : t === 'dm' ? '💬 Direct' : '👥 Groups'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {isLoading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(c) => c.id}
            renderItem={renderItem}
            refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.accent} />}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>💬</Text>
                <Text style={styles.emptyText}>No chats yet</Text>
              </View>
            }
          />
        )}

        {/* Floating: Create Group */}
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate('GroupChat', { groupId: 'new', groupName: 'New Group' })}
        >
          <Text style={styles.fabIcon}>✏️</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgPrimary },
  container: { flex: 1 },
  searchRow: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  searchInput: {
    backgroundColor: colors.bgCard, color: colors.textPrimary,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9,
    fontSize: 14, borderWidth: 1, borderColor: colors.border,
  },
  tabs: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  tab: {
    paddingVertical: 6, paddingHorizontal: 14,
    borderRadius: 20, borderWidth: 1, borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  tabText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  chatRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  avatarBox: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center', marginRight: 12, position: 'relative' },
  avatarEmoji: { fontSize: 24 },
  groupBadge: { position: 'absolute', bottom: -2, right: -2, backgroundColor: colors.accent, borderRadius: 8, width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  groupBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  chatInfo: { flex: 1 },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  chatName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  chatTime: { fontSize: 11, color: colors.textMuted, marginLeft: 8 },
  chatMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lastMsg: { fontSize: 13, color: colors.textMuted, flex: 1 },
  unreadBadge: { backgroundColor: colors.accent, borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, marginLeft: 8 },
  unreadText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  memberCount: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  separator: { height: 1, backgroundColor: colors.border, marginLeft: 76 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: colors.textMuted, fontSize: 15 },
  fab: {
    position: 'absolute', right: 20, bottom: 20,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
  },
  fabIcon: { fontSize: 22 },
});
