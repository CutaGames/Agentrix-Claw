import { invoke } from "@tauri-apps/api/core";

const LEGACY_TOKEN_KEY = "agentrix_token";
const DEV_TEST_TOKEN = import.meta.env.DEV ? String(import.meta.env.VITE_DESKTOP_TEST_TOKEN || "").trim() : "";

export type ApprovalRiskLevel = "L0" | "L1" | "L2" | "L3";
export type DesktopActionKind =
  | "clipboard"
  | "context"
  | "active-window"
  | "list-windows"
  | "list-directory"
  | "run-command"
  | "read-file"
  | "write-file"
  | "open-browser";

export interface DesktopCommandResult {
  command: string;
  workingDirectory?: string | null;
  stdout: string;
  stderr: string;
  exitCode?: number | null;
  timedOut: boolean;
  durationMs: number;
}

export interface DesktopReadFileResult {
  path: string;
  content: string;
  size: number;
  totalLines: number;
  startLine: number;
  endLine: number;
}

export interface DesktopListDirectoryResult {
  path: string;
  entries: Array<{
    name: string;
    is_dir: boolean;
    size: number;
  }>;
}

export interface DesktopWriteFileResult {
  path: string;
  bytesWritten: number;
}

export interface DesktopWindowInfo {
  title: string;
  processName?: string | null;
  processId?: number | null;
}

export interface DesktopContextResult {
  platform: string;
  activeWindow?: DesktopWindowInfo | null;
  clipboardTextPreview?: string | null;
  workspaceHint?: string | null;
  fileHint?: string | null;
}

const DEVICE_ID_KEY = "agentrix_desktop_device_id";
const READ_ONLY_COMMAND_PATTERN = /^(dir|ls|get-childitem|pwd|rg|find|type|cat|get-content)(\s|$)/i;

function isTauriAvailable() {
  return Boolean((window as any).__TAURI_INTERNALS__?.invoke);
}

async function invokeDesktop<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriAvailable()) {
    throw new Error("Desktop command is only available inside the packaged Tauri app.");
  }
  return invoke<T>(command, args);
}

export async function secureGetToken(): Promise<string | null> {
  if (DEV_TEST_TOKEN) {
    return DEV_TEST_TOKEN;
  }

  const legacyToken = localStorage.getItem(LEGACY_TOKEN_KEY);

  if (!isTauriAvailable()) {
    return legacyToken;
  }

  let token: string | null = null;
  try {
    token = await invokeDesktop<string | null>("desktop_bridge_get_auth_token");
  } catch {
    return legacyToken;
  }
  if (!token && legacyToken) {
    try {
      await invokeDesktop("desktop_bridge_set_auth_token", { token: legacyToken });
      localStorage.removeItem(LEGACY_TOKEN_KEY);
    } catch {
      return legacyToken;
    }
    return legacyToken;
  }

  if (legacyToken) {
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  }

  return token || null;
}

export async function secureSetToken(token: string): Promise<void> {
  if (!isTauriAvailable()) {
    localStorage.setItem(LEGACY_TOKEN_KEY, token);
    return;
  }

  try {
    await invokeDesktop("desktop_bridge_set_auth_token", { token });
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  } catch {
    localStorage.setItem(LEGACY_TOKEN_KEY, token);
  }
}

export async function secureDeleteToken(): Promise<void> {
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  if (!isTauriAvailable()) return;
  try {
    await invokeDesktop("desktop_bridge_delete_auth_token");
  } catch {
    // Fallback already removed the legacy token.
  }
}

export async function nativeDesktopPasswordLogin(email: string, password: string) {
  return invokeDesktop<{ token?: string | null; access_token?: string | null }>("desktop_bridge_password_login", {
    email,
    password,
  });
}

export async function logDesktopDebugEvent(message: string): Promise<void> {
  if (!isTauriAvailable()) return;
  try {
    await invokeDesktop("desktop_bridge_log_debug_event", { message: `${new Date().toISOString()} ${message}` });
  } catch {
    // Ignore logging failures so runtime behavior is unchanged.
  }
}

