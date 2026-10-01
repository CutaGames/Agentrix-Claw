/**
 * agentGuard — 桌面 D3 切片 4b / 5：第三方 AI 的保护状态（Claude Code、Cursor 的 hooks：急停拦截和改文件前的快照）。
 *
 * 只调用 Rust 的三个命令（src-tauri/src/lib.rs，desktop_bridge_agent_guard_*）：
 * - status：只返回结论，不返回配置内容；
 * - install / uninstall：只在"我的 AI 们"里由本人点击触发，先备份原配置；急停拉下时
 *   Rust 拒绝卸载。
 *
 * 聊天工具和远程通道都没有对应的命令（fence 登记表里没有），AI 不能自己装或卸。
 * 宿主没说的一律按"未知"显示，不当成受保护。
 */

export type ClaudeProtection =
  | "not_installed"
  | "unprotected"
  | "protected"
  | "script_missing"
  | "unreadable"
  | "unsupported"
  | "unknown";

/** D3 切片 5：Claude Code 改文件之前留快照（能从"今天的改动"撤回）。 */
export type ClaudeSnapshotProtection = "on" | "off" | "binary_missing" | "translocated" | "unsupported" | "unknown";

export interface AgentGuardStatus {
  claudeCode: ClaudeProtection;
  claudeCodeSnapshots: ClaudeSnapshotProtection;
  /**
   * Cursor 的 `preToolUse` hook（`~/.cursor/hooks.json`），同一个拦截脚本：急停时退出码 2 拦下，
   * 平时不输出任何东西（Cursor 3.7 记为"没有输出"，不算同意）。
   */
  cursor: ClaudeProtection;
  /** 同一个快照 hook 装进 Cursor 的 preToolUse（Write、Delete），Cursor 改的文件也能撤回。 */
  cursorSnapshots: ClaudeSnapshotProtection;
}

export interface AgentGuardEditResult {
  ok: boolean;
  status: ClaudeProtection;
  changed: boolean;
  backedUp: boolean;
  reason?: string;
}

const CLAUDE_VALUES: ReadonlySet<string> = new Set([
  "not_installed",
  "unprotected",
  "protected",
  "script_missing",
  "unreadable",
  "unsupported",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function claudeValue(value: unknown): ClaudeProtection {
  return typeof value === "string" && CLAUDE_VALUES.has(value) ? (value as ClaudeProtection) : "unknown";
}

const SNAPSHOT_VALUES: ReadonlySet<string> = new Set(["on", "off", "binary_missing", "translocated", "unsupported"]);

const UNKNOWN_STATUS: AgentGuardStatus = {
  claudeCode: "unknown",
  claudeCodeSnapshots: "unknown",
  cursor: "unknown",
  cursorSnapshots: "unknown",
};

function snapshotValue(value: unknown): ClaudeSnapshotProtection {
  return typeof value === "string" && SNAPSHOT_VALUES.has(value) ? (value as ClaudeSnapshotProtection) : "unknown";
}

export function normalizeAgentGuardStatus(raw: unknown): AgentGuardStatus {
  if (!isRecord(raw)) return { ...UNKNOWN_STATUS };
  return {
    claudeCode: claudeValue(raw.claudeCode),
    claudeCodeSnapshots: snapshotValue(raw.claudeCodeSnapshots),
    cursor: claudeValue(raw.cursor),
    // An older host has no `cursorSnapshots`: "unknown", never "on".
    cursorSnapshots: snapshotValue(raw.cursorSnapshots),
  };
}

export function normalizeAgentGuardEdit(raw: unknown): AgentGuardEditResult {
  if (!isRecord(raw)) return { ok: false, status: "unknown", changed: false, backedUp: false, reason: "invalid_response" };
  return {
    ok: true,
    status: claudeValue(raw.status),
    changed: raw.changed === true,
    backedUp: raw.backedUp === true,
  };
}

function hasNativeHost(): boolean {
  return typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__?.invoke);
}

async function invokeNative(command: string, args?: Record<string, unknown>): Promise<unknown> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke(command, args);
}

export async function readAgentGuardStatus(): Promise<AgentGuardStatus> {
  if (!hasNativeHost()) return { ...UNKNOWN_STATUS };
  try {
    return normalizeAgentGuardStatus(await invokeNative("desktop_bridge_agent_guard_status"));
  } catch {
    return { ...UNKNOWN_STATUS };
  }
}

function errorReason(error: unknown): string {
  if (typeof error === "string" && error) return error;
  if (error instanceof Error && error.message) return error.message;
  return "invoke_failed";
}

