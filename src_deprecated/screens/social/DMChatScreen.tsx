/**
 * DMChatScreen — Direct Message conversation view
 *
 * Real-time delivery: messages are sent via REST POST and auto-refreshed every 5s.
 * To upgrade to true WebSocket push, add socket.io-client via:
 *   npx expo install socket.io-client
 * and subscribe to the 'dm:new' event in this component.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, ActivityIndicator, KeyboardAvoidingView,
  Platform, Alert,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect, RouteProp } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { apiFetch } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import type { SocialStackParamList } from '../../navigation/types';

type DMChatRouteProp = RouteProp<SocialStackParamList, 'DMChat'>;

interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  status: string;
  createdAt: string;
}

async function fetchMessages(partnerId: string, page = 1): Promise<{ messages: Message[]; total: number }> {
  const res = await apiFetch<{ success: boolean; messages: Message[]; total: number }>(
    `/messaging/dm/${partnerId}?page=${page}&limit=50`,
  );
  return { messages: res.messages ?? [], total: res.total ?? 0 };
}

async function sendMessage(receiverId: string, content: string): Promise<Message> {
  const res = await apiFetch<{ success: boolean; data: Message }>(`/messaging/dm/${receiverId}`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
  return res.data;
}

async function markRead(partnerId: string): Promise<void> {
  await apiFetch(`/messaging/dm/${partnerId}/read`, { method: 'PATCH' });
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function DMChatScreen() {
  const route = useRoute<DMChatRouteProp>();
  const { userId: partnerId, userName, userAvatar } = route.params;
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const flatListRef = useRef<FlatList>(null);
  const [text, setText] = useState('');

  const queryKey = ['dm', partnerId];

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: () => fetchMessages(partnerId),
    retry: false,
    refetchInterval: 5000, // poll every 5s for new messages
  });

  const messages = data?.messages ?? [];

  // Mark conversation read when we enter
  useFocusEffect(
    useCallback(() => {
      markRead(partnerId).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    }, [partnerId]),
  );

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const { mutate: send, isPending: isSending } = useMutation({
    mutationFn: () => sendMessage(partnerId, text.trim()),
    onSuccess: (newMsg) => {
      // Optimistically add to cache
      queryClient.setQueryData(queryKey, (old: any) => ({
        ...old,
        messages: [...(old?.messages ?? []), newMsg],
      }));
      setText('');
    },
    onError: () => Alert.alert('Error', 'Failed to send message'),
  });

  const handleSend = () => {
    if (!text.trim() || isSending) return;
    send();
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMine = item.senderId === currentUserId;
    return (
      <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
        <Text style={[styles.bubbleText, isMine ? styles.textMine : styles.textTheirs]}>
          {item.content}
        </Text>
        <Text style={[styles.bubbleTime, isMine ? styles.timeMine : styles.timeTheirs]}>
          {formatTime(item.createdAt)}
          {isMine && item.status === 'read' ? ' ✓✓' : isMine ? ' ✓' : ''}
        </Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.root}
      keyboardVerticalOffset={88}
    >
      {/* Header bar */}
      <View style={styles.header}>
        <Text style={styles.headerAvatar}>{userAvatar || '👤'}</Text>
        <View>
          <Text style={styles.headerName}>{userName}</Text>
          <Text style={styles.headerSub}>Direct Message</Text>
        </View>
      </View>

      {/* Messages */}
      {isLoading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Text style={styles.emptyChatText}>
                Say hi to {userName} 👋
              </Text>
            </View>
          }
        />
      )}

      {/* Input bar */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder={`Message ${userName}...`}
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={1000}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!text.trim() || isSending) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!text.trim() || isSending}
        >
          {isSending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.sendIcon}>➤</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPrimary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.bgSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerAvatar: { fontSize: 26 },
  headerName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  headerSub: { fontSize: 11, color: colors.textMuted },
  messageList: { paddingHorizontal: 12, paddingVertical: 16, gap: 8, flexGrow: 1 },
  bubble: {
    maxWidth: '78%',
    borderRadius: 18,
    padding: 10,
    marginBottom: 4,
  },
  bubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: colors.accent,
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    alignSelf: 'flex-start',
    backgroundColor: colors.bgCard,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  textMine: { color: '#fff' },
  textTheirs: { color: colors.textPrimary },
  bubbleTime: { fontSize: 10, marginTop: 3 },
  timeMine: { color: 'rgba(255,255,255,0.65)', textAlign: 'right' },
  timeTheirs: { color: colors.textMuted },
  emptyChat: { flex: 1, alignItems: 'center', paddingTop: 80 },
  emptyChatText: { fontSize: 15, color: colors.textMuted },
  inputBar: {
    flexDirection: 'row',
    gap: 8,
    padding: 10,
    paddingBottom: Platform.OS === 'ios' ? 16 : 10,
    backgroundColor: colors.bgSecondary,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    backgroundColor: colors.bgCard,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 14,
    color: colors.textPrimary,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendIcon: { color: '#fff', fontSize: 16 },
});
