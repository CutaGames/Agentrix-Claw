/**
 * PongRoom — 权威实时对战 Pong 客户端(路径 A)。
 *
 * 服务器(/arcade)拥有球/拍/分数的权威模拟(30Hz);本端只发输入方向(拖动控拍),
 * 渲染收到的权威快照。座位由服务器分配(先到=左,次到=右,其余观战)。
 * 实时动作类联机的最小可玩证明。
 */
import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Dimensions, PanResponder } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { useAuthStore } from '../../stores/authStore';
import { connectArcade, type ArcadeHandle } from '../../services/arcadeRealtime';
import { ARCADE, type PongState, type PongSide } from '../../../shared/types/arcade';
import { themedStyles } from '../../theme/useTheme';

export default function PongRoom({
  creationId,
  title,
  t,
}: {
  creationId: string;
  title?: string;
  t: (d: { zh: string; en: string }) => string;
}) {
  const user = useAuthStore((s) => s.user);
  const displayName = user?.nickname || user?.agentrixId || '玩家';

  const [state, setState] = useState<PongState | null>(null);
  const [connected, setConnected] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const handleRef = useRef<ArcadeHandle | null>(null);
  const stateRef = useRef<PongState | null>(null);

  // 渲染尺寸:保持球场宽高比。
  const screenW = Dimensions.get('window').width;
  const fieldW = Math.min(screenW - 16, 360);
  const scale = fieldW / ARCADE.FIELD_W;
  const fieldH = ARCADE.FIELD_H * scale;

  useFocusEffect(
    useCallback(() => {
      setState(null); stateRef.current = null;
      const handle = connectArcade({
        roomId: `pong-${creationId}`,
        displayName,
        onConnectionChange: setConnected,
        onState: (s) => { stateRef.current = s; setState(s); },
      });
      handleRef.current = handle;
      setDegraded(handle.isDegraded);
      return () => { handle.disconnect(); handleRef.current = null; };
    }, [creationId, displayName]),
  );

  // 拖动控拍:把触摸 Y 映射到球场坐标,与我方拍中心比较 → dir(-1/0/1)。
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_evt, gesture) => {
        const s = stateRef.current;
        if (!s || (s.you !== 'l' && s.you !== 'r')) return;
        // gesture.moveY 是屏幕坐标;用相对移动方向也可,但用 dy 速度判断方向更稳。
        const dy = gesture.vy; // 垂直速度
        let dir: -1 | 0 | 1 = 0;
        if (dy < -0.05) dir = -1; else if (dy > 0.05) dir = 1; else dir = 0;
        handleRef.current?.sendInput(dir);
      },
      onPanResponderRelease: () => handleRef.current?.sendInput(0),
      onPanResponderTerminate: () => handleRef.current?.sendInput(0),
    }),
  ).current;

  // 备用按钮控制(更精确):按住上/下。
  const press = (dir: -1 | 0 | 1) => handleRef.current?.sendInput(dir);

  const you: PongSide = state?.you ?? 'spec';
  const seatLabel = (side: 'l' | 'r') => {
    const n = state?.seats?.[side];
    if (n) return n;
    return state?.status === 'playing' ? 'AI' : t({ en: 'open', zh: '空位' });
  };
  let status = '';
  if (degraded) status = t({ en: 'Realtime unavailable on this build.', zh: '当前版本实时不可用。' });
  else if (!state || !connected) status = t({ en: 'Connecting…', zh: '连接中…' });
  else if (state.winner) status = `${state.winner === you ? t({ en: 'You win! 🏆', zh: '你赢了!🏆' }) : t({ en: 'You lose', zh: '你输了' })}`;
  else if (you === 'spec') status = t({ en: 'Spectating', zh: '观战中' });
  else status = t({ en: 'Drag or hold ▲▼ to move your paddle (vs AI until an opponent joins)', zh: '拖动或按住 ▲▼ 移动球拍(无对手时与 AI 对战)' });

  const ballPx = state ? { left: state.ball.x * scale - ARCADE.BALL_R * scale, top: state.ball.y * scale - ARCADE.BALL_R * scale } : null;
  const padLPx = state ? state.paddles.l * scale : fieldH / 2;
  const padRPx = state ? state.paddles.r * scale : fieldH / 2;
  const padHPx = ARCADE.PADDLE_H * scale;
  const padWPx = Math.max(4, ARCADE.PADDLE_W * scale);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>🏓 {title || t({ en: 'Pong', zh: '弹球对战' })}</Text>
        <View style={styles.metaRow}>
          <View style={[styles.dot, { backgroundColor: connected ? '#43d17a' : '#888' }]} />
          <Text style={styles.metaText}>{state?.occupants ?? 0} {t({ en: 'in room', zh: '在房' })}</Text>
        </View>
      </View>

      <View style={styles.scoreRow}>
        <Text style={[styles.score, you === 'l' && styles.scoreYou]}>{seatLabel('l')}  {state?.score.l ?? 0}</Text>
        <Text style={styles.vs}>:</Text>
        <Text style={[styles.score, you === 'r' && styles.scoreYou]}>{state?.score.r ?? 0}  {seatLabel('r')}</Text>
      </View>

      <Text style={styles.status}>{status}</Text>

      {!state && !degraded ? (
        <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
      ) : (
        <View style={[styles.field, { width: fieldW, height: fieldH }]} {...panResponder.panHandlers} testID="pong-field">
          <View style={styles.midline} />
          {/* 左拍 */}
          <View style={[styles.paddle, { width: padWPx, height: padHPx, left: 2, top: padLPx - padHPx / 2 }]} />
          {/* 右拍 */}
          <View style={[styles.paddle, { width: padWPx, height: padHPx, right: 2, top: padRPx - padHPx / 2 }]} />
          {/* 球 */}
          {ballPx ? <View style={[styles.ball, { width: ARCADE.BALL_R * 2 * scale, height: ARCADE.BALL_R * 2 * scale, borderRadius: ARCADE.BALL_R * scale, left: ballPx.left, top: ballPx.top }]} /> : null}
        </View>
      )}

      {/* 控制:按住上/下(拖动也可) */}
      {(you === 'l' || you === 'r') ? (
        <View style={styles.controls}>
          <TouchableOpacity style={styles.ctrlBtn} onPressIn={() => press(-1)} onPressOut={() => press(0)} testID="pong-up"><Text style={styles.ctrlText}>▲</Text></TouchableOpacity>
          <TouchableOpacity style={styles.ctrlBtn} onPressIn={() => press(1)} onPressOut={() => press(0)} testID="pong-down"><Text style={styles.ctrlText}>▼</Text></TouchableOpacity>
        </View>
      ) : null}

      {state?.winner ? (
        <TouchableOpacity style={styles.restartBtn} onPress={() => handleRef.current?.restart()} testID="pong-restart">
          <Text style={styles.restartText}>↻ {t({ en: 'Rematch', zh: '再来一局' })}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', paddingTop: 8 },
  header: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 8 },
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: '800', flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  metaText: { color: colors.textMuted, fontSize: 12 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  score: { color: colors.textPrimary, fontSize: 15, fontWeight: '700' },
  scoreYou: { color: colors.accent },
  vs: { color: colors.textMuted, fontSize: 15, fontWeight: '700' },
  status: { color: colors.accent, fontSize: 13, fontWeight: '600', paddingVertical: 6, textAlign: 'center', paddingHorizontal: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  field: { backgroundColor: '#0e1016', borderRadius: 8, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  midline: { position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, backgroundColor: '#2a2f3a' },
  paddle: { position: 'absolute', backgroundColor: colors.accent, borderRadius: 2 },
  ball: { position: 'absolute', backgroundColor: '#fff' },
  controls: { flexDirection: 'row', gap: 24, marginTop: 14 },
  ctrlBtn: { width: 76, height: 56, borderRadius: 12, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  ctrlText: { color: colors.accent, fontSize: 24, fontWeight: '800' },
  restartBtn: { marginTop: 14, backgroundColor: colors.bgCard, borderRadius: 10, paddingHorizontal: 22, paddingVertical: 10, borderWidth: 1, borderColor: colors.border },
  restartText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
}));
