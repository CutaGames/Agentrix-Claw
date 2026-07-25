/**
 * presence.service.ts — 移动端跨端 presence 客户端封装(设计 §7.3 / Requirement 8)。
 *
 * 三件事(task 2.3):
 *   1. heartbeat:进入主界面后周期性上报本端(默认 'mobile')在线心跳(R8.2)。
 *   2. subscribePresence:订阅 WS `presence:update` 事件,实时刷新设备列表 UI(R8.4/R8.5)。
 *   3. queryPresence:按需拉取某实例各端在线快照(R8.5)。
 *
 * 复用既有约定,不另造客户端:
 *   - HTTP 走 `apiFetch`(`./api`),自动注入 Bearer token + API_BASE(`/api` 前缀)。
 *     后端控制器为 `v1/presence`,故路径用 `/v1/presence/*`(与 crossDeviceToken 同款)。
 *   - WS 走 `socket.io-client`(动态 require 兜底,未安装则降级 noop,见 `petPresence.ts`),
 *     连后端既有 `/presence` 命名空间(`PresenceGateway`)。该网关用握手 auth 的
 *     `{ token, deviceId }` 鉴权并把客户端加入 `user:{userId}` 房间,所有 `presence:*`
 *     事件转发到该房间——因此本端订阅 `presence:update` 即可收到自己各端的在线变化。
 *   - deviceId 复用 SecureStore key `agentrix_device_id`(与 `auth.ts` 同一稳定标识)。
 *
 * 在线/离线判定权威在后端(心跳 ttl + sweep,R8.6);本封装只负责上报与接收。
 */
import * as SecureStore from 'expo-secure-store';

import { apiFetch, getApiConfig } from './api';
import { API_BASE } from '../config/env';
import {
  PRESENCE_UPDATE_EVENT,
  type PresenceDevice,
  type PresenceSnapshot,
  type PresenceUpdate,
} from '../../shared/types/device-presence';

export type {
  PresenceDevice,
  PresenceSnapshot,
  PresenceUpdate,
  DevicePresence,
} from '../../shared/types/device-presence';

/** 默认本端类型:移动端固定上报 'mobile'。 */
const DEFAULT_DEVICE: PresenceDevice = 'mobile';

/**
 * 默认心跳间隔(毫秒)。后端默认 ttl 30s,这里取其约一半(15s)以保证
 * 在 ttl 过期前必有新心跳,避免在线端被误判离线。
 */
const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;

/** SecureStore 中本设备稳定 deviceId 的 key(与 auth.ts 共用,保持单一设备标识)。 */
const DEVICE_ID_KEY = 'agentrix_device_id';

// ─────────────────────────────────────────────────────────────────────────────
// deviceId(WS 握手需要;复用 auth.ts 同一 SecureStore key)
// ─────────────────────────────────────────────────────────────────────────────

let _cachedDeviceId: string | null = null;

