import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Modal, ScrollView,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { useAuthStore } from '../../stores/authStore';
import { useSettingsStore, SUPPORTED_MODELS } from '../../stores/settingsStore';
import { streamProxyChatSSE, streamDirectClaude } from '../../services/realtime.service';
import { API_BASE } from '../../config/env';
import { useTokenQuota } from '../../hooks/useTokenQuota';
import type { AgentStackParamList } from '../../navigation/types';
import * as Haptics from 'expo-haptics';

// expo-av: graceful degrade if missing
let Audio: any = null;
try { Audio = require('expo-av').Audio; } catch (_) {}

type RouteT = RouteProp<AgentStackParamList, 'AgentChat'>;

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  streaming?: boolean;
  error?: boolean;
  createdAt: number;
  thoughts?: string[]; // Added for Thought Chain UI
}

// Strip basic markdown: **bold** -> bold, *italic* -> italic
function renderContent(text: string) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1');
}

const MessageBubble = ({ item }: { item: Message }) => {
  const isUser = item.role === 'user';
  const hasThoughts = item.thoughts && item.thoughts.length > 0;
  const [isThoughtsExpanded, setIsThoughtsExpanded] = useState(true);

  return (
    <View style={[styles.msgRow, isUser && styles.msgRowUser]}>
      {!isUser && (
        <View style={styles.avatarBot}>
          <Text style={styles.avatarBotText}>🤖</Text>
        </View>
      )}
      <View style={{ flex: 1, maxWidth: '100%' }}>
        {/* Thought Chain UI */}
        {!isUser && hasThoughts && (
          <View style={styles.thoughtContainer}>
            <TouchableOpacity 
              style={styles.thoughtHeader} 
              onPress={() => setIsThoughtsExpanded(!isThoughtsExpanded)}
              activeOpacity={0.7}
            >
              {item.streaming ? (
                <ActivityIndicator size="small" color={colors.textMuted} style={{ transform: [{ scale: 0.7 }] }} />
              ) : (
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{isThoughtsExpanded ? '▼' : '▶'}</Text>
              )}
              <Text style={styles.thoughtHeaderText}>
                {item.streaming ? 'Agent is thinking...' : `Thought process (${item.thoughts?.length} steps)`}
              </Text>
            </TouchableOpacity>
            
            {isThoughtsExpanded && item.thoughts?.map((thought, idx) => (
              <Text key={idx} style={styles.thoughtItem}>
                <Text style={{ color: colors.accent }}>›</Text> {thought}
              </Text>
            ))}
          </View>
        )}

        {/* Main Message Bubble */}
        {(item.content || item.streaming) && (
          <View
            style={[
              styles.bubble,
              isUser ? styles.bubbleUser : styles.bubbleBot,
              item.error && styles.bubbleError,
            ]}
          >
            <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>
              {renderContent(item.content) || (item.streaming && !hasThoughts ? ' ' : '')}
            </Text>
            {item.streaming && (
              <ActivityIndicator size="small" color={colors.accent} style={{ alignSelf: 'flex-start', marginTop: 4 }} />
            )}
          </View>
        )}
      </View>
    </View>
  );
};

