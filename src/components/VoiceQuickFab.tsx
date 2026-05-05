/**
 * VoiceQuickFab — Mobile floating mic FAB (PRD mobile-prd-v3 §3.2 Voice Quick).
 *
 * Always-on tappable bubble that toggles the Voice Quick form. Wraps a long-press
 * to switch to push-to-talk mode. Renderer-only — actual STT pipeline is owned by
 * `voiceRealtime.ts` (Realtime full-duplex) when available, else falls back to the
 * standard chat voice flow.
 *
 * Position is draggable (last position persisted to AsyncStorage). Default
 * bottom-right above the tab bar so it never overlaps Tab labels.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMobileFormStore } from '../stores/mobileFormStore';

const STORAGE_KEY = 'agentrix_voice_fab_pos_v1';
const SIZE = 56;

interface Props {
  /** Optional override: hide on auth/onboarding screens. */
  visible?: boolean;
  /** Tap handler (defaults to switching form to voice_quick + emitting event). */
  onTap?: () => void;
  /** Long-press handler (defaults to push-to-talk start). */
  onLongPress?: () => void;
}

export function VoiceQuickFab({ visible = true, onTap, onLongPress }: Props) {
  const setForm = useMobileFormStore((s) => s.setForm);
  const { width, height } = Dimensions.get('window');
  const pos = useRef(new Animated.ValueXY({ x: width - SIZE - 16, y: height - SIZE - 110 })).current;
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const { x, y } = JSON.parse(raw);
          if (typeof x === 'number' && typeof y === 'number') pos.setValue({ x, y });
        }
      } catch {}
    })();
  }, [pos]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
      onPanResponderGrant: () => {
        // @ts-ignore animated value internals
        pos.setOffset({ x: pos.x._value, y: pos.y._value });
        pos.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pos.x, dy: pos.y }], { useNativeDriver: false }),
      onPanResponderRelease: () => {
        pos.flattenOffset();
        // @ts-ignore
        const finalX = pos.x._value;
        // @ts-ignore
        const finalY = pos.y._value;
        void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ x: finalX, y: finalY })).catch(() => {});
      },
    }),
  ).current;

  const handleTap = () => {
    setForm('voice_quick');
    if (onTap) onTap();
    else {
      // Surface global signal — voiceRealtime / chat panel listens for this.
      // @ts-ignore RN global event bus indirection (no DOM)
      const g: any = globalThis;
      g.AgentrixVoiceFab?.onTap?.();
    }
  };

  const handleLongPress = () => {
    setRecording(true);
    if (onLongPress) onLongPress();
  };
  const handleRelease = () => setRecording(false);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.fab,
        { transform: [{ translateX: pos.x }, { translateY: pos.y }] },
        recording && styles.fabRecording,
      ]}
      {...panResponder.panHandlers}
    >
      <Pressable
        onPress={handleTap}
        onLongPress={handleLongPress}
        onPressOut={handleRelease}
        delayLongPress={250}
        style={styles.tap}
        accessibilityLabel="Voice Quick"
        accessibilityHint="Tap to ask Aira; long-press for push-to-talk"
      >
        <View style={styles.inner}>
          <Text style={styles.icon}>{recording ? '●' : '🎙'}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    zIndex: 9999,
    elevation: 12,
  },
  fabRecording: {
    shadowColor: '#ef4444',
    shadowOpacity: 0.6,
    shadowRadius: 18,
  },
  tap: { flex: 1, borderRadius: SIZE / 2 },
  inner: {
    flex: 1,
    borderRadius: SIZE / 2,
    backgroundColor: '#00d4ff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00d4ff',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  icon: { fontSize: 22, color: '#0B1220' },
});
