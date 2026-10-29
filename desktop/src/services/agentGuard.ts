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

import { zhT, type Translator } from "../i18n/strings";

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
// The words live in `i18n/strings.ts` under `guard.*`; these helpers pick the right key.
// A state the host did not report reads "Not detected" (`guard.*.unknown`), never "unknown".

export function claudeProtectionText(state: ClaudeProtection, t: Translator = zhT): string {
  return t(`guard.claude.${state}`);
}

export function cursorProtectionText(state: ClaudeProtection, t: Translator = zhT): string {
  return t(`guard.cursor.${state}`);
}

export function claudeSnapshotText(state: ClaudeSnapshotProtection, t: Translator = zhT): string {
  return t(`guard.claudeSnap.${state}`);
}

export function cursorSnapshotText(state: ClaudeSnapshotProtection, t: Translator = zhT): string {
  return t(`guard.cursorSnap.${state}`);
}

/** 快照开着才算"撤得回"。 */
export function snapshotsOn(status: ClaudeSnapshotProtection): boolean {
  return status === "on";
}

export function describeAgentGuardReason(reason: string | undefined, t: Translator = zhT): string {
  if (!reason) return "";
  const key = `guard.reason.${reason}`;
  const text = t(key);
  return text === key ? reason : text;
}

/**
 * Which buttons a row shows (T7 r2, 10-16). When the state could not be read, neither "turn on" nor "remove" is
 * offered, only a quiet "check again": the owner is not asked to act on something we could not see.
 * A state that was read as off offers "turn on"; one read as on offers "remove".
 */
export interface GuardControls {
  /** The host answered with something we can act on. */
  readable: boolean;
  /** Offer "turn on" (read as off). */
  enable: boolean;
  /** Offer "reinstall" (the script is gone, or the snapshot part is missing on a protected row). */
  reinstall: boolean;
  /** Offer "remove" (read as on, or the setup is there with its script gone). */
  disable: boolean;
}

export function guardControls(state: ClaudeProtection, snapshots: ClaudeSnapshotProtection): GuardControls {
  if (state === "unknown" || state === "unreadable") return { readable: false, enable: false, reinstall: false, disable: false };
  if (state === "not_installed" || state === "unsupported") return { readable: true, enable: false, reinstall: false, disable: false };
  const snapshotsMissing = snapshots === "off" || snapshots === "binary_missing";
  return {
    readable: true,
    enable: state === "unprotected",
    reinstall: state === "script_missing" || (state === "protected" && snapshotsMissing),
    disable: state === "protected" || state === "script_missing",
  };
}

/** "受保护"只认 protected；其他任何值（包括未知）都算未受保护。 */
export function isProtected(status: ClaudeProtection): boolean {
  return status === "protected";
}
