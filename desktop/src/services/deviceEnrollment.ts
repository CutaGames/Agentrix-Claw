/**
 * deviceEnrollment — E32（REQ-desktop-018，合同 `shared/types/device-runtime-binding.ts`）：绑定这台电脑。
 *
 * - 本人在"这台电脑"里点"绑定这台电脑"：WebView 把当前登录的 JWT 交给 Rust **一次**
 *   （`developer_runtime_enroll`），Rust 跑完配对 → 登记签名凭据 → 建绑定 → 签发运行时凭据，
 *   不保存 JWT。设备私钥、DST、运行时凭据都只在钥匙串里，WebView 拿不到。
 * - 绑定以后，这台电脑在 desktop-sync 里用自证的 `dev_…` 设备 id（以前是 localStorage 里的
 *   `desktop-<uuid>`），L2 / L3 审批可以由 Rust 在原生确认框里签名批准
 *   （`developer_runtime_sign_approval`）。
 * - 宿主没说的一律按"没绑定"处理：`canSignApprovalsLocally()` 只在读到 `bound: true` 之后为真。
 */
import type { ApprovalLocalConfirmationV1 } from "../../../shared/types/approval-card";
import { SELF_CERTIFYING_DEVICE_ID_PATTERN_V1 } from "../../../shared/types/device-pairing-proof";
import { API_BASE, apiFetch } from "./store";

export const DEVICE_ENROLLMENT_CHANGED_EVENT = "agentrix:device-enrollment-changed";
/** 和 `services/desktop.ts` 的 `DEVICE_ID_KEY` 相同：desktop-sync 用它当设备 id。 */
export const DESKTOP_DEVICE_ID_KEY = "agentrix_desktop_device_id";

export interface DeviceEnrollmentStatus {
  deviceId: string | null;
  /** 绑定和运行时凭据都有效。 */
  enrolled: boolean;
  /** 绑定有效：审批签名能被服务端验证。 */
  bound: boolean;
  bindingExpiresAt: string | null;
  credentialExpiresAt: string | null;
  /** 这次启动开了开发者运行时（Gate B 的两个开关）。 */
  runtimeOptIn: boolean;
  /** 开发者运行时在这次启动里已经接上（宿主有核对过的绑定）。 */
  runtimeConnected: boolean;
}

export const UNKNOWN_ENROLLMENT: DeviceEnrollmentStatus = {
  deviceId: null,
  enrolled: false,
  bound: false,
  bindingExpiresAt: null,
  credentialExpiresAt: null,
  runtimeOptIn: false,
  runtimeConnected: false,
};

let cached: DeviceEnrollmentStatus = UNKNOWN_ENROLLMENT;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isoOrNull(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

export function normalizeEnrollmentStatus(raw: unknown, nowMs: number = Date.now()): DeviceEnrollmentStatus {
  if (!isRecord(raw)) return { ...UNKNOWN_ENROLLMENT };
  const deviceId = typeof raw.deviceId === "string" && SELF_CERTIFYING_DEVICE_ID_PATTERN_V1.test(raw.deviceId) ? raw.deviceId : null;
  const bindingExpiresAt = isoOrNull(raw.bindingExpiresAt);
  const credentialExpiresAt = isoOrNull(raw.credentialExpiresAt);
  const bindingLive = bindingExpiresAt !== null && Date.parse(bindingExpiresAt) > nowMs;
  const credentialLive = credentialExpiresAt !== null && Date.parse(credentialExpiresAt) > nowMs;
  return {
    deviceId,
    bound: deviceId !== null && raw.bound === true && bindingLive,
    enrolled: deviceId !== null && raw.enrolled === true && bindingLive && credentialLive,
    bindingExpiresAt,
    credentialExpiresAt,
    runtimeOptIn: raw.runtimeOptIn === true,
    runtimeConnected: raw.runtimeConnected === true,
  };
}

function hasNativeHost(): boolean {
  return typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__?.invoke);
}

async function invokeNative<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

