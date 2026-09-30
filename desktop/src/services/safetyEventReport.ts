/**
 * safetyEventReport — 急停回执上报（REQ-desktop-010 / REQ-backend-047，合同 `shared/types/device-safety-event.ts`）。
 *
 * 本机急停先生效、先记在本机（emergencyStopLog），这里之后再把记录报给服务端，手机和 Web 能在
 * "事项 → 电脑上"看到。上报失败永远不影响本机急停。
 *
 * - 只报两道闸都有结论的记录（没有 `pending`）；`origin: test` 的不报。事件原样取本机记录的字段，
 *   先用 `validateDeviceSafetyEventV1` 校验。
 * - 设备签名由 Rust 做（`developer_runtime_sign_safety_event`，用这台电脑登记过的签名凭据）；
 *   这台电脑还没绑定（`not_enrolled`）就只留在本机，下次再看。
 * - WebView 用本人的登录凭据发 `POST /api/v1/device-safety-events`：
 *   2xx（包括重放）记为已报；503、5xx、断网、401 留着下次再试；400 / 403 / 409 不再重试，记一行原因。
 * - 什么时候试：登录以后、急停记录有变化时、网络恢复时。不加定时轮询（E64）。
 */
import {
  DEVICE_SAFETY_EVENT_ROUTES,
  deviceSafetyEventDigestV1,
  validateDeviceSafetyEventV1,
  validateRecordDeviceSafetyEventRequestV1,
  type DeviceSafetyEventV1,
} from "../../../shared/types/device-safety-event";
import { EMERGENCY_STOP_LOG_CHANGED_EVENT, EMERGENCY_STOP_LOG_KEY, listEmergencyStopRecords, type EmergencyStopRecord } from "./emergencyStopLog";
import { API_BASE, apiFetch } from "./store";

export const SAFETY_EVENT_REPORTS_KEY = "agentrix_desktop_safety_event_reports";
const MAX_TRACKED = 200;

/** 每条本机记录的上报结果：`reported`，或者 `rejected:<原因>`（不再重试）。 */
export type SafetyEventReportState = "reported" | `rejected:${string}`;

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

export function readReportStates(): Record<string, SafetyEventReportState> {
  try {
    const raw = globalThis.localStorage?.getItem(SAFETY_EVENT_REPORTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, SafetyEventReportState] => typeof entry[1] === "string" && (entry[1] === "reported" || entry[1].startsWith("rejected:")),
      ),
    );
  } catch {
    return {};
  }
}

function writeReportState(id: string, state: SafetyEventReportState) {
  const states = readReportStates();
  states[id] = state;
  // Keep the newest ids only (ids start with the event time).
  const ids = Object.keys(states).sort().slice(-MAX_TRACKED);
  try {
    globalThis.localStorage?.setItem(SAFETY_EVENT_REPORTS_KEY, JSON.stringify(Object.fromEntries(ids.map((key) => [key, states[key]]))));
  } catch {
    /* next run tries again; the server treats a replay as the same receipt */
  }
}

/** 本机记录 → 合同里的事件。还没结论、测试来源或者不合格式的返回 null（不报）。 */
export function toDeviceSafetyEvent(record: EmergencyStopRecord): DeviceSafetyEventV1 | null {
  if (record.origin === "test") return null;
  if (record.nativeGate === "pending" || record.runtime === "pending") return null;
  const event: Record<string, unknown> = {
    id: record.id,
    kind: record.kind,
    at: record.at,
    origin: record.origin,
    reason: record.reason,
    approvalsRejected: record.approvalsRejected,
    nativeGate: record.nativeGate,
    runtime: record.kind === "engaged" ? record.runtime : undefined,
    settledAfterMs: record.settledAfterMs,
    withinBudget: record.withinBudget,
  };
  for (const key of Object.keys(event)) if (event[key] === undefined) delete event[key];
  return validateDeviceSafetyEventV1(event).valid ? (event as unknown as DeviceSafetyEventV1) : null;
}

function errorReason(error: unknown): string {
  if (typeof error === "string" && error) return error;
  if (error instanceof Error && error.message) return error.message;
  return "invoke_failed";
}

async function defaultInvoke(command: string, args?: Record<string, unknown>): Promise<unknown> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke(command, args);
}

function hasNativeHost(): boolean {
  return typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__?.invoke);
}

export interface ReportRunResult {
  reported: string[];
  rejected: string[];
  /** 这一轮为什么停下（留着下次再试）；全部报完是 null。 */
  stoppedBy: string | null;
}

