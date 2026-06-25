// 群组聊天
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, Modal, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { apiFetch } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import type { ChatStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<ChatStackParamList, 'GroupChat'>;
type Route = RouteProp<ChatStackParamList, 'GroupChat'>;

type GroupMessage = {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  type: 'text' | 'image' | 'system' | 'announcement';
  createdAt: string;
};

type GroupMember = { id: string; name: string; avatar: string; role: 'admin' | 'member' };

const PLACEHOLDER_MSGS: GroupMessage[] = [
  { id: 'sys-1', senderId: 'system', senderName: 'System', content: '🎉 Welcome to Agentrix Builders!', type: 'system', createdAt: new Date(Date.now() - 86400000).toISOString() },
  { id: 'ann-1', senderId: 'system', senderName: 'System', content: '📌 Announcement: Join our weekly agent showcase every Friday 5pm UTC!', type: 'announcement', createdAt: new Date(Date.now() - 72000000).toISOString() },
  { id: '1', senderId: 'u1', senderName: 'openclaw_fan', senderAvatar: '🦀', content: 'Build 40 APK is out — Social tab is live 🔥', type: 'text', createdAt: new Date(Date.now() - 3600000).toISOString() },
  { id: '2', senderId: 'u2', senderName: 'ai_builder', senderAvatar: '🤖', content: 'On it! The new community + chat tab split is 🔥', type: 'text', createdAt: new Date(Date.now() - 3500000).toISOString() },
  { id: '3', senderId: 'u3', senderName: 'claw_dev', senderAvatar: '💻', content: 'Post Detail screen with comments is finally in 🙌', type: 'text', createdAt: new Date(Date.now() - 3400000).toISOString() },
  { id: '4', senderId: 'u4', senderName: 'skill_wizard', senderAvatar: '⚡', content: 'Just published my second MCP skill! Check it in the marketplace.', type: 'text', createdAt: new Date(Date.now() - 3200000).toISOString() },
];

const PLACEHOLDER_MEMBERS: GroupMember[] = [
  { id: 'u0', name: 'You', avatar: '👤', role: 'admin' },
  { id: 'u1', name: 'openclaw_fan', avatar: '🦀', role: 'member' },
  { id: 'u2', name: 'ai_builder', avatar: '🤖', role: 'member' },
  { id: 'u3', name: 'claw_dev', avatar: '💻', role: 'member' },
  { id: 'u4', name: 'skill_wizard', avatar: '⚡', role: 'member' },
];

async function fetchGroupMessages(groupId: string): Promise<GroupMessage[]> {
  if (groupId === 'new') return [];
  try { return apiFetch<GroupMessage[]>(`/social/groups/${groupId}/messages`); }
  catch { return []; }
}

async function sendGroupMessage(groupId: string, content: string) {
  return apiFetch(`/social/groups/${groupId}/messages`, {
    method: 'POST', body: JSON.stringify({ content, type: 'text' }),
  });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function GroupChatScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { groupId, groupName } = route.params;
  const me = useAuthStore((s) => s.user);
  const [input, setInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const listRef = useRef<FlatList>(null);
  const qc = useQueryClient();

  // Group settings button in header
  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          style={{ paddingHorizontal: 12 }}
          onPress={() => setShowSettings(true)}
        >
          <Text style={{ fontSize: 20 }}>⚙️</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  const { data, isLoading } = useQuery({
    queryKey: ['group-messages', groupId],
    queryFn: () => fetchGroupMessages(groupId),
    retry: false,
    refetchInterval: 6000,
  });

  const msgs: GroupMessage[] = (Array.isArray(data) && data.length > 0) ? data : PLACEHOLDER_MSGS;

  // Simulate typing indicator
  useEffect(() => {
    if (!isLoading) {
      const t1 = setTimeout(() => setTypingUsers(['ai_builder']), 3000);
      const t2 = setTimeout(() => setTypingUsers([]), 6000);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [isLoading]);

  const sendMut = useMutation({
    mutationFn: (content: string) => sendGroupMessage(groupId, content),
    onMutate: async (content) => {
      const optimistic: GroupMessage = {
        id: `opt-${Date.now()}`, senderId: me?.id ?? 'me',
        senderName: me?.nickname ?? 'You',
        content, type: 'text', createdAt: new Date().toISOString(),
      };
      qc.setQueryData(['group-messages', groupId], (old: GroupMessage[] | undefined) => [...(old ?? []), optimistic]);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['group-messages', groupId] }),
  });

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    sendMut.mutate(text);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, [input, sendMut]);

  const renderMsg = ({ item }: { item: GroupMessage }) => {
    if (item.type === 'system') {
      return (
        <View style={styles.systemMsgRow}>
          <Text style={styles.systemMsg}>{item.content}</Text>
        </View>
      );
    }
    if (item.type === 'announcement') {
      return (
        <View style={styles.announcementRow}>
          <Text style={styles.announcementText}>{item.content}</Text>
        </View>
      );
    }
    const isMine = item.senderId === me?.id || item.senderId === 'me';
    return (
      <View style={[styles.msgRow, isMine ? styles.msgRowMine : styles.msgRowTheirs]}>
        {!isMine && (
          <View style={styles.peerAvatar}>
            <Text style={styles.peerAvatarText}>
              {item.senderAvatar ?? item.senderName.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.msgContent}>
          {!isMine && <Text style={styles.senderName}>{item.senderName}</Text>}
          <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
            <Text style={[styles.bubbleText, isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs]}>
              {item.content}
            </Text>
          </View>
          <Text style={[styles.msgTime, isMine ? styles.msgTimeMine : styles.msgTimeTheirs]}>
            {formatTime(item.createdAt)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
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
            ListFooterComponent={
              typingUsers.length > 0 ? (
                <View style={styles.typingRow}>
                  <Text style={styles.typingText}>
                    {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing • • •
                  </Text>
                </View>
              ) : null
            }
          />
        )}

        {/* Input Bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder={`Message ${groupName}...`}
            placeholderTextColor={colors.textMuted}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!input.trim()}
          >
            <Text style={styles.sendBtnText}>➤</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Group Settings Modal */}
      <Modal
        visible={showSettings}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSettings(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSettings(false)}
        >
          <View style={styles.settingsSheet}>
            <View style={styles.pickerHandle} />
            <Text style={styles.settingsTitle}>{groupName}</Text>
            <Text style={styles.settingsMeta}>{PLACEHOLDER_MEMBERS.length} members</Text>

            {/* Announcement */}
            <View style={styles.settingsSection}>
              <Text style={styles.settingsSectionTitle}>📌 Group Announcement</Text>
              <Text style={styles.settingsAnnounce}>Join our weekly agent showcase every Friday 5pm UTC!</Text>
            </View>

            {/* Members */}
            <View style={styles.settingsSection}>
              <Text style={styles.settingsSectionTitle}>Members</Text>
              <ScrollView style={{ maxHeight: 180 }}>
                {PLACEHOLDER_MEMBERS.map((m) => (
                  <View key={m.id} style={styles.memberRow}>
                    <Text style={styles.memberAvatar}>{m.avatar}</Text>
                    <Text style={styles.memberName}>{m.name}</Text>
                    {m.role === 'admin' && (
                      <View style={styles.adminBadge}><Text style={styles.adminBadgeText}>Admin</Text></View>
                    )}
                  </View>
                ))}
              </ScrollView>
            </View>

            {/* Invite + Leave */}
            <View style={styles.settingsActions}>
              <TouchableOpacity style={styles.inviteBtn} onPress={() => setShowSettings(false)}>
                <Text style={styles.inviteBtnText}>✉️ Invite Members</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.leaveBtn}
                onPress={() => {
                  setShowSettings(false);
                  Alert.alert('Leave Group', `Leave ${groupName}?`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Leave', style: 'destructive', onPress: () => navigation.goBack() },
                  ]);
                }}
              >
                <Text style={styles.leaveBtnText}>Leave Group</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgPrimary },
  kav: { flex: 1 },
  msgList: { padding: 16, paddingBottom: 8 },
  systemMsgRow: { alignItems: 'center', marginVertical: 8 },
  systemMsg: { fontSize: 12, color: colors.textMuted, backgroundColor: colors.bgCard, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10 },
  announcementRow: { backgroundColor: colors.accent + '18', borderRadius: 12, padding: 10, marginVertical: 6, borderWidth: 1, borderColor: colors.accent + '44' },
  announcementText: { fontSize: 13, color: colors.accent, lineHeight: 18 },
  msgRow: { flexDirection: 'row', marginBottom: 12, maxWidth: '82%' },
  msgRowMine: { alignSelf: 'flex-end', justifyContent: 'flex-end' },
  msgRowTheirs: { alignSelf: 'flex-start' },
  peerAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginRight: 8, alignSelf: 'flex-start', marginTop: 16 },
  peerAvatarText: { fontSize: 16 },
  msgContent: { flex: 1 },
  senderName: { fontSize: 11, color: colors.accent, fontWeight: '700', marginBottom: 3, marginLeft: 2 },
  bubble: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleMine: { backgroundColor: colors.accent, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.bgCard, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleTextMine: { color: '#000' },
  bubbleTextTheirs: { color: colors.textPrimary },
  msgTime: { fontSize: 10, marginTop: 3 },
  msgTimeMine: { color: colors.textMuted, textAlign: 'right' },
  msgTimeTheirs: { color: colors.textMuted },
  typingRow: { paddingHorizontal: 16, paddingBottom: 6 },
  typingText: { fontSize: 12, color: colors.textMuted, fontStyle: 'italic' },
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

  // Settings Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  settingsSheet: { backgroundColor: colors.bgSecondary, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8, paddingBottom: 32, paddingHorizontal: 16 },
  pickerHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 },
  settingsTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  settingsMeta: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 4, marginBottom: 16 },
  settingsSection: { marginBottom: 16 },
  settingsSectionTitle: { fontSize: 12, color: colors.textMuted, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  settingsAnnounce: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, backgroundColor: colors.bgCard, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.border },
  memberAvatar: { fontSize: 22 },
  memberName: { flex: 1, fontSize: 14, color: colors.textPrimary, fontWeight: '600' },
  adminBadge: { backgroundColor: colors.accent + '22', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: colors.accent + '44' },
  adminBadgeText: { fontSize: 10, color: colors.accent, fontWeight: '700' },
  settingsActions: { gap: 10, marginTop: 4 },
  inviteBtn: { backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  inviteBtnText: { color: '#000', fontSize: 15, fontWeight: '700' },
  leaveBtn: { backgroundColor: colors.bgCard, borderRadius: 14, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: colors.error + '55' },
  leaveBtnText: { color: colors.error, fontSize: 15, fontWeight: '600' },
});
