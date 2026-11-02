/**
 * contextMemoryCredentials — 桌面 A6 / D4"共用记忆"："我的 AI 们 → 哪个 AI 能读我的记忆"。
 *
 * 合同：`shared/types/context-memory.ts`。主人给 Cursor / Claude Code / Kiro 各发一张短期凭据（audience
 * `context_gateway`），本机 MCP 服务（`--agentrix-mcp`）用它读 `agent_profile`、`agent_preferences`，
 * 主人打开以后还能读 `agent_memory`。
 *
 * - 签名在 Rust 里做（设备钥匙不出 Rust）；这里只带主人的登录凭据去发 HTTP 请求。
 * - 发回来的凭据直接交给 Rust 存进钥匙串；这里**拿不回** token，状态里也没有 token 字段。
 * - 类别记在凭据上：打开 / 关闭 `agent_memory` 就是用新的类别重新签发一张（服务端吊销旧的）。
 * - 急停拉下时 Rust 拒绝签发、刷新、保存；吊销是停止类操作，不受急停影响。
 * - 聊天工具和远程通道都没有对应的命令（fence 登记表里没有），AI 不能自己给自己发凭据。
 * - 宿主没说的一律按"没有发凭据"处理。
 */
import {
  CONTEXT_GATEWAY_CREDENTIAL_REF_PATTERN,
  DESKTOP_MEMORY_CLIENT_IDS_V1,
  DESKTOP_MEMORY_DEFAULT_CATEGORIES_V1,
  CONTEXT_MEMORY_CATEGORY_V1_1,
  type DesktopMemoryClientIdV1,
} from "../../../shared/types/context-memory";
import { ownerCall } from "./deviceCapabilityUpload";

export const MEMORY_CLIENT_NAME: Record<DesktopMemoryClientIdV1, string> = {
  cursor: "Cursor",
  claude_code: "Claude Code",
  kiro: "Kiro",
  openclaw: "OpenClaw",
  hermes: "Hermes",
};

export interface MemoryClientStatus {
  clientId: DesktopMemoryClientIdV1;
  issued: boolean;
  memoryOn: boolean;
  expired: boolean;
  expiresAt?: string;
  /** 这张凭据属于哪台设备（吊销的路径要用；不是机密）。 */
  deviceId?: string;
  /** Rust 读不出这张凭据时的原因（钥匙串不可用、内容损坏）。 */
  error?: string;
}

export type CredentialActionResult = { ok: true } | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isClientId(value: unknown): value is DesktopMemoryClientIdV1 {
  return typeof value === "string" && (DESKTOP_MEMORY_CLIENT_IDS_V1 as readonly string[]).includes(value);
}

/** 三个客户端各一行，顺序固定；缺的、认不出的一律是"没发凭据"。 */
export function normalizeMemoryClientStatuses(raw: unknown): MemoryClientStatus[] {
  const byClient = new Map<DesktopMemoryClientIdV1, MemoryClientStatus>();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!isRecord(item) || !isClientId(item.clientId)) continue;
      const issued = item.issued === true;
      byClient.set(item.clientId, {
        clientId: item.clientId,
        issued,
        memoryOn: issued && item.memoryOn === true,
        expired: issued && item.expired !== false,
        ...(issued && typeof item.expiresAt === "string" ? { expiresAt: item.expiresAt } : {}),
        ...(issued && typeof item.deviceId === "string" ? { deviceId: item.deviceId } : {}),
        ...(typeof item.error === "string" ? { error: item.error } : {}),
      });
    }
  }
  return DESKTOP_MEMORY_CLIENT_IDS_V1.map((clientId) => byClient.get(clientId) ?? { clientId, issued: false, memoryOn: false, expired: false });
}

/** 开着记忆 = 默认的两类加 `agent_memory`；关着 = 只有默认的两类。 */
export function categoriesFor(memoryOn: boolean): string[] {
  return memoryOn ? [...DESKTOP_MEMORY_DEFAULT_CATEGORIES_V1, CONTEXT_MEMORY_CATEGORY_V1_1] : [...DESKTOP_MEMORY_DEFAULT_CATEGORIES_V1];
}

export interface CredentialDeps {
  invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
  post: (path: string, body: unknown, bearer?: string, origin?: string) => Promise<{ status: number; body: unknown }>;
}

async function realInvoke(command: string, args?: Record<string, unknown>): Promise<unknown> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke(command, args);
}

