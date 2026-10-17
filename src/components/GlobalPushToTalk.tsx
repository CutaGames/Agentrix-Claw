/**
 * GlobalPushToTalk — the mic button on the four-zone tabs (EXPO_PUBLIC_MOBILE_GLOBAL_PTT=1, pushToTalk.ts). Hold to talk,
 * release to send the words to your Agent; a tap opens the chat. The logic lives in createPttController; this renders
 * it and wires the recorder, the transcription call, the pending prefill and the navigation.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { API_BASE } from '../config/env';
import { useAuthStore } from '../stores/authStore';
import { useI18n } from '../stores/i18nStore';
import { useColors } from '../theme/useTheme';
import { readUriAsBase64 } from '../utils/readBase64';
import { setPendingPrefill } from '../services/conversationStore';
import { PTT_MAX_HOLD_MS, createPttController, transcribePttRecording, type PttNotice, type PttPhase } from '../services/pushToTalk';
import { createExpoAvPttRecorder } from '../services/pushToTalkRecorder';

const SIZE = 60;
const NOTICE: Record<PttNotice, { zh: string; en: string }> = {
  mic_denied: { zh: '要先在系统设置里允许使用麦克风。', en: 'Allow the microphone in system settings first.' },
  nothing_heard: { zh: '没听清，再按住说一次。', en: "Didn't catch that. Hold and try again." },
  transcribe_failed: { zh: '转文字没成功，请稍后再试。', en: 'Could not turn that into text. Try again shortly.' },
  signed_out: { zh: '请先登录。', en: 'Please sign in first.' },
};

export function GlobalPushToTalk({ bottomOffset }: { bottomOffset: number }) {
  const c = useColors();
  const { t, language } = useI18n();
  const navigation = useNavigation<any>();
  const [phase, setPhase] = useState<PttPhase>('idle');
  const [notice, setNotice] = useState<PttNotice | null>(null);
  const maxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const controller = useMemo(() => {
    const openChat = () => navigation.navigate('Main', { screen: 'Companion' });
    return createPttController({
      recorder: createExpoAvPttRecorder(),
      transcribe: (uri) =>
        transcribePttRecording(uri, {
          apiBase: API_BASE,
          token: useAuthStore.getState().token,
          lang: language === 'zh' ? 'zh' : 'en',
          readBase64: readUriAsBase64,
        }),
      deliver: (text) => {
        setPendingPrefill({ text, autoSend: true, speakReply: true });
        openChat();
      },
      openChat,
      notify: (next) => {
        setNotice(next);
        if (noticeTimer.current) clearTimeout(noticeTimer.current);
        noticeTimer.current = setTimeout(() => setNotice(null), 3000);
      },
      onPhase: (next) => {
        setPhase(next);
        if (next === 'recording') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
      },
    });
  }, [navigation, language]);

  useEffect(
    () => () => {
      if (maxTimer.current) clearTimeout(maxTimer.current);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );

  const onPressIn = () => {
    setNotice(null);
    void controller.pressIn();
    if (maxTimer.current) clearTimeout(maxTimer.current);
    maxTimer.current = setTimeout(() => void controller.pressOut(), PTT_MAX_HOLD_MS);
  };
  const onPressOut = () => {
    if (maxTimer.current) clearTimeout(maxTimer.current);
    void controller.pressOut();
  };

  const recording = phase === 'recording' || phase === 'starting';
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: bottomOffset }]}>
      {recording || notice ? (
        <View style={[styles.bubble, { backgroundColor: c.bgCard, borderColor: c.border }]}>
          <Text style={[styles.bubbleText, { color: c.textPrimary }]}>
            {notice ? t(NOTICE[notice]) : t({ zh: '在听…松开发给你的 Agent', en: 'Listening… release to send to your Agent' })}
          </Text>
        </View>
      ) : null}
      <Pressable
        testID="global-ptt"
        accessibilityRole="button"
        accessibilityLabel={t({ zh: '按住说话', en: 'Hold to talk' })}
        accessibilityHint={t({ zh: '按住说一句，松开发给你的 Agent；点一下打开对话', en: 'Hold, speak and release to send to your Agent; tap to open the chat' })}
        disabled={phase === 'transcribing'}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={[styles.button, { backgroundColor: recording ? '#e05252' : c.accent, transform: [{ scale: recording ? 1.12 : 1 }] }]}
      >
        {phase === 'transcribing' ? (
          <ActivityIndicator color={c.onAccent} />
        ) : (
          <Ionicons name="mic" size={26} color={c.onAccent} accessibilityElementsHidden importantForAccessibility="no" />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: 16, alignItems: 'flex-end' },
  bubble: { marginBottom: 8, maxWidth: 240, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  bubbleText: { fontSize: 13, lineHeight: 18 },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
});
