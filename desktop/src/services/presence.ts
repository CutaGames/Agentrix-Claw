/**
 * presence.ts — 桌面端跨端 presence 客户端(Tauri)。
 *
 * spec:   .kiro/specs/soul-companion-onboarding/{requirements,design}.md
 * task:   4.3(Requirements 8.2 / 8.3 / 8.4 / 8.6,Design §7.3)
 *
 * 职责:**打开桌面端即自动确认「跨端在线」**——周期性向后端上报 device='desktop'
 * 心跳,使同一 Claw_Instance 在移动端/桌面端的在线态实时同步(R8.2)。
 *
 *   - 启动检测 relay:桌面侧的 relay 连接状态由 `/auth/me` 注入的
 *     `OpenClawInstance.relayConnected` 体现,**活跃实例 id 即上报目标**。心跳在
 *     解析到活跃实例后才发出;实例尚未就绪时本次心跳静默跳过、下一拍再试,
 *     因此「检测到 relay/实例 → 自动上报」自然成立(R8.2)。
 *   - 失网即离线:单次心跳失败被吞掉且 interval 不中断(R8.6)——网络中断时心跳
 *     上报失败,后端 sweep 在 ttl 超时即把 desktop 端判离线;网络恢复后下一次心跳
 *     成功即自动回到在线,无需重启服务。
 *   - 5s 内同步:状态变化由后端经现有 WS 通道广播 `presence:update`,移动端订阅后
 *     刷新设备列表 UI(R8.3/R8.4;移动端订阅见 `src/components/desktop/DesktopBanner.tsx`)。
 *
 * 复用既有约定,不另造客户端:
 *   - HTTP 走 `apiFetch`(`./store`):全 URL + 手动注入 `Authorization: Bearer`,
 *     后端控制器为 `v1/presence/heartbeat`(与移动端 `src/services/presence.service.ts` 同后端)。
 *   - 活跃实例解析与 `remoteControl` 同款:`activeInstanceId → primary → 第一个`。
 *   - 跨端契约类型走 `shared/types/device-presence`(≥2 端共用的 single source of truth)。
 */
import { apiFetch, API_BASE, useAuthStore } from "./store";
import type {
  PresenceDevice,
  PresenceSnapshot,
} from "../../../shared/types/device-presence";

/** 本端固定上报 'desktop'。 */
const DESKTOP_DEVICE: PresenceDevice = "desktop";

/**
 * 默认心跳间隔(毫秒)。后端默认 ttl 30s,这里取其约一半(15s)以保证 ttl 过期前
 * 必有新心跳,避免在线端被误判离线(与移动端 `presence.service.ts` 取值一致)。
 */
const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;

// ─────────────────────────────────────────────────────────────────────────────
// 活跃实例解析(与 remoteControl 同款:activeInstanceId → primary → 第一个)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 解析当前要上报在线的 Claw_Instance id。
 * 与 `useServiceBootstrapper` 里 `initRemoteControl` 的解析顺序保持一致,确保
 * 桌面端把同一个实例(移动端 presence/remote-control 也指向它)报为在线。
 * 实例尚未从 `/auth/me` 加载时返回 null(本次心跳跳过,下一拍再试)。
 */
export function resolveActivePresenceInstanceId(): string | null {
  try {
    const st = useAuthStore.getState() as {
      activeInstanceId?: string | null;
      instances?: Array<{ id: string; isPrimary?: boolean }>;
    };
    return (
      st.activeInstanceId ||
      st.instances?.find((i) => i.isPrimary)?.id ||
      st.instances?.[0]?.id ||
      null
    );
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 单次心跳上报
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 单次心跳上报(R8.2/R8.3)。POST /v1/presence/heartbeat。
 * 返回该实例当前各端在线快照,便于上报端即时拿到最新设备列表。
 * 失败(非 2xx / 网络错误)抛出,由调用方决定是否吞掉(周期心跳会吞掉并继续)。
 */
export async function sendDesktopHeartbeat(opts: {
  instanceId: string;
  token: string;
  ttlSec?: number;
}): Promise<PresenceSnapshot | null> {
  const res = await apiFetch(`${API_BASE}/v1/presence/heartbeat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    body: JSON.stringify({
      instanceId: opts.instanceId,
      device: DESKTOP_DEVICE,
      ttlSec: opts.ttlSec,
    }),
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`presence heartbeat failed: ${res.status}`);
  }
  const text = await res.text();
  return text ? (JSON.parse(text) as PresenceSnapshot) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 周期心跳(模块单例,生命周期由 useServiceBootstrapper 驱动)
// ─────────────────────────────────────────────────────────────────────────────

let _timer: ReturnType<typeof setInterval> | null = null;
let _running = false;
let _activeToken: string | null = null;

export interface StartDesktopPresenceOptions {
  /** 心跳间隔(毫秒);默认 15s。 */
  intervalMs?: number;
  /** 心跳有效期(秒);省略走后端默认 30s。 */
  ttlSec?: number;
  /** 每次心跳成功后回调最新快照(可用于刷新桌面侧设备列表)。 */
  onUpdate?: (snapshot: PresenceSnapshot) => void;
  /** 心跳失败回调(非阻塞,周期不中断)。 */
  onError?: (err: unknown) => void;
}

/**
 * 启动桌面端周期心跳(登录后、服务宿主窗口里调用,R8.2)。
 * 立即发一次,随后按 `intervalMs` 周期上报。活跃实例在**每拍解析**——因此即便
 * 实例稍后才从 `/auth/me` 就绪,心跳也会在其出现后自动开始上报(检测到 relay/实例
 * 即自动确认在线)。
 *
 * 单次失败静默吞掉(网络抖动/失网不应中断后续心跳),仅通过可选 `onError` 暴露;
 * 这样失网 → 心跳上报失败 → 后端 ttl 超时判离线;重连后下一拍成功 → 自动恢复在线(R8.6)。
 *
 * 幂等:同 token 重复调用复用现有定时器;token 变化则重启。
 */
export function startDesktopPresence(
  token: string,
  opts: StartDesktopPresenceOptions = {},
): void {
  if (!token) return;
  // 同 token 且仍在运行 → 复用,不重复起定时器。
  if (_running && _activeToken === token) return;

  stopDesktopPresence();
  _activeToken = token;
  _running = true;

  const intervalMs = Math.max(1_000, opts.intervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS);

  const beat = async () => {
    if (!_running || !_activeToken) return;
    const instanceId = resolveActivePresenceInstanceId();
    // relay/实例尚未就绪 → 本次跳过,下一拍再试(不报错、不中断周期)。
    if (!instanceId) return;
    try {
      const snapshot = await sendDesktopHeartbeat({
        instanceId,
        token: _activeToken,
        ttlSec: opts.ttlSec,
      });
      if (_running && snapshot) opts.onUpdate?.(snapshot);
    } catch (err) {
      // 失网/瞬时错误:吞掉以保证 interval 不中断(R8.6 重连自动恢复)。
      if (_running) opts.onError?.(err);
    }
  };

  // 立即上报一次,确保打开桌面端即尽快在线,不必等首个 interval。
  void beat();
  _timer = setInterval(() => void beat(), intervalMs);
}

/** 停止周期心跳并清理(登出/卸载时调用)。 */
export function stopDesktopPresence(): void {
  _running = false;
  _activeToken = null;
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

/** 周期心跳是否仍在运行(供诊断/测试)。 */
export function isDesktopPresenceRunning(): boolean {
  return _running;
}
