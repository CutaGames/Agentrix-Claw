/**
 * executionFence.ts — 桌面 D0：本机副作用的唯一 fence。
 *
 * 三条会在这台电脑上产生副作用的通道都先经过这里：
 *   - "agent-sync"     后端 desktop-sync 命令队列（手机、云端聊天下发）
 *   - "remote-control" 手机经后端转发的 `remote-control:run`
 *   - "chat-tool"      本机模型聊天里的桌面工具
 *
 * 规则（按顺序，任何一步不过就拒绝，fail closed）：
 *   1. 未登记的命令一律拒绝，不受任何开关影响。
 *   2. 急停（kill switch）拉下时，只放行 safety_control（停止类）命令。
 *   3. 远程来源的 mutating 命令需要本机开关"允许远程改动"（默认关闭）。
 *      语义与 backend 的 `AGENTRIX_REMOTE_MUTATION_COMMANDS_ENABLED` 相同：
 *      read_only 与 safety_control 不受开关限制，unknown 永远拒绝。
 *   4. raw shell（运行任意命令）需要本机开关"允许运行命令"（默认关闭），
 *      三条通道一视同仁；开了以后每次都要审批，不能"本次会话记住"。
 *   5. Computer Use / 浏览器自动化类命令需要对应的本机开关已打开。
 *   6. 路径与 URL 校验：远程来源只能访问已选工作区内的路径；密钥类文件
 *      远程一律拒绝；URL 只允许 http(s)。
 *   7. 风险分级决定审批：L0 免审批；L1/L2 需要审批；L3 必须在这台电脑上确认。
 *      "本次会话记住"只对本机聊天来源的 L1 生效（backend 禁止 L2/L3 记住）。
 *
 * 分类表与 backend `remote-mutation-policy.ts` 保持一致，见
 * `src/test/executionFence.parity.test.ts`。
 */
import { REMOTE_CONTROL_WHITELIST } from "../../../shared/types/remote-control.ts";
import type { ApprovalRiskLevel } from "./desktop";
import { nowForEmergencyStop, recordEmergencyStop, verifyEmergencyStop } from "./emergencyStopLog";
import { parseApiErrorBodyV1 } from "../../../shared/types/api-error";

export type FenceSource = "agent-sync" | "remote-control" | "chat-tool";
export type FenceEffect = "read_only" | "mutating" | "safety_control" | "unknown";
export type FenceApproval = "none" | "required" | "local";
export type FenceCapability = "computer-use" | "browser";

export type FenceDenyReason =
  | "unknown_command"
  | "kill_switch_engaged"
  | "remote_mutation_disabled"
  | "raw_shell_disabled"
  | "computer_use_disabled"
  | "browser_automation_disabled"
  | "sensitive_path"
  | "outside_workspace"
  | "invalid_path"
  | "invalid_url"
  | "payload_ref_unsupported"
  | "replayed_request"
  | "missing_request_id"
  | "journal_unavailable";

export interface FenceRequest {
  source: FenceSource;
  /** 通道里的原始命令名：desktop-sync kind、remote-control command 或聊天工具名。 */
  command: string;
  payload?: Record<string, unknown>;
  /** desktop-sync 的不透明数据面引用；桌面端目前无法解析，带了就拒绝。 */
  payloadRef?: unknown;
  /** 已选工作区的绝对路径；远程来源的路径必须落在它里面。 */
  workspaceRoot?: string | null;
}

export interface FenceDecision {
  allowed: boolean;
  reason?: FenceDenyReason;
  source: FenceSource;
  command: string;
  /** 规范化后的动作类型，用于审批记录和"本次会话记住"的键。 */
  kind: string;
  effect: FenceEffect;
  riskLevel: ApprovalRiskLevel;
  approval: FenceApproval;
  allowRemember: boolean;
  sessionKey?: string;
}

interface CommandSpec {
  kind: string;
  effect: Exclude<FenceEffect, "unknown">;
  risk: ApprovalRiskLevel;
  /** 远程来源时改用的风险级别（通常是升到 L3，要求本机确认）。 */
  remoteRisk?: ApprovalRiskLevel;
  shell?: boolean;
  capability?: FenceCapability;
  /** payload 里携带文件路径的字段名。 */
  pathArg?: string;
  /** 路径可以为空（表示工作区根目录）。 */
  pathOptional?: boolean;
  /** payload 里携带 URL 的字段名。 */
  urlArg?: string;
  /** 允许"本次会话记住"（只对 L1/L2、非密钥路径生效）。 */
  remember?: boolean;
}

function spec(kind: string, effect: CommandSpec["effect"], risk: ApprovalRiskLevel, extra: Partial<CommandSpec> = {}): CommandSpec {
  return { kind, effect, risk, ...extra };
}

