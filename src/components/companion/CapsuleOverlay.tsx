/**
 * CapsuleOverlay — base component for the three transient overlays that
 * float above (or beside) the companion ball:
 *   - WalletCapsule       (💰 +$N USDC)
 *   - ApprovalAlertCapsule (🚨 待审批 N)
 *   - VoiceGreetCapsule    (🐾 morning whisper)
 *
 * Phase 1 strategy (T10):
 *   - Single base view that knows nothing about the ball's exact position;
 *     it just renders an absolute-positioned pill near the screen's
 *     bottom-right corner. Wave 6 will read companionLayoutStore for
 *     true ball-anchored placement.
 *   - Pure functional fade-in/fade-out animation; auto-dismiss after
 *     `durationMs` (default 3.2s for Wallet, 4s for others).
 *   - Tappable when `onPress` provided.
 *
 * Spec: design.md §Components/Core 5.
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { colors } from '../../theme/colors';
import { themedStyles } from '../../theme/useTheme';

export interface CapsuleOverlayProps {
  visible: boolean;
  durationMs?: number;
  emoji: string;
  text: string;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
  onPress?: () => void;
  onDismiss?: () => void;
  /** Optional tweak to the bottom offset (e.g. lift above the ball). */
  bottomOffset?: number;
  testID?: string;
}

export function CapsuleOverlay({
  visible,
  durationMs = 3200,
  emoji,
  text,
  textColor = colors.textPrimary,
  bgColor = colors.bgCard,
  borderColor = colors.border,
  onPress,
  onDismiss,
  bottomOffset = 110,
  testID,
}: CapsuleOverlayProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
      dismissTimerRef.current = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 8, duration: 220, useNativeDriver: true }),
        ]).start(() => onDismiss?.());
      }, durationMs);
    } else {
      Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }).start();
    }
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [visible, durationMs, opacity, translateY, onDismiss]);

  if (!visible) return null;

  const containerStyle: ViewStyle = {
    position: 'absolute',
    right: 16,
    bottom: bottomOffset,
  };

  const Wrapper: any = onPress ? Pressable : View;
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[containerStyle, { opacity, transform: [{ translateY }] }]}
      testID={testID}
    >
      <Wrapper
        onPress={onPress}
        style={[
          styles.capsule,
          { backgroundColor: bgColor, borderColor },
        ]}
      >
        <Text style={styles.emoji}>{emoji}</Text>
        <Text style={[styles.text, { color: textColor }]} numberOfLines={1}>
          {text}
        </Text>
      </Wrapper>
    </Animated.View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 1,
    maxWidth: 260,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
  emoji: { fontSize: 16 },
  text: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
}));
