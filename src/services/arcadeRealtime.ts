/**
 * arcadeRealtime.ts — 权威实时对战客户端(路径 A)。连后端 `/arcade` 网关。
 *
 * 与 aeonRealtime 不同:本端只发"输入"(dir),不报位置;渲染服务器下发的权威快照(STATE)。
 * socket.io-client 缺失/无 token → degraded noop(UI 不阻塞)。
 */
import { getApiConfig } from './api';
import { API_BASE } from '../config/env';
import { ARCADE, type PongState, type PongInput } from '../../shared/types/arcade';

export interface ArcadeHandle {
  sendInput: (dir: -1 | 0 | 1) => void;
  restart: () => void;
  disconnect: () => void;
  isConnected: () => boolean;
  isDegraded: boolean;
}

export interface ConnectArcadeOptions {
  roomId: string;
  displayName: string;
  onState: (s: PongState) => void;
  onConnectionChange?: (connected: boolean) => void;
  debug?: boolean;
}

function resolveWsOrigin(): string {
  return API_BASE.replace(/\/api\/?$/, '');
}

export function connectArcade(opts: ConnectArcadeOptions): ArcadeHandle {
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
    return {
      sendInput: () => {}, restart: () => {}, disconnect: () => {},
      isConnected: () => false, isDegraded: true,
    };
  }

  let socket: any = null;
  let disposed = false;
  let lastDir: -1 | 0 | 1 | null = null;

  const wsOrigin = resolveWsOrigin();
  socket = io(`${wsOrigin}${ARCADE.NAMESPACE}`, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1500,
  });

  socket.on('connect', () => {
    socket.emit(ARCADE.JOIN, { roomId: opts.roomId, displayName: opts.displayName });
    opts.onConnectionChange?.(true);
    lastDir = null;
  });
  socket.on('disconnect', () => opts.onConnectionChange?.(false));
  if (opts.debug) socket.on('connect_error', (e: any) => console.warn('[arcade] connect_error', e?.message || e));
  socket.on(ARCADE.STATE, (s: PongState) => { if (!disposed && s) opts.onState(s); });

  return {
    sendInput: (dir: -1 | 0 | 1) => {
      if (dir === lastDir) return; // 仅在方向变化时发,降带宽
      lastDir = dir;
      if (socket?.connected) socket.emit(ARCADE.INPUT, { dir } as PongInput);
    },
    restart: () => { if (socket?.connected) socket.emit('arcade:restart'); },
    disconnect: () => {
      disposed = true;
      if (socket) {
        try { if (socket.connected) socket.emit(ARCADE.LEAVE); } finally { socket.disconnect(); socket = null; }
      }
    },
    isConnected: () => Boolean(socket?.connected),
    isDegraded: false,
  };
}