/** desktop-sync 命令队列：键与 backend `REMOTE_*_DESKTOP_COMMAND_KINDS` 一一对应。 */
const AGENT_SYNC_COMMANDS = new Map<string, CommandSpec>([
  ["context", spec("context", "read_only", "L0")],
  ["active-window", spec("active-window", "read_only", "L0")],
  ["list-windows", spec("list-windows", "read_only", "L0")],
  ["list-directory", spec("list-directory", "read_only", "L0", { pathArg: "path", pathOptional: true })],
  ["read-file", spec("read-file", "read_only", "L0", { pathArg: "path" })],
  ["computer-use-screenshot", spec("computer-use-screenshot", "read_only", "L0", { capability: "computer-use" })],
  ["computer-use-window-tree", spec("computer-use-window-tree", "read_only", "L0", { capability: "computer-use" })],
  ["computer-use-browser-list-tabs", spec("computer-use-browser-list-tabs", "read_only", "L0", { capability: "browser" })],
  ["git-status", spec("git-status", "read_only", "L0")],
  ["git-diff", spec("git-diff", "read_only", "L0")],
  ["git-log", spec("git-log", "read_only", "L0")],
  ["run-command", spec("run-command", "mutating", "L2", { shell: true })],
  ["write-file", spec("write-file", "mutating", "L1", { pathArg: "path", remember: true })],
  ["open-browser", spec("open-browser", "mutating", "L1", { urlArg: "url", remember: true })],
  ["computer-use-click", spec("computer-use-click", "mutating", "L2", { capability: "computer-use" })],
  ["computer-use-move", spec("computer-use-move", "mutating", "L0", { capability: "computer-use" })],
  ["computer-use-type", spec("computer-use-type", "mutating", "L2", { capability: "computer-use" })],
  ["computer-use-key", spec("computer-use-key", "mutating", "L2", { capability: "computer-use" })],
  ["computer-use-browser-navigate", spec("computer-use-browser-navigate", "mutating", "L1", { capability: "browser", urlArg: "url", remember: true })],
  ["computer-use-browser-eval", spec("computer-use-browser-eval", "mutating", "L2", { capability: "browser", remoteRisk: "L3" })],
  ["computer-use-browser-click-selector", spec("computer-use-browser-click-selector", "mutating", "L2", { capability: "browser" })],
  ["world-creation-task", spec("world-creation-task", "mutating", "L0")],
  ["git-commit", spec("git-commit", "mutating", "L2")],
  ["git-push", spec("git-push", "mutating", "L3")],
  ["git-pull", spec("git-pull", "mutating", "L2")],
  ["git-checkout", spec("git-checkout", "mutating", "L2")],
]);

/**
 * remote-control：只登记桌面端真正会执行的命令。`speaker.*`、`watch.*`、
 * `device.status.query` 在 backend 白名单里，但桌面端不实现，按未知命令拒绝。
 */
const REMOTE_CONTROL_COMMANDS = new Map<string, CommandSpec>([
  ["desktop.computer-use.stop", spec("desktop.computer-use.stop", "safety_control", "L0")],
  ["desktop.computer-use.start", spec("desktop.computer-use.start", "mutating", "L2", { remoteRisk: "L3" })],
  ["desktop.pro-mode.toggle", spec("desktop.pro-mode.toggle", "mutating", "L0")],
  ["desktop.aira-work-mode.start", spec("desktop.aira-work-mode.start", "mutating", "L0")],
]);

/** 本机模型聊天里的桌面工具。 */
const CHAT_TOOL_COMMANDS = new Map<string, CommandSpec>([
  ["get_current_time", spec("chat.get-current-time", "read_only", "L0")],
  ["recall_memory", spec("chat.recall-memory", "read_only", "L0")],
  ["save_memory", spec("chat.save-memory", "mutating", "L0")],
  ["search_skills", spec("chat.search-skills", "read_only", "L0")],
  ["get_installed_skills", spec("chat.get-installed-skills", "read_only", "L0")],
  ["agent_run", spec("chat.agent-run", "mutating", "L0")],
  ["search_workspace_files", spec("search-workspace-files", "read_only", "L0")],
  ["list_directory", spec("list-directory", "read_only", "L0", { pathArg: "path", pathOptional: true })],
  ["read_file", spec("read-file", "read_only", "L0", { pathArg: "path" })],
  ["index_workspace_code", spec("index-workspace-code", "read_only", "L0")],
  ["search_workspace_symbols", spec("search-workspace-symbols", "read_only", "L0")],
  ["semantic_search_workspace_code", spec("semantic-search-workspace-code", "read_only", "L0")],
  ["write_file", spec("write-file", "mutating", "L1", { pathArg: "path", remember: true })],
  ["run_command", spec("run-command", "mutating", "L2", { shell: true })],
  ["run_auto_repair_command", spec("run-command", "mutating", "L2", { shell: true })],
  ["git_push", spec("git-push", "mutating", "L3")],
  ["git_pull", spec("git-pull", "mutating", "L2")],
  ["git_checkout", spec("git-checkout", "mutating", "L2")],
  ["git_stash", spec("git-stash", "mutating", "L2")],
  ["computer_use_screenshot", spec("computer-use-screenshot", "read_only", "L0", { capability: "computer-use" })],
  ["computer_use_window_tree", spec("computer-use-window-tree", "read_only", "L0", { capability: "computer-use" })],
  ["computer_use_ground_active_window", spec("computer-use-ground-active-window", "read_only", "L0", { capability: "computer-use" })],
  ["computer_use_move", spec("computer-use-move", "mutating", "L0", { capability: "computer-use" })],
  ["computer_use_focus_window_active", spec("computer-use-focus-window", "mutating", "L0", { capability: "computer-use" })],
  ["computer_use_click", spec("computer-use-click", "mutating", "L2", { capability: "computer-use" })],
  ["computer_use_click_mark", spec("computer-use-click", "mutating", "L2", { capability: "computer-use" })],
  ["computer_use_type", spec("computer-use-type", "mutating", "L2", { capability: "computer-use" })],
  ["computer_use_key", spec("computer-use-key", "mutating", "L2", { capability: "computer-use" })],
  ["computer_use_browser_list_tabs", spec("computer-use-browser-list-tabs", "read_only", "L0", { capability: "browser" })],
  ["computer_use_browser_navigate", spec("computer-use-browser-navigate", "mutating", "L1", { capability: "browser", urlArg: "url", remember: true })],
  ["computer_use_browser_eval", spec("computer-use-browser-eval", "mutating", "L2", { capability: "browser" })],
  ["computer_use_browser_click_selector", spec("computer-use-browser-click-selector", "mutating", "L2", { capability: "browser" })],
]);

