/**
 * Arcade 实时对战协议(路径 A:权威 game server)——跨端单一来源。
 *
 * 与 /aeon(server-authoritative-lite:客户端报位置)不同,本协议是**完全服务器权威**:
 *   - 客户端只发"输入"(input),绝不报位置;
 *   - 服务器以固定 tick(TICK_HZ)模拟权威世界(球/拍/分数/碰撞),广播快照(state);
 *   - 客户端渲染最新快照(可选插值)。这是实时动作类联机的标准 netcode 骨架。
 *
 * 首个落地游戏:权威多人 Pong(2 人对战 + 观战)。后续动作类(射击/竞速)沿用同骨架:
 * 替换 simulate() 与 input/state 形状即可,房间/tick/鉴权/清理不变。
 */

export const ARCADE = {
  NAMESPACE: '/arcade',
  /** 加入对战房间。 */
  JOIN: 'arcade:join',
  /** 上报输入(高频,节流由客户端控制)。 */
  INPUT: 'arcade:input',
  /** 离开。 */
  LEAVE: 'arcade:leave',
  /** 服务器权威快照(每 tick 广播)。 */
  STATE: 'arcade:state',
  /** 权威模拟频率(Hz)。 */
  TICK_HZ: 30,
  /** 虚拟球场尺寸(单位无关;客户端按比例缩放渲染)。 */
  FIELD_W: 200,
  FIELD_H: 120,
  PADDLE_H: 28,
  PADDLE_W: 4,
  BALL_R: 3,
} as const;

/** 座位:左 / 右 / 观战。 */
export type PongSide = 'l' | 'r' | 'spec';

/** 加入载荷。 */
export interface ArcadeJoinPayload {
  /** 房间 id(本端用 `pong-<creationId>`)。 */
  roomId: string;
  /** 展示名。 */
  displayName: string;
}

/** 客户端输入:拍子移动方向(-1 上 / 0 停 / 1 下)。 */
export interface PongInput {
  dir: -1 | 0 | 1;
}

/** 服务器权威快照。 */
export interface PongState {
  /** 球心(球场单位)。 */
  ball: { x: number; y: number };
  /** 左右拍中心 y。 */
  paddles: { l: number; r: number };
  /** 比分。 */
  score: { l: number; r: number };
  /** 座位占用展示名(空 = 空位)。 */
  seats: { l: string | null; r: string | null };
  /** 本客户端的座位。 */
  you: PongSide;
  /** 房间状态:等待满员 / 对战中 / 刚得分(短暂)。 */
  status: 'waiting' | 'playing' | 'point';
  /** 在场人数(含观战)。 */
  occupants: number;
  /** 权威 tick 序号(客户端可用于丢弃乱序/插值)。 */
  tick: number;
  /** 胜者(达到胜分时;否则 null)。 */
  winner: PongSide | null;
}

/** 字段常量(胜分等)。 */
export const PONG = {
  WIN_SCORE: 11,
  PADDLE_SPEED: 2.4, // 单位/tick
  BALL_SPEED_X: 2.2,
  BALL_SPEED_Y_MAX: 2.0,
} as const;
