// 一对一私信聊天
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, Modal, ScrollView,
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

type Nav = NativeStackNavigationProp<ChatStackParamList, 'DirectMessage'>;
type Route = RouteProp<ChatStackParamList, 'DirectMessage'>;

type SkillCard = { skillId: string; skillName: string; description: string; price: number; priceUnit: string };

type Message = {
  id: string;
  senderId: string;
  content: string;
  type: 'text' | 'image' | 'skill_card';
  skillCard?: SkillCard;
  createdAt: string;
  status?: 'sent' | 'delivered' | 'read';
};

const PLACEHOLDER_MSGS: Message[] = [
  { id: '1', senderId: 'them', content: 'Hey! Saw your agent setup post 👀', type: 'text', createdAt: new Date(Date.now() - 3600000).toISOString() },
  { id: '2', senderId: 'me', content: 'Thanks! Been running it for 3 days straight with zero downtime', type: 'text', createdAt: new Date(Date.now() - 3500000).toISOString(), status: 'read' },
  { id: '3', senderId: 'them', content: 'Which skills are you using?', type: 'text', createdAt: new Date(Date.now() - 3400000).toISOString() },
  { id: '4', senderId: 'me',
    content: 'Check out this one 👇', type: 'skill_card',
    skillCard: { skillId: 's1', skillName: 'Web Search Pro', description: 'Enhanced search with source citations', price: 0, priceUnit: 'free' },
    createdAt: new Date(Date.now() - 3300000).toISOString(), status: 'delivered',
  },
];

// Sample skills for the picker
const SAMPLE_SKILLS: SkillCard[] = [
  { skillId: 's1', skillName: 'Web Search Pro', description: 'Enhanced search with source citations', price: 0, priceUnit: 'free' },
  { skillId: 's2', skillName: 'GitHub Auto-Review', description: 'Auto-reviews PRs and posts comments', price: 2, priceUnit: 'USDT' },
  { skillId: 's3', skillName: 'Email Summarizer', description: 'Reads and summarizes email threads daily', price: 1, priceUnit: 'USDT' },
];

async function fetchMessages(userId: string): Promise<Message[]> {
  try { return apiFetch<Message[]>(`/social/dm/${userId}/messages`); }
  catch { return []; }
}

