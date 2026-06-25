/**
 * Web Pet Presence Client (P0-2)
 *
 * Web 端连接 backend `/presence` namespace 的最小可用客户端，与 desktop
 * agentPresence.ts 等价。负责：
 *   - 建立 socket.io 连接（auth: token + deviceId + deviceType='web'）
 *   - 通过 shared/utils/pet-presence-subscribe 订阅 typed pet 事件
 *   - 自动重连 / 离线优雅降级（socket.io 内置）
 *
 * 调用示例：
 *
 *   import { connectPetPresence } from '@/lib/presence/petPresenceClient';
 *   const handle = connectPetPresence({ token, handlers: {
 *     'presence:pet.state': (s) => store.setState(s),
 *   }});
 *   // ...
 *   handle.disconnect();
 */

import { io, type Socket } from 'socket.io-client';
import {
  subscribePetPresence,
  type PetPresenceHandlers,
} from '../../../shared/utils/pet-presence-subscribe';
import type { PetPresenceHandshakeAuth } from '../../../shared/types/pet-presence';

export interface ConnectPetPresenceOpts {
  /** JWT token */
  token: string;
  /** 浏览器 device id；未提供时自动生成并存入 sessionStorage。 */
  deviceId?: string;
  /** 后端 ws origin，默认从 NEXT_PUBLIC_WS_URL / NEXT_PUBLIC_API_BASE_URL 推导 */
  wsOrigin?: string;
  /** typed pet presence handlers */
  handlers: PetPresenceHandlers;
  /** 调试日志 */
  debug?: boolean;
}

export interface PetPresenceHandle {
  socket: Socket;
  disconnect: () => void;
  isConnected: () => boolean;
}

const DEVICE_ID_KEY = 'agentrix:web:device_id';

function ensureDeviceId(provided?: string): string {
  if (provided) return provided;
  if (typeof window === 'undefined') return `web-ssr-${Date.now()}`;
  try {
    const existing = window.sessionStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const fresh =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? `web-${(crypto as Crypto).randomUUID()}`
        : `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(DEVICE_ID_KEY, fresh);
    return fresh;
  } catch {
    return `web-${Date.now()}`;
  }
}

function resolveWsOrigin(provided?: string): string {
  if (provided) return provided;
  const env = (typeof process !== 'undefined' ? process.env : {}) as Record<string, string | undefined>;
  const explicit = env.NEXT_PUBLIC_WS_URL;
  if (explicit) return explicit;
  const apiBase = env.NEXT_PUBLIC_API_BASE_URL || env.NEXT_PUBLIC_API_BASE || 'https://api.agentrix.top';
  // strip trailing /api if present and convert http(s) → ws(s)
  const noApi = apiBase.replace(/\/api\/?$/, '');
  return noApi.replace(/^http/, 'ws');
}

export function connectPetPresence(opts: ConnectPetPresenceOpts): PetPresenceHandle {
  const wsOrigin = resolveWsOrigin(opts.wsOrigin);
  const deviceId = ensureDeviceId(opts.deviceId);

  const auth: PetPresenceHandshakeAuth = {
    token: opts.token,
    deviceId,
    deviceType: 'web',
    platform:
      typeof navigator !== 'undefined' ? navigator.platform || 'web' : 'web',
    deviceName: 'Agentrix Web',
    appVersion: '1.0.0',
    capabilities: ['chat', 'pet'],
  };

  const socket = io(`${wsOrigin}/presence`, {
    auth: auth as unknown as Record<string, unknown>,
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 3000,
    reconnectionDelayMax: 30000,
  });

  if (opts.debug) {
    socket.on('connect', () => console.log('[petPresence] connected', { wsOrigin, deviceId }));
    socket.on('disconnect', (reason) => console.log('[petPresence] disconnect', reason));
    socket.on('connect_error', (err) => console.warn('[petPresence] connect_error', err?.message || err));
  }

  const unsubscribe = subscribePetPresence(socket as unknown as { on: typeof socket.on; off: typeof socket.off }, opts.handlers);

  return {
    socket,
    disconnect: () => {
      try {
        unsubscribe();
      } finally {
        socket.disconnect();
      }
    },
    isConnected: () => socket.connected,
  };
}
