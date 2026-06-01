/**
 * AeonSceneScreen — Aeon 2.5D 等距场景(Task 1.8 / R5 / R14.1)。
 *
 * 进入一个地块后展示其房间场景:等距地块背景 + 复用现有 chibi 精灵(PetSpriteImage)
 * 渲染在场角色。实时轨:连 /aeon 网关收 room_state/char_upsert/char_leave;
 * 降级轨:socket.io 不可用 → 轮询 REST 在场态(design "实时 vs 异步双轨")。
 *
 * 身份铁律(R3):每个角色按 badge 渲染 ✋/🤖/🤖+✋/NPC,以服务器下发的
 * isAgentDriven/badge 为准。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, TouchableOpacity, ImageBackground } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { PetSpriteImage } from '../../components/PetSpriteImage';
import { roomImage } from '../../components/aeon/aeonAssets';
import { useActivePet } from '../../services/activePet.service';
import { listRoomsByPlot, getRoomWithPresence } from '../../services/aeon/aeonApi';
import { connectAeonRoom, type AeonRealtimeHandle } from '../../services/aeon/aeonRealtimeClient';
import { AeonTutorialOverlay, useAeonTutorial } from '../../components/aeon/AeonTutorialOverlay';
import type { AeonCharacterSnapshot, AeonServerEvent } from '../../../shared/types/aeon-sync';

const TILE = 40; // 等距格像素
const SPRITE_SIZE = 48;

/** 身份徽章 emoji(R3)。 */
function badgeEmoji(b: AeonCharacterSnapshot['badge']): string {
  switch (b) {
    case 'human': return '✋';
    case 'agent': return '🤖';
    case 'copilot': return '🤖✋';
    case 'npc': return '🟣';
  }
}