const REGISTRIES: Record<FenceSource, Map<string, CommandSpec>> = {
  "agent-sync": AGENT_SYNC_COMMANDS,
  "remote-control": REMOTE_CONTROL_COMMANDS,
  "chat-tool": CHAT_TOOL_COMMANDS,
};

/** 供测试和对齐检查使用：各通道登记的命令名。 */
export function listFenceCommands(source: FenceSource): string[] {
  return [...REGISTRIES[source].keys()];
}

/** 供对齐检查使用：登记命令的效果分类；未登记返回 "unknown"。 */
export function classifyFenceCommand(source: FenceSource, command: unknown): FenceEffect {
  if (typeof command !== "string") return "unknown";
  return REGISTRIES[source].get(command)?.effect ?? "unknown";
}

/**
 * remote-control 登记表只能是 shared 白名单的子集。白名单里去掉的命令在这里
 * 也去掉（按未知命令拒绝）；不抛异常，免得 shared 改动让桌面启动崩溃。
 * 对齐由 executionFence.parity.test.ts 把关。
 */
export function pruneRemoteControlRegistry(whitelist: readonly string[]): string[] {
  const removed: string[] = [];
  for (const command of [...REMOTE_CONTROL_COMMANDS.keys()]) {
    if (!whitelist.includes(command)) {
      REMOTE_CONTROL_COMMANDS.delete(command);
      removed.push(command);
    }
  }
  if (removed.length > 0) {
    // eslint-disable-next-line no-console
    console.error(`[executionFence] remote-control commands not in REMOTE_CONTROL_WHITELIST were disabled: ${removed.join(", ")}`);
  }
  return removed;
}

pruneRemoteControlRegistry(REMOTE_CONTROL_WHITELIST as readonly string[]);

// ── 本机开关 ──────────────────────────────────────────────────────────────
//
// 精确为 "1" 才算打开，其余（缺失、"true"、"yes"、读取出错）都算关闭，
// 与 backend 的 exact opt-in 语义一致。
//
// 与 backend 三个远程执行开关的对应（I-004，生产里都是 false）：
//   AGENTRIX_REMOTE_MUTATION_COMMANDS_ENABLED
//       ↔ 本机 agentrix_desktop_remote_mutation_commands_enabled（同名同义：
//         read_only / safety_control 不受限，mutating 需要打开，unknown 永远拒绝）。
//         backend 在 claim 时执行；桌面在 claim 成功后再按本机开关判一次。
//   AGENTRIX_REMOTE_COMMAND_RAW_PAYLOAD_ENABLED
//       ↔ 桌面没有单独开关：backend 关闭时下发 opaque payloadRef，桌面暂不支持
//         解析，按 payload_ref_unsupported 拒绝（fail closed）。
//   AGENTRIX_DESKTOP_SESSION_RAW_MESSAGES_ENABLED
//       ↔ 会话同步，不产生本机副作用，不经过本 fence。
// raw shell（agentrix_desktop_raw_shell_enabled）是桌面独有的本机开关。

export const REMOTE_MUTATION_ENABLED_KEY = "agentrix_desktop_remote_mutation_commands_enabled";
export const RAW_SHELL_ENABLED_KEY = "agentrix_desktop_raw_shell_enabled";
export const KILL_SWITCH_KEY = "agentrix_desktop_kill_switch";
export const COMPUTER_USE_ENABLED_KEY = "agentrix_computer_use_enabled";
export const COMPUTER_USE_BROWSER_KEY = "agentrix_computer_use_browser_enabled";

