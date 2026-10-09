/**
 * VoiceAnswerButton — hold to speak an answer into a text box (M1 "语音访谈": the owner answers the twin's questions by
 * voice). Same controller, recorder and transcription call as the global push-to-talk, but the words go to `onText`
 * instead of the chat, and a tap does nothing. Nothing is saved here; the screen saves what the owner then sees.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { API_BASE } from '../config/env';
import { useAuthStore } from '../stores/authStore';
import { useI18n } from '../stores/i18nStore';
import { useColors } from '../theme/useTheme';
import { readUriAsBase64 } from '../utils/readBase64';
import { PTT_MAX_HOLD_MS, createPttController, transcribePttRecording, type PttNotice, type PttPhase } from '../services/pushToTalk';
import { createExpoAvPttRecorder } from '../services/pushToTalkRecorder';

const NOTICE: Record<PttNotice, { zh: string; en: string }> = {
  mic_denied: { zh: '没有麦克风权限，可以在系统设置里打开。', en: 'No microphone permission; turn it on in Settings.' },
  nothing_heard: { zh: '没听清，按住多说一会儿。', en: 'Didn’t catch that; hold a little longer.' },
  transcribe_failed: { zh: '转文字没成功，请稍后再试。', en: 'Could not turn that into text. Try again shortly.' },
  signed_out: { zh: '请重新登录。', en: 'Sign in again.' },
};

export function VoiceAnswerButton({ onText, testID }: { onText: (text: string) => void; testID?: string }) {
  const { t, language } = useI18n();
  const c = useColors();
  const [phase, setPhase] = useState<PttPhase>('idle');
  const [notice, setNotice] = useState<PttNotice | null>(null);
  const maxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const controller = useMemo(
    () =>
      createPttController({
        recorder: createExpoAvPttRecorder(),
        transcribe: (uri) =>
          transcribePttRecording(uri, { apiBase: API_BASE, token: useAuthStore.getState().token, lang: language === 'zh' ? 'zh' : 'en', readBase64: readUriAsBase64 }),
        deliver: (text) => onTextRef.current(text),
        openChat: () => undefined,
        notify: setNotice,
        onPhase: (next) => {
          setPhase(next);
          if (next === 'recording') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
        },
      }),
    [language],
  );

  useEffect(() => () => {
    if (maxTimer.current) clearTimeout(maxTimer.current);
  }, []);

  const recording = phase === 'recording' || phase === 'starting';
  return (
    <View style={styles.row}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={t({ zh: '按住说出回答', en: 'Hold to speak the answer' })}
        disabled={phase === 'transcribing'}
        onPressIn={() => {
          setNotice(null);
          void controller.pressIn();
          if (maxTimer.current) clearTimeout(maxTimer.current);
          maxTimer.current = setTimeout(() => void controller.pressOut(), PTT_MAX_HOLD_MS);
        }}
        onPressOut={() => {
          if (maxTimer.current) clearTimeout(maxTimer.current);
          void controller.pressOut();
        }}
        style={[styles.button, { backgroundColor: recording ? '#e05252' : c.bgCard, borderColor: c.border }]}
      >
        {phase === 'transcribing' ? <ActivityIndicator /> : <Text style={[styles.label, { color: recording ? '#ffffff' : c.textPrimary }]}>🎙 {recording ? t({ zh: '在听…松开', en: 'Listening… release' }) : t({ zh: '按住说', en: 'Hold to speak' })}</Text>}
      </Pressable>
      {notice ? <Text style={[styles.notice, { color: c.textMuted }]}>{t(NOTICE[notice])}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 6 },
  button: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  label: { fontSize: 14, fontWeight: '700' },
  notice: { fontSize: 12, lineHeight: 17 },
});
