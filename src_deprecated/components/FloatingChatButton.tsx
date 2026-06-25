/**
 * FloatingChatButton — In-app floating action button for quick voice/chat access.
 *
 * Usage: Render at the root of any screen that needs the floating button.
 * The button anchors to the bottom-right corner of the screen and opens
 * either VoiceChatScreen (hold) or quick text chat sheet (tap).
 *
 * Note: For true system-wide overlay (visible over other apps),
 * an ejected bare React Native build with SYSTEM_ALERT_WINDOW permission is required.
 * This component provides in-app overlay via `position: absolute` over the current screen.
 */
import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
  Platform,
  TextInput,
  KeyboardAvoidingView,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { apiFetch } from '../services/api';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const BUTTON_SIZE = 56;
const EDGE_PADDING = 20;

// ─── Types ────────────────────────────────────────────────────────────────────

type QuickMessage = { role: 'user' | 'assistant'; text: string };

// ─── Quick Chat Sheet ─────────────────────────────────────────────────────────

function QuickChatSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<QuickMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);

  const send = useCallback(async () => {
    if (!text.trim() || loading) return;
    const userText = text.trim();
    setText('');
    setMessages((prev) => [...prev, { role: 'user', text: userText }]);
    setLoading(true);
    try {
      const data = await apiFetch<any>('/hq/chat', {
        method: 'POST',
        body: JSON.stringify({ message: userText }),
      });
      const reply = data.reply || data.content || data.message || '(no response)';
      setMessages((prev) => [...prev, { role: 'assistant', text: reply }]);
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: 'assistant', text: `Error: ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  }, [text, loading]);

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView
        style={styles.sheetOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.sheet}>
          {/* Sheet header */}
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>🦀 Quick Chat</Text>
            <TouchableOpacity onPress={onClose} style={styles.sheetClose}>
              <Text style={styles.sheetCloseText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Messages */}
          <View style={styles.sheetMessages}>
            {messages.length === 0 ? (
              <Text style={styles.sheetEmpty}>Ask anything, I'm listening…</Text>
            ) : (
              messages.map((m, i) => (
                <View
                  key={i}
                  style={[
                    styles.sheetBubble,
                    m.role === 'user' ? styles.sheetBubbleUser : styles.sheetBubbleAssist,
                  ]}
                >
                  <Text
                    style={[
                      styles.sheetBubbleText,
                      m.role === 'user' ? { color: '#fff' } : { color: colors.textPrimary },
                    ]}
                  >
                    {m.text}
                  </Text>
                </View>
              ))
            )}
            {loading && <ActivityIndicator size="small" color={colors.accent} style={{ alignSelf: 'flex-start', marginTop: 4 }} />}
          </View>

          {/* Input */}
          <View style={styles.sheetInputRow}>
            <TextInput
              style={styles.sheetInput}
              value={text}
              onChangeText={setText}
              placeholder="Type a message…"
              placeholderTextColor={colors.textMuted}
              returnKeyType="send"
              onSubmitEditing={send}
            />
            <TouchableOpacity
              style={[styles.sheetSend, !text.trim() && styles.sheetSendDisabled]}
              onPress={send}
              disabled={!text.trim() || loading}
            >
              <Text style={{ color: '#fff', fontSize: 16 }}>➤</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── FloatingChatButton ───────────────────────────────────────────────────────

export function FloatingChatButton() {
  const navigation = useNavigation<any>();
  const [sheetVisible, setSheetVisible] = useState(false);

  // Draggable position
  const pan = useRef(
    new Animated.ValueXY({
      x: SCREEN_W - BUTTON_SIZE - EDGE_PADDING,
      y: SCREEN_H - BUTTON_SIZE - EDGE_PADDING - (Platform.OS === 'ios' ? 90 : 60),
    }),
  ).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pan.setOffset({ x: (pan.x as any)._value, y: (pan.y as any)._value });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_, gestureState) => {
        pan.flattenOffset();
        // Snap to nearest edge
        const currentX = (pan.x as any)._value;
        const currentY = (pan.y as any)._value;
        const snapX =
          currentX + BUTTON_SIZE / 2 < SCREEN_W / 2
            ? EDGE_PADDING
            : SCREEN_W - BUTTON_SIZE - EDGE_PADDING;
        const snapY = Math.max(
          EDGE_PADDING + (Platform.OS === 'ios' ? 50 : 20),
          Math.min(currentY, SCREEN_H - BUTTON_SIZE - EDGE_PADDING - (Platform.OS === 'ios' ? 90 : 60)),
        );
        Animated.spring(pan, {
          toValue: { x: snapX, y: snapY },
          useNativeDriver: false,
          friction: 7,
        }).start();

        // If barely moved, treat as tap
        if (Math.abs(gestureState.dx) < 5 && Math.abs(gestureState.dy) < 5) {
          setSheetVisible(true);
        }
      },
    }),
  ).current;

  return (
    <>
      <Animated.View
        style={[styles.floatContainer, { transform: pan.getTranslateTransform() }]}
        {...panResponder.panHandlers}
      >
        {/* Long-press → Voice */}
        <TouchableOpacity
          style={styles.floatBtn}
          onPress={() => setSheetVisible(true)}
          onLongPress={() => navigation.navigate('VoiceChat', {})}
          delayLongPress={600}
          activeOpacity={0.85}
        >
          <Text style={styles.floatIcon}>🦀</Text>
        </TouchableOpacity>
        <Text style={styles.floatHint}>tap / hold</Text>
      </Animated.View>

      <QuickChatSheet visible={sheetVisible} onClose={() => setSheetVisible(false)} />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  floatContainer: {
    position: 'absolute',
    alignItems: 'center',
    zIndex: 9999,
    elevation: 9999,
  },
  floatBtn: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 8,
  },
  floatIcon: { fontSize: 24 },
  floatHint: {
    fontSize: 9,
    color: colors.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
  // Quick Chat Sheet
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: colors.bgSecondary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: SCREEN_H * 0.6,
    paddingBottom: Platform.OS === 'ios' ? 36 : 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sheetTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  sheetClose: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: 14,
  },
  sheetCloseText: { color: colors.textMuted, fontSize: 14, fontWeight: '700' },
  sheetMessages: {
    flex: 1,
    gap: 6,
    marginBottom: 10,
  },
  sheetEmpty: { color: colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: 12 },
  sheetBubble: {
    maxWidth: '85%',
    padding: 10,
    borderRadius: 14,
  },
  sheetBubbleUser: { alignSelf: 'flex-end', backgroundColor: colors.accent },
  sheetBubbleAssist: { alignSelf: 'flex-start', backgroundColor: colors.bgCard },
  sheetBubbleText: { fontSize: 14, lineHeight: 20 },
  sheetInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  sheetInput: {
    flex: 1,
    backgroundColor: colors.bgCard,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 14,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sheetSend: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetSendDisabled: { opacity: 0.4 },
});
