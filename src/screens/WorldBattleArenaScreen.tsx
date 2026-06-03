/**
 * WorldBattleArenaScreen — Battle visualization and challenge flow.
 *
 * Task 15.2: Implement Battle UI and Dungeon Explorer
 *
 * Features:
 * - Battle visualization with attack effects, damage numbers, health bars
 * - Battle results screen (winner, damage breakdown, MVP skill, XP earned)
 * - Async challenge creation and acceptance flow
 *
 * Requirements: 5.1, 5.2, 5.4, 5.5
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Platform,
  Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRoute } from '@react-navigation/native';
import { createBattle, createBattleChallenge } from '../services/worldEngineApi';

// ============================================================
// Types
// ============================================================

interface BattleParticipant {
  id: string;
  name: string;
  stats: { hp: number; atk: number; def: number; spd: number; int: number };
  level: number;
  styledMeshUrl: string;
}

interface BattleRound {
  roundNumber: number;
  attackerId: string;
  defenderId: string;
  damageDealt: number;
  isCritical: boolean;
  skillUsed?: string;
  attackerHpAfter: number;
  defenderHpAfter: number;
}

interface BattleResult {
  battleId: string;
  winnerSide: 'challenger' | 'defender';
  totalRounds: number;
  rounds: BattleRound[];
  xpAwarded: { winner: number; loser: number };
  challenger: BattleParticipant;
  defender: BattleParticipant;
}

type BattlePhase = 'waiting' | 'fighting' | 'result';

// ============================================================
// Constants
// ============================================================

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ROUND_ANIMATION_MS = 800;

// ============================================================
// Component
// ============================================================

export default function WorldBattleArenaScreen() {
  const navigation = useNavigation();
  const route = useRoute<any>();

  // State
  const [phase, setPhase] = useState<BattlePhase>('waiting');
  const [currentRound, setCurrentRound] = useState(0);
  const [battleResult, setBattleResult] = useState<BattleResult | null>(null);

  // Animated values
  const challengerHpAnim = useRef(new Animated.Value(1)).current;
  const defenderHpAnim = useRef(new Animated.Value(1)).current;
  const damagePopAnim = useRef(new Animated.Value(0)).current;
  const [damageText, setDamageText] = useState('');
  const [damagePosition, setDamagePosition] = useState<'left' | 'right'>('right');

  // ─── Battle simulation ───────────────────────────────────────────────

  const startBattle = useCallback(async () => {
    setPhase('fighting');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    const challengerAssetId = (route.params as any)?.challengerAssetId;
    const defenderAssetId = (route.params as any)?.defenderAssetId;

    if (!challengerAssetId || !defenderAssetId) {
      // 没有选好双方 → 不再跑假战斗, 引导去选人(真实可玩入口)。
      setPhase('waiting');
      Alert.alert(
        '先选择对战双方',
        '请先在"选择对战"里挑好你的角色和对手,再开始战斗。',
        [
          { text: '取消', style: 'cancel' },
          { text: '去选人', onPress: () => (navigation as any).navigate('WorldBattlePicker') },
        ],
      );
      return;
    }

    let result: BattleResult;
    try {
      result = await createBattle({ challengerAssetId, defenderAssetId });
    } catch (err: any) {
      Alert.alert('战斗发起失败', err?.message || '请稍后重试');
      setPhase('waiting');
      return;
    }

    setBattleResult(result);

    // Animate rounds
    for (let i = 0; i < result.rounds.length; i++) {
      await animateRound(result.rounds[i], result);
      setCurrentRound(i + 1);
    }

    // Show result
    setPhase('result');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [route, navigation]);

  const animateRound = (round: BattleRound, result: BattleResult): Promise<void> => {
    return new Promise((resolve) => {
      // Show damage number
      const isAttackerChallenger = round.attackerId === result.challenger.id;
      setDamagePosition(isAttackerChallenger ? 'right' : 'left');
      setDamageText(
        `${round.isCritical ? '暴击! ' : ''}${round.damageDealt}`,
      );

      // Animate damage pop
      damagePopAnim.setValue(0);
      Animated.sequence([
        Animated.timing(damagePopAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(damagePopAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();

      // Animate HP bars
      const challengerHpPercent = round.attackerId === result.challenger.id
        ? round.attackerHpAfter / result.challenger.stats.hp
        : round.defenderHpAfter / result.challenger.stats.hp;
      const defenderHpPercent = round.attackerId === result.defender.id
        ? round.attackerHpAfter / result.defender.stats.hp
        : round.defenderHpAfter / result.defender.stats.hp;

      Animated.parallel([
        Animated.timing(challengerHpAnim, {
          toValue: Math.max(0, challengerHpPercent),
          duration: 300,
          useNativeDriver: false,
        }),
        Animated.timing(defenderHpAnim, {
          toValue: Math.max(0, defenderHpPercent),
          duration: 300,
          useNativeDriver: false,
        }),
      ]).start();

      // Haptic on critical hit
      if (round.isCritical) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      setTimeout(resolve, ROUND_ANIMATION_MS);
    });
  };

  // ─── Challenge flow ──────────────────────────────────────────────────

  const handleCreateChallenge = useCallback(async () => {
    // Sprint P-8 (2026-05-22): real backend challenge creation.
    const challengerAssetId = (route.params as any)?.challengerAssetId;
    if (!challengerAssetId) {
      Alert.alert('需要选择我方资产', '请先选择一个资产再创建挑战');
      return;
    }
    try {
      const { shareLink, expiresAt } = await createBattleChallenge({
        challengerAssetId,
      });
      const expires = new Date(expiresAt).toLocaleString();
      Alert.alert(
        '已创建异步挑战',
        `链接: ${shareLink}\n过期: ${expires}`,
      );
    } catch (e: any) {
      Alert.alert('创建挑战失败', e?.message || '请稍后再试');
    }
  }, [route]);

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>⚔️ 战斗竞技场</Text>
        <Text style={styles.roundText}>
          {phase === 'fighting' ? `第 ${currentRound} 回合` : ''}
        </Text>
      </View>

      {/* Battle Arena */}
      <View style={styles.arena}>
        {/* Challenger (left) */}
        <View style={styles.participantSide}>
          <View style={styles.characterAvatar}>
            <Text style={styles.avatarEmoji}>🔥</Text>
          </View>
          <Text style={styles.characterName}>
            {battleResult?.challenger.name || '选择角色'}
          </Text>
          <View style={styles.hpBarContainer}>
            <Animated.View
              style={[
                styles.hpBar,
                styles.hpBarChallenger,
                {
                  width: challengerHpAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
        </View>

        {/* VS */}
        <View style={styles.vsContainer}>
          <Text style={styles.vsText}>VS</Text>
          {/* Damage pop */}
          <Animated.View
            style={[
              styles.damagePop,
              damagePosition === 'right' ? styles.damagePopRight : styles.damagePopLeft,
              {
                opacity: damagePopAnim,
                transform: [
                  {
                    translateY: damagePopAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -30],
                    }),
                  },
                  {
                    scale: damagePopAnim.interpolate({
                      inputRange: [0, 0.5, 1],
                      outputRange: [0.5, 1.3, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <Text style={styles.damageText}>{damageText}</Text>
          </Animated.View>
        </View>

        {/* Defender (right) */}
        <View style={styles.participantSide}>
          <View style={styles.characterAvatar}>
            <Text style={styles.avatarEmoji}>❄️</Text>
          </View>
          <Text style={styles.characterName}>
            {battleResult?.defender.name || '等待对手'}
          </Text>
          <View style={styles.hpBarContainer}>
            <Animated.View
              style={[
                styles.hpBar,
                styles.hpBarDefender,
                {
                  width: defenderHpAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
        </View>
      </View>

      {/* Result Panel */}
      {phase === 'result' && battleResult && (
        <View style={styles.resultPanel}>
          <Text style={styles.resultTitle}>
            🏆 {battleResult.winnerSide === 'challenger'
              ? battleResult.challenger.name
              : battleResult.defender.name} 获胜！
          </Text>
          <View style={styles.resultStats}>
            <Text style={styles.resultStat}>
              回合数: {battleResult.totalRounds}
            </Text>
            <Text style={styles.resultStat}>
              胜者 XP: +{battleResult.xpAwarded.winner}
            </Text>
            <Text style={styles.resultStat}>
              败者 XP: +{battleResult.xpAwarded.loser}
            </Text>
          </View>
          <View style={styles.resultActions}>
            <TouchableOpacity
              style={styles.resultButton}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.resultButtonText}>返回</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.resultButton, styles.resultButtonPrimary]}
              onPress={startBattle}
            >
              <Text style={styles.resultButtonTextPrimary}>再战一次</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Action Buttons */}
      {phase === 'waiting' && (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.battleButton} onPress={startBattle}>
            <Text style={styles.battleButtonText}>⚔️ 开始战斗</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.challengeButton} onPress={handleCreateChallenge}>
            <Text style={styles.challengeButtonText}>📤 创建异步挑战</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ============================================================
// Styles
// ============================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  roundText: {
    color: '#6c5ce7',
    fontSize: 14,
    fontWeight: '600',
  },
  // Arena
  arena: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
  },
  participantSide: {
    alignItems: 'center',
    width: SCREEN_WIDTH * 0.35,
  },
  characterAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  avatarEmoji: {
    fontSize: 36,
  },
  characterName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  hpBarContainer: {
    width: '100%',
    height: 8,
    backgroundColor: '#333',
    borderRadius: 4,
    overflow: 'hidden',
  },
  hpBar: {
    height: '100%',
    borderRadius: 4,
  },
  hpBarChallenger: {
    backgroundColor: '#4CAF50',
  },
  hpBarDefender: {
    backgroundColor: '#f44336',
  },
  // VS
  vsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  vsText: {
    color: '#666',
    fontSize: 24,
    fontWeight: '900',
  },
  damagePop: {
    position: 'absolute',
  },
  damagePopRight: {
    right: -60,
  },
  damagePopLeft: {
    left: -60,
  },
  damageText: {
    color: '#ff5252',
    fontSize: 18,
    fontWeight: '900',
  },
  // Result
  resultPanel: {
    backgroundColor: '#1a1a2e',
    margin: 20,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  resultTitle: {
    color: '#FFD700',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
  resultStats: {
    gap: 4,
    marginBottom: 16,
  },
  resultStat: {
    color: '#aaa',
    fontSize: 14,
    textAlign: 'center',
  },
  resultActions: {
    flexDirection: 'row',
    gap: 12,
  },
  resultButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#333',
  },
  resultButtonPrimary: {
    backgroundColor: '#6c5ce7',
  },
  resultButtonText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
  },
  resultButtonTextPrimary: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Actions
  actions: {
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    gap: 12,
  },
  battleButton: {
    backgroundColor: '#6c5ce7',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  battleButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  challengeButton: {
    backgroundColor: '#1a1a2e',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  challengeButtonText: {
    color: '#6c5ce7',
    fontSize: 14,
    fontWeight: '600',
  },
});