export const FENCE_SETTINGS_CHANGED_EVENT = "agentrix:execution-fence-changed";
export const KILL_SWITCH_CHANGED_EVENT = "agentrix:kill-switch-changed";
export const EMERGENCY_STOP_EVENT = "agentrix:emergency-stop";

function readFlag(key: string): boolean {
  try {
    return globalThis.localStorage?.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string, enabled: boolean) {
  try {
    globalThis.localStorage?.setItem(key, enabled ? "1" : "0");
  } catch {
    /* storage unavailable — flag stays at its fail-closed default */
  }
}

function dispatchWindowEvent(name: string, detail: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch {
    /* non-DOM host */
  }
}

export function isRemoteMutationEnabled(): boolean {
  return readFlag(REMOTE_MUTATION_ENABLED_KEY);
}

export function setRemoteMutationEnabled(enabled: boolean) {
  writeFlag(REMOTE_MUTATION_ENABLED_KEY, enabled);
  dispatchWindowEvent(FENCE_SETTINGS_CHANGED_EVENT, { key: REMOTE_MUTATION_ENABLED_KEY, enabled });
}

export function isRawShellEnabled(): boolean {
  return readFlag(RAW_SHELL_ENABLED_KEY);
}

export function setRawShellEnabled(enabled: boolean) {
  writeFlag(RAW_SHELL_ENABLED_KEY, enabled);
  dispatchWindowEvent(FENCE_SETTINGS_CHANGED_EVENT, { key: RAW_SHELL_ENABLED_KEY, enabled });
}

function isCapabilityEnabled(capability: FenceCapability): boolean {
  return capability === "computer-use"
    ? readFlag(COMPUTER_USE_ENABLED_KEY)
    : readFlag(COMPUTER_USE_BROWSER_KEY);
}

// ── 急停（kill switch）────────────────────────────────────────────────────
//
// 拉下后，除停止类命令外，三条通道全部拒绝；同时关掉 Computer Use 与浏览器
// 自动化开关、驳回所有等待中的审批。只能在这台电脑上由本人解除，远程只能
// 拉下不能解除（D16：手机和桌面只做收紧类操作）。

export type KillSwitchOrigin = "tray" | "settings" | "shortcut" | "local-user" | "remote-stop" | "test";

export interface KillSwitchState {
  engaged: boolean;
  engagedAt?: string;
  origin?: KillSwitchOrigin;
  reason?: string;
}

type KillSwitchListener = (state: KillSwitchState) => void;

let memoryKillSwitch: KillSwitchState = { engaged: false };
const killSwitchListeners = new Set<KillSwitchListener>();

function parseKillSwitch(raw: string | null | undefined): KillSwitchState | null {
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<KillSwitchState>;
    if (parsed && parsed.engaged === true) {
      return {
        engaged: true,
        engagedAt: typeof parsed.engagedAt === "string" ? parsed.engagedAt : undefined,
        origin: parsed.origin,
        reason: typeof parsed.reason === "string" ? parsed.reason : undefined,
      };
    }
    return { engaged: false };
  } catch {
    // 写坏的值按"已拉下"处理：宁可多停，不可漏停。
    return { engaged: true, reason: "unreadable_kill_switch_state" };
  }
}

export function getKillSwitchState(): KillSwitchState {
  if (memoryKillSwitch.engaged) return memoryKillSwitch;
  try {
    const stored = parseKillSwitch(globalThis.localStorage?.getItem(KILL_SWITCH_KEY));
    if (stored) return stored;
  } catch {
    /* fall through to memory */
  }
  return memoryKillSwitch;
}

export function isKillSwitchEngaged(): boolean {
  return getKillSwitchState().engaged;
}

export function onKillSwitchChange(listener: KillSwitchListener): () => void {
  killSwitchListeners.add(listener);
  return () => {
    killSwitchListeners.delete(listener);
  };
}

function notifyKillSwitch(state: KillSwitchState) {
  for (const listener of [...killSwitchListeners]) {
    try {
      listener(state);
    } catch {
      /* one listener must not block the others */
    }
  }
  dispatchWindowEvent(KILL_SWITCH_CHANGED_EVENT, state);
}

async function mirrorKillSwitchToNative(engaged: boolean) {
  // Rust 侧的第二道闸（desktop_bridge_set_kill_switch）。旧版本没有这个命令，
  // 失败时忽略：TypeScript fence 已经生效。
  try {
    if (typeof window === "undefined" || !(window as any).__TAURI_INTERNALS__?.invoke) return;
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("desktop_bridge_set_kill_switch", { engaged });
  } catch {
    /* older native host */
  }
}

async function syncKillSwitchWithNative() {
  let nativeEngaged: boolean | null = null;
  try {
    if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__?.invoke) {
      const { invoke } = await import("@tauri-apps/api/core");
      nativeEngaged = Boolean(await invoke<boolean>("desktop_bridge_get_kill_switch"));
    }
  } catch {
    nativeEngaged = null; // older native host
  }
  if (nativeEngaged && !isKillSwitchEngaged()) {
    engageKillSwitch({ origin: "tray", reason: "native_kill_switch_engaged" });
    return;
  }
  await mirrorKillSwitchToNative(isKillSwitchEngaged());
}

