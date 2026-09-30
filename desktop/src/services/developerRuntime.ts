/**
 * developerRuntime — 桌面 D2 切片 3：Developer Runtime Host 的 WebView 接线。
 *
 * 移植自 09-15 DRH 分支（`e98f7092` services/developerRuntimeCommands.ts、`ae2d95b0`
 * services/desktopRuntimeIdentity.ts，REQ-desktop-005 的取用项）。这一层只调用 Rust 侧的
 * 9 个 `developer_runtime_*` 命令（src-tauri/src/developer_runtime/commands.rs），
 * 不自己推断结果：
 *
 * - 宿主没报的字段一律是 `unknown`，界面照实显示，不沿用上一次的状态。
 * - 身份只取 `developer_runtime_presentation` 里校验过的非秘密引用；不读 window
 *   全局变量、不读 localStorage；OpenClaw 实例 id 不是设备 id（持有 ≠ 所有）。
 * - 绑定、刷新、信任工作区在急停拉下时由 Rust 侧拒绝（`kill_switch_engaged`）；
 *   急停同时撤销运行时，撤销到应用重启为止。
 * - 本机运行时的结果一律是 LOCAL_RUNTIME_UNCERTIFIED：不产生回执，不算正式完成。
 */

export const DEVELOPER_RUNTIME_COMMANDS = [
  "developer_runtime_presentation",
  "developer_runtime_bootstrap",
  "developer_runtime_refresh",
  "developer_runtime_events",
  "developer_runtime_query",
  "developer_runtime_cancel",
  "developer_runtime_revoke",
  "developer_runtime_probe_vendor",
  "developer_runtime_trust_selected_workspace",
] as const;

export type DeveloperRuntimeCommand = (typeof DEVELOPER_RUNTIME_COMMANDS)[number];

export type RuntimeOutcome = "ok" | "unavailable" | "fail_closed" | "unknown";

/** 与 `developer_runtime/types.rs` 里的 `RuntimePresentation` 对应。 */
export interface RuntimePresentation {
  resultClass: string;
  environment: string;
  enabled: boolean;
  defaultOff: boolean;
  productionRoute: boolean;
  productionCertification: boolean;
  receiptClaim: boolean;
  canonicalSuccessClaim: boolean;
  replayAllowed: boolean;
  vendorProcessStarted: boolean;
  outcome: RuntimeOutcome;
  reasonCode?: string;
  payload?: Record<string, unknown>;
}

export const LOCAL_RUNTIME_UNCERTIFIED = "LOCAL_RUNTIME_UNCERTIFIED" as const;

type Unknown = "unknown";

export interface RuntimeStatusProjection {
  outcome: RuntimeOutcome;
  reasonCode: string | null;
  optedIn: boolean | Unknown;
  operational: boolean | Unknown;
  revoked: boolean | Unknown;
  bound: boolean | Unknown;
  vendorProcessStarted: boolean | Unknown;
  productionCertification: boolean | Unknown;
  deviceId: string | Unknown;
  bindingId: string | Unknown;
  bindingVersion: number | Unknown;
}

export interface DesktopRuntimeIdentity {
  deviceId: string;
  bindingId: string;
  bindingVersion: number;
  credentialRef: string;
}

