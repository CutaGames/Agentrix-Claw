/**
 * Mobile Pet Presence (P0-2)
 *
 * 与 web/desktop 等价的 React Native 版本。socket.io-client 在移动端仓库
 * 当前是可选依赖（DMChatScreen 注释中标注 `expo install socket.io-client`），
 * 因此本模块用动态 require 兜底：未安装时 connect 直接返回 noop handle，
 * 让上层 UI 不阻塞，安装后即生效。
 */

import {
  subscribePetPresence,
  type PetPresenceHandlers,
} from '../../shared/utils/pet-presence-subscribe';
import type { PetPresenceHandshakeAuth } from '../../shared/types/pet-presence';
import { API_BASE } from '../config/env';

export interface ConnectPetPresenceMobileOpts {
  token: string;
  deviceId: string;
  deviceName?: string;
  appVersion?: string;
  wsOrigin?: string;
  handlers: PetPresenceHandlers;
  debug?: boolean;
}

export interface PetPresenceMobileHandle {
  disconnect: () => void;
  isConnected: () => boolean;
  /** True if socket.io-client was unavailable; UI may render a degraded state. */
  isDegraded: boolean;
}

function resolveWsOrigin(provided?: string): string {
  if (provided) return provided;
  // API_BASE looks like https://api.agentrix.top/api → strip /api & switch to ws(s)
  return API_BASE.replace(/\/api\/?$/, '').replace(/^http/, 'ws');
}

export function connectPetPresence(opts: ConnectPetPresenceMobileOpts): PetPresenceMobileHandle {
  let socketModule: { io?: (...args: unknown[]) => unknown } | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    socketModule = require('socket.io-client');
  } catch {
    socketModule = null;
  }

  if (!socketModule || typeof socketModule.io !== 'function') {
    if (opts.debug) {
      console.warn('[petPresence/mobile] socket.io-client not installed; skipping realtime');
    }
    return { disconnect: () => {}, isConnected: () => false, isDegraded: true };
  }

  const wsOrigin = resolveWsOrigin(opts.wsOrigin);
  const auth: PetPresenceHandshakeAuth = {
    token: opts.token,
    deviceId: opts.deviceId,
    deviceType: 'mobile',
    platform: 'react-native',
    deviceName: opts.deviceName || 'Agentrix Mobile',
    appVersion: opts.appVersion || '1.0.0',
    capabilities: ['chat', 'pet'],
  };

  const socket = socketModule.io(`${wsOrigin}/presence`, {
    auth,
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 3000,
    reconnectionDelayMax: 30000,
  }) as {
    on: (event: string, fn: (...args: unknown[]) => void) => void;
    off: (event: string, fn?: (...args: unknown[]) => void) => void;
    disconnect: () => void;
    connected?: boolean;
  };

  if (opts.debug) {
    socket.on('connect', () => console.log('[petPresence/mobile] connected', { wsOrigin }));
    socket.on('disconnect', (reason) =>
      console.log('[petPresence/mobile] disconnect', reason),
    );
    socket.on('connect_error', (err: unknown) =>
      console.warn('[petPresence/mobile] connect_error', (err as Error)?.message || err),
    );
  }

  const unsubscribe = subscribePetPresence(socket, opts.handlers);

  return {
    disconnect: () => {
      try {
        unsubscribe();
      } finally {
        socket.disconnect();
      }
    },
    isConnected: () => Boolean(socket.connected),
    isDegraded: false,
  };
}