function publish(next: DeviceEnrollmentStatus) {
  cached = next;
  // desktop-sync identifies this computer by its registry id once it is bound
  // (REQ-mobile-094: a `dev_…` id there means "this computer was bound").
  // The device key exists from the first binding attempt on, so a key alone
  // (an attempt that failed, nothing registered) keeps the `desktop-<uuid>` id.
  // Once switched, the id stays `dev_…` after the binding lapses: the old
  // `desktop-<uuid>` is gone, and a new one would only add another stale row.
  if (next.deviceId && next.bound) {
    try {
      localStorage.setItem(DESKTOP_DEVICE_ID_KEY, next.deviceId);
    } catch {
      /* storage unavailable */
    }
  }
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent(DEVICE_ENROLLMENT_CHANGED_EVENT, { detail: next }));
    } catch {
      /* non-DOM host */
    }
  }
}

/** 上次读到的状态（同步，给 `canSignApprovalsLocally()` 用）。 */
export function getCachedEnrollment(): DeviceEnrollmentStatus {
  return normalizeEnrollmentStatus(cached);
}

/** 测试用：回到"不知道"。 */
export function resetEnrollmentCacheForTests() {
  cached = UNKNOWN_ENROLLMENT;
}

export async function readEnrollmentStatus(): Promise<DeviceEnrollmentStatus> {
  if (!hasNativeHost()) return { ...UNKNOWN_ENROLLMENT };
  try {
    const next = normalizeEnrollmentStatus(await invokeNative<unknown>("developer_runtime_enrollment_status"));
    publish(next);
    return next;
  } catch {
    return { ...UNKNOWN_ENROLLMENT };
  }
}

export const ENROLLMENT_PROBE_TIMEOUT_MS = 5_000;
/** 这台电脑还没有设备密钥时，探测用的占位 id（格式合法；服务端只按它查，查不到就是 null）。 */
export const ENROLLMENT_PROBE_PLACEHOLDER_DEVICE_ID = `dev_${"0".repeat(32)}`;

/**
 * E73：后端的 E32 能力开着没有。只读，不建任何记录：
 * `GET /v1/devices/:id/signing-credentials/current?purpose=device-auth`。
 * 签名凭据 v1 关着时是 503；开着时是 200 `{ credential: … | null }`。
 * 只有 2xx 并且带 `credential` 字段才算开着；超时、网络错误、别的状态码、别的形状都算没开。
 * Rust 在配对之前还会再探测一次（`enrollment::probe_backend`），这里只决定显不显示入口。
 */