export interface VendorProbeProjection {
  available: boolean | Unknown;
  reasonCode: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeOutcome(value: unknown): RuntimeOutcome {
  return value === "ok" || value === "unavailable" || value === "fail_closed" ? value : "unknown";
}

const INVALID_PRESENTATION: RuntimePresentation = {
  resultClass: "unknown",
  environment: "unknown",
  enabled: false,
  defaultOff: true,
  productionRoute: false,
  productionCertification: false,
  receiptClaim: false,
  canonicalSuccessClaim: false,
  replayAllowed: false,
  vendorProcessStarted: false,
  outcome: "unknown",
  reasonCode: "invalid_presentation",
};

/**
 * 宿主返回什么就是什么，但"放宽"类字段只认明确的 `true`，"收紧"类字段只认
 * 明确的 `false`：`defaultOff` 缺失当作仍然默认关闭；`receiptClaim`、
 * `canonicalSuccessClaim`、`replayAllowed` 缺失当作没有。
 */
export function normalizeRuntimePresentation(raw: unknown): RuntimePresentation {
  if (!isRecord(raw)) return { ...INVALID_PRESENTATION };
  return {
    resultClass: typeof raw.resultClass === "string" ? raw.resultClass : "unknown",
    environment: typeof raw.environment === "string" ? raw.environment : "unknown",
    enabled: raw.enabled === true,
    defaultOff: raw.defaultOff !== false,
    productionRoute: raw.productionRoute === true,
    productionCertification: raw.productionCertification === true,
    receiptClaim: raw.receiptClaim === true,
    canonicalSuccessClaim: raw.canonicalSuccessClaim === true,
    replayAllowed: raw.replayAllowed === true,
    vendorProcessStarted: raw.vendorProcessStarted === true,
    outcome: normalizeOutcome(raw.outcome),
    reasonCode: typeof raw.reasonCode === "string" ? raw.reasonCode : undefined,
    payload: isRecord(raw.payload) ? raw.payload : undefined,
  };
}

function boolOrUnknown(value: unknown): boolean | Unknown {
  return typeof value === "boolean" ? value : "unknown";
}

function stringOrUnknown(value: unknown): string | Unknown {
  return typeof value === "string" && value.length > 0 ? value : "unknown";
}

/** 把 `developer_runtime_presentation` 投影成界面事实；缺的一律 `unknown`。 */
export function projectRuntimeStatus(presentation: RuntimePresentation): RuntimeStatusProjection {
  const payload = presentation.outcome === "ok" && presentation.payload ? presentation.payload : {};
  return {
    outcome: presentation.outcome,
    reasonCode: presentation.reasonCode ?? null,
    optedIn: boolOrUnknown(payload.optedIn),
    operational: boolOrUnknown(payload.operational),
    revoked: boolOrUnknown(payload.revoked),
    bound: boolOrUnknown(payload.bound),
    vendorProcessStarted: boolOrUnknown(payload.vendorProcessStarted),
    productionCertification: boolOrUnknown(payload.productionCertification),
    deviceId: stringOrUnknown(payload.deviceId),
    bindingId: stringOrUnknown(payload.bindingId),
    bindingVersion:
      typeof payload.bindingVersion === "number" && Number.isFinite(payload.bindingVersion)
        ? payload.bindingVersion
        : "unknown",
  };
}

export function isCompleteDesktopRuntimeIdentity(value: unknown): value is DesktopRuntimeIdentity {
  if (!isRecord(value)) return false;
  return (
    typeof value.deviceId === "string" &&
    value.deviceId.length > 0 &&
    typeof value.bindingId === "string" &&
    value.bindingId.length > 0 &&
    typeof value.bindingVersion === "number" &&
    Number.isFinite(value.bindingVersion) &&
    typeof value.credentialRef === "string" &&
    value.credentialRef.length > 0
  );
}

/**
 * 只有 `outcome: "ok"`、没有撤销、四个引用齐全时才有身份；否则 `null`。
 * 参数是宿主的原始返回值，不接受别的来源。
 */
export function runtimeIdentityFromPresentation(raw: unknown): DesktopRuntimeIdentity | null {
  const presentation = normalizeRuntimePresentation(raw);
  if (presentation.outcome !== "ok" || !presentation.payload) return null;
  const fields = presentation.payload;
  if (fields.revoked !== false) return null;
  const candidate = {
    deviceId: fields.deviceId,
    bindingId: fields.bindingId,
    bindingVersion: fields.bindingVersion,
    credentialRef: fields.credentialRef,
  };
  return isCompleteDesktopRuntimeIdentity(candidate) ? candidate : null;
}

export function projectVendorProbe(presentation: RuntimePresentation): VendorProbeProjection {
  if (presentation.outcome !== "ok" || !presentation.payload) {
    return { available: "unknown", reasonCode: presentation.reasonCode || "unknown" };
  }
  const { available, reasonCode } = presentation.payload;
  return {
    available: boolOrUnknown(available),
    reasonCode: typeof reasonCode === "string" && reasonCode ? reasonCode : "unknown",
  };
}

// ── 界面文案 ──────────────────────────────────────────────────────────────

export type RuntimeStateLabel = "revoked" | "stopped" | "off" | "unbound" | "bound" | "unknown";

/** 状态优先级：已撤销 > 急停 > 默认关闭 > 未绑定 > 已绑定；看不清就是未知。 */
export function runtimeStateLabel(status: RuntimeStatusProjection, killSwitchEngaged: boolean): RuntimeStateLabel {
  if (status.revoked === true || status.reasonCode === "runtime_revoked") return "revoked";
  if (killSwitchEngaged) return "stopped";
  if (status.outcome !== "ok") {
    return status.reasonCode === "runtime_default_off" ? "off" : "unknown";
  }
  if (status.optedIn === false) return "off";
  if (status.bound === true && status.revoked === false) return "bound";
  if (status.bound === false) return "unbound";
  return "unknown";
}

export const RUNTIME_STATE_TEXT: Record<RuntimeStateLabel, string> = {
  revoked: "已撤销（重启应用后才能重新绑定）",
  stopped: "急停已拉下：不能绑定，也不能信任新的工作区",
  off: "默认关闭",
  unbound: "已开启，还没有绑定这台电脑",
  bound: "已绑定",
  unknown: "未知",
};

const REASON_TEXT: Record<string, string> = {
  runtime_default_off: "默认关闭",
  runtime_revoked: "已撤销，重启应用后才能重新绑定",
  kill_switch_engaged: "急停已拉下",
  binding_bootstrap_unavailable: "还没有绑定这台电脑",
  channel_credential_missing: "没有通道凭据",
  channel_credential_corrupt: "通道凭据损坏",
  workspace_trust_missing: "没有选择工作区",
  workspace_digest_mismatch: "所选文件夹和绑定的工作区不一致",
  workspace_untrusted: "工作区不可信（路径或文件权限不符合要求）",
  workspace_trust_io: "写入信任记录失败",
  vendor_cli_unavailable: "没有找到 Cursor agent CLI",
  vendor_cli_present_unverified: "找到了 Cursor agent CLI（还没验证能用）",
  command_not_allowlisted: "命令不在白名单里",
  runtime_lock: "运行时忙，请稍后再试",
  invalid_presentation: "宿主返回的格式无法识别",
};

export function describeRuntimeReason(reasonCode: string | null | undefined): string {
  if (!reasonCode) return "";
  if (reasonCode.startsWith("invoke_failed")) return "这个窗口不能调用本机运行时";
  return REASON_TEXT[reasonCode] || reasonCode;
}

// ── 调用 ─────────────────────────────────────────────────────────────────

async function invokeRaw(command: DeveloperRuntimeCommand, args?: Record<string, unknown>): Promise<unknown> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke(command, args);
}

