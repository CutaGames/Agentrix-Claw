/**
 * WorldDungeonExplorerScreen — Dungeon exploration with fog of war.
 *
 * Task 15.2: Implement Dungeon Explorer
 *
 * Features:
 * - Dungeon exploration with fog of war
 * - Enemy encounters and loot collection
 * - Share code entry for friend dungeons
 *
 * Requirements: 4.2, 4.7
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  Dimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { getDungeonByCode, attemptDungeon, listWorldAssets } from '../services/worldEngineApi';

// ============================================================
// Types
// ============================================================

interface DungeonRoom {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  theme: 'fire' | 'dream' | 'data' | 'neutral';
  explored: boolean;
  hasBoss: boolean;
  hasLoot: boolean;
  enemies: number;
  cleared?: boolean;
}

// ============================================================
// Component
// ============================================================

export default function WorldDungeonExplorerScreen() {
  const navigation = useNavigation();

  const [shareCode, setShareCode] = useState('');
  const [isExploring, setIsExploring] = useState(false);
  const [rooms, setRooms] = useState<DungeonRoom[]>([]);
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);
  const [myAssetId, setMyAssetId] = useState<string | null>(null);

  // 载入玩家第一个角色作为副本闯关者(打房间怪用)。
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const r = await listWorldAssets({ category: 'character', sort: 'level', limit: 1 });
          if (!cancelled) setMyAssetId(r.items?.[0]?.id ?? null);
        } catch { /* ignore */ }
      })();
      return () => { cancelled = true; };
    }, []),
  );

  // ─── Enter dungeon by share code ────────────────────────────────────

  const handleEnterDungeon = useCallback(async () => {
    if (!shareCode || shareCode.length < 6) {
      Alert.alert('无效代码', '请输入 6-12 位副本代码');
      return;
    }

    // Sprint P-8 (2026-05-22): real backend dungeon load + attempt.
    try {
      const dungeon = await getDungeonByCode(shareCode.trim().toUpperCase());
      await attemptDungeon(shareCode.trim().toUpperCase());
      setIsExploring(true);

      // Convert backend layout to local room format. The backend may
      // return either a structured `layout.rooms` array or a stub —
      // gracefully handle both by mapping known fields and falling
      // back to a 1-room demo if the layout is unrecognizable.
      const layoutRooms = (dungeon.layout?.rooms ?? []) as any[];
      if (layoutRooms.length > 0) {
        setRooms(
          layoutRooms.map((r, idx) => ({
            id: r.id ?? `r${idx}`,
            x: r.x ?? idx * 3,
            y: r.y ?? 0,
            width: r.width ?? 3,
            height: r.height ?? 3,
            theme: r.theme ?? 'neutral',
            explored: idx === 0,
            hasBoss: !!r.hasBoss,
            hasLoot: !!r.hasLoot,
            enemies: r.enemies ?? 3,
          })),
        );
        setCurrentRoom(layoutRooms[0].id ?? 'r0');
      } else {
        // Fallback: single placeholder room.
        setRooms([
          {
            id: 'r0', x: 0, y: 0, width: 3, height: 3, theme: 'neutral',
            explored: true, hasBoss: false, hasLoot: false, enemies: 3,
          },
        ]);
        setCurrentRoom('r0');
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert('副本加载失败', err?.message || '请确认代码是否正确');
    }
  }, [shareCode]);

  // ─── Room exploration ────────────────────────────────────────────────

  const handleExploreRoom = useCallback((roomId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCurrentRoom(roomId);
    setRooms((prev) =>
      prev.map((r) => (r.id === roomId ? { ...r, explored: true } : r)),
    );
    const room = rooms.find((r) => r.id === roomId);
    if (!room) return;
    // 房间→战斗打通:有怪/BOSS 且未清的房间,进入即开打(PvE 训练战引擎,
    // 房间主题/BOSS 决定难度)。打赢标记 cleared,可拿战利品。
    if (!room.cleared && (room.enemies > 0 || room.hasBoss)) {
      if (!myAssetId) {
        Alert.alert('需要一个角色', '先去扫描生成一个角色,才能进副本战斗。', [
          { text: '去扫描', onPress: () => (navigation as any).navigate('WorldEngineScanner') },
          { text: '取消', style: 'cancel' },
        ]);
        return;
      }
      const difficulty: 'easy' | 'normal' | 'hard' = room.hasBoss ? 'hard' : room.enemies >= 3 ? 'normal' : 'easy';
      Alert.alert(
        room.hasBoss ? '👹 BOSS 房间' : '⚔️ 遭遇敌人',
        `这个房间有 ${room.enemies} 个敌人${room.hasBoss ? ' + 1 个 BOSS' : ''}。开打?`,
        [
          { text: '稍后', style: 'cancel' },
          {
            text: '开战',
            onPress: () => (navigation as any).navigate('WorldInteractiveBattle', {
              challengerAssetId: myAssetId,
              defenderAssetId: myAssetId,
              training: true,
              difficulty,
              challengerName: '你的角色',
              defenderName: room.hasBoss ? '副本 BOSS' : '副本守卫',
              dungeonRoomId: roomId,
            }),
          },
        ],
      );
    }
  }, [rooms, myAssetId, navigation]);

  // ─── Generate from scan ──────────────────────────────────────────────

  const handleGenerateFromScan = useCallback(() => {
    // Sprint P-8: navigate to room scan mode. The dungeon is generated
    // from the resulting scan session via /dungeons/generate (the
    // scanner doesn't auto-call this; the inventory list shows the
    // generated dungeon after scan completion).
    (navigation as any).navigate('WorldEngineScanner');
  }, [navigation]);

  // ─── Render ──────────────────────────────────────────────────────────

  if (!isExploring) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>🏰 副本探索</Text>
        </View>

        <View style={styles.entryPanel}>
          {/* Enter by code */}
          <Text style={styles.sectionTitle}>输入副本代码</Text>
          <View style={styles.codeInputRow}>
            <TextInput
              style={styles.codeInput}
              value={shareCode}
              onChangeText={setShareCode}
              placeholder="6-12位代码"
              placeholderTextColor="#666"
              maxLength={12}
              autoCapitalize="characters"
            />
            <TouchableOpacity style={styles.enterButton} onPress={handleEnterDungeon}>
              <Text style={styles.enterButtonText}>进入</Text>
            </TouchableOpacity>
          </View>

          {/* Generate from scan */}
          <Text style={[styles.sectionTitle, { marginTop: 32 }]}>生成新副本</Text>
          <TouchableOpacity style={styles.generateButton} onPress={handleGenerateFromScan}>
            <Text style={styles.generateButtonText}>📷 扫描房间生成副本</Text>
          </TouchableOpacity>
          <Text style={styles.generateHint}>
            扫描您的房间，AI 将根据房间布局生成独特的副本关卡
          </Text>
        </View>
      </View>
    );
  }

  // Dungeon exploration view
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setIsExploring(false)}>
          <Text style={styles.backText}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🏰 探索中</Text>
      </View>

      {/* Dungeon map */}
      <View style={styles.dungeonMap}>
        {rooms.map((room) => (
          <TouchableOpacity
            key={room.id}
            style={[
              styles.roomCell,
              room.explored && styles.roomExplored,
              currentRoom === room.id && styles.roomCurrent,
              !room.explored && styles.roomFog,
            ]}
            onPress={() => handleExploreRoom(room.id)}
            disabled={!room.explored && currentRoom !== room.id}
          >
            {room.explored ? (
              <>
                <Text style={styles.roomThemeIcon}>
                  {room.theme === 'fire' ? '🔥' : room.theme === 'dream' ? '💫' : room.theme === 'data' ? '💻' : '⬜'}
                </Text>
                {room.hasBoss && <Text style={styles.roomBossIcon}>👹</Text>}
                {room.hasLoot && <Text style={styles.roomLootIcon}>💎</Text>}
                <Text style={styles.roomEnemyCount}>×{room.enemies}</Text>
              </>
            ) : (
              <Text style={styles.fogText}>?</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Current room info */}
      {currentRoom && (
        <View style={styles.roomInfo}>
          {(() => {
            const room = rooms.find((r) => r.id === currentRoom);
            if (!room) return null;
            return (
              <>
                <Text style={styles.roomInfoTitle}>
                  {room.theme === 'fire' ? '🔥 火焰房间' : room.theme === 'dream' ? '💫 梦境房间' : room.theme === 'data' ? '💻 数据房间' : '⬜ 中性房间'}
                </Text>
                <Text style={styles.roomInfoDetail}>
                  敌人: {room.enemies} | {room.hasLoot ? '有宝箱' : '无宝箱'} | {room.hasBoss ? 'BOSS房' : '普通房'}
                </Text>
              </>
            );
          })()}
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
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  backText: {
    color: '#6c5ce7',
    fontSize: 14,
  },
  // Entry panel
  entryPanel: {
    padding: 20,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  codeInputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  codeInput: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 16,
    letterSpacing: 2,
  },
  enterButton: {
    backgroundColor: '#6c5ce7',
    borderRadius: 12,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  enterButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  generateButton: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#6c5ce7',
    borderStyle: 'dashed',
  },
  generateButtonText: {
    color: '#6c5ce7',
    fontSize: 15,
    fontWeight: '600',
  },
  generateHint: {
    color: '#666',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  // Dungeon map
  dungeonMap: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 20,
    gap: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roomCell: {
    width: 100,
    height: 100,
    borderRadius: 12,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#333',
  },
  roomExplored: {
    borderColor: '#4CAF50',
  },
  roomCurrent: {
    borderColor: '#6c5ce7',
    borderWidth: 3,
  },
  roomFog: {
    backgroundColor: '#111',
    borderColor: '#222',
  },
  roomThemeIcon: {
    fontSize: 24,
  },
  roomBossIcon: {
    fontSize: 16,
    position: 'absolute',
    top: 8,
    right: 8,
  },
  roomLootIcon: {
    fontSize: 14,
    position: 'absolute',
    bottom: 8,
    right: 8,
  },
  roomEnemyCount: {
    color: '#f44336',
    fontSize: 11,
    position: 'absolute',
    bottom: 8,
    left: 8,
  },
  fogText: {
    color: '#444',
    fontSize: 24,
    fontWeight: '700',
  },
  // Room info
  roomInfo: {
    backgroundColor: '#1a1a2e',
    margin: 20,
    borderRadius: 12,
    padding: 16,
  },
  roomInfoTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  roomInfoDetail: {
    color: '#888',
    fontSize: 13,
  },
});
