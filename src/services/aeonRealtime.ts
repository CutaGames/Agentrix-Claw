/**
 * aeonRealtime.ts — 移动端 Aeon 实时房间客户端(World Creation & Feed · 真实房间)。
 *
 * 复用既有 socket.io-client 模式(见 presence.service.ts / petPresence.ts):
 *   - 连后端 `/aeon` 命名空间(AeonRealtimeGateway),握手 auth `{ token }` 鉴权。
 *   - 房间 = roomId(本封装用 `aeon-live-c-<creationId>` 前缀 → 后端按"舞台房间"处理:
 *     首个真人成 host,其余 audience;支持聊天/举手/上下台/打赏 AXP)。
 *   - 服务器权威:本端只发"意图"(JOIN/chat/raise/tip),所有状态以服务器广播为准。
 *   - socket.io-client 在移动端为可选依赖,缺失/无 token → 返回 degraded noop 句柄,UI 不阻塞。
 *
 * 用于 CreationExperienceScreen 的 livestream / stage 类型:把"占位"替换为可进可聊
 * 可打赏的真实多人房间。
 */
import { getApiConfig } from './api';
import { API_BASE } from '../config/env';
import {
  AEON_SYNC,
  type AeonServerEvent,
  type AeonCharacterSnapshot,
  type AeonClan,
} from '../../shared/types/aeon-sync';

/** 房间客户端句柄(供 UI 调用)。 */
export interface AeonRoomHandle {
  /** 发送房间聊天(scope=room)。 */
  sendChat: (text: string) => void;
  /** 观众举手申请上台。 */
  raiseHand: () => void;
  /** host 批准某观众上台为 speaker。 */
  invite: (targetCharId: string) => void;
  /** speaker 下台(自己),或 host 请某 speaker 下台。 */
  leaveStage: (targetCharId?: string) => void;
  /** 给台上某发言者打赏 AXP(真实价值流转)。 */
  tip: (targetCharId: string, amount: number) => void;
  /** 广播一个自定义 action(游戏走子等;经服务器转发给房间其它人)。 */
  sendAction: (action: string) => void;
  /** 离开房间并断开。 */
  disconnect: () => void;
  /** 当前 socket 是否已连接。 */
  isConnected: () => boolean;
  /** socket.io-client 不可用或缺少 token 时为 true,UI 可显示降级提示。 */
  isDegraded: boolean;
}

export interface ConnectAeonRoomOptions {
  /** 房间标识(本封装会加 `aeon-live-c-` 前缀,除非已带 `aeon-live-`)。 */
  roomId: string;
  /** 角色实例 id(稳定唯一;默认用 user id 派生)。 */
  charId: string;
  /** 展示名。 */
  displayName: string;
  /** 族群(精灵外观;默认 'A')。 */
  clan?: AeonClan;
  /** 服务器权威事件回调(room_state / char_upsert / char_leave / chat / stage_*)。 */
  onServerEvent: (ev: AeonServerEvent) => void;
  /** 连接状态变化回调。 */
  onConnectionChange?: (connected: boolean) => void;
  debug?: boolean;
}

/** 把 API_BASE(`https://host/api`)转成 socket.io origin(去掉 `/api` 前缀)。 */
function resolveWsOrigin(): string {
  return API_BASE.replace(/\/api\/?$/, '');
}

/** 由 creationId 生成舞台房间 id(满足后端 `aeon-live-` 前缀判定)。 */
export function creationRoomId(creationId: string): string {
  return `aeon-live-c-${creationId}`;
}

const HEARTBEAT_MS = 5_000;

/**
 * 连接并加入一个 Aeon 房间。立即返回句柄;连接/加入在内部异步完成。
 * socket.io-client 缺失或无 token → 返回 degraded noop 句柄(isDegraded=true)。
 */