function makeDeviceId(): string {
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 获取/生成本设备稳定 deviceId(持久化到 SecureStore,与 auth.ts 同 key)。
 * SecureStore 读写失败时退化为进程内临时 id,确保 WS 连接不被阻塞。
 */
export async function resolvePresenceDeviceId(): Promise<string> {
  if (_cachedDeviceId) return _cachedDeviceId;
  try {
    let id = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (!id) {
      id = makeDeviceId();
      await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
    }
    _cachedDeviceId = id;
    return id;
  } catch {
    _cachedDeviceId = makeDeviceId();
    return _cachedDeviceId;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP:心跳上报 + 查询
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 单次心跳上报(R8.2/R8.3)。POST /v1/presence/heartbeat。
 * 返回该实例当前各端在线快照,便于上报端即时拿到最新设备列表。
 */
export async function sendHeartbeat(opts: {
  instanceId: string;
  device?: PresenceDevice;
  ttlSec?: number;
}): Promise<PresenceSnapshot> {
  return apiFetch<PresenceSnapshot>('/v1/presence/heartbeat', {
    method: 'POST',
    body: JSON.stringify({
      instanceId: opts.instanceId,
      device: opts.device ?? DEFAULT_DEVICE,
      ttlSec: opts.ttlSec,
    }),
  });
}

/**
 * 查询某实例各端在线状态(R8.5)。GET /v1/presence/:instanceId。
 * 读取即时叠加 ttl 判定,超时端即便服务端 sweep 未跑到也呈现为离线。
 */
export async function queryPresence(instanceId: string): Promise<PresenceSnapshot> {
  return apiFetch<PresenceSnapshot>(`/v1/presence/${encodeURIComponent(instanceId)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 周期心跳
// ─────────────────────────────────────────────────────────────────────────────

export interface HeartbeatHandle {
  /** 停止周期心跳。 */
  stop: () => void;
  /** 是否仍在运行。 */
  isRunning: () => boolean;
}

/**
 * 启动周期心跳(进入主界面后调用,R8.2)。立即发一次,随后按 `intervalMs` 周期上报。
 * 单次失败静默吞掉(网络抖动不应中断后续心跳),并通过可选 `onError` 暴露给调用方。
 * 返回句柄供卸载时 `stop()`。
 */
export function startHeartbeat(opts: {
  instanceId: string;
  device?: PresenceDevice;
  intervalMs?: number;
  ttlSec?: number;
  /** 每次心跳成功后回调最新快照(可用于刷新设备列表)。 */
  onUpdate?: (snapshot: PresenceSnapshot) => void;
  /** 心跳失败回调(非阻塞,周期不中断)。 */
  onError?: (err: unknown) => void;
}): HeartbeatHandle {
  const device = opts.device ?? DEFAULT_DEVICE;
  const intervalMs = Math.max(1_000, opts.intervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS);
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const beat = async () => {
    try {
      const snapshot = await sendHeartbeat({
        instanceId: opts.instanceId,
        device,
        ttlSec: opts.ttlSec,
      });
      if (!stopped) opts.onUpdate?.(snapshot);
    } catch (err) {
      if (!stopped) opts.onError?.(err);
    }
  };

  // 立即上报一次,确保进场即在线,不必等首个 interval。
  void beat();
  timer = setInterval(() => void beat(), intervalMs);

  return {
    stop: () => {
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    isRunning: () => !stopped,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// WS:订阅 presence:update
// ─────────────────────────────────────────────────────────────────────────────

export interface PresenceSubscription {
  /** 退订并断开 socket。 */
  disconnect: () => void;
  /** 当前 socket 是否已连接。 */
  isConnected: () => boolean;
  /** socket.io-client 不可用或缺少 token 时为 true,UI 可退化为轮询。 */
  isDegraded: boolean;
}

/** 把 API_BASE(`https://host/api`)转成 socket.io origin(去掉 `/api` 前缀)。 */
function resolveWsOrigin(): string {
  return API_BASE.replace(/\/api\/?$/, '');
}

/**
 * 订阅 `presence:update`(R8.4/R8.5)。连后端既有 `/presence` 命名空间,
 * 用握手 auth `{ token, deviceId, deviceType:'mobile' }` 鉴权;网关把本端加入
 * `user:{userId}` 房间并转发所有 `presence:*` 事件,故无需手动 join。
 *
 * 与 `petPresence.ts` 同款:socket.io-client 在移动端为可选依赖,未安装时返回
 * degraded noop 句柄,UI 不被阻塞(可改走 `queryPresence` 轮询)。
 *
 * 同步返回句柄(deviceId 解析为异步,故连接在内部异步建立——类似 realtime 流式
 * 立即返回控制器的模式);`isDegraded` 基于同步可判定的前置条件(socket.io 缺失 /
 * 无 token)。
 *
 * @param opts.instanceId 可选;给定时只回调该实例的更新,其余忽略。
 */
export function subscribePresence(opts: {
  onUpdate: (update: PresenceUpdate) => void;
  /** 仅关心某实例时传入;省略则透传该用户所有实例的 presence 更新。 */
  instanceId?: string;
  /** 覆盖握手 token;省略则取 `getApiConfig().token`。 */
  token?: string;
  /** 覆盖握手 deviceId;省略则解析 SecureStore 稳定 id。 */
  deviceId?: string;
  debug?: boolean;
}): PresenceSubscription {
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
  const token = opts.token ?? getApiConfig().token;

  // 前置条件不满足 → 立即返回 degraded noop 句柄(R8 客户端不阻塞)。
  if (typeof io !== 'function' || !token) {
    if (opts.debug) {
      console.warn(
        `[presence/mobile] realtime unavailable (socketIo=${typeof io === 'function'}, token=${Boolean(token)})`,
      );
    }
    return { disconnect: () => {}, isConnected: () => false, isDegraded: true };
  }

  let socket: {
    on: (event: string, fn: (...args: unknown[]) => void) => void;
    off: (event: string, fn?: (...args: unknown[]) => void) => void;
    disconnect: () => void;
    connected?: boolean;
  } | null = null;
  let disposed = false;

  const handleUpdate = (payload: unknown) => {
    const update = payload as PresenceUpdate;
    if (!update || !Array.isArray(update.presences)) return;
    if (opts.instanceId && update.instanceId !== opts.instanceId) return;
    opts.onUpdate(update);
  };

  // deviceId 为异步(SecureStore);先返回句柄,连接在内部异步建立。
  (async () => {
    const deviceId = opts.deviceId ?? (await resolvePresenceDeviceId());
    if (disposed) return;

    const wsOrigin = resolveWsOrigin();
    socket = io(`${wsOrigin}/presence`, {
      auth: {
        token,
        deviceId,
        deviceType: 'mobile',
        platform: 'react-native',
        deviceName: 'Agentrix Mobile',
        capabilities: ['chat', 'pet', 'presence'],
      },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 3_000,
      reconnectionDelayMax: 30_000,
    });

    if (opts.debug) {
      socket!.on('connect', () => console.log('[presence/mobile] connected', { wsOrigin }));
      socket!.on('disconnect', (reason: unknown) =>
        console.log('[presence/mobile] disconnect', reason),
      );
      socket!.on('connect_error', (err: unknown) =>
        console.warn('[presence/mobile] connect_error', (err as Error)?.message || err),
      );
    }

    socket!.on(PRESENCE_UPDATE_EVENT, handleUpdate);

    // 若在异步连接期间已被 disconnect(),立即清理,避免悬挂连接。
    if (disposed) {
      try {
        socket!.off(PRESENCE_UPDATE_EVENT, handleUpdate);
      } finally {
        socket!.disconnect();
        socket = null;
      }
    }
  })();

  return {
    disconnect: () => {
      disposed = true;
      if (!socket) return;
      try {
        socket.off(PRESENCE_UPDATE_EVENT, handleUpdate);
      } finally {
        socket.disconnect();
        socket = null;
      }
    },
    isConnected: () => Boolean(socket?.connected),
    isDegraded: false,
  };
}