async function sendMessage(userId: string, payload: { content: string; type: string; skillCard?: SkillCard }) {
  return apiFetch(`/social/dm/${userId}/messages`, { method: 'POST', body: JSON.stringify(payload) });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function DirectMessageScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { userId, userName } = route.params;
  const me = useAuthStore((s) => s.user);
  const [input, setInput] = useState('');
  const [showSkillPicker, setShowSkillPicker] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const listRef = useRef<FlatList>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['dm-messages', userId],
    queryFn: () => fetchMessages(userId),
    retry: false,
    refetchInterval: 8000,
  });

  const msgs: Message[] = (Array.isArray(data) && data.length > 0) ? data : PLACEHOLDER_MSGS;

  // Simulate peer typing after initial load
  useEffect(() => {
    if (!isLoading) {
      const t1 = setTimeout(() => setPeerTyping(true), 2000);
      const t2 = setTimeout(() => setPeerTyping(false), 5000);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [isLoading]);

  const sendMut = useMutation({
    mutationFn: (payload: { content: string; type: string; skillCard?: SkillCard }) =>
      sendMessage(userId, payload),
    onMutate: async (payload) => {
      const optimistic: Message = {
        id: `opt-${Date.now()}`, senderId: 'me',
        content: payload.content, type: payload.type as Message['type'],
        skillCard: payload.skillCard,
        createdAt: new Date().toISOString(), status: 'sent',
      };
      qc.setQueryData(['dm-messages', userId], (old: Message[] | undefined) => [...(old ?? []), optimistic]);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['dm-messages', userId] }),
  });

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    sendMut.mutate({ content: text, type: 'text' });
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, [input, sendMut]);

  const handleSendSkill = useCallback((skill: SkillCard) => {
    setShowSkillPicker(false);
    sendMut.mutate({ content: `Check out this skill: ${skill.skillName}`, type: 'skill_card', skillCard: skill });
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, [sendMut]);

  const renderMsg = ({ item }: { item: Message }) => {
    const isMine = item.senderId === 'me' || item.senderId === me?.id;

    if (item.type === 'skill_card' && item.skillCard) {
      const skill = item.skillCard;
      return (
        <View style={[styles.msgRow, isMine ? styles.msgRowMine : styles.msgRowTheirs]}>
          {!isMine && (
            <View style={styles.peerAvatar}>
              <Text style={styles.peerAvatarText}>{userName.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.skillCardBubble}>
            <View style={styles.skillCardHeader}>
              <Text style={styles.skillCardBadge}>⚡ Skill</Text>
              <Text style={styles.skillCardPrice}>
                {skill.price === 0 ? 'Free' : `${skill.price} ${skill.priceUnit}`}
              </Text>
            </View>
            <Text style={styles.skillCardName}>{skill.skillName}</Text>
            <Text style={styles.skillCardDesc}>{skill.description}</Text>
            <TouchableOpacity style={styles.skillCardInstallBtn}>
              <Text style={styles.skillCardInstallText}>Install Skill →</Text>
            </TouchableOpacity>
            <Text style={styles.msgTimeSC}>{formatTime(item.createdAt)}</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.msgRow, isMine ? styles.msgRowMine : styles.msgRowTheirs]}>
        {!isMine && (
          <View style={styles.peerAvatar}>
            <Text style={styles.peerAvatarText}>{userName.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
          <Text style={[styles.bubbleText, isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs]}>
            {item.content}
          </Text>
          <View style={styles.msgMeta}>
            <Text style={[styles.msgTime, !isMine && styles.msgTimeTheirs]}>{formatTime(item.createdAt)}</Text>
            {isMine && item.status && (
              <Text style={[styles.msgStatus, item.status === 'read' && styles.msgStatusRead]}>
                {item.status === 'read' ? '✓✓' : item.status === 'delivered' ? '✓✓' : '✓'}
              </Text>
            )}
          </View>
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
              peerTyping ? (
                <View style={styles.typingRow}>
                  <View style={styles.peerAvatar}>
                    <Text style={styles.peerAvatarText}>{userName.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={styles.typingBubble}>
                    <Text style={styles.typingDots}>• • •</Text>
                  </View>
                </View>
              ) : null
            }
          />
        )}

        {/* Input Bar */}
        <View style={styles.inputBar}>
          <TouchableOpacity
            style={styles.attachBtn}
            onPress={() => setShowSkillPicker(true)}
          >
            <Text style={styles.attachBtnText}>+</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            placeholder="Message..."
            placeholderTextColor={colors.textMuted}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={2000}
            returnKeyType="send"
            onSubmitEditing={handleSend}
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

      {/* Skill Picker Modal */}
      <Modal
        visible={showSkillPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSkillPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSkillPicker(false)}
        >
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHandle} />
            <Text style={styles.pickerTitle}>Share a Skill</Text>
            <ScrollView>
              {SAMPLE_SKILLS.map((skill) => (
                <TouchableOpacity
                  key={skill.skillId}
                  style={styles.pickerItem}
                  onPress={() => handleSendSkill(skill)}
                >
                  <View style={styles.pickerItemInfo}>
                    <Text style={styles.pickerItemName}>⚡ {skill.skillName}</Text>
                    <Text style={styles.pickerItemDesc}>{skill.description}</Text>
                  </View>
                  <Text style={styles.pickerItemPrice}>
                    {skill.price === 0 ? 'Free' : `${skill.price} ${skill.priceUnit}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
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
  msgRow: { flexDirection: 'row', marginBottom: 12, maxWidth: '82%' },
  msgRowMine: { alignSelf: 'flex-end', justifyContent: 'flex-end' },
  msgRowTheirs: { alignSelf: 'flex-start' },
  peerAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accent + '33', borderWidth: 1, borderColor: colors.accent + '66', alignItems: 'center', justifyContent: 'center', marginRight: 8, alignSelf: 'flex-end' },
  peerAvatarText: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, maxWidth: '100%' },
  bubbleMine: { backgroundColor: colors.accent, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.bgCard, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleTextMine: { color: '#000' },
  bubbleTextTheirs: { color: colors.textPrimary },
  msgMeta: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 4, gap: 4 },
  msgTime: { fontSize: 10, color: 'rgba(0,0,0,0.5)' },
  msgTimeTheirs: { color: colors.textMuted },
  msgStatus: { fontSize: 10, color: 'rgba(0,0,0,0.4)' },
  msgStatusRead: { color: '#0088CC' },

  // Skill card bubble
  skillCardBubble: { backgroundColor: colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: colors.accent + '55', padding: 12, maxWidth: '100%', gap: 6 },
  skillCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  skillCardBadge: { fontSize: 11, color: colors.accent, fontWeight: '700' },
  skillCardPrice: { fontSize: 12, color: colors.textMuted },
  skillCardName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  skillCardDesc: { fontSize: 13, color: colors.textSecondary },
  skillCardInstallBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 6, alignItems: 'center', marginTop: 4 },
  skillCardInstallText: { color: '#000', fontSize: 13, fontWeight: '700' },
  msgTimeSC: { fontSize: 10, color: colors.textMuted, textAlign: 'right' },

  // Typing indicator
  typingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 },
  typingBubble: { backgroundColor: colors.bgCard, borderRadius: 14, borderBottomLeftRadius: 4, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  typingDots: { fontSize: 13, color: colors.textMuted, letterSpacing: 2 },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12,
    paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: colors.bgSecondary, gap: 8,
  },
  attachBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  attachBtnText: { color: colors.textPrimary, fontSize: 22, lineHeight: 26, fontWeight: '300' },
  input: {
    flex: 1, backgroundColor: colors.bgCard, color: colors.textPrimary,
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 15, maxHeight: 100, borderWidth: 1, borderColor: colors.border,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#000', fontSize: 18, marginLeft: 2 },

  // Skill Picker Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerSheet: { backgroundColor: colors.bgSecondary, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8, paddingBottom: 32, maxHeight: '70%' },
  pickerHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 },
  pickerTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, paddingHorizontal: 16, paddingBottom: 12 },
  pickerItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  pickerItemInfo: { flex: 1, gap: 3 },
  pickerItemName: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  pickerItemDesc: { fontSize: 12, color: colors.textSecondary },
  pickerItemPrice: { fontSize: 13, fontWeight: '700', color: colors.accent, marginLeft: 12 },
});