export function connectAeonRoom(opts: ConnectAeonRoomOptions): AeonRoomHandle {
  let socketModule: { io?: (...args: unknown[]) => unknown; default?: unknown } | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    socketModule = require('socket.io-client');
  } catch {
    socketModule = null;
  }
  const io = (socketModule?.io ?? (socketModule as any)?.default ?? socketModule) as
    | ((...args: unknown[]) => any)
    | undefined;
  const token = getApiConfig().token;

  if (typeof io !== 'function' || !token) {
    if (opts.debug) {
      console.warn(
        `[aeon/mobile] realtime unavailable (socketIo=${typeof io === 'function'}, token=${Boolean(token)})`,
      );
    }
    return {
      sendChat: () => {},
      raiseHand: () => {},
      invite: () => {},
      leaveStage: () => {},
      tip: () => {},
      disconnect: () => {},
      isConnected: () => false,
      isDegraded: true,
    };
  }

  // 'aeon-live-' = 舞台房间(host/观众/主播);'game-' = 普通游戏房间(仅在场+chat+action,
  // 不触发舞台/主播逻辑);其余按 creationRoomId 包装成舞台房间。
  const roomId = /^(aeon-live-|game-)/.test(opts.roomId) ? opts.roomId : creationRoomId(opts.roomId);
  const charId = opts.charId;
  let socket: any = null;
  let disposed = false;
  let hbTimer: ReturnType<typeof setInterval> | null = null;

  const snapshot: AeonCharacterSnapshot = {
    charId,
    ownerUserId: '', // 服务器从 JWT 权威回填
    controlState: 'manual', // 真人亲自在场
    isAgentDriven: false, // 服务器据 controlState 重新派生
    badge: 'human',
    clan: opts.clan ?? 'A',
    x: 4 + Math.floor(Math.random() * 4),
    y: 4 + Math.floor(Math.random() * 4),
    facing: 'right',
    sprite: 'idle',
    displayName: opts.displayName || '访客',
  };

  const emitClient = (ev: any) => {
    if (socket && socket.connected) socket.emit(AEON_SYNC.CLIENT_EVENT, ev);
  };

  const wsOrigin = resolveWsOrigin();
  socket = io(`${wsOrigin}${AEON_SYNC.NAMESPACE}`, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 2_000,
    reconnectionDelayMax: 15_000,
  });

  socket.on('connect', () => {
    if (opts.debug) console.log('[aeon/mobile] connected', { wsOrigin, roomId });
    // 加入房间(带权威快照;服务器回填 ownerUserId/badge)。
    socket.emit(AEON_SYNC.JOIN, { roomId, charId, snapshot });
    opts.onConnectionChange?.(true);
    if (hbTimer) clearInterval(hbTimer);
    hbTimer = setInterval(() => {
      if (socket && socket.connected) socket.emit(AEON_SYNC.HEARTBEAT);
    }, HEARTBEAT_MS);
  });

  socket.on('disconnect', (reason: unknown) => {
    if (opts.debug) console.log('[aeon/mobile] disconnect', reason);
    opts.onConnectionChange?.(false);
  });

  if (opts.debug) {
    socket.on('connect_error', (err: unknown) =>
      console.warn('[aeon/mobile] connect_error', (err as Error)?.message || err),
    );
  }

  socket.on(AEON_SYNC.SERVER_EVENT, (ev: AeonServerEvent) => {
    if (!disposed && ev) opts.onServerEvent(ev);
  });

  return {
    sendChat: (text: string) => {
      const trimmed = (text || '').trim();
      if (trimmed) emitClient({ t: 'chat', text: trimmed.slice(0, 500), scope: 'room' });
    },
    raiseHand: () => emitClient({ t: 'stage_raise_hand' }),
    invite: (targetCharId: string) => emitClient({ t: 'stage_invite', targetCharId }),
    leaveStage: (targetCharId?: string) => emitClient({ t: 'stage_leave_stage', targetCharId }),
    tip: (targetCharId: string, amount: number) =>
      emitClient({ t: 'stage_tip', targetCharId, amount }),
    sendAction: (action: string) => emitClient({ t: 'action', action }),
    disconnect: () => {
      disposed = true;
      if (hbTimer) {
        clearInterval(hbTimer);
        hbTimer = null;
      }
      if (socket) {
        try {
          if (socket.connected) socket.emit(AEON_SYNC.LEAVE);
          socket.off(AEON_SYNC.SERVER_EVENT);
        } finally {
          socket.disconnect();
          socket = null;
        }
      }
    },
    isConnected: () => Boolean(socket?.connected),
    isDegraded: false,
  };
}

export { AEON_SYNC };
export type { AeonServerEvent, AeonCharacterSnapshot };
