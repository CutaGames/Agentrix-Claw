/**
 * aeonRealtimeClient — Aeon `/aeon` 实时房间客户端(Task 1.8 支撑 / Phase 0 客户端侧)。
 *
 * 连接后端 AeonRealtimeGateway(namespace `/aeon`),收发 aeon-sync 契约消息。
 * 复用 petPresence 的优雅降级模式:socket.io-client 在移动端为可选依赖,
 * 未安装时返回 noop handle(isDegraded=true),上层场景退回异步快照(REST 拉在场态),
 * 不阻塞 UI。这与 design.md "实时 vs 异步双轨"一致——实时不可用时异步轨仍工作。
 */
import { WS_BASE } from '../../config/env';
import { useAuthStore } from '../../stores/authStore';
import {
  AEON_SYNC,
  type AeonClientEvent,
  type AeonServerEvent,
  type AeonCharacterSnapshot,
} from '../../../shared/types/aeon-sync';

export interface AeonRealtimeHandle {
  /** 发送客户端意图(move/action/control/chat)。 */
  send: (ev: AeonClientEvent) => void;
  /** 主动离开房间并断开。 */
  disconnect: () => void;
  isConnected: () => boolean;
  /** socket.io-client 不可用 → true,上层应退回异步快照。 */
  isDegraded: boolean;
}

export interface ConnectAeonOpts {
  roomId: string;
  snapshot: AeonCharacterSnapshot;
  onServerEvent: (ev: AeonServerEvent) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  wsOrigin?: string;
  debug?: boolean;
}

function resolveWsOrigin(provided?: string): string {
  if (provided) return provided;
  // WS_BASE 形如 wss://api.agentrix.top;若为空则由 API_BASE 推导。
  if (typeof WS_BASE === 'string' && WS_BASE) return WS_BASE;
  return 'wss://api.agentrix.top';
}

export function connectAeonRoom(opts: ConnectAeonOpts): AeonRealtimeHandle {
  let socketModule: any = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    socketModule = require('socket.io-client');
  } catch {
    socketModule = null;
  }

  if (!socketModule || typeof socketModule.io !== 'function') {
    if (opts.debug) {
      console.warn('[aeon] socket.io-client 未安装;退回异步快照(无实时同框)');
    }
    return {
      send: () => {},
      disconnect: () => {},
      isConnected: () => false,
      isDegraded: true,
    };
  }

  const token = useAuthStore.getState().token;
  const origin = resolveWsOrigin(opts.wsOrigin);
  const heartbeatMs = Math.floor(AEON_SYNC.DISCONNECT_GRACE_MS / 2);

  const socket = socketModule.io(`${origin}${AEON_SYNC.NAMESPACE}`, {
    transports: ['websocket'],
    auth: { token },
    forceNew: true,
  });

  let connected = false;
  let hbTimer: ReturnType<typeof setInterval> | null = null;

  socket.on('connect', () => {
    connected = true;
    socket.emit(AEON_SYNC.JOIN, { roomId: opts.roomId, charId: opts.snapshot.charId, snapshot: opts.snapshot });
    hbTimer = setInterval(() => socket.emit(AEON_SYNC.HEARTBEAT), heartbeatMs);
    opts.onConnected?.();
  });

  socket.on(AEON_SYNC.SERVER_EVENT, (ev: AeonServerEvent) => {
    opts.onServerEvent(ev);
  });

  socket.on('disconnect', () => {
    connected = false;
    if (hbTimer) {
      clearInterval(hbTimer);
      hbTimer = null;
    }
    opts.onDisconnected?.();
  });

  return {
    send: (ev: AeonClientEvent) => {
      if (connected) socket.emit(AEON_SYNC.CLIENT_EVENT, ev);
    },
    disconnect: () => {
      try {
        if (connected) socket.emit(AEON_SYNC.LEAVE);
        if (hbTimer) clearInterval(hbTimer);
        socket.close();
      } catch {
        /* ignore */
      }
    },
    isConnected: () => connected,
    isDegraded: false,
  };
}
