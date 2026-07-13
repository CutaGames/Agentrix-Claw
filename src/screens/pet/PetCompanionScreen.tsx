/**
 * PetCompanionScreen — Mobile · Phase C upgrade.
 *
 * Companion view that renders the live pet sprite, current emotion + intimacy,
 * a diary card, and the tap-the-food mini-game. Mirrors the desktop "living
 * pet" experience as closely as a single screen reasonably can.
 *
 * Behaviour summary:
 *   - sprite renderer (`PetSpriteAnimator`) with multi-frame walk/idle/sleep
 *     animations from `assets/pets/sprites/default/*.png`;
 *   - emotion → preferred sprite action (sleep → sleep clip, happy → idle …);
 *   - tap pet → light haptic + chirp + +1 intimacy XP;
 *   - long-press → heavy haptic + purr + +5 intimacy XP;
 *   - feed button → medium haptic + crunch + +1 intimacy XP + brief eat clip;
 *   - mini-game button → opens `PetTapGameModal`;
 *   - diary card → fetched from `/v1/pet/diary/recent`.
 *
 * Renderer-agnostic state subscription: still polls `/v1/pet/state` every 5 s
 * (cheap REST) and live-updates from any presence socket events the global
 * MobilePetProactiveBanner has already wired.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { apiFetch } from '../../services/api';
import { colors } from '../../theme/colors';
import { type PetClan } from '../../components/pet/PetRiveRenderer';
import {
  PetSpriteAnimator,
  defaultActionForEmotion,
  type PetAction,
} from '../../components/pet/PetSpriteAnimator';
import { PetDiaryCard } from '../../components/pet/PetDiaryCard';
import { PetTapGameModal } from '../../components/pet/PetTapGameModal';
import { playPetFx, stopPetFx } from '../../services/petInteractionFx';
import { themedStyles } from '../../theme/useTheme';

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

const EMOTION_LABEL_ZH: Record<PetEmotion, string> = {
  calm: '平静',
  happy: '开心',
  excited: '兴奋',
  focused: '专注',
  concerned: '担心',
  tired: '疲倦',
  love: '想抱抱',
  sad: '难过',
  angry: '小生气',
  sleepy: '困',
};

export function PetCompanionScreen() {
  const navigation = useNavigation<any>();
  const [pet, setPet] = useState<PetState | null>(null);
  const [action, setAction] = useState<PetAction>('idle');
  const [facing, setFacing] = useState<'left' | 'right'>('right');
  const [showGame, setShowGame] = useState(false);
  const [diaryRefresh, setDiaryRefresh] = useState(0);

  // Poll pet state
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await apiFetch<PetState>('/v1/pet/state');
        if (!cancelled && data) setPet(data);
      } catch {
        if (!cancelled) {
          setPet({
            emotion: 'calm',
            emotion_intensity: 0,
            intimacy_level: 0,
            intimacy_xp: 0,
          });
        }
      }
    };
    void load();
    const id = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Map current emotion → default sprite action when no transient action is
  // playing (e.g. eat / jump). When `action` is one of the transient set we
  // leave it alone until it completes.
  useEffect(() => {
    if (action === 'eat' || action === 'jump') return;
    setAction(defaultActionForEmotion(pet?.emotion));
  }, [pet?.emotion, action]);

  // Periodically flip facing direction when in idle, gives the pet a sense
  // of presence even without an explicit wander loop.
  useEffect(() => {
    if (action !== 'idle' && action !== 'sit' && action !== 'sleep') return;
    const t = setInterval(() => {
      setFacing((f) => (Math.random() < 0.3 ? (f === 'left' ? 'right' : 'left') : f));
    }, 4000 + Math.random() * 3000);
    return () => clearInterval(t);
  }, [action]);

  // Stop any looping FX (snore) when the screen unmounts.
  useEffect(() => {
    return () => stopPetFx();
  }, []);

  // Loop snore audio while sleepy
  useEffect(() => {
    if (pet?.emotion === 'sleepy' || action === 'sleep') {
      void playPetFx('sleep');
    } else {
      stopPetFx();
    }
  }, [pet?.emotion, action]);

  const triggerInteraction = async (
    kind: 'tap' | 'double_click' | 'voice_greet' | 'feed',
  ) => {
    const xpMap: Record<string, number> = {
      tap: 1,
      double_click: 5,
      voice_greet: 1,
      feed: 1,
    };
    // Fire haptic + sound first for instant feedback
    if (kind === 'tap' || kind === 'voice_greet') void playPetFx('tap');
    else if (kind === 'double_click') void playPetFx('hold');
    else if (kind === 'feed') void playPetFx('feed');

    if (kind === 'feed') {
      setAction('eat');
      // play eat for ~1.6s then return to idle
      setTimeout(() => setAction((a) => (a === 'eat' ? 'idle' : a)), 1600);
    }

    try {
      // Backend uses 'tap' / 'double_click' / 'voice_greet' kinds; map 'feed'
      // to double_click semantics so it earns the +5 reward path that desktop
      // already wires up via right-click → 'feed'.
      const remoteKind = kind === 'feed' ? 'double_click' : kind;
      await apiFetch('/v1/pet/intimacy', {
        method: 'POST',
        body: JSON.stringify({ kind: remoteKind, xp: xpMap[kind] ?? 1 }),
      });
      setDiaryRefresh((v) => v + 1); // diary may pick up new emotion
    } catch {
      // ignore — server-authoritative reconciliation will catch up via socket
    }
  };

  const emotion = pet?.emotion ?? 'calm';
  const lv = pet?.intimacy_level ?? 0;
  const xp = pet?.intimacy_xp ?? 0;
  const intensity = pet?.emotion_intensity ?? 0;

  const subtitle = useMemo(
    () => `${EMOTION_LABEL_ZH[emotion]} · 强度 ${intensity}`,
    [emotion, intensity],
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>主宠陪伴</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>

      <Pressable
        onPress={() => triggerInteraction('tap')}
        onLongPress={() => triggerInteraction('double_click')}
        style={({ pressed }) => [styles.petWrap, pressed && { transform: [{ scale: 0.97 }] }]}
        accessibilityRole="button"
        accessibilityLabel="拍一下宠物 (轻按 +1 亲密度,长按 +5)"
      >
        <PetSpriteAnimator
          action={action}
          size={200}
          facing={facing}
          onActionComplete={(a) => {
            // Transient actions return to idle when finished
            if (a === 'eat' || a === 'jump') setAction('idle');
          }}
        />
      </Pressable>

      <View style={styles.intimacyCard}>
        <Text style={styles.intimacyLabel}>亲密度</Text>
        <Text style={styles.intimacyValue}>Lv {lv}</Text>
        <Text style={styles.intimacyXp}>{xp} xp</Text>
      </View>

      <View style={styles.actionRow}>
        <Pressable style={styles.actionBtn} onPress={() => triggerInteraction('feed')}>
          <Text style={styles.actionEmoji}>🍖</Text>
          <Text style={styles.actionLabel}>喂食</Text>
        </Pressable>
        <Pressable style={styles.actionBtn} onPress={() => triggerInteraction('voice_greet')}>
          <Text style={styles.actionEmoji}>🎙</Text>
          <Text style={styles.actionLabel}>打招呼</Text>
        </Pressable>
        <Pressable style={styles.actionBtn} onPress={() => setShowGame(true)}>
          <Text style={styles.actionEmoji}>🎮</Text>
          <Text style={styles.actionLabel}>小游戏</Text>
        </Pressable>
      </View>

      <PetDiaryCard refreshKey={diaryRefresh} />

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

      <PetTapGameModal visible={showGame} onClose={() => setShowGame(false)} />
    </ScrollView>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, alignItems: 'center', paddingBottom: 40 },
  title: { color: colors.text, fontSize: 22, fontWeight: '700', marginBottom: 4 },
  subtitle: { color: colors.textSecondary, fontSize: 13, marginBottom: 24 },
  petWrap: {
    marginBottom: 24,
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  intimacyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 16,
  },
  intimacyLabel: { color: colors.textSecondary, fontSize: 12 },
  intimacyValue: { color: '#a78bfa', fontSize: 18, fontWeight: '700' },
  intimacyXp: { color: colors.textSecondary, fontSize: 12 },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  actionBtn: {
    backgroundColor: 'rgba(167,139,250,0.10)',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: 'center',
    minWidth: 84,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.25)',
  },
  actionEmoji: { fontSize: 22 },
  actionLabel: { color: colors.text, fontSize: 12, fontWeight: '600', marginTop: 4 },
  v4Row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    width: '100%',
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
}));
