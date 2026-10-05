/**
 * nodeAllowlist — L5 常开节点 N0（REQ-desktop-057 第 3、6 节）：主人在这台电脑上列的白名单。默认关。
 *
 * 放宽的只有两种 L1 步骤，而且只对这台电脑自己的聊天（`chat-tool`）发起的：
 * - 打开网页：网址的 origin 和白名单里的网站完全一样；
 * - 写文件：目标在白名单里的文件夹里（Rust 按自己的工作区目录拼出路径、解开符号链接再比）。
 * 其余一律照旧逐步批准：点击、输入、按键、页面脚本、运行命令、git，所有 L2 / L3；碰密钥类路径的写入
 * 本来就是 L3。远程来源（手机、云端）不看白名单。急停拉下时白名单不起作用（Rust 和 fence 都拒）。
 *
 * 白名单存在 Rust 那边、用钥匙串密钥签名；文件被改过就当空的。这里只问"这一步被哪一条盖住"，
 * 拿不到答案（没有宿主、出错、格式不对）就当没盖住，照常弹批准。
 * 增删改只在"这台电脑 → 常开节点"里由本人点；fence 登记表里没有这些命令，AI 调不到。
 */
import type { FenceDecision, FenceRequest } from "./executionFence";
import { isKillSwitchEngaged } from "./executionFence";

export type NodeAllowlistIntegrity = "empty" | "ok" | "tampered" | "key_unavailable" | "unknown";
export type NodeAllowlistEntryKind = "site" | "folder";

export interface NodeAllowlistEntry {
  id: string;
  kind: NodeAllowlistEntryKind;
  value: string;
  addedAt: number;
  expiresAt: number;
  expired: boolean;
}

export interface NodeAllowlistView {
  enabled: boolean;
  integrity: NodeAllowlistIntegrity;
  entries: NodeAllowlistEntry[];
}

export const NODE_ALLOWLIST_COMMANDS = {
  get: "desktop_bridge_node_allowlist_get",
  setEnabled: "desktop_bridge_node_allowlist_set_enabled",
  addSite: "desktop_bridge_node_allowlist_add_site",
  addFolder: "desktop_bridge_node_allowlist_add_folder",
  remove: "desktop_bridge_node_allowlist_remove",
  match: "desktop_bridge_node_allowlist_match",
} as const;

/** 白名单能放宽的动作（fence 的 kind）→ 用 payload 里哪个字段去比。只有这两种。 */
export const NODE_RELAXABLE_KINDS: Readonly<Record<string, { match: NodeAllowlistEntryKind; arg: "url" | "path" }>> = {
  "computer-use-browser-navigate": { match: "site", arg: "url" },
  "write-file": { match: "folder", arg: "path" },
};

const ENTRY_ID = /^nal-\d{13}-[0-9a-f]{12}$/;
const INTEGRITY: ReadonlySet<string> = new Set(["empty", "ok", "tampered", "key_unavailable"]);

export const UNKNOWN_NODE_ALLOWLIST: NodeAllowlistView = { enabled: false, integrity: "unknown", entries: [] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeNodeAllowlistView(raw: unknown): NodeAllowlistView {
  if (!isRecord(raw)) return { ...UNKNOWN_NODE_ALLOWLIST };
  const integrity = typeof raw.integrity === "string" && INTEGRITY.has(raw.integrity) ? (raw.integrity as NodeAllowlistIntegrity) : "unknown";
  const entries = (Array.isArray(raw.entries) ? raw.entries : []).flatMap((item): NodeAllowlistEntry[] => {
    if (!isRecord(item) || typeof item.id !== "string" || !ENTRY_ID.test(item.id)) return [];
    if (item.kind !== "site" && item.kind !== "folder") return [];
    if (typeof item.value !== "string" || !item.value) return [];
    const addedAt = Number(item.addedAt);
    const expiresAt = Number(item.expiresAt);
    if (!Number.isFinite(addedAt) || !Number.isFinite(expiresAt)) return [];
    return [{ id: item.id, kind: item.kind, value: item.value, addedAt, expiresAt, expired: item.expired !== false }];
  });
  // Only a verified file can be on.
  return { enabled: raw.enabled === true && integrity === "ok", integrity, entries };
}

function hasNativeHost(): boolean {
  return typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__?.invoke);
}

async function invokeNative<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