export function AgentChatScreen() {
  const route = useRoute<RouteT>();
  const activeInstance = useAuthStore((s) => s.activeInstance);
  const instanceId = route.params?.instanceId || activeInstance?.id || '';
  const instanceName = route.params?.instanceName || activeInstance?.name || 'Agent';
  const token = useAuthStore.getState().token || '';
  const selectedModelId = useSettingsStore((s) => s.selectedModelId);
  const setSelectedModel = useSettingsStore((s) => s.setSelectedModel);

  const sessionIdRef = useRef<string>(`session-${Date.now()}`);
  const streamAbortRef = useRef<AbortController | null>(null);
  const recordingRef = useRef<any>(null);
  const isRecordingRef = useRef(false);  // stable ref for press hold logic

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Hi! I'm **${instanceName}**. How can I help you today?`,
      createdAt: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);   // WeChat-style toggle
  const [showModelPicker, setShowModelPicker] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Token quota for energy bar
  const { data: quota } = useTokenQuota();
  const used = quota?.usedTokens ?? 0;
  const total = quota?.totalQuota ?? 100000;
  const tokenPct = quota?.energyLevel ?? (total > 0 ? Math.min(100, (used / total) * 100) : 0);
  const tokenBarColor = tokenPct > 80 ? '#ef4444' : tokenPct > 50 ? '#f59e0b' : '#22c55e';

  // Load chat history on mount
  useEffect(() => {
    if (!instanceId) return;
    loadHistory();
    return () => {
      // Cancel any in-flight stream on unmount
      streamAbortRef.current?.abort();
    };
  }, [instanceId]);

  const loadHistory = async () => {
    if (!instanceId || !token) return;
    try {
      setLoadingHistory(true);
      const _acH = new AbortController();
      const _tH = setTimeout(() => _acH.abort(), 6000);
      let resp: Response;
      try {
        resp = await fetch(
          `${API_BASE}/openclaw/proxy/${instanceId}/history?sessionId=${sessionIdRef.current}`,
          { headers: { Authorization: `Bearer ${token}` }, signal: _acH.signal },
        );
      } finally {
        clearTimeout(_tH);
      }
      if (!resp.ok) return;
      const data = await resp.json();
      const historyItems: any[] = Array.isArray(data) ? data : data.messages ?? [];
      if (historyItems.length > 0) {
        const historyMessages: Message[] = historyItems.map((m: any) => ({
          id: m.id || `hist-${Math.random()}`,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt ? new Date(m.createdAt).getTime() : Date.now(),
        }));
        setMessages(historyMessages);
      }
    } catch {
      // Silently ignore — instance may not support history endpoint
    } finally {
      setLoadingHistory(false);
    }
  };

  const scrollToBottom = useCallback(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages]);

  const appendToStreamingMessage = (msgId: string, chunk: string) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId) return m;
        
        // Simple heuristic to detect "thought" blocks (e.g., <thought>...</thought> or [Tool Call])
        // In a real app, this would be parsed from structured SSE events
        let newContent = m.content + chunk;
        let newThoughts = m.thoughts || [];
        
        if (chunk.includes('[Tool Call]') || chunk.includes('Thinking...')) {
           newThoughts = [...newThoughts, chunk.trim()];
           return { ...m, thoughts: newThoughts };
        }
        
        return { ...m, content: newContent };
      })
    );
  };

  // Build conversation history for Claude direct fallback
  const buildHistory = (msgs: Message[], newText: string) =>
    [
      ...msgs
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content.trim())
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: newText },
    ];

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: Date.now(),
    };

    const assistantMsgId = `assistant-${Date.now()}`;
    const assistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      streaming: true,
      createdAt: Date.now(),
    };

    // Capture current messages before state update for history
    const currentMsgs = messages;
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
    setSending(true);
    streamAbortRef.current?.abort();

    try {
      await Haptics.selectionAsync();

      let streamSucceeded = false;

      // Try OpenClaw proxy first (requires active instance)
      if (instanceId) {
        await new Promise<void>((resolve) => {
          const ac = streamProxyChatSSE({
            instanceId,
            message: text,
            sessionId: sessionIdRef.current,
            token,
            model: selectedModelId,
            onChunk: (chunk) => {
              streamSucceeded = true;
              appendToStreamingMessage(assistantMsgId, chunk);
            },
            onDone: () => resolve(),
            onError: (_err) => resolve(), // silently fall through to direct Claude
          });
          streamAbortRef.current = ac;
        });
      }

      if (!streamSucceeded) {
        // Fallback: direct Claude via backend Bedrock key (always available)
        const history = buildHistory(currentMsgs, text);
        await new Promise<void>((resolve) => {
          const ac = streamDirectClaude({
            messages: history,
            token,
            model: selectedModelId,
            sessionId: sessionIdRef.current,
            onChunk: (chunk) => { streamSucceeded = true; appendToStreamingMessage(assistantMsgId, chunk); },
            onDone: () => resolve(),
            onError: (err) => {
              appendToStreamingMessage(assistantMsgId, `⚠️ ${err || 'Could not reach AI service. Check your connection.'}`);
              resolve();
            },
          });
          streamAbortRef.current = ac;
        });
      }

      // If stream ran but produced no content, show a friendly error
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== assistantMsgId) return m;
          if (!m.content && !m.thoughts?.length) {
            return { ...m, content: '⚠️ No response received. Please check your connection or try again.', streaming: false, error: true };
          }
          return { ...m, streaming: false };
        })
      );
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: `Error: ${err?.message || 'Something went wrong'}`, streaming: false, error: true }
            : m
        )
      );
    } finally {
      setSending(false);
      streamAbortRef.current = null;
    }
  };

  // Voice recording — called on both onPressIn (start) and onPressOut (stop)
  const handleVoicePress = async () => {
    if (!Audio) {
      Alert.alert('Voice input', 'Install expo-av to enable voice input, or type your message.');
      return;
    }
    try {
      if (!isRecordingRef.current) {
        // START recording
        isRecordingRef.current = true;
        await Audio.requestPermissionsAsync();
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
        if (recordingRef.current) {
          try { await recordingRef.current.stopAndUnloadAsync(); } catch (_) {}
          recordingRef.current = null;
        }
        const { recording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY
        );
        recordingRef.current = recording;
        setIsRecording(true);
      } else {
        // STOP and transcribe
        isRecordingRef.current = false;
        setIsRecording(false);
        if (recordingRef.current) {
          await recordingRef.current.stopAndUnloadAsync();
          const uri = recordingRef.current.getURI();
          recordingRef.current = null;
          if (uri) {
            try {
              const formData = new FormData();
              formData.append('audio', { uri, name: 'voice.m4a', type: 'audio/m4a' } as any);
              const resp = await fetch(`${API_BASE}/voice/transcribe`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
                signal: (() => { const _acV = new AbortController(); setTimeout(() => _acV.abort(), 20_000); return _acV.signal; })(),
              });
              if (resp.ok) {
                const data = await resp.json();
                const transcript = data?.text || data?.transcript || '';
                if (transcript) {
                  // Auto-send voice message
                  setInput(transcript);
                  setTimeout(() => handleSend(), 100);
                }
              } else {
                Alert.alert('Transcription failed', 'Could not convert audio to text. Try typing instead.');
              }
            } catch {
              Alert.alert('Voice error', 'Could not reach transcription service. Try typing instead.');
            }
          }
        }
      }
    } catch (e: any) {
      isRecordingRef.current = false;
      setIsRecording(false);
      Alert.alert('Voice error', e?.message || 'Unknown error');
    }
  };

  const openModelPicker = () => setShowModelPicker(true);

  const handleClearChat = () => {
    Alert.alert('Start new session?', 'Chat history will be cleared.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'New Session',
        style: 'destructive',
        onPress: () => {
          streamAbortRef.current?.abort();
          sessionIdRef.current = `session-${Date.now()}`;
          setMessages([{
            id: 'welcome',
            role: 'assistant',
            content: `Hi! I\'m **${instanceName}**. How can I help you today?`,
            createdAt: Date.now(),
          }]);
        },
      },
    ]);
  };

  const renderMessage = ({ item }: { item: Message }) => {
    return <MessageBubble item={item} />;
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={88}
    >
      {/* Chat toolbar */}
      <View style={styles.chatBar}>
        <Text style={styles.chatBarTitle}>🤖 {instanceName}</Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TouchableOpacity onPress={openModelPicker} style={styles.modelBtn}>
            <Text style={styles.modelBtnText} numberOfLines={1}>
              {SUPPORTED_MODELS.find((m) => m.id === selectedModelId)?.label ?? selectedModelId}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleClearChat} style={styles.chatBarBtn}>
            <Text style={styles.chatBarBtnText}>New</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Compact token energy bar */}
      <View style={styles.tokenBar}>
        <View style={[styles.tokenBarFill, { width: `${tokenPct}%` as any, backgroundColor: tokenBarColor }]} />
        <Text style={styles.tokenBarLabel}>{used.toLocaleString()} / {total.toLocaleString()} tokens</Text>
      </View>

      {loadingHistory && (
        <View style={styles.historyLoader}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.historyLoaderText}>Loading history…</Text>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={scrollToBottom}
      />

      {/* Input bar — WeChat / Doubao style */}
      <View style={styles.inputRow}>
        {/* Left: voice/keyboard toggle */}
        <TouchableOpacity
          style={styles.modeToggleBtn}
          onPress={() => { setVoiceMode(!voiceMode); setIsRecording(false); }}
        >
          <Text style={styles.modeToggleIcon}>{voiceMode ? '⌨️' : '🎤'}</Text>
        </TouchableOpacity>

        {voiceMode ? (
          /* Voice mode: hold-to-talk button */
          <TouchableOpacity
            style={[styles.holdTalkBtn, isRecording && styles.holdTalkBtnActive]}
            onPressIn={handleVoicePress}
            onPressOut={handleVoicePress}
            activeOpacity={0.85}
          >
            <Text style={styles.holdTalkText}>
              {isRecording ? '🔴  Release to Send' : '🎙  Hold to Talk'}
            </Text>
          </TouchableOpacity>
        ) : (
          /* Text mode */
          <TextInput
            style={styles.input}
            placeholder={`Message ${instanceName}...`}
            placeholderTextColor={colors.textMuted}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={4000}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
        )}

        {/* Right: send button */}
        <TouchableOpacity
          style={[styles.sendBtn, ((!input.trim() && !isRecording) || sending) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={(!input.trim() && !isRecording) || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.sendIcon}>↑</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Model picker modal */}
      <Modal visible={showModelPicker} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowModelPicker(false)} activeOpacity={1}>
          <View style={styles.modelSheet}>
            <Text style={styles.modelSheetTitle}>Select Model</Text>
            <ScrollView>
              {SUPPORTED_MODELS.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.modelOption, m.id === selectedModelId && styles.modelOptionActive]}
                  onPress={() => { setSelectedModel(m.id); setShowModelPicker(false); }}
                >
                  <Text style={styles.modelOptionLabel}>{m.label}</Text>
                  {m.id === selectedModelId && <Text style={styles.modelOptionCheck}>✓</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  chatBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  chatBarTitle: { color: colors.textPrimary, fontWeight: '700', fontSize: 15 },
  chatBarBtn: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: colors.bgSecondary },
  chatBarBtnText: { color: colors.textMuted, fontSize: 12 },
  historyLoader: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, justifyContent: 'center' },
  historyLoaderText: { color: colors.textMuted, fontSize: 13 },
  messageList: { padding: 16, paddingBottom: 8, gap: 12 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '85%' },
  msgRowUser: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  avatarBot: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center' },
  avatarBotText: { fontSize: 16 },
  bubble: {
    flexDirection: 'column',
    borderRadius: 18,
    padding: 12,
    maxWidth: '100%',
  },
  bubbleUser: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleBot: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 4,
  },
  bubbleError: { borderColor: colors.error, backgroundColor: colors.error + '15' },
  bubbleText: { color: colors.textPrimary, fontSize: 15, lineHeight: 22 },
  bubbleTextUser: { color: '#fff' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    backgroundColor: colors.bgSecondary,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: colors.bgCard,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 15,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border },
  sendIcon: { color: '#fff', fontSize: 20, fontWeight: '700' },
  modeToggleBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.bgCard,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  modeToggleIcon: { fontSize: 18 },
  holdTalkBtn: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  holdTalkBtnActive: {
    backgroundColor: '#ef4444',
    borderColor: '#ef4444',
  },
  holdTalkText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  tokenBar: {
    height: 18, backgroundColor: colors.bgSecondary,
    flexDirection: 'row', alignItems: 'center', overflow: 'hidden', position: 'relative',
  },
  tokenBarFill: { position: 'absolute', left: 0, top: 0, bottom: 0, opacity: 0.35 },
  tokenBarLabel: { fontSize: 10, color: colors.textMuted, paddingHorizontal: 8, zIndex: 1 },
  modelBtn: {
    paddingVertical: 3, paddingHorizontal: 8, borderRadius: 8,
    backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border,
    maxWidth: 140,
  },
  modelBtnText: { color: colors.accent, fontSize: 11, fontWeight: '600' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000077' },
  modelSheet: {
    backgroundColor: colors.bgCard, borderTopLeftRadius: 16, borderTopRightRadius: 16,
    paddingTop: 16, paddingBottom: 32, maxHeight: '60%',
  },
  modelSheetTitle: { color: colors.textPrimary, fontWeight: '700', fontSize: 16, textAlign: 'center', marginBottom: 12 },
  modelOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  modelOptionActive: { backgroundColor: colors.bgSecondary },
  modelOptionLabel: { color: colors.textPrimary, fontSize: 15 },
  modelOptionCheck: { color: colors.accent, fontSize: 16, fontWeight: '700' },
  thoughtContainer: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thoughtHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  thoughtHeaderText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600',
  },
  thoughtItem: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    marginLeft: 4,
  },
});
