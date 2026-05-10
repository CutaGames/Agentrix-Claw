/**
 * AgentSpaceScreen — Agent-centric collaboration room.
 *
 * Replaces the legacy GroupChatScreen with a task-oriented room where
 * humans and agents collaborate. Supports @Agent mentions to invoke
 * AI replies, task progress updates, and DB-persisted messages.
 *
 * API endpoints:
 *   GET  /messaging/spaces/:spaceId           — space details
 *   GET  /messaging/spaces/:spaceId/messages   — paginated messages
 *   POST /messaging/spaces/:spaceId/messages   — send message
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { apiFetch } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { useI18n } from '../../stores/i18nStore';
import type { AgentStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<AgentStackParamList, 'AgentSpace'>;
type RouteT = RouteProp<AgentStackParamList, 'AgentSpace'>;

// @Agent mention regex
const AGENT_MENTION_RE = /@([A-Za-z][A-Za-z0-9_-]*)/g;

type SpaceMessage = {
  id: string;
  spaceId: string;
  senderId: string;
  senderName?: string;
  senderAvatar?: string;
  content: string;
  type: 'text' | 'system' | 'agent_reply' | 'task_update' | 'announcement';
  metadata?: Record<string, any>;
  createdAt: string;
};

type SpaceInfo = {
  id: string;
  name: string;
  description?: string;
  type: 'task_room' | 'collaboration' | 'general';
  memberIds?: string[];
  taskId?: string;
  agentInstanceId?: string;
};

const TYPE_BADGE: Record<string, { icon: string; label: string; color: string }> = {
  task_room: { icon: '🎯', label: 'Task Room', color: '#10B981' },
  collaboration: { icon: '🤝', label: 'Collaboration', color: '#8B5CF6' },
  general: { icon: '💬', label: 'General', color: colors.accent },
};

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function AgentSpaceScreen() {
  const route = useRoute<RouteT>();
  const navigation = useNavigation<Nav>();
  const { spaceId, spaceName } = route.params;
  const me = useAuthStore((s) => s.user);
  const { t } = useI18n();
  const [input, setInput] = useState('');
  const [agentLoading, setAgentLoading] = useState(false);
  const listRef = useRef<FlatList>(null);
  const qc = useQueryClient();

  React.useLayoutEffect(() => {
    navigation.setOptions({ title: spaceName || 'Agent Space' });
  }, [navigation, spaceName]);

  // Space details
  const { data: spaceInfo } = useQuery({
    queryKey: ['space-info', spaceId],
    queryFn: () => apiFetch<{ success: boolean; data: SpaceInfo }>(`/messaging/spaces/${spaceId}`).then((r) => r.data),
    retry: false,
  });

  // Messages
  const { data: messagesData, isLoading } = useQuery({
    queryKey: ['space-messages', spaceId],
    queryFn: () => apiFetch<{ success: boolean; data: SpaceMessage[] }>(`/messaging/spaces/${spaceId}/messages?limit=100`).then((r) => r.data),
    retry: false,
    refetchInterval: 5000,
  });

  const msgs: SpaceMessage[] = messagesData ?? [];

  const sendMut = useMutation({
    mutationFn: (content: string) =>
      apiFetch(`/messaging/spaces/${spaceId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content, type: 'text' }),
      }),
    onMutate: async (content) => {
      const opt: SpaceMessage = {
        id: `opt-${Date.now()}`, spaceId, senderId: me?.id ?? 'me',
        senderName: me?.nickname ?? 'You', content, type: 'text',
        createdAt: new Date().toISOString(),
      };
      qc.setQueryData(['space-messages', spaceId], (old: SpaceMessage[] | undefined) => [...(old ?? []), opt]);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['space-messages', spaceId] }),
  });

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    sendMut.mutate(text);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);

    // @Agent mention detection
    const agentMentions = [...text.matchAll(AGENT_MENTION_RE)].map((m) => m[1]);
    if (agentMentions.length > 0) {
      const agentName = agentMentions[0];
      setAgentLoading(true);
      const typingId = `agent-typing-${Date.now()}`;
      const typingMsg: SpaceMessage = {
        id: typingId, spaceId, senderId: `agent_${agentName}`,
        senderName: `🤖 @${agentName}`, content: '• • •',
        type: 'agent_reply', createdAt: new Date().toISOString(),
      };
      qc.setQueryData(['space-messages', spaceId], (old: SpaceMessage[] | undefined) => [...(old ?? []), typingMsg]);

      try {
        const response = await apiFetch<any>('/openclaw/proxy/chat', {
          method: 'POST',
          body: JSON.stringify({
            message: text.replace(AGENT_MENTION_RE, '').trim() || text,
            context: `agent_space:${spaceId}`,
            agentName,
          }),
        });
        const reply = response?.reply ?? response?.content ?? response?.message ?? `I'm @${agentName}. How can I help?`;
        qc.setQueryData(['space-messages', spaceId], (old: SpaceMessage[] | undefined) =>
          (old ?? []).map((m) =>
            m.id === typingId ? { ...m, id: `agent-${Date.now()}`, content: reply } : m
          )
        );
      } catch {
        qc.setQueryData(['space-messages', spaceId], (old: SpaceMessage[] | undefined) =>
          (old ?? []).map((m) =>
            m.id === typingId ? { ...m, id: `agent-err-${Date.now()}`, content: `⚠️ @${agentName} is unavailable.`, type: 'system' as any } : m
          )
        );
      } finally {
        setAgentLoading(false);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 150);
      }
    }
  }, [input, sendMut, qc, spaceId, me]);

  const typeBadge = TYPE_BADGE[spaceInfo?.type ?? 'general'] ?? TYPE_BADGE.general;

  const renderMsg = ({ item }: { item: SpaceMessage }) => {
    // System / task_update / announcement
    if (item.type === 'system' || item.type === 'task_update') {
      return (
        <View style={styles.systemRow}>
          <Text style={styles.systemText}>
            {item.type === 'task_update' ? '📊 ' : ''}{item.content}
          </Text>
        </View>
      );
    }
    if (item.type === 'announcement') {
      return (
        <View style={styles.announceRow}>
          <Text style={styles.announceText}>{item.content}</Text>
        </View>
      );
    }

    const isMine = item.senderId === me?.id || item.senderId === 'me';
    const isAgent = item.type === 'agent_reply' || item.senderId.startsWith('agent_');

    return (
      <View style={[styles.msgRow, isMine ? styles.msgRowMine : styles.msgRowOther]}>
        {!isMine && (
          <View style={[styles.avatar, isAgent && styles.avatarAgent]}>
            <Text style={styles.avatarText}>
              {item.senderAvatar ?? (isAgent ? '🤖' : (item.senderName ?? '?').charAt(0).toUpperCase())}
            </Text>
          </View>
        )}
        <View style={styles.msgBody}>
          {!isMine && (
            <Text style={[styles.senderName, isAgent && styles.senderNameAgent]}>
              {item.senderName ?? item.senderId.substring(0, 8)}
            </Text>
          )}
          <View style={[
            styles.bubble,
            isMine ? styles.bubbleMine : (isAgent ? styles.bubbleAgent : styles.bubbleOther),
          ]}>
            <Text style={[
              styles.bubbleText,
              isMine ? styles.bubbleTextMine : styles.bubbleTextOther,
            ]}>
              {item.content}
            </Text>
          </View>
          <Text style={[styles.msgTime, isMine && { textAlign: 'right' }]}>{formatTime(item.createdAt)}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        {/* Space type badge */}
        <View style={styles.topBar}>
          <View style={[styles.typeBadge, { backgroundColor: typeBadge.color + '22' }]}>
            <Text style={{ fontSize: 12 }}>{typeBadge.icon}</Text>
            <Text style={[styles.typeBadgeText, { color: typeBadge.color }]}>{typeBadge.label}</Text>
          </View>
          {spaceInfo?.memberIds && (
            <Text style={styles.memberCount}>{spaceInfo.memberIds.length} {t({ en: 'members', zh: '成员' })}</Text>
          )}
        </View>

        {isLoading ? (
          <ActivityIndicator color={colors.accent} style={{ flex: 1 }} />
        ) : (
          <FlatList
            ref={listRef}
            data={msgs}
            keyExtractor={(m) => m.id}
            renderItem={renderMsg}
            contentContainerStyle={styles.msgList}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🤖</Text>
                <Text style={styles.emptyText}>
                  {t({ en: 'No messages yet. Start collaborating with your agent!', zh: '还没有消息。开始和你的 Agent 协作吧！' })}
                </Text>
                <Text style={styles.emptyHint}>
                  {t({ en: 'Tip: Use @Agent to invoke an AI reply', zh: '提示：使用 @Agent 调用 AI 回复' })}
                </Text>
              </View>
            }
          />
        )}

        {/* Input */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder={t({ en: 'Message… (use @Agent to invoke)', zh: '输入消息…（用 @Agent 调用）' })}
            placeholderTextColor={colors.textMuted}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={2000}
          />
          {agentLoading ? (
            <ActivityIndicator color={colors.accent} style={{ width: 44 }} />
          ) : (
            <TouchableOpacity
              style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!input.trim()}
            >
              <Text style={styles.sendBtnText}>➤</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgPrimary },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  memberCount: { fontSize: 11, color: colors.textMuted },

  msgList: { padding: 16, paddingBottom: 8 },

  systemRow: { alignItems: 'center', marginVertical: 8 },
  systemText: { fontSize: 12, color: colors.textMuted, backgroundColor: colors.bgCard, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10 },
  announceRow: { backgroundColor: colors.accent + '18', borderRadius: 12, padding: 10, marginVertical: 6, borderWidth: 1, borderColor: colors.accent + '44' },
  announceText: { fontSize: 13, color: colors.accent, lineHeight: 18 },

  msgRow: { flexDirection: 'row', marginBottom: 12, maxWidth: '82%' },
  msgRowMine: { alignSelf: 'flex-end', justifyContent: 'flex-end' },
  msgRowOther: { alignSelf: 'flex-start' },
  avatar: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bgCard,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
    marginRight: 8, alignSelf: 'flex-start', marginTop: 16,
  },
  avatarAgent: { borderColor: colors.accent + '66', backgroundColor: colors.accent + '11' },
  avatarText: { fontSize: 16 },
  msgBody: { flex: 1 },
  senderName: { fontSize: 11, color: colors.textMuted, fontWeight: '700', marginBottom: 3, marginLeft: 2 },
  senderNameAgent: { color: colors.accent },
  bubble: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleMine: { backgroundColor: colors.accent, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: colors.bgCard, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
  bubbleAgent: { backgroundColor: colors.accent + '18', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.accent + '44' },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleTextMine: { color: '#000' },
  bubbleTextOther: { color: colors.textPrimary },
  msgTime: { fontSize: 10, color: colors.textMuted, marginTop: 3 },

  emptyState: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  emptyHint: { fontSize: 12, color: colors.accent, marginTop: 4 },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12,
    paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: colors.bgSecondary, gap: 8,
  },
  input: {
    flex: 1, backgroundColor: colors.bgCard, color: colors.textPrimary,
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 15, maxHeight: 100, borderWidth: 1, borderColor: colors.border,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#000', fontSize: 18, marginLeft: 2 },
});
