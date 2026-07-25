/**
 * GomokuRoom — 回合制多人五子棋(路径 B:复用 /aeon 实时层做共享状态)。
 *
 * - 进入 = JOIN 普通房间 `game-go-<creationId>`(非舞台房,不触发主播/host 逻辑)。
 * - 座位:房间内真人按 charId 升序排序,seat0=黑(先手),seat1=白,其余为观战。
 * - 走子:客户端发 `action`(JSON {k:'mv',x,y}),服务器转发给房间其它人;各端本地落子。
 *   轮次/合法性客户端校验(回合制低风险);胜负(五连)客户端判定。
 * - 新人加入:seat0 广播 {k:'sync',mv:[...]} 让其对齐当前棋局。
 * - 纯客户端规则(无服务器权威):适合回合制休闲;真竞技/防作弊需权威 game server。
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { useAuthStore } from '../../stores/authStore';
import { connectAeonRoom, type AeonRoomHandle } from '../../services/aeonRealtime';
import type { AeonServerEvent, AeonCharacterSnapshot } from '../../../shared/types/aeon-sync';
import { themedStyles } from '../../theme/useTheme';

const SIZE = 15; // 15x15 标准棋盘
type Cell = 'B' | 'W';
interface Move { x: number; y: number }

function buildBoard(moves: Move[]): Record<string, Cell> {
  const b: Record<string, Cell> = {};
  moves.forEach((m, i) => { b[`${m.x}-${m.y}`] = i % 2 === 0 ? 'B' : 'W'; });
  return b;
}

/** 从最后一手判断是否五连。 */
function checkWin(board: Record<string, Cell>, x: number, y: number, color: Cell): boolean {
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (const [dx, dy] of dirs) {
    let count = 1;
    for (let s = 1; s < 5; s++) { if (board[`${x + dx * s}-${y + dy * s}`] === color) count++; else break; }
    for (let s = 1; s < 5; s++) { if (board[`${x - dx * s}-${y - dy * s}`] === color) count++; else break; }
    if (count >= 5) return true;
  }
  return false;
}

const inBounds = (x: number, y: number) => x >= 0 && x < SIZE && y >= 0 && y < SIZE;

/** 某连子形态的价值(count 连子数,opens 两端开放数)。 */
function patternValue(count: number, opens: number): number {
  if (count >= 5) return 100000;
  if (count === 4) return opens === 2 ? 50000 : opens === 1 ? 6000 : 0;
  if (count === 3) return opens === 2 ? 5000 : opens === 1 ? 400 : 0;
  if (count === 2) return opens === 2 ? 300 : opens === 1 ? 40 : 0;
  if (count === 1) return opens === 2 ? 20 : 5;
  return 0;
}

/** 在 (x,y) 落 color 的四方向形态总分。 */
function scoreCell(board: Record<string, Cell>, x: number, y: number, color: Cell): number {
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
  let total = 0;
  for (const [dx, dy] of dirs) {
    let count = 1;
    let a = 1; while (board[`${x + dx * a}-${y + dy * a}`] === color) { count++; a++; }
    const openA = inBounds(x + dx * a, y + dy * a) && !board[`${x + dx * a}-${y + dy * a}`];
    let b = 1; while (board[`${x - dx * b}-${y - dy * b}`] === color) { count++; b++; }
    const openB = inBounds(x - dx * b, y - dy * b) && !board[`${x - dx * b}-${y - dy * b}`];
    total += patternValue(count, (openA ? 1 : 0) + (openB ? 1 : 0));
  }
  return total;
}

/** 启发式单机 AI(白方):候选取已有棋子附近空位,攻防加权取最高分。 */
function aiMove(moves: Move[]): Move | null {
  const board = buildBoard(moves);
  if (moves.length === 0) return { x: 7, y: 7 };
  const cand = new Set<string>();
  for (const m of moves) {
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
      const nx = m.x + dx, ny = m.y + dy;
      if (inBounds(nx, ny) && !board[`${nx}-${ny}`]) cand.add(`${nx}-${ny}`);
    }
  }
  let best: Move | null = null; let bestScore = -1;
  for (const key of cand) {
    const [x, y] = key.split('-').map(Number);
    const atk = scoreCell(board, x, y, 'W');       // 自己进攻
    const def = scoreCell(board, x, y, 'B') * 0.95; // 防守对手
    const score = Math.max(atk, def) + Math.min(atk, def) * 0.1 + Math.random() * 3;
    if (score > bestScore) { bestScore = score; best = { x, y }; }
  }
  return best;
}

