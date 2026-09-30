/**
 * emergencyStopLog — 桌面 D2 切片 4：急停记录。
 *
 * D2 的退出条件是"急停 3 秒内生效并留下回执"（产品文档 6.6）。服务端还没有
 * 设备收紧类操作的回执接口，这里先留本机记录：每次拉下 / 解除写一条，然后
 * 回读两道闸，记下用了多久：
 *
 * - 电脑侧闸门：`desktop_bridge_get_kill_switch` 读回的值和预期一致；
 * - 本机开发运行时（只在拉下时查）：`developer_runtime_presentation` 读回
 *   `revoked: true`（Rust 侧另起线程撤销，所以要轮询）。
 *
 * 记录只有时间、来源、计数和回读结果，没有命令内容。这是本机证据，不是
 * ActionReceipt；界面上照这个说。
 */
import type { KillSwitchOrigin } from "./executionFence";
import { developerRuntime } from "./developerRuntime";

export const EMERGENCY_STOP_LOG_KEY = "agentrix_desktop_emergency_stop_log";
export const EMERGENCY_STOP_LOG_CHANGED_EVENT = "agentrix:emergency-stop-log-changed";
/** 产品文档 6.6：急停 3 秒内生效。 */
export const EMERGENCY_STOP_BUDGET_MS = 3000;
const MAX_RECORDS = 50;
const POLL_INTERVAL_MS = 100;

/** confirmed：读回的值符合预期；not_confirmed：读回了但不符合，或到时间还没符合；unavailable：读不到。 */
export type GateReadback = "pending" | "confirmed" | "not_confirmed" | "unavailable";

export interface EmergencyStopRecord {
  id: string;
  kind: "engaged" | "released";
  at: string;
  origin: KillSwitchOrigin;
  reason?: string;
  /** 这次急停驳回的等待中审批数（只在拉下时有）。 */
  approvalsRejected?: number;
  nativeGate: GateReadback;
  /** 只在拉下时检查。 */
  runtime?: GateReadback;
  /** 从拉下 / 解除到两道闸都有结论用了多久。 */
  settledAfterMs?: number;
  /** 两道闸都确认，并且在 3 秒内。 */
  withinBudget?: boolean;
}

export interface EmergencyStopProbes {
  /** 返回电脑侧闸门当前是否拉下；读不到返回 null。 */
  readNativeGate: () => Promise<boolean | null>;
  /** 返回本机开发运行时是否已撤销；读不到返回 null。 */
  readRuntimeRevoked: () => Promise<boolean | null>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

function hasNativeHost(): boolean {
  return typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__?.invoke);
}

const defaultProbes: EmergencyStopProbes = {
  readNativeGate: async () => {
    if (!hasNativeHost()) return null;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const value = await invoke<unknown>("desktop_bridge_get_kill_switch");
      return typeof value === "boolean" ? value : null;
    } catch {
      return null;
    }
  },
  readRuntimeRevoked: async () => {
    if (!hasNativeHost()) return null;
    const shown = await developerRuntime.presentation();
    if (shown.outcome !== "ok" || !shown.payload) return null;
    return typeof shown.payload.revoked === "boolean" ? shown.payload.revoked : null;
  },
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

let probes: EmergencyStopProbes = defaultProbes;

/** 测试用。 */
export function __setEmergencyStopProbesForTests(next: Partial<EmergencyStopProbes> | null) {
  probes = next ? { ...defaultProbes, ...next } : defaultProbes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isRecordShape(value: unknown): value is EmergencyStopRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (value.kind === "engaged" || value.kind === "released") &&
    typeof value.at === "string" &&
    typeof value.origin === "string" &&
    typeof value.nativeGate === "string"
  );
}

export function listEmergencyStopRecords(): EmergencyStopRecord[] {
  try {
    const raw = globalThis.localStorage?.getItem(EMERGENCY_STOP_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isRecordShape) : [];
  } catch {
    return [];
  }
}

function writeRecords(records: EmergencyStopRecord[]): boolean {
  try {
    globalThis.localStorage?.setItem(EMERGENCY_STOP_LOG_KEY, JSON.stringify(records.slice(0, MAX_RECORDS)));
  } catch {
    return false;
  }
  try {
    window.dispatchEvent(new CustomEvent(EMERGENCY_STOP_LOG_CHANGED_EVENT));
  } catch {
    /* no window */
  }
  return true;
}

function patchRecord(id: string, patch: Partial<EmergencyStopRecord>) {
  const records = listEmergencyStopRecords();
  const index = records.findIndex((record) => record.id === id);
  if (index < 0) return;
  records[index] = { ...records[index], ...patch };
  writeRecords(records);
}