function applyEngagedSideEffects(state: KillSwitchState) {
  writeFlag(COMPUTER_USE_ENABLED_KEY, false);
  writeFlag(COMPUTER_USE_BROWSER_KEY, false);
  dispatchWindowEvent("agentrix:computer-use-changed", { enabled: false });
  dispatchWindowEvent("agentrix:cu-active", { active: false });
  notifyKillSwitch(state);
}

/**
 * 桌面 D2：每次真正的拉下 / 解除写一条急停记录，并在电脑侧同步完成后回读
 * 两道闸（emergencyStopLog）。已经是这个状态时不再记（托盘急停会发给每个
 * 窗口，只记第一次）。记录失败不影响急停本身。
 */
function startEmergencyStopRecord(kind: "engaged" | "released", origin: KillSwitchOrigin, reason?: string) {
  try {
    return { id: recordEmergencyStop({ kind, origin, reason }), startedAt: nowForEmergencyStop() };
  } catch {
    return null;
  }
}

function finishEmergencyStopRecord(record: { id: string; startedAt: number } | null, engaged: boolean) {
  if (!record) return;
  void verifyEmergencyStop(record.id, engaged, record.startedAt).catch(() => undefined);
}

export function engageKillSwitch(input: { origin: KillSwitchOrigin; reason?: string }): KillSwitchState {
  const record = isKillSwitchEngaged() ? null : startEmergencyStopRecord("engaged", input.origin, input.reason);
  const state: KillSwitchState = {
    engaged: true,
    engagedAt: new Date().toISOString(),
    origin: input.origin,
    reason: input.reason,
  };
  memoryKillSwitch = state;
  try {
    globalThis.localStorage?.setItem(KILL_SWITCH_KEY, JSON.stringify(state));
  } catch {
    /* memory copy still engaged */
  }
  applyEngagedSideEffects(state);
  void mirrorKillSwitchToNative(true).then(() => finishEmergencyStopRecord(record, true));
  return state;
}

/** 只由本人在这台电脑上解除；远程来源没有解除入口。 */
export function releaseKillSwitch(input: { origin: Exclude<KillSwitchOrigin, "remote-stop"> }): KillSwitchState {
  const record = isKillSwitchEngaged() ? startEmergencyStopRecord("released", input.origin) : null;
  const state: KillSwitchState = { engaged: false };
  memoryKillSwitch = state;
  try {
    globalThis.localStorage?.removeItem(KILL_SWITCH_KEY);
  } catch {
    /* ignore */
  }
  notifyKillSwitch(state);
  void mirrorKillSwitchToNative(false).then(() => finishEmergencyStopRecord(record, false));
  return state;
}

/**
 * 托盘"急停"和其他窗口的急停都走这里。托盘菜单在 Rust 侧向每个窗口派发
 * `agentrix:emergency-stop`；另一个窗口拉下时通过 storage 事件同步。
 * 返回卸载函数。
 */
export function installEmergencyStopListener(): () => void {
  if (typeof window === "undefined") return () => {};
  const onEmergencyStop = (event: Event) => {
    const detail = (event as CustomEvent).detail as { origin?: KillSwitchOrigin; reason?: string } | undefined;
    const origin: KillSwitchOrigin = detail?.origin === "shortcut" || detail?.origin === "settings" ? detail.origin : "tray";
    engageKillSwitch({ origin, reason: detail?.reason || "emergency_stop" });
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KILL_SWITCH_KEY) return;
    const state = parseKillSwitch(event.newValue) || { engaged: false };
    memoryKillSwitch = state.engaged ? state : { engaged: false };
    notifyKillSwitch(state);
  };
  window.addEventListener(EMERGENCY_STOP_EVENT, onEmergencyStop);
  window.addEventListener("storage", onStorage);
  // 启动时两边对齐，只往"拉下"的方向合并：Rust 侧已拉下（例如托盘在窗口加载前
  // 被点了）就在这边也拉下；否则把这边的持久化状态同步过去。
  void syncKillSwitchWithNative();
  return () => {
    window.removeEventListener(EMERGENCY_STOP_EVENT, onEmergencyStop);
    window.removeEventListener("storage", onStorage);
  };
}

// ── backend kill switch 的观测值（只用于界面展示）──────────────────────────
//
// backend 在 claim 时执行 `AGENTRIX_REMOTE_MUTATION_COMMANDS_ENABLED`；桌面端
// 的服从方式是：claim 没有明确成功就不执行（见 desktopAgentSync）。这里只记录
// 最近一次观测到的结果，给设置页显示。

export const BACKEND_REMOTE_MUTATION_FLAG = "AGENTRIX_REMOTE_MUTATION_COMMANDS_ENABLED" as const;
export type BackendRemoteMutationState = "unknown" | "enabled" | "disabled";

let backendRemoteMutation: { state: BackendRemoteMutationState; observedAt?: string } = { state: "unknown" };

