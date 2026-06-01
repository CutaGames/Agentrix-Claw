/**
 * VoiceOnboardingTooltip — progressive voice quick-start guide
 *
 * Shows a tooltip sequence on first voice interaction with the current
 * wake-word and live voice workflow.
 *
 * Persisted via MMKV so it only shows once per device.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { colors } from '../theme/colors';
import { mmkv } from '../stores/mmkvStorage';

const MMKV_KEY = 'voice_onboarding_completed_v2';
const TOTAL_STEPS = 3;

interface Props {
  /** Whether the voice panel is currently visible */
  visible: boolean;
  /** Current voice interaction mode */
  voiceInteractionMode: 'hold' | 'tap';
  /** Whether duplex (live) mode is active */
  duplexMode: boolean;
  /** i18n helper */
  t: (opts: { en: string; zh: string }) => string;
}

export function VoiceOnboardingTooltip({ visible, voiceInteractionMode, duplexMode, t }: Props) {
  const [step, setStep] = useState(0); // 0 = not showing, 1-3 = active step
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    const completed = mmkv.getBoolean(MMKV_KEY);
    if (completed) return;
    setStep(1);
  }, [visible]);

  useEffect(() => {
    if (step > 0) {
      Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    }
  }, [step, fadeAnim]);

  const advance = useCallback(() => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      if (step >= TOTAL_STEPS) {
        mmkv.set(MMKV_KEY, true);
        setStep(0);
      } else {
        setStep((s) => s + 1);
      }
    });
  }, [step, fadeAnim]);

  const dismiss = useCallback(() => {
    mmkv.set(MMKV_KEY, true);
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setStep(0);
    });
  }, [fadeAnim]);

  if (step === 0) return null;

  const stepContent = [
    null, // 0 index unused
    {
      title: t({ en: 'Wake or Tap to Enter', zh: '唤醒或点按进入' }),
      body: t({ en: 'From a cold start, say your wake phrase or tap the floating ball once to jump straight into voice chat.', zh: '冷启动后，你可以直接说唤醒词，或点一次悬浮球，立即进入语音对话。' }),
    },
    {
      title: t({ en: 'Grant Mic Access Once', zh: '先完成麦克风授权' }),
      body: t({ en: 'If wake word or live voice does not start, allow microphone and speech recognition in system settings first.', zh: '如果唤醒词或实时语音没有启动，先到系统设置里允许麦克风和语音识别权限。' }),
    },
    {
      title: t({ en: 'Tune Voice and Wake Phrase', zh: '调节音色和唤醒词' }),
      body: duplexMode
        ? t({ en: 'In live mode you can speak naturally, interrupt anytime, and use the top-right gear to change the agent voice or wake phrase.', zh: '实时模式下你可以自然说话、随时打断，并通过右上角齿轮修改智能体音色和唤醒词。' })
        : t({ en: 'Use the top-right gear to change the agent voice, wake phrase, and other voice behavior any time.', zh: '右上角齿轮里可以随时修改智能体音色、唤醒词和其他语音行为。' }),
    },
  ];

  const content = stepContent[step];
  if (!content) return null;

  return (
    <Animated.View
      testID="voice-onboarding-tooltip"
      accessibilityLabel="voice-onboarding-tooltip"
      style={[styles.container, { opacity: fadeAnim }]}
    >
      <View style={styles.bubble}>
        <View style={styles.header}>
          <Text testID="voice-onboarding-step-indicator" style={styles.stepIndicator}>{step}/{TOTAL_STEPS}</Text>
          <TouchableOpacity
            testID="voice-onboarding-skip"
            accessibilityLabel="voice-onboarding-skip"
            onPress={dismiss}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.dismissText}>{t({ en: 'Skip', zh: '跳过' })}</Text>
          </TouchableOpacity>
        </View>
        <Text testID="voice-onboarding-title" style={styles.title}>{content.title}</Text>
        <Text testID="voice-onboarding-body" style={styles.body}>{content.body}</Text>
        <TouchableOpacity
          testID="voice-onboarding-next"
          accessibilityLabel="voice-onboarding-next"
          style={styles.nextBtn}
          onPress={advance}
        >
          <Text style={styles.nextBtnText}>
            {step >= TOTAL_STEPS
              ? t({ en: 'Got it!', zh: '知道了！' })
              : t({ en: 'Next', zh: '下一步' })}
          </Text>
        </TouchableOpacity>
      </View>
      <View style={styles.arrow} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 80,
    alignSelf: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  bubble: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 14,
    width: 280,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  stepIndicator: {
    fontSize: 11,
    color: colors.textMuted,
  },
  dismissText: {
    fontSize: 12,
    color: colors.accent,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  body: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: 10,
  },
  nextBtn: {
    alignSelf: 'flex-end',
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  nextBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  arrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.bgCard,
  },
});