const RECORD_ROUTE_PATH = DEVICE_SAFETY_EVENT_ROUTES.record.replace(/^POST \/api/, "");

/** 报一轮：旧的在前，一条一条来；遇到"稍后再试"的情况就停。 */
export async function reportPendingSafetyEvents(input: {
  token: string | null | undefined;
  fetchImpl?: Fetch;
  invokeImpl?: Invoke;
}): Promise<ReportRunResult> {
  const result: ReportRunResult = { reported: [], rejected: [], stoppedBy: null };
  if (!input.token) return { ...result, stoppedBy: "signed_out" };
  if (!input.invokeImpl && !hasNativeHost()) return { ...result, stoppedBy: "no_native_host" };
  const invoke = input.invokeImpl ?? defaultInvoke;
  const fetchImpl = input.fetchImpl ?? apiFetch;
  const states = readReportStates();
  const pending = listEmergencyStopRecords()
    .filter((record) => !states[record.id])
    .map((record) => ({ record, event: toDeviceSafetyEvent(record) }))
    .filter((item): item is { record: EmergencyStopRecord; event: DeviceSafetyEventV1 } => item.event !== null)
    .reverse();
  for (const { record, event } of pending) {
    let body: unknown;
    try {
      body = await invoke("developer_runtime_sign_safety_event", { event });
    } catch (error) {
      const reason = errorReason(error);
      // Not bound yet, keychain unavailable, …: keep it local and try another time.
      if (!reason.startsWith("safety_event_invalid")) return { ...result, stoppedBy: reason };
      writeReportState(record.id, `rejected:${reason}`);
      result.rejected.push(record.id);
      continue;
    }
    // What Rust signed must be exactly this event (same contract digest), in the contract's shape.
    if (!validateRecordDeviceSafetyEventRequestV1(body).valid) return { ...result, stoppedBy: "invalid_signature_response" };
    const signed = body as { deviceId: string; signerRef: string; signedAt: string; signature: string; event: DeviceSafetyEventV1 };
    if (deviceSafetyEventDigestV1(signed.event) !== deviceSafetyEventDigestV1(event)) {
      return { ...result, stoppedBy: "invalid_signature_response" };
    }
    let response: Response | undefined;
    try {
      response = await fetchImpl(`${API_BASE}${RECORD_ROUTE_PATH}`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${input.token}` },
        body: JSON.stringify({ deviceId: signed.deviceId, signerRef: signed.signerRef, signedAt: signed.signedAt, signature: signed.signature, event }),
      });
    } catch {
      return { ...result, stoppedBy: "network" };
    }
    if (!response) return { ...result, stoppedBy: "network" };
    if (response.status >= 200 && response.status < 300) {
      writeReportState(record.id, "reported");
      result.reported.push(record.id);
      continue;
    }
    if (response.status === 400 || response.status === 403 || response.status === 409) {
      let code = `http_${response.status}`;
      try {
        const payload = (await response.json()) as { code?: unknown };
        if (typeof payload?.code === "string" && /^[A-Za-z0-9_]{1,64}$/.test(payload.code)) code = payload.code;
      } catch {
        /* keep the status */
      }
      writeReportState(record.id, `rejected:${code}`);
      result.rejected.push(record.id);
      continue;
    }
    // 401 (sign in again), 404 (route not deployed), 429, 5xx: later.
    return { ...result, stoppedBy: `http_${response.status}` };
  }
  return result;
}

/**
 * 主窗口登录以后调用：先报一轮，之后急停记录变化、网络恢复时再报。返回停止函数。
 * 同一时间只跑一轮；跑的时候又有变化，跑完再补一轮。
 */
export function startSafetyEventReporter(token: string, options: { fetchImpl?: Fetch; invokeImpl?: Invoke } = {}): () => void {
  let stopped = false;
  let running = false;
  let again = false;
  const run = async () => {
    if (stopped) return;
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        await reportPendingSafetyEvents({ token, ...options });
      } while (again && !stopped);
    } catch {
      /* never let reporting disturb the app */
    } finally {
      running = false;
    }
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === EMERGENCY_STOP_LOG_KEY) void run();
  };
  const onChange = () => void run();
  window.addEventListener(EMERGENCY_STOP_LOG_CHANGED_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  window.addEventListener("online", onChange);
  void run();
  return () => {
    stopped = true;
    window.removeEventListener(EMERGENCY_STOP_LOG_CHANGED_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("online", onChange);
  };
}