function normalizeShellCommand(command?: string) {
  return `${command || ""}`.trim().replace(/\s+/g, " ");
}

export function classifyDesktopRisk(kind: DesktopActionKind, payload?: Record<string, string>): ApprovalRiskLevel {
  if (kind === "clipboard" || kind === "context" || kind === "active-window" || kind === "list-windows" || kind === "list-directory" || kind === "read-file") {
    return "L0";
  }

  if (kind === "open-browser") {
    return "L1";
  }

  if (kind === "write-file") {
    return "L1";
  }

  const command = normalizeShellCommand(payload?.command).toLowerCase();
  if (READ_ONLY_COMMAND_PATTERN.test(command)) {
    return "L0";
  }

  const dangerousPattern = /(rm\s+-rf|del\s+\/f|remove-item|git\s+push|npm\s+publish|cargo\s+publish|shutdown|format\s+|mkfs|diskpart|sudo)/;
  if (dangerousPattern.test(command)) {
    return "L3";
  }

  return "L2";
}

export function buildDesktopApprovalSessionKey(kind: DesktopActionKind, payload?: Record<string, string>) {
  if (kind === "write-file") {
    const path = `${payload?.path || ""}`.trim().toLowerCase();
    return path ? `write-file:${path}` : undefined;
  }

  if (kind === "open-browser") {
    try {
      const host = new URL(`${payload?.url || ""}`).host.toLowerCase();
      return host ? `open-browser:${host}` : undefined;
    } catch {
      return undefined;
    }
  }

  if (kind === "run-command") {
    const command = normalizeShellCommand(payload?.command).toLowerCase();
    if (!command) {
      return undefined;
    }
    const sessionCommand = READ_ONLY_COMMAND_PATTERN.test(command)
      ? command.split(" ")[0]
      : command;
    return `run-command:${sessionCommand}`;
  }

  return undefined;
}

export function shouldRequireApproval(riskLevel: ApprovalRiskLevel, sessionApproved: boolean) {
  if (riskLevel === "L0") return false;
  if (riskLevel === "L1") return !sessionApproved;
  if (riskLevel === "L2") return !sessionApproved;
  return true;
}

export async function runDesktopCommand(command: string, workingDirectory?: string, timeoutMs = 60_000) {
  return invokeDesktop<DesktopCommandResult>("desktop_bridge_run_command", {
    command,
    workingDirectory: workingDirectory || null,
    timeoutMs,
  });
}

export async function listDesktopDirectory(path: string) {
  return invokeDesktop<DesktopListDirectoryResult>("desktop_bridge_list_directory", { path });
}

export async function readDesktopFile(path: string, startLine?: number, endLine?: number) {
  return invokeDesktop<DesktopReadFileResult>("desktop_bridge_read_file", {
    path,
    startLine: typeof startLine === "number" ? startLine : null,
    endLine: typeof endLine === "number" ? endLine : null,
  });
}

export async function writeDesktopFile(path: string, content: string) {
  return invokeDesktop<DesktopWriteFileResult>("desktop_bridge_write_file", { path, content });
}

export async function openDesktopBrowser(url: string) {
  return invokeDesktop<string>("desktop_bridge_open_browser", { url });
}

export async function getActiveDesktopWindow() {
  return invokeDesktop<DesktopWindowInfo | null>("desktop_bridge_get_active_window");
}

export async function listDesktopWindows() {
  return invokeDesktop<DesktopWindowInfo[]>("desktop_bridge_list_windows");
}

export async function getDesktopContext() {
  return invokeDesktop<DesktopContextResult>("desktop_bridge_get_context");
}

export async function getDesktopClipboardText() {
  return invokeDesktop<string | null>("desktop_bridge_get_clipboard_text");
}

export function getDesktopDeviceId() {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = `desktop-${crypto.randomUUID()}`;
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}