let sequence = 0;

/** 新的在前。存不进去也不影响急停本身。 */
export function recordEmergencyStop(input: {
  kind: EmergencyStopRecord["kind"];
  origin: KillSwitchOrigin;
  reason?: string;
  at?: string;
}): string {
  sequence += 1;
  const at = input.at || new Date(probes.now()).toISOString();
  const record: EmergencyStopRecord = {
    id: `es-${Date.parse(at) || probes.now()}-${sequence}`,
    kind: input.kind,
    at,
    origin: input.origin,
    reason: input.reason ? input.reason.slice(0, 80) : undefined,
    nativeGate: "pending",
    ...(input.kind === "engaged" ? { runtime: "pending" as const, approvalsRejected: 0 } : {}),
  };
  writeRecords([record, ...listEmergencyStopRecords()]);
  return record.id;
}

/** desktopApproval 在急停驳回等待中的审批时调用，记到最近一条"拉下"上。 */
export function noteApprovalsRejectedByEmergencyStop(count: number) {
  if (!Number.isFinite(count) || count <= 0) return;
  const latest = listEmergencyStopRecords().find((record) => record.kind === "engaged");
  if (!latest) return;
  patchRecord(latest.id, { approvalsRejected: (latest.approvalsRejected || 0) + count });
}

async function pollUntil(read: () => Promise<boolean | null>, expected: boolean, deadline: number): Promise<GateReadback> {
  let last: boolean | null = null;
  for (;;) {
    try {
      last = await read();
    } catch {
      last = null;
    }
    if (last === null) return "unavailable";
    if (last === expected) return "confirmed";
    if (probes.now() >= deadline) return "not_confirmed";
    await probes.sleep(POLL_INTERVAL_MS);
  }
}

/**
 * 回读两道闸并记下结果。`startedAt` 是拉下 / 解除那一刻（probes.now() 的值）。
 * 读不到原生宿主（浏览器、测试）时记为 unavailable，不算在 3 秒内。
 */
export async function verifyEmergencyStop(id: string, engaged: boolean, startedAt: number): Promise<EmergencyStopRecord | null> {
  const deadline = startedAt + EMERGENCY_STOP_BUDGET_MS;
  const nativeGate = await pollUntil(probes.readNativeGate, engaged, deadline);
  // Show the first gate as soon as it has a result (the countdown ring lights it up).
  // The runtime gate is still `pending`, so the receipt reporter skips this write.
  if (engaged) patchRecord(id, { nativeGate });
  const runtime = engaged ? await pollUntil(probes.readRuntimeRevoked, true, deadline) : undefined;
  const settledAfterMs = Math.max(0, probes.now() - startedAt);
  const confirmed = nativeGate === "confirmed" && (!engaged || runtime === "confirmed");
  patchRecord(id, {
    nativeGate,
    ...(engaged ? { runtime } : {}),
    settledAfterMs,
    withinBudget: confirmed && settledAfterMs <= EMERGENCY_STOP_BUDGET_MS,
  });
  return listEmergencyStopRecords().find((record) => record.id === id) || null;
}

export function nowForEmergencyStop(): number {
  return probes.now();
}

// ── 界面文案 ──────────────────────────────────────────────────────────────

const ORIGIN_TEXT: Record<string, string> = {
  tray: "托盘",
  settings: "设置",
  shortcut: "快捷键",
  "local-user": "本人",
  "remote-stop": "远程停止",
  test: "测试",
};

const READBACK_TEXT: Record<GateReadback, string> = {
  pending: "确认中",
  confirmed: "已确认",
  not_confirmed: "未确认",
  unavailable: "读不到",
};

export function describeEmergencyStopRecord(record: EmergencyStopRecord): string {
  const parts = [`${record.kind === "engaged" ? "拉下" : "解除"}（${ORIGIN_TEXT[record.origin] || record.origin}）`];
  parts.push(`电脑侧闸门${READBACK_TEXT[record.nativeGate]}`);
  if (record.kind === "engaged") {
    parts.push(`本机运行时撤销${READBACK_TEXT[record.runtime || "pending"]}`);
    if (record.approvalsRejected) parts.push(`驳回 ${record.approvalsRejected} 个待审批`);
  }
  if (typeof record.settledAfterMs === "number") {
    parts.push(
      record.withinBudget
        ? `${record.settledAfterMs} ms 内生效（3 秒内）`
        : `用时 ${record.settledAfterMs} ms，没有在 3 秒内全部确认`,
    );
  }
  return parts.join(" · ");
}