/** 主人的登录凭据（`bearer` 省略）或者给定的 bearer（刷新要带旧凭据）。 */
async function realPost(path: string, body: unknown, bearer?: string, origin?: string): Promise<{ status: number; body: unknown }> {
  if (bearer === undefined) return ownerCall("POST", path, body);
  const { API_BASE, apiFetch } = await import("./store");
  // The credential's own origin; if this app talks to a different one, the old token is not sent anywhere.
  const target = (origin ?? API_BASE).replace(/\/+$/, "");
  if (target !== API_BASE.replace(/\/+$/, "")) throw new Error("origin_mismatch");
  const response = await apiFetch(`${target}${path}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
    body: JSON.stringify(body),
  });
  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }
  return { status: response.status, body: parsed };
}

export function desktopCredentialDeps(): CredentialDeps {
  return { invoke: realInvoke, post: realPost };
}

function hasNativeHost(): boolean {
  return typeof window !== "undefined" && Boolean((window as unknown as { __TAURI_INTERNALS__?: { invoke?: unknown } }).__TAURI_INTERNALS__?.invoke);
}

function reasonOf(error: unknown): string {
  if (typeof error === "string" && error) return error;
  if (error instanceof Error && error.message) return error.message;
  return "invoke_failed";
}

function serverReason(status: number, body: unknown): string {
  const code = isRecord(body) && typeof body.code === "string" ? body.code : null;
  return code ?? `http_${status}`;
}

export async function readMemoryClientStatuses(deps: CredentialDeps = desktopCredentialDeps()): Promise<MemoryClientStatus[]> {
  if (deps.invoke === realInvoke && !hasNativeHost()) return normalizeMemoryClientStatuses(null);
  try {
    return normalizeMemoryClientStatuses(await deps.invoke("desktop_bridge_context_credential_status"));
  } catch {
    return normalizeMemoryClientStatuses(null);
  }
}

/**
 * 给一个客户端发凭据（或者用新的类别重新发）。服务端只要主人本人登录和设备钥匙签名都对才发；
 * 发回来的东西由 Rust 核对（设备、类别、客户端、过期时间）以后才保存。
 */
export async function issueMemoryCredential(
  clientId: DesktopMemoryClientIdV1,
  memoryOn: boolean,
  deps: CredentialDeps = desktopCredentialDeps(),
): Promise<CredentialActionResult> {
  if (!isClientId(clientId)) return { ok: false, reason: "client_invalid" };
  if (deps.invoke === realInvoke && !hasNativeHost()) return { ok: false, reason: "no_native_host" };
  let signed: unknown;
  try {
    signed = await deps.invoke("desktop_bridge_context_credential_sign_issue", { clientId, categories: categoriesFor(memoryOn) });
  } catch (error) {
    return { ok: false, reason: reasonOf(error) };
  }
  if (!isRecord(signed) || typeof signed.deviceId !== "string" || typeof signed.apiOrigin !== "string" || !isRecord(signed.command)) {
    return { ok: false, reason: "invalid_response" };
  }
  let response: { status: number; body: unknown };
  try {
    response = await deps.post(`/v1/devices/${encodeURIComponent(signed.deviceId)}/context-credentials`, signed.command);
  } catch {
    return { ok: false, reason: "network" };
  }
  if (response.status < 200 || response.status >= 300 || !isRecord(response.body)) {
    return { ok: false, reason: serverReason(response.status, response.body) };
  }
  return keepIssued(signed.apiOrigin, response.body, deps);
}

/** 凭据过半以后刷新一次（旧凭据当 bearer；刷新不能改客户端和类别）。 */
export async function refreshMemoryCredential(clientId: DesktopMemoryClientIdV1, deps: CredentialDeps = desktopCredentialDeps()): Promise<CredentialActionResult> {
  if (!isClientId(clientId)) return { ok: false, reason: "client_invalid" };
  if (deps.invoke === realInvoke && !hasNativeHost()) return { ok: false, reason: "no_native_host" };
  let signed: unknown;
  try {
    signed = await deps.invoke("desktop_bridge_context_credential_sign_refresh", { clientId });
  } catch (error) {
    return { ok: false, reason: reasonOf(error) };
  }
  if (!isRecord(signed) || typeof signed.deviceId !== "string" || typeof signed.apiOrigin !== "string" || typeof signed.token !== "string" || !isRecord(signed.command)) {
    return { ok: false, reason: "invalid_response" };
  }
  let response: { status: number; body: unknown };
  try {
        // The old credential goes to the origin it was issued for, and nowhere else (`realPost` refuses any other).
    response = await deps.post(`/v1/devices/${encodeURIComponent(signed.deviceId)}/context-credentials/refresh`, signed.command, signed.token, signed.apiOrigin);
  } catch {
    return { ok: false, reason: "network" };
  }
  if (response.status < 200 || response.status >= 300 || !isRecord(response.body)) {
    return { ok: false, reason: serverReason(response.status, response.body) };
  }
  return keepIssued(signed.apiOrigin, response.body, deps);
}

async function keepIssued(apiOrigin: string, body: Record<string, unknown>, deps: CredentialDeps): Promise<CredentialActionResult> {
  // 服务端的回答可能直接是凭据，也可能包在 `credential` 里。
  const credential = isRecord(body.credential) ? body.credential : body;
  if (typeof credential.credentialRef !== "string" || !CONTEXT_GATEWAY_CREDENTIAL_REF_PATTERN.test(credential.credentialRef)) {
    return { ok: false, reason: "invalid_response" };
  }
  try {
    await deps.invoke("desktop_bridge_context_credential_store", { apiOrigin, credential });
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: reasonOf(error) };
  }
}

/**
 * 吊销一个客户端的凭据：先让服务端吊销（主人登录凭据，只吊销这个客户端的），成功以后删掉本机那份。
 * 服务端没吊销成功时本机那份也保留，界面如实说"没撤掉"，不假装成功。
 */
export async function revokeMemoryCredential(
  clientId: DesktopMemoryClientIdV1,
  deviceId: string | undefined,
  deps: CredentialDeps = desktopCredentialDeps(),
): Promise<CredentialActionResult> {
  if (!isClientId(clientId)) return { ok: false, reason: "client_invalid" };
  if (deps.invoke === realInvoke && !hasNativeHost()) return { ok: false, reason: "no_native_host" };
  // 设备 id 取自本机那张凭据的状态行；没有凭据就没有可吊销的。
  if (!deviceId) return { ok: false, reason: "no_credential" };
  let response: { status: number; body: unknown };
  try {
    response = await deps.post(`/v1/devices/${encodeURIComponent(deviceId)}/context-credentials/revoke`, { schemaVersion: 1, clientId });
  } catch {
    return { ok: false, reason: "network" };
  }
  if (response.status < 200 || response.status >= 300) return { ok: false, reason: serverReason(response.status, response.body) };
  try {
    await deps.invoke("desktop_bridge_context_credential_remove", { clientId });
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: reasonOf(error) };
  }
}

/** 复制给客户端的 MCP 设置片段：启动本机 MCP 服务的命令。Agentrix 不去改别家的设置文件。 */
export async function readMcpLaunchSnippet(clientId: DesktopMemoryClientIdV1, deps: CredentialDeps = desktopCredentialDeps()): Promise<string | null> {
  if (!isClientId(clientId)) return null;
  if (deps.invoke === realInvoke && !hasNativeHost()) return null;
  try {
    const spec = await deps.invoke("desktop_bridge_context_mcp_launch", { clientId });
    if (!isRecord(spec) || typeof spec.command !== "string" || !Array.isArray(spec.args) || !spec.args.every((arg) => typeof arg === "string")) return null;
    return JSON.stringify({ mcpServers: { agentrix: { command: spec.command, args: spec.args } } }, null, 2);
  } catch {
    return null;
  }
}

const REASON_TEXT: Record<string, string> = {
  kill_switch_engaged: "急停已拉下，先解除急停",
  not_enrolled: "这台电脑还没有绑定，先在设置里绑定",
  client_invalid: "不认识这个客户端",
  category_not_allowed: "这个类别不能给第三方客户端",
  no_native_host: "这个窗口不能调用本机功能",
  network: "连不上服务器",
  invalid_response: "服务器返回的格式无法识别",
  credential_invalid: "服务器发来的凭据对不上这台电脑，没有保存",
  keychain_unavailable: "读不到系统钥匙串",
  CONTEXT_GATEWAY_CREDENTIAL_SIGN_IN_REQUIRED: "需要重新登录",
  CONTEXT_GATEWAY_CREDENTIAL_BINDING_UNAVAILABLE: "这台电脑的绑定已失效，重新绑定后再试",
  CONTEXT_GATEWAY_CREDENTIAL_REFRESH_REJECTED: "旧凭据已失效，请重新开通",
  http_404: "服务器还没有开放这个功能",
};

/** 失败原因的白话。认不出的原因不上屏。 */
export function describeCredentialReason(reason: string | undefined): string {
  if (!reason) return "";
  return REASON_TEXT[reason] ?? "没有成功，稍后再试";
}
