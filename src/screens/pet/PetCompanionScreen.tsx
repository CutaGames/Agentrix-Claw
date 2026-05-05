/**
 * PetCompanionScreen — Mobile · v0.1 (PRD mobile-prd-v3 §3 / §3.4).
 *
 * Renderer-agnostic Pet Companion view. Subscribes to backend `pet.state`
 * (already pushed via presence socket) and animates emotion + intimacy level.
 *
 * Live2D / Skia heavy renderer is not yet bundled (待 license)，先用纯 React
 * Native 的颜色 + 缓动模拟 6+ 表情，保持视觉一致。
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Pressable } from 'react-native';
import { apiFetch } from '../../services/api';
import { colors } from '../../theme/colors';

type PetEmotion =
  | 'calm' | 'happy' | 'excited' | 'focused'
  | 'concerned' | 'tired' | 'love' | 'sad' | 'angry' | 'sleepy';

interface PetState {
  emotion: PetEmotion;
  emotion_intensity: 0 | 1 | 2 | 3;
  intimacy_level: number;
  intimacy_xp: number;
  primary_agent_id?: string;
  updated_at?: number;
}

const EMOTION_PALETTE: Record<PetEmotion, { body: string; cheek: string; mood: string }> = {
  calm:      { body: '#a78bfa', cheek: '#fda4af', mood: '😌' },
  happy:     { body: '#34d399', cheek: '#fda4af', mood: '😄' },
  excited:   { body: '#fbbf24', cheek: '#fb7185', mood: '🤩' },
  focused:   { body: '#818cf8', cheek: '#a5b4fc', mood: '🧐' },
  concerned: { body: '#f87171', cheek: '#fecaca', mood: '😟' },
  tired:     { body: '#94a3b8', cheek: '#cbd5e1', mood: '😪' },
  love:      { body: '#f472b6', cheek: '#fda4af', mood: '🥰' },
  sad:       { body: '#60a5fa', cheek: '#bae6fd', mood: '😢' },
  angry:     { body: '#ef4444', cheek: '#fca5a5', mood: '😠' },
  sleepy:    { body: '#64748b', cheek: '#94a3b8', mood: '😴' },
};

export function PetCompanionScreen() {
  const [pet, setPet] = useState<PetState | null>(null);
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await apiFetch<PetState>('/v1/pet/state');
        if (!cancelled && data) setPet(data);
      } catch {
        // graceful default
        if (!cancelled) setPet({ emotion: 'calm', emotion_intensity: 0, intimacy_level: 0, intimacy_xp: 0 });
      }
    };
    load();
    const id = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // breathing animation
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.05, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1.0, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [scale]);

  const triggerInteraction = async (kind: 'double_click' | 'tap' | 'voice_greet') => {
    try {
      const xpMap: Record<string, number> = { double_click: 5, tap: 1, voice_greet: 1 };
      await apiFetch('/v1/pet/intimacy', {
        method: 'POST',
        body: JSON.stringify({ xp: xpMap[kind] ?? 1 }),
      });
    } catch {
      // ignore — server-authoritative reconciliation will catch up via socket
    }
  };

  const emotion = pet?.emotion ?? 'calm';
  const palette = EMOTION_PALETTE[emotion];
  const lv = pet?.intimacy_level ?? 0;
  const xp = pet?.intimacy_xp ?? 0;
  const intensity = pet?.emotion_intensity ?? 0;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>主宠陪伴</Text>
      <Text style={styles.subtitle}>{emotion} · intensity {intensity}</Text>

      <Pressable
        onPress={() => triggerInteraction('tap')}
        onLongPress={() => triggerInteraction('double_click')}
        style={({ pressed }) => [styles.petWrap, pressed && { opacity: 0.85 }]}
      >
        <Animated.View
          style={[
            styles.petBody,
            {
              backgroundColor: palette.body,
              transform: [{ scale }],
              shadowColor: palette.body,
              shadowOpacity: 0.35 + intensity * 0.15,
              shadowRadius: 18 + intensity * 6,
            },
          ]}
        >
          <Text style={styles.petMood}>{palette.mood}</Text>
        </Animated.View>
      </Pressable>

      <View style={styles.intimacyCard}>
        <Text style={styles.intimacyLabel}>亲密度</Text>
        <Text style={styles.intimacyValue}>Lv {lv}</Text>
        <Text style={styles.intimacyXp}>{xp} xp</Text>
      </View>

      <Pressable style={styles.voiceBtn} onPress={() => triggerInteraction('voice_greet')}>
        <Text style={styles.voiceBtnText}>🎙 打招呼 (+1 xp)</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 24, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 22, fontWeight: '700', marginBottom: 4 },
  subtitle: { color: colors.textSecondary, fontSize: 13, marginBottom: 32, textTransform: 'capitalize' },
  petWrap: { marginBottom: 32 },
  petBody: {
    width: 180, height: 180, borderRadius: 90,
    alignItems: 'center', justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  petMood: { fontSize: 80 },
  intimacyCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 24,
  },
  intimacyLabel: { color: colors.textSecondary, fontSize: 12 },
  intimacyValue: { color: '#a78bfa', fontSize: 18, fontWeight: '700' },
  intimacyXp: { color: colors.textSecondary, fontSize: 12 },
  voiceBtn: {
    backgroundColor: colors.accent, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24,
  },
  voiceBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