async function edit(
  command: "desktop_bridge_agent_guard_install" | "desktop_bridge_agent_guard_uninstall",
  target: "claude-code" | "cursor" = "claude-code",
): Promise<AgentGuardEditResult> {
  if (!hasNativeHost()) return { ok: false, status: "unknown", changed: false, backedUp: false, reason: "no_native_host" };
  try {
    return normalizeAgentGuardEdit(await invokeNative(command, { target }));
  } catch (error) {
    return { ok: false, status: "unknown", changed: false, backedUp: false, reason: errorReason(error) };
  }
}

export const installClaudeCodeGuard = () => edit("desktop_bridge_agent_guard_install");
export const uninstallClaudeCodeGuard = () => edit("desktop_bridge_agent_guard_uninstall");
export const installCursorGuard = () => edit("desktop_bridge_agent_guard_install", "cursor");
export const uninstallCursorGuard = () => edit("desktop_bridge_agent_guard_uninstall", "cursor");

// ── 界面文案 ──────────────────────────────────────────────────────────────

export const CLAUDE_PROTECTION_TEXT: Record<ClaudeProtection, string> = {
  protected: "受保护：急停拉下时，Claude Code 的每个工具调用都会被拦下",
  unprotected: "未受保护：急停管不到 Claude Code",
  script_missing: "未受保护：配置还在，但拦截脚本不见了，重新安装即可",
  unreadable: "未受保护：Claude Code 的设置文件读不懂，没有改动它",
  not_installed: "这台电脑上没有发现 Claude Code",
  unsupported: "这个系统上还不支持",
  unknown: "未知",
};

export const CURSOR_PROTECTION_TEXT: Record<ClaudeProtection, string> = {
  protected: "受保护：急停拉下时，Cursor 的 Agent 每个工具调用都会被拦下",
  unprotected: "未受保护：急停管不到 Cursor",
  script_missing: "未受保护：配置还在，但拦截脚本不见了，重新安装即可",
  unreadable: "未受保护：Cursor 的 hooks.json 读不懂，没有改动它",
  not_installed: "这台电脑上没有发现 Cursor",
  unsupported: "这个系统上还不支持",
  unknown: "未知",
};

export const CLAUDE_SNAPSHOT_TEXT: Record<ClaudeSnapshotProtection, string> = {
  on: "改文件前留快照：Claude Code 改过的文件可以在\"今天的改动\"里撤回",
  off: "没有留快照：Claude Code 改的文件撤不回，重新点\"开启保护\"即可加上",
  binary_missing: "快照没在工作：Agentrix 换了位置，重新点\"开启保护\"即可",
  translocated: "快照没开：Agentrix 是从下载位置直接打开的，先把它拖进\"应用程序\"文件夹再开启",
  unsupported: "这个系统上还不支持快照",
  unknown: "快照状态未知",
};

export const CURSOR_SNAPSHOT_TEXT: Record<ClaudeSnapshotProtection, string> = {
  on: "改文件前留快照：Cursor 改过、删掉的文件可以在\"今天的改动\"里撤回",
  off: "没有留快照：Cursor 改的文件撤不回，重新点\"开启保护\"即可加上",
  binary_missing: "快照没在工作：Agentrix 换了位置，重新点\"开启保护\"即可",
  translocated: "快照没开：Agentrix 是从下载位置直接打开的，先把它拖进\"应用程序\"文件夹再开启",
  unsupported: "这个系统上还不支持快照",
  unknown: "快照状态未知",
};

/** 快照开着才算"撤得回"。 */
export function snapshotsOn(status: ClaudeSnapshotProtection): boolean {
  return status === "on";
}

const REASON_TEXT: Record<string, string> = {
  kill_switch_engaged: "急停拉下时不能移除保护",
  claude_code_not_found: "没有发现 Claude Code（~/.claude 不存在）",
  settings_unreadable: "Claude Code 的设置文件读不懂，没有改动它",
  settings_unexpected_shape: "Claude Code 的设置文件结构和预期不同，没有改动它",
  hooks_path_unsafe: "应用数据目录的路径里有不安全的字符",
  hooks_path_not_utf8: "应用数据目录的路径编码不支持",
  script_write_failed: "写拦截脚本失败",
  backup_failed: "备份原设置失败，没有改动它",
  settings_write_failed: "写设置文件失败",
  unsupported_platform: "这个系统上还不支持",
  no_native_host: "这个窗口不能调用本机功能",
  invalid_response: "本机返回的格式无法识别",
};

export function describeAgentGuardReason(reason: string | undefined): string {
  if (!reason) return "";
  return REASON_TEXT[reason] || reason;
}

/** "受保护"只认 protected；其他任何值（包括未知）都算未受保护。 */
export function isProtected(status: ClaudeProtection): boolean {
  return status === "protected";
}