export function noteBackendRemoteMutationState(state: Exclude<BackendRemoteMutationState, "unknown">) {
  backendRemoteMutation = { state, observedAt: new Date().toISOString() };
  dispatchWindowEvent(FENCE_SETTINGS_CHANGED_EVENT, { key: BACKEND_REMOTE_MUTATION_FLAG, state });
}

export function getBackendRemoteMutationState() {
  return backendRemoteMutation;
}

/**
 * 远程改动被服务端 kill switch 拒绝了吗。按错误合同 v1（`shared/types/api-error.ts`）读
 * `code: "REMOTE_MUTATION_DISABLED"` 或 `reasonCode: "remote_mutation_disabled"`；旧形状
 * （`RemoteMutationDeniedBody` 的 `ok: false, error`，或包在 Nest 异常的 `message` 里）也认。
 * 只影响设置页的观测值；执行与否只看 claim 是否明确成功。
 */
export function isBackendRemoteMutationDenied(body: unknown): boolean {
  const candidates = [body, (body as { message?: unknown } | null)?.message];
  return candidates.some((value) => {
    if (!value || typeof value !== "object") return false;
    const parsed = parseApiErrorBodyV1(value);
    if (parsed.code === "REMOTE_MUTATION_DISABLED" || parsed.reasonCode === "remote_mutation_disabled") return true;
    const record = value as Record<string, unknown>;
    return record.ok === false && record.error === "REMOTE_MUTATION_DISABLED";
  });
}

// ── 路径与 URL ────────────────────────────────────────────────────────────

const SENSITIVE_DIRECTORY_SEGMENTS = new Set([
  ".ssh",
  ".gnupg",
  ".aws",
  ".azure",
  ".kube",
  ".password-store",
  "keychains",
]);

const SENSITIVE_BASENAMES = new Set([
  ".npmrc",
  ".pypirc",
  ".netrc",
  "_netrc",
  ".git-credentials",
  ".htpasswd",
  "credentials",
  "credentials.json",
  "id_rsa",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
  "login data",
  "cookies",
]);

/** Claude Code / Cursor 的 hook 配置、Agentrix 的 guard 脚本与急停状态文件（已转小写）。 */
const AI_GUARD_CONFIG_PATTERN =
  /(^|\/)(\.claude\/settings(\.local)?\.json|\.cursor\/hooks\.json|\.cursor\/hooks\/.+|kill-switch\.state|agentrix-guard(\.sh)?)$/;

const SENSITIVE_EXTENSIONS = [".pem", ".key", ".p12", ".pfx", ".keystore", ".jks", ".kdbx"];
const NON_SENSITIVE_ENV_SUFFIXES = new Set(["example", "sample", "template", "dist"]);

function normalizeSlashes(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/\/{2,}/g, (match, offset: number) => (offset === 0 ? "//" : "/"));
}

function pathSegments(normalized: string): string[] {
  return normalized.split("/").filter((segment) => segment && segment !== ".");
}

/** 密钥类路径：SSH/GPG/云凭证目录、.env、私钥与证书、浏览器凭证库等。 */
export function isSensitivePath(path: string): boolean {
  const segments = pathSegments(normalizeSlashes(path).toLowerCase());
  if (segments.length === 0) return false;
  if (segments.some((segment) => SENSITIVE_DIRECTORY_SEGMENTS.has(segment))) return true;
  if (segments.join("/").includes(".docker/config.json")) return true;
  if (segments.join("/").includes(".config/gcloud")) return true;
  // 桌面 D3：AI 助手的 hook 配置和 Agentrix 急停状态。改了它们就能让急停管不到
  // 别家的 AI（例如项目里的 .claude/settings.local.json 写 disableAllHooks）。
  if (AI_GUARD_CONFIG_PATTERN.test(segments.join("/"))) return true;
  const basename = segments[segments.length - 1];
  if (SENSITIVE_BASENAMES.has(basename)) return true;
  if (basename === ".env") return true;
  if (basename.startsWith(".env.")) {
    const suffix = basename.slice(".env.".length);
    return !NON_SENSITIVE_ENV_SUFFIXES.has(suffix);
  }
  return SENSITIVE_EXTENSIONS.some((extension) => basename.endsWith(extension));
}

function isAbsoluteLike(normalized: string): boolean {
  return normalized.startsWith("/") || /^[a-z]:\//i.test(normalized);
}

type PathVerdict = { ok: true; normalized: string; sensitive: boolean } | { ok: false; reason: FenceDenyReason };

