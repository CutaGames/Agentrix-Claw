/**
 * AxpToastHost — Global renderer for AXP earn / spend drift-in toasts.
 *
 * Mounted once in App.tsx right next to <AppNavigator />. Renders any toast
 * pushed through `showAxpToast(...)` as a pill that drifts up from the
 * top-center of the screen, fades out after 2.5s. Queue stacks vertically so
 * two rapid earns don't overlap.
 *
 * Visual spec (confirmed 2026-05-10):
 *   • Earn: cyan gradient (colors.accent), white text, emoji prefix.
 *   • Spend: amber gradient, white text, negative sign.
 *   • Duration: 2500ms (300 fade in + 1800 hold + 400 fade out).
 *   • Stacks from top, newest on top.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '../stores/i18nStore';
import { useAxpToastStore, type AxpToast } from '../stores/axpToastStore';

const DURATION_MS = 2500;
const FADE_IN_MS = 280;
const FADE_OUT_MS = 400;

interface PillProps {
  toast: AxpToast;
  onDone: (id: string) => void;
  topOffset: number;
}

function AxpToastPill({ toast, onDone, topOffset }: PillProps) {
  const { t } = useI18n();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: FADE_IN_MS, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: FADE_IN_MS, useNativeDriver: true }),
    ]).start();

    const holdTimer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: FADE_OUT_MS, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -24, duration: FADE_OUT_MS, useNativeDriver: true }),
      ]).start(() => onDone(toast.id));
    }, DURATION_MS - FADE_IN_MS - FADE_OUT_MS);

    return () => clearTimeout(holdTimer);
  }, [opacity, translateY, toast.id, onDone]);

  const isEarn = toast.direction === 'earn';
  const sign = isEarn ? '+' : '−';
  return (
    <Animated.View
      style={[
        styles.pill,
        isEarn ? styles.pillEarn : styles.pillSpend,
        { top: topOffset, transform: [{ translateY }], opacity },
      ]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={() => onDone(toast.id)}
        style={styles.pillPressable}
        accessibilityRole="alert"
        accessibilityLabel={`${sign}${toast.amount} AXP`}
      >
        {toast.emoji ? <Text style={styles.emoji}>{toast.emoji}</Text> : null}
        <Text style={[styles.amount, !isEarn && styles.amountSpend]}>
          {sign}
          {toast.amount.toLocaleString()} AXP
        </Text>
        <Text style={styles.reason} numberOfLines={1}>
          {t(toast.reason)}
        </Text>
        <Text style={styles.sparkle}>✨</Text>
      </Pressable>
    </Animated.View>
  );
}

export function AxpToastHost() {
  const queue = useAxpToastStore((s) => s.queue);
  const dismiss = useAxpToastStore((s) => s.dismiss);
  const insets = useSafeAreaInsets();

  if (queue.length === 0) return null;

  return (
    <View style={styles.host} pointerEvents="box-none">
      {queue.map((toast, idx) => (
        <AxpToastPill
          key={toast.id}
          toast={toast}
          onDone={dismiss}
          topOffset={insets.top + 12 + idx * 52}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 10_000,
    elevation: 30,
  },
  pill: {
    position: 'absolute',
    alignSelf: 'center',
    minWidth: 220,
    maxWidth: '90%',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  pillEarn: {
    backgroundColor: 'rgba(34,211,238,0.16)',
    borderColor: 'rgba(34,211,238,0.6)',
    shadowColor: '#22d3ee',
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
  pillSpend: {
    backgroundColor: 'rgba(251,191,36,0.16)',
    borderColor: 'rgba(251,191,36,0.6)',
    shadowColor: '#fbbf24',
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
  pillPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emoji: { fontSize: 16 },
  amount: { fontSize: 15, fontWeight: '800', color: '#22d3ee' },
  amountSpend: { color: '#fbbf24' },
  reason: { fontSize: 12, color: '#e5e7eb', flexShrink: 1 },
  sparkle: { fontSize: 14 },
});