export async function probeEnrollmentAvailable(input: {
  userJwt: string | null | undefined;
  deviceId?: string | null;
  timeoutMs?: number;
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
}): Promise<boolean> {
  if (!input.userJwt) return false;
  const deviceId =
    input.deviceId && SELF_CERTIFYING_DEVICE_ID_PATTERN_V1.test(input.deviceId) ? input.deviceId : ENROLLMENT_PROBE_PLACEHOLDER_DEVICE_ID;
  const url = `${API_BASE}/v1/devices/${deviceId}/signing-credentials/current?purpose=device-auth`;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller?.abort();
      resolve(null);
    }, input.timeoutMs ?? ENROLLMENT_PROBE_TIMEOUT_MS);
  });
  try {
    const request = (input.fetchImpl ?? apiFetch)(url, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${input.userJwt}` },
      ...(controller ? { signal: controller.signal } : {}),
    });
    const response = await Promise.race([request, timeout]);
    if (!response || typeof response.status !== "number" || response.status < 200 || response.status >= 300) return false;
    const body: unknown = await Promise.race([response.json(), timeout]);
    const shaped = (value: unknown) => isRecord(value) && Object.prototype.hasOwnProperty.call(value, "credential");
    return shaped(body) || (isRecord(body) && shaped(body.data));
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface EnrollResult {
  ok: boolean;
  status: DeviceEnrollmentStatus;
  /** 运行时（DRW）这一步：开关没开时是 `skipped`。 */
  runtime?: { outcome: string; reasonCode?: string };
  reason?: string;
}

function errorReason(error: unknown): string {
  if (typeof error === "string" && error) return error;
  if (error instanceof Error && error.message) return error.message;
  return "invoke_failed";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * 本人点"绑定这台电脑"。`userJwt` 只在这一次调用里交给 Rust。
 * `agentAccountId` 是本人的主 Agent（`agentAccountIdOf(activeInstance)`）。
 */
export async function enrollThisComputer(input: { userJwt: string | null | undefined; agentAccountId: string | null | undefined; label: string }): Promise<EnrollResult> {
  if (!input.userJwt) return { ok: false, status: getCachedEnrollment(), reason: "signed_out" };
  if (!input.agentAccountId || !UUID.test(input.agentAccountId)) {
    return { ok: false, status: getCachedEnrollment(), reason: "no_agent" };
  }
  if (!hasNativeHost()) return { ok: false, status: getCachedEnrollment(), reason: "no_native_host" };
  try {
    const raw = await invokeNative<unknown>("developer_runtime_enroll", {
      request: { userJwt: input.userJwt, agentAccountId: input.agentAccountId, label: input.label },
    });
    const status = normalizeEnrollmentStatus(raw);
    publish(status);
    const runtime = isRecord(raw) && isRecord(raw.runtime)
      ? { outcome: String(raw.runtime.outcome ?? "unknown"), ...(typeof raw.runtime.reasonCode === "string" ? { reasonCode: raw.runtime.reasonCode } : {}) }
      : undefined;
    return { ok: status.bound, status, ...(runtime ? { runtime } : {}), ...(status.bound ? {} : { reason: "not_bound" }) };
  } catch (error) {
    return { ok: false, status: getCachedEnrollment(), reason: errorReason(error) };
  }
}

/**
 * D5 第 2 片：绑定还有效、运行时凭据过期了（没开开发者运行时的时候没有循环替它刷新），
 * 本人在交付台点"让电脑先备一份"时，用这次的登录只重做第 4 步。`userJwt` 只在这一次调用里交给 Rust。
 * 不配对、不建绑定、不选工作区；凭据还有效时 Rust 什么都不发。
 */
export async function renewRuntimeCredential(userJwt: string | null | undefined): Promise<{ ok: boolean; reason?: string }> {
  if (!userJwt) return { ok: false, reason: "signed_out" };
  if (!hasNativeHost()) return { ok: false, reason: "no_native_host" };
  try {
    const status = normalizeEnrollmentStatus(
      await invokeNative<unknown>("developer_runtime_order_renew_credential", { request: { userJwt } }),
    );
    publish(status);
    return status.enrolled ? { ok: true } : { ok: false, reason: "not_enrolled" };
  } catch (error) {
    return { ok: false, reason: errorReason(error).split(":")[0] };
  }
}

/** 退出登录时：吊销这台电脑的运行时凭据（设备密钥和绑定保留）。 */
export async function unenrollThisComputer(): Promise<boolean> {
  if (!hasNativeHost()) return false;
  try {
    const raw = await invokeNative<unknown>("developer_runtime_unenroll");
    await readEnrollmentStatus();
    return isRecord(raw) && raw.serverConfirmed === true;
  } catch {
    return false;
  }
}

export interface SignApprovalInput {
  approvalId: string;
  requestDigest: string;
  title: string;
  riskLevel: string;
}

export class ApprovalSignatureRefusedError extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

const SIGNATURE = /^[A-Za-z0-9_-]{86}$/;
const REF = /^l3c-[0-9a-f]{16,128}$/;

/**
 * Rust 在原生确认框里请本人确认，点确定才用设备密钥签。本人取消、没绑定、急停拉下都抛
 * `ApprovalSignatureRefusedError`。返回值的格式先按合同校验，不对就当没签。
 */
export async function signApprovalLocally(input: SignApprovalInput): Promise<ApprovalLocalConfirmationV1> {
  if (!hasNativeHost()) throw new ApprovalSignatureRefusedError("no_native_host");
  let raw: unknown;
  try {
    raw = await invokeNative<unknown>("developer_runtime_sign_approval", {
      request: { approvalId: input.approvalId, requestDigest: input.requestDigest, title: input.title, riskLevel: input.riskLevel },
    });
  } catch (error) {
    throw new ApprovalSignatureRefusedError(errorReason(error));
  }
  if (!isRecord(raw) || typeof raw.ref !== "string" || !REF.test(raw.ref) || typeof raw.signature !== "string" || !SIGNATURE.test(raw.signature)) {
    throw new ApprovalSignatureRefusedError("invalid_response");
  }
  return { ref: raw.ref, signature: raw.signature };
}