function checkPath(raw: unknown, options: { remote: boolean; optional: boolean; workspaceRoot?: string | null }): PathVerdict {
  const value = typeof raw === "string" ? raw : raw == null ? "" : String(raw);
  if (value.includes("\0")) return { ok: false, reason: "invalid_path" };
  const normalized = normalizeSlashes(value);
  if (!normalized || normalized === ".") {
    return options.optional ? { ok: true, normalized: "", sensitive: false } : { ok: false, reason: "invalid_path" };
  }
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "..")) return { ok: false, reason: "invalid_path" };
  const sensitive = isSensitivePath(normalized);

  if (!options.remote) {
    // 聊天工具只接受工作区相对路径（工具实现另有同样的校验）。
    if (isAbsoluteLike(normalized) || normalized.startsWith("~")) return { ok: false, reason: "invalid_path" };
    return { ok: true, normalized, sensitive };
  }

  if (sensitive) return { ok: false, reason: "sensitive_path" };
  if (normalized.startsWith("~")) return { ok: false, reason: "outside_workspace" };
  if (isAbsoluteLike(normalized)) {
    const root = options.workspaceRoot ? normalizeSlashes(options.workspaceRoot).replace(/\/+$/, "").toLowerCase() : "";
    const candidate = normalized.toLowerCase();
    if (!root || !(candidate === root || candidate.startsWith(`${root}/`))) {
      return { ok: false, reason: "outside_workspace" };
    }
  }
  return { ok: true, normalized, sensitive };
}

function checkUrl(raw: unknown): { ok: true; host: string } | { ok: false } {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return { ok: false };
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { ok: false };
    if (!parsed.host) return { ok: false };
    return { ok: true, host: parsed.host.toLowerCase() };
  } catch {
    return { ok: false };
  }
}

const DANGEROUS_SHELL_PATTERN =
  /(\brm\s+-[a-z]*[rf]|\bdel\s+\/|remove-item|\brmdir\b|\brd\s+\/s|git\s+push|npm\s+publish|cargo\s+publish|\bshutdown\b|\breboot\b|\bformat\s|\bmkfs|\bdiskpart\b|\bsudo\b|\brunas\b|\b(curl|wget)\b[^|]*\|\s*(ba|z|fi)?sh\b|invoke-expression|\biex\b|\breg\s+(add|delete)\b|\bsecurity\s+(find|dump)-)/i;

/** 会把环境变量或钥匙串内容打出来的命令。 */
const SECRET_DUMP_SHELL_PATTERN = /(\bprintenv\b|(^|[;&|]\s*)(env|set|export -p)\s*($|[;&|>])|\bsecurity\s+(find|dump)-|\bgpg\b[^|]*--export-secret|\bkeychain\b)/i;

