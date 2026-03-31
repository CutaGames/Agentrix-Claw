import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { watchColors } from '../theme/watchColors';
import { watchLayout } from '../theme/watchLayout';
import { API_BASE } from '../../config/env';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const QUICK_REPLIES = ['好的', '稍后再说', '取消', '详细说'];
const MAX_DISPLAY_CHARS = 200; // truncate long Agent replies for watch

export function WatchChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;

      const userMsg: ChatMessage = {
        role: 'user',
        content: trimmed,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setSending(true);

      try {
        const res = await fetch(`${API_BASE}/claude/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: trimmed,
            source: 'watch',
            maxTokens: 150, // keep replies short on watch
          }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const reply = (data.response ?? data.content ?? '').slice(0, MAX_DISPLAY_CHARS);

        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: reply || '(无回复)',
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: '⚠ 连接失败', timestamp: new Date().toISOString() },
        ]);
      } finally {
        setSending(false);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      }
    },
    [sending],
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={styles.messageList}
        contentContainerStyle={styles.messageContent}
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 && (
          <Text style={styles.emptyText}>抬腕问 Agent 任何问题</Text>
        )}
        {messages.map((msg, i) => (
          <View
            key={i}
            style={[
              styles.bubble,
              msg.role === 'user' ? styles.bubbleUser : styles.bubbleAgent,
            ]}
          >
            <Text
              style={[
                styles.bubbleText,
                msg.role === 'user' ? styles.bubbleTextUser : styles.bubbleTextAgent,
              ]}
            >
              {msg.content}
            </Text>
          </View>
        ))}
        {sending && (
          <View style={styles.thinkingRow}>
            <ActivityIndicator color={watchColors.accent} size="small" />
            <Text style={styles.thinkingText}>思考中…</Text>
          </View>
        )}
      </ScrollView>

      {/* Quick Replies */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.quickReplies}
      >
        {QUICK_REPLIES.map((qr) => (
          <TouchableOpacity
            key={qr}
            style={styles.quickChip}
            onPress={() => sendMessage(qr)}
            disabled={sending}
          >
            <Text style={styles.quickChipText}>{qr}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Input */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="输入消息…"
          placeholderTextColor={watchColors.textMuted}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => sendMessage(input)}
          returnKeyType="send"
          editable={!sending}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
          onPress={() => sendMessage(input)}
          disabled={!input.trim() || sending}
        >
          <Text style={styles.sendBtnText}>↑</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: watchColors.bg,
  },
  messageList: {
    flex: 1,
  },
  messageContent: {
    padding: watchLayout.safePadding,
    paddingBottom: 4,
  },
  emptyText: {
    color: watchColors.textMuted,
    fontSize: watchLayout.fontCaption,
    textAlign: 'center',
    marginTop: watchLayout.screenHeight * 0.3,
  },
  bubble: {
    maxWidth: '85%',
    borderRadius: watchLayout.radiusSm,
    padding: 8,
    marginBottom: 6,
  },
  bubbleUser: {
    backgroundColor: watchColors.primary,
    alignSelf: 'flex-end',
  },
  bubbleAgent: {
    backgroundColor: watchColors.surface,
    alignSelf: 'flex-start',
  },
  bubbleText: {
    fontSize: watchLayout.fontCaption,
    lineHeight: 16,
  },
  bubbleTextUser: {
    color: watchColors.text,
  },
  bubbleTextAgent: {
    color: watchColors.text,
  },
  thinkingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    padding: 4,
  },
  thinkingText: {
    color: watchColors.textMuted,
    fontSize: watchLayout.fontMicro,
  },
  quickReplies: {
    paddingHorizontal: watchLayout.safePadding,
    paddingVertical: 4,
    gap: 6,
  },
  quickChip: {
    backgroundColor: watchColors.surface,
    borderRadius: watchLayout.radiusFull,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  quickChipText: {
    color: watchColors.accent,
    fontSize: watchLayout.fontMicro,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: watchLayout.safePadding,
    paddingBottom: watchLayout.safePadding,
    gap: 6,
  },
  input: {
    flex: 1,
    backgroundColor: watchColors.surface,
    color: watchColors.text,
    fontSize: watchLayout.fontCaption,
    borderRadius: watchLayout.radiusFull,
    paddingHorizontal: 12,
    paddingVertical: 8,
    height: 36,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: watchColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  sendBtnText: {
    color: watchColors.text,
    fontSize: 18,
    fontWeight: '700',
  },
});
