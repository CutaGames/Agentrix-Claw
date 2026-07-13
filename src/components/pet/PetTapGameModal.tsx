/**
 * PetTapGameModal — Phase C / C-6 真小游戏
 *
 * 30 秒 tap-the-target reaction game。屏幕上方掉落随机食物 emoji,玩家
 * 在它们落出屏幕之前 tap 中即可得分。命中 +10, 错过 0, 超时(快落出)只
 * 算 +3。结束后 POST `/v1/pet/minigames/:key/scores` (复用现有 minigame
 * 后端,key='tap_reaction') 由服务端 clamp + 反作弊。
 *
 * 替换原 PetPlaygroundScreen 的"快速一局随机分"——那个版本的分数完全是
 * `Math.random()` 拍脑袋,既不公平也不好玩。
 *
 * 实现要点:
 *   - 用 `requestAnimationFrame` 统一驱动食物 y 位置(无 Reanimated 依赖,
 *     FPS 自适应,后台时 RAF 自动暂停)。
 *   - 食物以 0.6 ~ 1.4 秒间隔生成,落速 200 ~ 350 px/sec。
 *   - 每只食物有自己的 id,被点中后立即从列表移除并 +10 分。
 *   - 游戏结束(30s 倒计时归零)上传分数,弹结算面板。
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  Dimensions,
  Platform,
  Vibration,
} from 'react-native';
import { colors } from '../../theme/colors';
import { submitMinigameScore, type MinigameKey } from '../../services/petPhase6Sdk';
import { playPetFx } from '../../services/petInteractionFx';
import { celebratePet } from '../../services/petModeAdapters';
import { themedStyles } from '../../theme/useTheme';

const GAME_DURATION_MS = 30_000;
const FOOD_EMOJIS = ['🍖', '🍗', '🍣', '🍱', '🍙', '🍤', '🥩', '🍪', '🥯', '🥨'];
const SPAWN_MIN_MS = 600;
const SPAWN_MAX_MS = 1400;
const FALL_MIN_PX_PER_SEC = 200;
const FALL_MAX_PX_PER_SEC = 350;
const HIT_REWARD = 10;
const LATE_HIT_REWARD = 3; // bottom-fifth hit

interface Falling {
  id: number;
  emoji: string;
  x: number; // px
  y: number; // px
  speed: number; // px/sec
  hit: boolean;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function PetTapGameModal({ visible, onClose }: Props) {
  const { width: screenW } = Dimensions.get('window');
  const PLAY_HEIGHT = 480;
  const PLAY_WIDTH = Math.min(screenW - 32, 420);
  const FOOD_SIZE = 44;

  const [score, setScore] = useState(0);
  const [running, setRunning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION_MS);
  const [items, setItems] = useState<Falling[]>([]);
  const [phase, setPhase] = useState<'ready' | 'playing' | 'done'>('ready');
  const [submitResult, setSubmitResult] = useState<{
    score: number;
    xp: number;
    levelUp: boolean;
  } | null>(null);

  const startTsRef = useRef<number>(0);
  const lastSpawnRef = useRef<number>(0);
  const nextSpawnRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);
  const idCounterRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  // Reset on open
  useEffect(() => {
    if (!visible) return;
    setScore(0);
    setItems([]);
    setTimeLeft(GAME_DURATION_MS);
    setPhase('ready');
    setSubmitResult(null);
  }, [visible]);

  // Stop RAF on unmount / modal close
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  function start() {
    setPhase('playing');
    setRunning(true);
    startTsRef.current = performance.now();
    lastFrameRef.current = startTsRef.current;
    lastSpawnRef.current = startTsRef.current;
    nextSpawnRef.current = startTsRef.current + (SPAWN_MIN_MS + Math.random() * (SPAWN_MAX_MS - SPAWN_MIN_MS));
    setItems([]);
    setScore(0);
    setTimeLeft(GAME_DURATION_MS);
    rafRef.current = requestAnimationFrame(tick);
  }

  function tick(now: number) {
    const dt = Math.min(48, now - lastFrameRef.current);
    lastFrameRef.current = now;
    const elapsed = now - startTsRef.current;
    const remaining = Math.max(0, GAME_DURATION_MS - elapsed);

    if (remaining <= 0) {
      finish();
      return;
    }

    // Spawn
    if (now >= nextSpawnRef.current) {
      idCounterRef.current += 1;
      const id = idCounterRef.current;
      const emoji = FOOD_EMOJIS[Math.floor(Math.random() * FOOD_EMOJIS.length)];
      const x = 8 + Math.random() * (PLAY_WIDTH - FOOD_SIZE - 16);
      const speed =
        FALL_MIN_PX_PER_SEC +
        Math.random() * (FALL_MAX_PX_PER_SEC - FALL_MIN_PX_PER_SEC);
      setItems((prev) => [
        ...prev,
        { id, emoji, x, y: -FOOD_SIZE, speed, hit: false },
      ]);
      lastSpawnRef.current = now;
      nextSpawnRef.current =
        now + (SPAWN_MIN_MS + Math.random() * (SPAWN_MAX_MS - SPAWN_MIN_MS));
    }

    // Advance positions; drop items that exited the play area
    setItems((prev) =>
      prev
        .map((it) => ({ ...it, y: it.y + (it.speed * dt) / 1000 }))
        .filter((it) => it.y < PLAY_HEIGHT + FOOD_SIZE),
    );

    setTimeLeft(remaining);
    rafRef.current = requestAnimationFrame(tick);
  }

  async function finish() {
    setPhase('done');
    setRunning(false);
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    // Submit
    try {
      const r = await submitMinigameScore('feed' as MinigameKey, score, {
        client: 'mobile-tap-game',
        durationMs: GAME_DURATION_MS,
      });
      setSubmitResult({
        score: r.score_clamped ?? score,
        xp: r.intimacy_xp_awarded ?? 0,
        levelUp: !!r.level_up,
      });
      if (r.level_up) {
        await playPetFx('cheer');
        // Sprint P-6 phase 6.3: trigger pet form celebration sprite
        // alongside the cheer haptic + audio fx.
        celebratePet('axp-level-up', 1500);
      }
    } catch {
      setSubmitResult({ score, xp: 0, levelUp: false });
    }
  }

  function onHitItem(id: number, late: boolean) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, hit: true } : it)));
    setScore((s) => s + (late ? LATE_HIT_REWARD : HIT_REWARD));
    void playPetFx(late ? 'tap' : 'feed');
    if (Platform.OS !== 'web') {
      try { Vibration.vibrate(20); } catch { /* ignore */ }
    }
    // Remove after a short flash so the user sees it pop
    setTimeout(() => {
      setItems((prev) => prev.filter((it) => it.id !== id));
    }, 90);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.frame, { width: PLAY_WIDTH }]}>
          <View style={styles.header}>
            <Text style={styles.title}>🎮 接食游戏</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>
          <View style={styles.statsRow}>
            <Text style={styles.statLabel}>分数</Text>
            <Text style={styles.statValue}>{score}</Text>
            <Text style={styles.statLabel}>剩余</Text>
            <Text style={styles.statValue}>{(timeLeft / 1000).toFixed(1)}s</Text>
          </View>

          <View
            style={[
              styles.playArea,
              { width: PLAY_WIDTH, height: PLAY_HEIGHT },
            ]}
          >
            {phase === 'ready' && (
              <View style={styles.overlay}>
                <Text style={styles.overlayTitle}>🐾 接食物挑战</Text>
                <Text style={styles.overlayBody}>
                  食物会从顶部掉落,30 秒内点中越多越好。
                  {'\n'}下方点中算 +{LATE_HIT_REWARD},中段点中 +{HIT_REWARD}。
                </Text>
                <Pressable style={styles.startBtn} onPress={start}>
                  <Text style={styles.startBtnText}>开始</Text>
                </Pressable>
              </View>
            )}

            {phase === 'playing' &&
              items.map((it) => {
                const lateZone = it.y > PLAY_HEIGHT * 0.78;
                return (
                  <Pressable
                    key={it.id}
                    onPress={() => onHitItem(it.id, lateZone)}
                    hitSlop={12}
                    style={[
                      styles.foodItem,
                      {
                        left: it.x,
                        top: it.y,
                        width: FOOD_SIZE,
                        height: FOOD_SIZE,
                        backgroundColor: it.hit
                          ? 'rgba(52,211,153,0.4)'
                          : 'rgba(255,255,255,0.05)',
                      },
                    ]}
                  >
                    <Text style={styles.foodEmoji}>{it.emoji}</Text>
                  </Pressable>
                );
              })}

            {phase === 'done' && (
              <View style={styles.overlay}>
                <Text style={styles.overlayTitle}>🎉 完成</Text>
                <Text style={styles.bigScore}>{submitResult?.score ?? score}</Text>
                {submitResult ? (
                  <Text style={styles.overlayBody}>
                    亲密度 +{submitResult.xp} XP
                    {submitResult.levelUp && '\n等级提升!'}
                  </Text>
                ) : (
                  <Text style={styles.overlayBody}>正在提交分数…</Text>
                )}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <Pressable style={styles.startBtn} onPress={start}>
                    <Text style={styles.startBtnText}>再来一局</Text>
                  </Pressable>
                  <Pressable style={styles.dismissBtn} onPress={onClose}>
                    <Text style={styles.dismissBtnText}>结束</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  frame: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  close: { color: colors.textSecondary, fontSize: 22, paddingHorizontal: 4 },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  statLabel: { color: colors.textSecondary, fontSize: 12 },
  statValue: { color: colors.accent, fontSize: 16, fontWeight: '700' },
  playArea: {
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  overlayTitle: { color: colors.text, fontSize: 24, fontWeight: '700', marginBottom: 8 },
  overlayBody: { color: colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 22 },
  bigScore: { color: '#a7f3d0', fontSize: 56, fontWeight: '900', marginVertical: 12 },
  startBtn: {
    backgroundColor: '#34d399',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 16,
  },
  startBtnText: { color: '#000', fontSize: 14, fontWeight: '700' },
  dismissBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 16,
  },
  dismissBtnText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  foodItem: {
    position: 'absolute',
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  foodEmoji: { fontSize: 26 },
}));
