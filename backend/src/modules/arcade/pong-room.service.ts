import { Injectable, Logger } from '@nestjs/common';
import { ARCADE, PONG, type PongState, type PongSide } from '../../../../shared/types/arcade';

/**
 * PongRoomService — 权威多人 Pong 的服务器端模拟(路径 A 的核心:server-authoritative)。
 *
 * 每个房间一个固定 tick 循环(TICK_HZ):服务器拥有球/拍/分数,客户端只发输入方向。
 * 本服务只管"权威世界态 + 模拟",广播由网关订阅 onState 回调完成(解耦 socket)。
 *
 * 设计沿用 RoomPresenceService 的"实时态放内存"理念;单实例足够(生产 1 个 PM2 fork)。
 * 多实例需把房间分片或加 sticky(超出本期范围)。
 */

interface Player {
  socketId: string;
  side: PongSide; // 'l' | 'r'(观战不入此表)
  name: string;
  input: -1 | 0 | 1;
}

interface Room {
  roomId: string;
  ball: { x: number; y: number; vx: number; vy: number };
  paddles: { l: number; r: number };
  score: { l: number; r: number };
  players: Map<string, Player>; // socketId -> seated player
  spectators: Set<string>; // socketId
  names: Map<string, string>; // socketId -> name(含观战)
  status: 'waiting' | 'playing' | 'point';
  winner: PongSide | null;
  tick: number;
  timer: ReturnType<typeof setInterval> | null;
  pointHoldUntil: number; // 得分后短暂定格
}

@Injectable()
export class PongRoomService {
  private readonly logger = new Logger(PongRoomService.name);
  private readonly rooms = new Map<string, Room>();
  /** 网关注入的广播回调:把某房间快照发给该房间所有 socket。 */
  private onState: ((roomId: string, state: (id: string) => PongState) => void) | null = null;

  setBroadcaster(fn: (roomId: string, stateFor: (socketId: string) => PongState) => void) {
    this.onState = fn;
  }

  private newRoom(roomId: string): Room {
    return {
      roomId,
      ball: { x: ARCADE.FIELD_W / 2, y: ARCADE.FIELD_H / 2, vx: 0, vy: 0 },
      paddles: { l: ARCADE.FIELD_H / 2, r: ARCADE.FIELD_H / 2 },
      score: { l: 0, r: 0 },
      players: new Map(),
      spectators: new Set(),
      names: new Map(),
      status: 'waiting',
      winner: null,
      tick: 0,
      timer: null,
      pointHoldUntil: 0,
    };
  }

  /** 加入房间,分配座位(l→r→观战)。返回分配的 side。 */
  join(roomId: string, socketId: string, name: string): PongSide {
    let room = this.rooms.get(roomId);
    if (!room) { room = this.newRoom(roomId); this.rooms.set(roomId, room); }
    room.names.set(socketId, name);

    const sides = new Set([...room.players.values()].map((p) => p.side));
    let side: PongSide = 'spec';
    if (!sides.has('l')) side = 'l';
    else if (!sides.has('r')) side = 'r';

    if (side === 'spec') {
      room.spectators.add(socketId);
    } else {
      room.players.set(socketId, { socketId, side, name, input: 0 });
    }

    // 总是启动 tick 循环(即使 1 人):持续广播快照,客户端立刻拿到状态(不再卡"连接中")。
    // 有 >=1 名真人即开赛,空位由 AI 接管(单人也能玩 vs AI;第二名真人加入即接管该位)。
    this.ensureLoop(room);
    if (room.players.size >= 1 && room.status !== 'playing') {
      this.resetBall(room, Math.random() < 0.5 ? 1 : -1);
      room.status = 'playing';
      room.winner = null;
    }
    return side;
  }

  /** 离开/断线:释放座位;无人则停循环并删房。 */
  leave(roomId: string, socketId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.players.delete(socketId);
    room.spectators.delete(socketId);
    room.names.delete(socketId);
    // 真人离开后空位由 AI 接管,只要还有 >=1 真人就继续对战(不暂停)。
    if (room.players.size === 0) {
      room.status = 'waiting';
    }
    if (room.players.size === 0 && room.spectators.size === 0) {
      if (room.timer) clearInterval(room.timer);
      this.rooms.delete(roomId);
      this.logger.log(`pong room closed: ${roomId}`);
    }
  }

  /** 记录某 socket 的输入方向。 */
  setInput(roomId: string, socketId: string, dir: -1 | 0 | 1): void {
    const p = this.rooms.get(roomId)?.players.get(socketId);
    if (p) p.input = dir;
  }

  private resetBall(room: Room, dir: 1 | -1): void {
    room.ball.x = ARCADE.FIELD_W / 2;
    room.ball.y = ARCADE.FIELD_H / 2;
    room.ball.vx = PONG.BALL_SPEED_X * dir;
    room.ball.vy = (Math.random() * 2 - 1) * PONG.BALL_SPEED_Y_MAX;
  }

  private ensureLoop(room: Room): void {
    if (room.timer) return;
    const dtMs = Math.round(1000 / ARCADE.TICK_HZ);
    room.timer = setInterval(() => this.step(room), dtMs);
  }