export default function GomokuRoom({
  creationId,
  title,
  t,
}: {
  creationId: string;
  title?: string;
  t: (d: { zh: string; en: string }) => string;
}) {
  const user = useAuthStore((s) => s.user);
  const selfCharId = `c-${user?.id ?? 'guest'}`;
  const displayName = user?.nickname || user?.agentrixId || '玩家';

  const [moves, setMoves] = useState<Move[]>([]);
  const [chars, setChars] = useState<Record<string, AeonCharacterSnapshot>>({});
  const [winner, setWinner] = useState<Cell | null>(null);
  const [connected, setConnected] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const handleRef = useRef<AeonRoomHandle | null>(null);
  const movesRef = useRef<Move[]>([]);
  const prevCount = useRef(0);

  const setMovesBoth = useCallback((next: Move[]) => {
    movesRef.current = next;
    setMoves(next);
    if (next.length > 0) {
      const last = next[next.length - 1];
      const color: Cell = (next.length - 1) % 2 === 0 ? 'B' : 'W';
      if (checkWin(buildBoard(next), last.x, last.y, color)) setWinner(color);
      else setWinner(null);
    } else {
      setWinner(null);
    }
  }, []);

  // 座位:真人按 charId 升序 → seat0 黑、seat1 白。
  const humans = useMemo(
    () => Object.values(chars).filter((c) => c.badge === 'human').sort((a, b) => a.charId.localeCompare(b.charId)),
    [chars],
  );
  const seatIndex = humans.findIndex((c) => c.charId === selfCharId);
  // 单人(无第二个真人)→ vs AI 模式:我固定执黑先手,AI 执白。
  const vsAI = humans.length < 2;
  const myColor: Cell | null = vsAI ? 'B' : seatIndex === 0 ? 'B' : seatIndex === 1 ? 'W' : null;
  const board = useMemo(() => buildBoard(moves), [moves]);
  const currentColor: Cell = moves.length % 2 === 0 ? 'B' : 'W';
  const myTurn = vsAI
    ? !winner && currentColor === 'B'
    : !!myColor && !winner && currentColor === myColor && humans.length >= 2;

  // vs AI:轮到白(AI)时,本地算一手并落子(并广播,便于观战者同步)。
  const aiThinking = useRef(false);
  React.useEffect(() => {
    if (!vsAI || winner) return;
    if (currentColor !== 'W') return;
    if (aiThinking.current) return;
    aiThinking.current = true;
    const tmr = setTimeout(() => {
      const cur = movesRef.current;
      const mv = aiMove(cur);
      if (mv && !buildBoard(cur)[`${mv.x}-${mv.y}`]) {
        setMovesBoth([...cur, mv]);
        handleRef.current?.sendAction(JSON.stringify({ k: 'mv', x: mv.x, y: mv.y }));
      }
      aiThinking.current = false;
    }, 450);
    return () => { clearTimeout(tmr); aiThinking.current = false; };
  }, [vsAI, winner, currentColor, moves.length, setMovesBoth]);

  useFocusEffect(
    useCallback(() => {
      setMoves([]); movesRef.current = []; setChars({}); setWinner(null); prevCount.current = 0;

      const handle = connectAeonRoom({
        roomId: `game-go-${creationId}`,
        charId: selfCharId,
        displayName,
        onConnectionChange: setConnected,
        onServerEvent: (ev: AeonServerEvent) => {
          switch (ev.t) {
            case 'room_state': {
              const map: Record<string, AeonCharacterSnapshot> = {};
              for (const c of ev.chars) map[c.charId] = c;
              setChars(map);
              prevCount.current = ev.chars.length;
              break;
            }
            case 'char_upsert': {
              setChars((prev) => {
                const next = { ...prev, [ev.char.charId]: ev.char };
                const cnt = Object.keys(next).length;
                // 我是 seat0(黑)且有新人加入 → 广播当前棋局对齐。
                const humansNow = Object.values(next).filter((c) => c.badge === 'human').sort((a, b) => a.charId.localeCompare(b.charId));
                if (cnt > prevCount.current && humansNow[0]?.charId === selfCharId && movesRef.current.length > 0) {
                  handleRef.current?.sendAction(JSON.stringify({ k: 'sync', mv: movesRef.current }));
                }
                prevCount.current = cnt;
                return next;
              });
              break;
            }
            case 'char_leave': {
              setChars((prev) => { const n = { ...prev }; delete n[ev.charId]; prevCount.current = Math.max(0, prevCount.current - 1); return n; });
              break;
            }
            case 'action': {
              if (ev.fromCharId === selfCharId) break;
              let msg: any; try { msg = JSON.parse(ev.action); } catch { break; }
              if (msg?.k === 'mv' && Number.isInteger(msg.x) && Number.isInteger(msg.y)) {
                const cur = movesRef.current;
                if (!buildBoard(cur)[`${msg.x}-${msg.y}`]) setMovesBoth([...cur, { x: msg.x, y: msg.y }]);
              } else if (msg?.k === 'restart') {
                setMovesBoth([]);
              } else if (msg?.k === 'sync' && Array.isArray(msg.mv)) {
                if (msg.mv.length > movesRef.current.length) setMovesBoth(msg.mv);
              }
              break;
            }
            default: break;
          }
        },
      });
      handleRef.current = handle;
      setDegraded(handle.isDegraded);
      return () => { handle.disconnect(); handleRef.current = null; };
    }, [creationId, selfCharId, displayName, setMovesBoth]),
  );

  const onTapCell = useCallback((x: number, y: number) => {
    if (!myTurn) return;
    if (board[`${x}-${y}`]) return;
    const next = [...movesRef.current, { x, y }];
    setMovesBoth(next);
    handleRef.current?.sendAction(JSON.stringify({ k: 'mv', x, y }));
  }, [myTurn, board, setMovesBoth]);

  const onRestart = useCallback(() => {
    setMovesBoth([]);
    handleRef.current?.sendAction(JSON.stringify({ k: 'restart' }));
  }, [setMovesBoth]);

  const screenW = Dimensions.get('window').width;
  const boardW = Math.min(screenW - 16, 380);
  const cell = Math.floor(boardW / SIZE);
  const blackName = humans[0]?.displayName ?? t({ en: 'Waiting', zh: '等待' });
  const whiteName = vsAI ? 'AI' : humans[1]?.displayName ?? t({ en: 'Waiting', zh: '等待' });

  let statusText: string;
  if (degraded) statusText = t({ en: 'Single-player vs AI (you are black).', zh: '单机 vs AI(你执黑)。' });
  else if (winner) statusText = `${winner === 'B' ? '⚫' : '⚪'} ${winner === myColor ? t({ en: 'You win!', zh: '你赢了!' }) : vsAI ? t({ en: 'AI wins', zh: 'AI 获胜' }) : t({ en: 'wins', zh: '获胜' })}`;
  else if (vsAI) statusText = myTurn ? t({ en: 'Your move (vs AI). An opponent can join anytime.', zh: '轮到你落子(vs AI)。有人加入即转双人对战。' }) : t({ en: 'AI is thinking…', zh: 'AI 思考中…' });
  else if (myColor) statusText = myTurn ? t({ en: 'Your move', zh: '轮到你落子' }) : t({ en: "Opponent's move", zh: '等待对方落子' });
  else statusText = t({ en: 'Spectating', zh: '观战中' });

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>♟️ {title || t({ en: 'Gomoku', zh: '五子棋' })}</Text>
        <View style={styles.metaRow}>
          <View style={[styles.dot, { backgroundColor: connected ? '#43d17a' : '#888' }]} />
          <Text style={styles.metaText}>{Object.keys(chars).length} {t({ en: 'in room', zh: '在房' })}</Text>
        </View>
      </View>

      <View style={styles.seats}>
        <View style={[styles.seat, currentColor === 'B' && !winner && humans.length >= 2 && styles.seatActive]}>
          <Text style={styles.seatStone}>⚫</Text>
          <Text style={styles.seatName} numberOfLines={1}>{blackName}{myColor === 'B' ? t({ en: ' (you)', zh: '(你)' }) : ''}</Text>
        </View>
        <View style={[styles.seat, currentColor === 'W' && !winner && humans.length >= 2 && styles.seatActive]}>
          <Text style={styles.seatStone}>⚪</Text>
          <Text style={styles.seatName} numberOfLines={1}>{whiteName}{myColor === 'W' ? t({ en: ' (you)', zh: '(你)' }) : ''}</Text>
        </View>
      </View>

      <Text style={styles.status}>{statusText}</Text>

      {!connected && !degraded ? (
        <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
      ) : (
        <View style={[styles.board, { width: cell * SIZE, height: cell * SIZE }]} testID="gomoku-board">
          {Array.from({ length: SIZE }).map((_, y) => (
            <View key={y} style={{ flexDirection: 'row' }}>
              {Array.from({ length: SIZE }).map((__, x) => {
                const v = board[`${x}-${y}`];
                return (
                  <TouchableOpacity
                    key={x}
                    activeOpacity={0.7}
                    style={[styles.cell, { width: cell, height: cell }]}
                    onPress={() => onTapCell(x, y)}
                    disabled={!myTurn || !!v}
                    testID={`go-cell-${x}-${y}`}
                  >
                    {v ? <View style={[styles.stone, { width: cell - 4, height: cell - 4, borderRadius: cell }, v === 'B' ? styles.black : styles.white]} /> : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity style={styles.restartBtn} onPress={onRestart} testID="gomoku-restart">
        <Text style={styles.restartText}>↻ {t({ en: 'Restart', zh: '重新开始' })}</Text>
      </TouchableOpacity>
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
  seats: { flexDirection: 'row', gap: 10, paddingVertical: 6 },
  seat: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.bgCard, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 2, borderColor: 'transparent', maxWidth: 170 },
  seatActive: { borderColor: colors.accent },
  seatStone: { fontSize: 16 },
  seatName: { color: colors.textPrimary, fontSize: 13, fontWeight: '600', maxWidth: 120 },
  status: { color: colors.accent, fontSize: 14, fontWeight: '700', paddingVertical: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  board: { backgroundColor: '#d8a960', borderRadius: 6, overflow: 'hidden' },
  cell: { alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: '#8a6d3b' },
  stone: { shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 1, shadowOffset: { width: 0, height: 1 } },
  black: { backgroundColor: '#1a1a1a' },
  white: { backgroundColor: '#f5f5f5' },
  restartBtn: { marginTop: 12, backgroundColor: colors.bgCard, borderRadius: 10, paddingHorizontal: 22, paddingVertical: 10, borderWidth: 1, borderColor: colors.border },
  restartText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
}));
