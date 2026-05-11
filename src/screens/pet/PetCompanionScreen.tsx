/**
 * PetCompanionScreen — Mobile · v0.1 (PRD mobile-prd-v3 §3 / §3.4).
 *
 * Renderer-agnostic Pet Companion view. Subscribes to backend `pet.state`
 * (already pushed via presence socket) and animates emotion + intimacy level.
 *
 * Live2D / Skia heavy renderer is not yet bundled (待 license)，先用纯 React
 * Native 的颜色 + 缓动模拟 6+ 表情，保持视觉一致。
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { apiFetch } from '../../services/api';
import { colors } from '../../theme/colors';
import { PetRenderer, type PetClan } from '../../components/pet/PetRiveRenderer';

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
  clan?: PetClan;
}

export function PetCompanionScreen() {
  const navigation = useNavigation<any>();
  const [pet, setPet] = useState<PetState | null>(null);

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
  const lv = pet?.intimacy_level ?? 0;
  const xp = pet?.intimacy_xp ?? 0;
  const intensity = pet?.emotion_intensity ?? 0;
  const clan: PetClan = pet?.clan ?? 'A';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>主宠陪伴</Text>
      <Text style={styles.subtitle}>{emotion} · intensity {intensity}</Text>

      <Pressable
        onPress={() => triggerInteraction('tap')}
        onLongPress={() => triggerInteraction('double_click')}
        style={({ pressed }) => [styles.petWrap, pressed && { opacity: 0.85 }]}
      >
        <PetRenderer
          clan={clan}
          emotion={emotion}
          width={180}
          height={180}
        />
      </Pressable>

      <View style={styles.intimacyCard}>
        <Text style={styles.intimacyLabel}>亲密度</Text>
        <Text style={styles.intimacyValue}>Lv {lv}</Text>
        <Text style={styles.intimacyXp}>{xp} xp</Text>
      </View>

      <Pressable style={styles.voiceBtn} onPress={() => triggerInteraction('voice_greet')}>
        <Text style={styles.voiceBtnText}>🎙 打招呼 (+1 xp)</Text>
      </Pressable>

      <View style={styles.v4Row} testID="pet-v4-cta-row">
        <Pressable
          style={styles.v4Btn}
          onPress={() => navigation.navigate('Wardrobe')}
          testID="pet-cta-wardrobe"
        >
          <Text style={styles.v4BtnText}>👗 衣柜</Text>
        </Pressable>
        <Pressable
          style={styles.v4Btn}
          onPress={() => navigation.navigate('SoulPicker')}
          testID="pet-cta-soul"
        >
          <Text style={styles.v4BtnText}>👻 灵魂</Text>
        </Pressable>
        <Pressable
          style={styles.v4Btn}
          onPress={() => navigation.navigate('SkinMarketplace')}
          testID="pet-cta-market"
        >
          <Text style={styles.v4BtnText}>🛒 市场</Text>
        </Pressable>
        <Pressable
          style={styles.v4Btn}
          onPress={() => navigation.navigate('Breed')}
          testID="pet-cta-breed"
        >
          <Text style={styles.v4BtnText}>🧬 繁殖</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 24, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 22, fontWeight: '700', marginBottom: 4 },
  subtitle: { color: colors.textSecondary, fontSize: 13, marginBottom: 32, textTransform: 'capitalize' },
  petWrap: { marginBottom: 32 },
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
  v4Row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
  },
  v4Btn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(0,212,255,0.35)',
    backgroundColor: 'rgba(0,212,255,0.10)',
  },
  v4BtnText: { color: colors.accent, fontSize: 13, fontWeight: '600' },
});