/** 命令里有没有指向密钥文件的参数（.ssh、.env、私钥、云凭证等）。 */
export function shellTouchesSecrets(command: unknown): boolean {
  const text = typeof command === "string" ? command : "";
  if (!text) return false;
  if (SECRET_DUMP_SHELL_PATTERN.test(text)) return true;
  const tokens = text.split(/[\s"'`=<>|;&()]+/).filter(Boolean);
  return tokens.some((token) => isSensitivePath(token));
}

/**
 * raw shell 永远不是 L0：没有"只读命令免审批"的捷径（重定向、子命令都能写文件）。
 * 破坏性命令和碰密钥的命令（读 .env、cat 私钥、printenv）要在这台电脑上确认（L3）。
 */
export function classifyShellRisk(command: unknown): ApprovalRiskLevel {
  const text = typeof command === "string" ? command : "";
  return DANGEROUS_SHELL_PATTERN.test(text) || shellTouchesSecrets(text) ? "L3" : "L2";
}

// ── 判定 ──────────────────────────────────────────────────────────────────

function deny(base: Omit<FenceDecision, "allowed" | "reason" | "approval" | "allowRemember">, reason: FenceDenyReason): FenceDecision {
  return { ...base, allowed: false, reason, approval: "none", allowRemember: false };
}

function maxRisk(a: ApprovalRiskLevel, b: ApprovalRiskLevel): ApprovalRiskLevel {
  return a >= b ? a : b;
}

/** 纯函数判定（只读本机开关，不产生副作用）。 */
export function evaluateFence(request: FenceRequest): FenceDecision {
  const source = request.source;
  const command = typeof request.command === "string" ? request.command : "";
  const registry = REGISTRIES[source];
  const commandSpec = registry ? registry.get(command) : undefined;
  const remote = source !== "chat-tool";

  if (!commandSpec) {
    return deny({ source, command, kind: command, effect: "unknown", riskLevel: "L3" }, "unknown_command");
  }

  const base = { source, command, kind: commandSpec.kind, effect: commandSpec.effect as FenceEffect, riskLevel: commandSpec.risk };

  if (isKillSwitchEngaged() && commandSpec.effect !== "safety_control") {
    return deny(base, "kill_switch_engaged");
  }

  if (commandSpec.effect === "safety_control") {
    return { ...base, allowed: true, approval: "none", allowRemember: false };
  }

  const payload = request.payload || {};
  if (remote && request.payloadRef != null && Object.keys(payload).length === 0) {
    return deny(base, "payload_ref_unsupported");
  }

  if (remote && commandSpec.effect === "mutating" && !isRemoteMutationEnabled()) {
    return deny(base, "remote_mutation_disabled");
  }

  if (commandSpec.shell && !isRawShellEnabled()) {
    return deny(base, "raw_shell_disabled");
  }

  if (commandSpec.capability && !isCapabilityEnabled(commandSpec.capability)) {
    return deny(base, commandSpec.capability === "computer-use" ? "computer_use_disabled" : "browser_automation_disabled");
  }

  let risk: ApprovalRiskLevel = remote && commandSpec.remoteRisk ? commandSpec.remoteRisk : commandSpec.risk;
  let sensitive = false;
  let sessionKey: string | undefined;

  if (commandSpec.pathArg) {
    const verdict = checkPath(payload[commandSpec.pathArg], {
      remote,
      optional: Boolean(commandSpec.pathOptional),
      workspaceRoot: request.workspaceRoot,
    });
    if (!verdict.ok) return deny(base, verdict.reason);
    sensitive = verdict.sensitive;
    if (verdict.normalized) sessionKey = `${commandSpec.kind}:${verdict.normalized.toLowerCase()}`;
  }

  if (commandSpec.shell) {
    risk = maxRisk(risk, classifyShellRisk(payload.command));
    const cwdKey = source === "chat-tool" ? "working_directory" : "workingDirectory";
    if (payload[cwdKey] != null && String(payload[cwdKey]).trim()) {
      const verdict = checkPath(payload[cwdKey], { remote, optional: true, workspaceRoot: request.workspaceRoot });
      if (!verdict.ok) return deny(base, verdict.reason);
    }
  }

  if (commandSpec.urlArg) {
    const verdict = checkUrl(payload[commandSpec.urlArg]);
    if (!verdict.ok) return deny(base, "invalid_url");
    sessionKey = `${commandSpec.kind}:${verdict.host}`;
  }

  if (sensitive) {
    // 只有聊天来源会走到这里（远程来源的密钥路径已被拒绝）。
    risk = maxRisk(risk, commandSpec.effect === "mutating" ? "L3" : "L2");
  }

  const approval: FenceApproval = risk === "L0" ? "none" : risk === "L3" ? "local" : "required";
  // backend `assertApprovalResponsePolicy` forbids rememberForSession for L2/L3.
  const allowRemember = Boolean(
    commandSpec.remember && !remote && !sensitive && !commandSpec.shell && risk === "L1" && sessionKey,
  );

  return {
    ...base,
    riskLevel: risk,
    allowed: true,
    approval,
    allowRemember,
    sessionKey: allowRemember ? sessionKey : undefined,
  };
}

const DENY_MESSAGES: Record<FenceDenyReason, string> = {
  unknown_command: "未登记的命令，已拒绝",
  kill_switch_engaged: "急停已拉下，这台电脑暂停执行 AI 操作",
  remote_mutation_disabled: "这台电脑没有打开\"允许远程改动\"，已拒绝来自手机或云端的改动操作",
  raw_shell_disabled: "这台电脑没有打开\"允许运行命令\"，已拒绝运行 shell 命令",
  computer_use_disabled: "Computer Use 未打开，已拒绝",
  browser_automation_disabled: "浏览器自动化未打开，已拒绝",
  sensitive_path: "目标是密钥或凭证文件，远程访问已拒绝",
  outside_workspace: "路径不在已选工作区内，远程访问已拒绝",
  invalid_path: "路径无效（不允许绝对路径、~ 或 ..）",
  invalid_url: "只允许打开 http(s) 链接",
  payload_ref_unsupported: "这台电脑暂不支持加密数据面引用，已拒绝",
  replayed_request: "同一个请求已经处理过（可能是重放），已拒绝",
  missing_request_id: "远程请求缺少请求编号，已拒绝",
  journal_unavailable: "本机执行日志写不进去，为了能事后核对，这次操作不执行",
};

/** 远程通道在 fence 之外单独判定的拒绝（重放、缺编号）。 */
export function requestDenial(source: FenceSource, command: string, reason: "replayed_request" | "missing_request_id"): FenceDeniedError {
  return new FenceDeniedError({
    allowed: false,
    reason,
    source,
    command,
    kind: command,
    effect: classifyFenceCommand(source, command),
    riskLevel: "L3",
    approval: "none",
    allowRemember: false,
  });
}

export function describeFenceDenial(reason: FenceDenyReason): string {
  return DENY_MESSAGES[reason];
}

export const FENCE_DENIED_ERROR = "DESKTOP_FENCE_DENIED" as const;

export class FenceDeniedError extends Error {
  readonly code = FENCE_DENIED_ERROR;
  readonly decision: FenceDecision;
  readonly reason: FenceDenyReason;

  constructor(decision: FenceDecision) {
    const reason = decision.reason || "unknown_command";
    super(`${FENCE_DENIED_ERROR}:${reason} — ${describeFenceDenial(reason)}`);
    this.name = "FenceDeniedError";
    this.decision = decision;
    this.reason = reason;
  }
}

/** 用于急停时驳回等待中的审批。 */
export function killSwitchDenial(source: FenceSource = "chat-tool", command = ""): FenceDeniedError {
  return new FenceDeniedError({
    allowed: false,
    reason: "kill_switch_engaged",
    source,
    command,
    kind: command,
    effect: "unknown",
    riskLevel: "L3",
    approval: "none",
    allowRemember: false,
  });
}