  private step(room: Room): void {
    room.tick++;

    // 拍子按输入移动(夹取边界)。
    const half = ARCADE.PADDLE_H / 2;
    const humanSides = new Set([...room.players.values()].map((p) => p.side));
    for (const p of room.players.values()) {
      const dy = p.input * PONG.PADDLE_SPEED;
      const cur = p.side === 'l' ? room.paddles.l : room.paddles.r;
      const next = Math.max(half, Math.min(ARCADE.FIELD_H - half, cur + dy));
      if (p.side === 'l') room.paddles.l = next; else room.paddles.r = next;
    }

    const active = room.status === 'playing' && room.players.size >= 1;

    // AI 接管无真人的一侧(单人 vs AI / 真人离开后补位)。速度略低于玩家,可被击败。
    if (active) {
      for (const side of ['l', 'r'] as const) {
        if (humanSides.has(side)) continue;
        const cur = side === 'l' ? room.paddles.l : room.paddles.r;
        const diff = room.ball.y - cur;
        const sp = PONG.PADDLE_SPEED * 0.82;
        const stepY = Math.max(-sp, Math.min(sp, diff));
        const next = Math.max(half, Math.min(ARCADE.FIELD_H - half, cur + stepY));
        if (side === 'l') room.paddles.l = next; else room.paddles.r = next;
      }
    }

    if (active) {
      const b = room.ball;
      b.x += b.vx; b.y += b.vy;
      // 上下墙反弹
      if (b.y < ARCADE.BALL_R) { b.y = ARCADE.BALL_R; b.vy = -b.vy; }
      if (b.y > ARCADE.FIELD_H - ARCADE.BALL_R) { b.y = ARCADE.FIELD_H - ARCADE.BALL_R; b.vy = -b.vy; }
      // 左拍
      const pad = ARCADE.PADDLE_W + ARCADE.BALL_R;
      if (b.vx < 0 && b.x <= pad) {
        if (Math.abs(b.y - room.paddles.l) <= half) {
          b.x = pad; b.vx = -b.vx;
          b.vy += (b.y - room.paddles.l) / half * 1.2; // 击球点决定角度
        }
      }
      // 右拍
      if (b.vx > 0 && b.x >= ARCADE.FIELD_W - pad) {
        if (Math.abs(b.y - room.paddles.r) <= half) {
          b.x = ARCADE.FIELD_W - pad; b.vx = -b.vx;
          b.vy += (b.y - room.paddles.r) / half * 1.2;
        }
      }
      // 出界 → 对方得分
      if (b.x < 0) { room.score.r++; this.afterPoint(room, 1); }
      else if (b.x > ARCADE.FIELD_W) { room.score.l++; this.afterPoint(room, -1); }
    } else if (room.status === 'point') {
      if (Date.now() >= room.pointHoldUntil) {
        room.status = room.winner ? 'waiting' : 'playing';
      }
    }

    // 广播快照
    if (this.onState) {
      this.onState(room.roomId, (sid) => this.snapshotFor(room, sid));
    }
  }

  private afterPoint(room: Room, nextDir: 1 | -1): void {
    if (room.score.l >= PONG.WIN_SCORE) room.winner = 'l';
    else if (room.score.r >= PONG.WIN_SCORE) room.winner = 'r';
    room.status = 'point';
    room.pointHoldUntil = Date.now() + 900;
    if (room.winner) {
      // 比赛结束:停球,等待重开(任一方再次满员/重置)。
      room.ball.vx = 0; room.ball.vy = 0;
    } else {
      this.resetBall(room, nextDir);
      room.ball.vx = 0; room.ball.vy = 0; // 定格 0.9s 后由 step 恢复
      setTimeout(() => { if (this.rooms.get(room.roomId) === room && !room.winner) this.resetBall(room, nextDir); }, 850);
    }
  }

  /** 重开(任一在座玩家请求)。 */
  restart(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.score.l = 0; room.score.r = 0; room.winner = null;
    if (room.players.size >= 1) { this.resetBall(room, Math.random() < 0.5 ? 1 : -1); room.status = 'playing'; this.ensureLoop(room); }
    else room.status = 'waiting';
  }

  private seatName(room: Room, side: 'l' | 'r'): string | null {
    for (const p of room.players.values()) if (p.side === side) return p.name;
    return null;
  }

  private snapshotFor(room: Room, socketId: string): PongState {
    const me = room.players.get(socketId);
    const you: PongSide = me ? me.side : 'spec';
    return {
      ball: { x: round1(room.ball.x), y: round1(room.ball.y) },
      paddles: { l: round1(room.paddles.l), r: round1(room.paddles.r) },
      score: { ...room.score },
      seats: { l: this.seatName(room, 'l'), r: this.seatName(room, 'r') },
      you,
      status: room.status,
      occupants: room.players.size + room.spectators.size,
      tick: room.tick,
      winner: room.winner,
    };
  }
}

function round1(n: number): number { return Math.round(n * 10) / 10; }