async function invokeRuntime(command: DeveloperRuntimeCommand, args?: Record<string, unknown>): Promise<RuntimePresentation> {
  try {
    return normalizeRuntimePresentation(await invokeRaw(command, args));
  } catch (error) {
    return {
      ...INVALID_PRESENTATION,
      outcome: "unavailable",
      reasonCode: error instanceof Error && error.message ? `invoke_failed: ${error.message}` : "invoke_failed",
    };
  }
}

/** 读身份：只认宿主校验过的绑定；拿不到就是 `null`，不回落到本机存储。 */
export async function readDesktopRuntimeIdentity(): Promise<DesktopRuntimeIdentity | null> {
  try {
    return runtimeIdentityFromPresentation(await invokeRaw("developer_runtime_presentation"));
  } catch {
    return null;
  }
}

export const developerRuntime = {
  presentation: () => invokeRuntime("developer_runtime_presentation"),
  /** 第一次绑定。`bootstrapRef` 来自 backend 的绑定流程（桌面还没有入口）。 */
  bootstrap: (bootstrapRef: string) => invokeRuntime("developer_runtime_bootstrap", { bootstrap: { bootstrapRef } }),
  refresh: (bootstrapRef: string) => invokeRuntime("developer_runtime_refresh", { bootstrap: { bootstrapRef } }),
  events: (instructionRef: string) => invokeRuntime("developer_runtime_events", { instructionRef }),
  query: (instructionRef: string) => invokeRuntime("developer_runtime_query", { instructionRef }),
  cancel: (instructionRef: string) => invokeRuntime("developer_runtime_cancel", { instructionRef }),
  /** 撤销绑定：结束 agent 进程、删除通道凭据；在途的只能查询，不重放。 */
  revoke: () => invokeRuntime("developer_runtime_revoke"),
  probeVendor: () => invokeRuntime("developer_runtime_probe_vendor"),
  /** 信任工作区：文件夹选择框在 Rust 侧弹出，WebView 不提供路径。 */
  trustSelectedWorkspace: () => invokeRuntime("developer_runtime_trust_selected_workspace"),
};

export type DeveloperRuntimeApi = typeof developerRuntime;