export default function AeonSceneScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const activePet = useActivePet();
  const plotId: string = route.params?.plotId;
  const displayName: string = route.params?.displayName ?? '领地';

  const [loading, setLoading] = useState(true);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomKind, setRoomKind] = useState<string>('public');
  const [chars, setChars] = useState<Record<string, AeonCharacterSnapshot>>({});
  const [degraded, setDegraded] = useState(false);
  const handleRef = useRef<AeonRealtimeHandle | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tutorial = useAeonTutorial('aeon_tutorial_scene_v1');

  // 我的角色快照(进入房间用)
  const mySnapshot = useMemo<AeonCharacterSnapshot>(
    () => ({
      charId: activePet.id,
      ownerUserId: activePet.id, // 服务器会以鉴权 userId 覆盖
      controlState: 'manual',
      isAgentDriven: false,
      badge: 'human',
      clan: (activePet.clan as AeonCharacterSnapshot['clan']) ?? 'A',
      x: 5,
      y: 5,
      facing: 'right',
      sprite: 'idle',
      displayName: activePet.name,
    }),
    [activePet],
  );

  const applyServerEvent = useCallback((ev: AeonServerEvent) => {
    setChars((prev) => {
      switch (ev.t) {
        case 'room_state': {
          const next: Record<string, AeonCharacterSnapshot> = {};
          for (const c of ev.chars) next[c.charId] = c;
          return next;
        }
        case 'char_upsert':
          return { ...prev, [ev.char.charId]: ev.char };
        case 'char_leave': {
          const next = { ...prev };
          delete next[ev.charId];
          return next;
        }
        default:
          return prev;
      }
    });
  }, []);

  // 异步降级:轮询 REST 在场态
  const startPolling = useCallback(
    (rid: string) => {
      const poll = async () => {
        try {
          const room = await getRoomWithPresence(rid);
          const next: Record<string, AeonCharacterSnapshot> = {};
          for (const c of room.occupants) next[c.charId] = c;
          setChars(next);
        } catch {
          /* ignore transient */
        }
      };
      void poll();
      pollRef.current = setInterval(poll, 3000);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // 取/建该地块的默认 public 房间
        const rooms = await listRoomsByPlot(plotId);
        const room = rooms[0];
        if (!room) {
          // Phase 1:无房间则提示(建房间在 owner 流程,Task 1.4/1.5 已提供 API)
          if (!cancelled) {
            setRoomId(null);
            setLoading(false);
          }
          return;
        }
        if (cancelled) return;
        setRoomId(room.id);
        setRoomKind((room.kind as string) || 'public');

        // 尝试实时连接
        const handle = connectAeonRoom({
          roomId: room.id,
          snapshot: mySnapshot,
          onServerEvent: applyServerEvent,
          debug: __DEV__,
        });
        handleRef.current = handle;
        if (handle.isDegraded) {
          setDegraded(true);
          startPolling(room.id);
        }
        setLoading(false);
      } catch (e) {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      handleRef.current?.disconnect();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [plotId, mySnapshot, applyServerEvent, startPolling]);

  const occupants = Object.values(chars);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.dim}>进入 {displayName}…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>🏙️ {displayName}</Text>
          <Text style={styles.sub}>
            {degraded ? '异步在场(已降级轮询)' : '实时在场'} · {occupants.length} 人
          </Text>
        </View>
        <TouchableOpacity
          style={styles.buildBtn}
          onPress={() => navigation.navigate('AeonBuild', { plotId, displayName })}
        >
          <Text style={styles.buildBtnText}>🏗️ 建造</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.helpBtn} onPress={() => tutorial.setOpen(true)}>
          <Text style={styles.helpBtnText}>怎么玩?</Text>
        </TouchableOpacity>
      </View>

      {/* 等距场景画布:晨昏暖光房间背景 + 角色站位(真等距 tilemap 后续迭代) */}
      <ImageBackground
        source={roomImage(roomKind)}
        style={styles.canvas}
        imageStyle={styles.canvasBg}
        resizeMode="cover"
      >
        {roomId == null ? (
          <Text style={styles.dim}>这块地还没有房间。回到地图,作为 owner 可创建房间。</Text>
        ) : occupants.length === 0 ? (
          <Text style={styles.dim}>房间安静无人,稍候有居民入场…</Text>
        ) : (
          occupants.map((c) => (
            <View
              key={c.charId}
              style={[
                styles.char,
                { left: (c.x % 8) * TILE + 8, top: (c.y % 8) * TILE + 8 },
              ]}
            >
              <Text style={styles.badge}>{badgeEmoji(c.badge)}</Text>
              {/* 可读性安全网(R15.3):精灵后垫柔和底盘,任意房间背景下角色都能浮出。 */}
              <View style={styles.spriteHalo}>
                <PetSpriteImage
                  sprite={(c.sprite as any) || 'idle'}
                  size={SPRITE_SIZE}
                  clan={c.clan}
                  facing={c.facing}
                />
              </View>
              <Text style={styles.charName} numberOfLines={1}>{c.displayName}</Text>
            </View>
          ))
        )}
      </ImageBackground>

      {/* 在场名单(含身份标识,R3 铁律可一眼区分真人/agent) */}
      <Text style={styles.rosterHeader}>在场</Text>
      <ScrollView style={styles.roster} contentContainerStyle={{ paddingBottom: 24 }}>
        {occupants.map((c) => (
          <View key={c.charId} style={styles.rosterRow}>
            <Text style={styles.rosterBadge}>{badgeEmoji(c.badge)}</Text>
            <Text style={styles.rosterName} numberOfLines={1}>{c.displayName}</Text>
            <Text style={styles.rosterState}>
              {c.badge === 'human' ? '真人' : c.badge === 'npc' ? 'NPC' : c.badge === 'copilot' ? '协同' : 'Agent'}
            </Text>
          </View>
        ))}
      </ScrollView>

      <AeonTutorialOverlay
        storageKey="aeon_tutorial_scene_v1"
        controlledOpen={tutorial.open}
        onClose={() => tutorial.setOpen(false)}
        title="🏙️ 欢迎来到永曜城"
        steps={[
          { icon: '✋', title: '你是真人', body: '你的角色头顶 ✋。带 🤖 的是 agent,带 🟣 的是 NPC —— 一眼区分,绝不混淆。' },
          { icon: '🕹️', title: '动起来', body: '在场景里走动、和身边的人/agent 打招呼。空房会自动有 agent/NPC 填场,不会冷清。' },
          { icon: '🏢', title: '做点有意义的事', body: '进公司打卡上班、在任务广场接单、去市场逛逛 —— 都能赚到 AXP。' },
        ]}
        ctaLabel="开始逛逛"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  center: { flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center' },
  header: { padding: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center' },
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: '700' },
  sub: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  helpBtn: { backgroundColor: colors.bgCard, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: colors.border },
  helpBtnText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  buildBtn: { backgroundColor: colors.accent, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8 },
  buildBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  canvas: {
    height: 8 * TILE + 60,
    margin: 16,
    borderRadius: 14,
    backgroundColor: '#0d1326',
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvasBg: { borderRadius: 14 },
  char: { position: 'absolute', alignItems: 'center', width: SPRITE_SIZE + 16 },
  badge: { fontSize: 12 },
  /**
   * 可读性安全网(R15.3):精灵后一层柔和半透明圆形底盘 + 轻微暗角,
   * 让明亮/纯白角色在任意房间背景(尤其浅色/高饱和)上都能浮出。零美术成本。
   */
  spriteHalo: {
    width: SPRITE_SIZE,
    height: SPRITE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: SPRITE_SIZE / 2,
    backgroundColor: 'rgba(8, 12, 28, 0.28)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  charName: { color: colors.textPrimary, fontSize: 10, maxWidth: SPRITE_SIZE + 16, textAlign: 'center' },
  dim: { color: colors.textMuted, fontSize: 13, paddingHorizontal: 24, textAlign: 'center' },
  rosterHeader: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', paddingHorizontal: 16, marginTop: 4 },
  roster: { flex: 1, paddingHorizontal: 16, marginTop: 8 },
  rosterRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: colors.border, gap: 10 },
  rosterBadge: { fontSize: 16 },
  rosterName: { color: colors.textPrimary, fontSize: 14, flex: 1 },
  rosterState: { color: colors.textMuted, fontSize: 11 },
});