export type NodeAllowlistEditResult = { ok: true; view: NodeAllowlistView | null } | { ok: false; reason: string };

function reasonOf(error: unknown): string {
  const text = typeof error === "string" ? error : error instanceof Error ? error.message : "";
  return /^[a-z_]{1,64}$/.test(text) ? text : "invoke_failed";
}

async function edit(command: string, args?: Record<string, unknown>): Promise<NodeAllowlistEditResult> {
  if (!hasNativeHost()) return { ok: false, reason: "no_native_host" };
  try {
    const raw = await invokeNative<unknown>(command, args);
    return { ok: true, view: raw === null ? null : normalizeNodeAllowlistView(raw) };
  } catch (error) {
    return { ok: false, reason: reasonOf(error) };
  }
}

export async function readNodeAllowlist(): Promise<NodeAllowlistView> {
  if (!hasNativeHost()) return { ...UNKNOWN_NODE_ALLOWLIST };
  try {
    return normalizeNodeAllowlistView(await invokeNative<unknown>(NODE_ALLOWLIST_COMMANDS.get));
  } catch {
    return { ...UNKNOWN_NODE_ALLOWLIST };
  }
}

export const setNodeAllowlistEnabled = (enabled: boolean) => edit(NODE_ALLOWLIST_COMMANDS.setEnabled, { enabled });
export const addNodeAllowlistSite = (origin: string, days?: number) => edit(NODE_ALLOWLIST_COMMANDS.addSite, { origin, days: days ?? null });
/** 打开系统的选文件夹窗口；本人取消时 `view` 是 null。 */
export const addNodeAllowlistFolder = (days?: number) => edit(NODE_ALLOWLIST_COMMANDS.addFolder, { days: days ?? null });
export const removeNodeAllowlistEntry = (id: string) => edit(NODE_ALLOWLIST_COMMANDS.remove, { id });

/**
 * 这一步能不能按白名单直接放行：返回盖住它的那一条的 id，否则 null。
 * 只看本机聊天发起的、fence 已经放行、要普通批准（不是本机确认）的 L1 改动，而且动作在
 * `NODE_RELAXABLE_KINDS` 里。其余一律 null（照常弹批准）。
 */
export async function nodeAllowlistCovers(
  request: FenceRequest,
  decision: FenceDecision,
  invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T> = invokeNative,
): Promise<string | null> {
  if (request.source !== "chat-tool") return null;
  if (!decision.allowed || decision.approval !== "required" || decision.riskLevel !== "L1" || decision.effect !== "mutating") return null;
  const relax = NODE_RELAXABLE_KINDS[decision.kind];
  if (!relax) return null;
  if (isKillSwitchEngaged()) return null;
  const value = request.payload?.[relax.arg];
  if (typeof value !== "string" || !value.trim()) return null;
  if (invoke === invokeNative && !hasNativeHost()) return null;
  try {
    const raw = await invoke<unknown>(NODE_ALLOWLIST_COMMANDS.match, {
      request: relax.match === "site" ? { kind: "site", url: value } : { kind: "folder", path: value },
    });
    const entryId = isRecord(raw) ? raw.entryId : null;
    return typeof entryId === "string" && ENTRY_ID.test(entryId) ? entryId : null;
  } catch {
    return null;
  }
}

const REASON_TEXT: Record<string, string> = {
  kill_switch_engaged: "急停拉着，不能打开常开节点",
  origin_invalid: "网址要写成 https://域名（可以带端口，不带路径）；本机开发可以用 http://localhost",
  allowlist_full: "白名单最多 50 条，先删掉一些",
  allowlist_key_unavailable: "读不到钥匙串，白名单没有保存",
  allowlist_write_failed: "写白名单失败",
  folder_too_broad: "这个文件夹太大了（根目录、用户目录或它的上级），请选具体的项目文件夹",
  folder_protected: "这个文件夹里有密钥、AI 设置或 Agentrix 自己的数据，不能加进白名单",
  folder_unreadable: "读不到这个文件夹",
  folder_picker_failed: "没能打开选文件夹的窗口",
  no_native_host: "这个窗口不能调用本机功能",
};

export function describeNodeAllowlistReason(reason: string | undefined): string {
  if (!reason) return "";
  return REASON_TEXT[reason] ?? `没有完成（${reason}）`;
}
