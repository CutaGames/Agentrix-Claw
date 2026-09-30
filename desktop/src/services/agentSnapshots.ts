/**
 * agentSnapshots — 桌面 D3 切片 5：别家 AI（Claude Code）改文件之前留下的快照，和一键撤回。
 *
 * - 快照由 Rust 在 Claude Code 的 PreToolUse hook 里拍（src-tauri/src/agent_snapshots.rs），
 *   存在应用数据目录里，保留 7 天。WebView 只拿到摘要（路径、时间、工具、现在和快照是否一样），
 *   拿不到文件内容。
 * - 撤回只在"今天的改动"里由本人点击触发，WebView 只传快照 id；Rust 自己读记录、拒绝写
 *   AI 的 hook 配置和 Agentrix 自己的数据目录，按原样恢复字节和权限（AI 新建的文件则删掉）。
 * - 聊天工具和远程通道都没有对应的命令（fence 登记表里没有）。
 * - 快照记录由 Rust 用钥匙串里的密钥签名（HMAC）。签名对不上（有人在快照目录里放了假记录、
 *   记录被改过、或者当时钥匙串读不到）的，Rust 拒绝撤回，这里也不显示撤回按钮。
 * 宿主没说的一律按"不能撤回"处理。
 */

export type SnapshotCurrent = "same" | "changed" | "unknown";

export interface AgentSnapshot {
  id: string;
  agent: "claude-code";
  tool: string;
  targetPath: string;
  createdAt: number;
  existedBefore: boolean;
  size: number;
  /** 没有留下内容的原因：`too_large` / `not_regular_file` / `unreadable_event`。 */
  skipped?: string;
  current: SnapshotCurrent;
  /** Rust 核对过这张快照的签名。没核对过的不能撤回。 */
  verified: boolean;
}

export interface AgentSnapshotRevertResult {
  ok: boolean;
  action?: "restored" | "deleted" | "nothing_to_do";
  reason?: string;
}

const SNAPSHOT_ID = /^snap-\d{13}-[0-9a-f]{12}$/;
const CURRENT_VALUES: ReadonlySet<string> = new Set(["same", "changed", "unknown"]);
const ACTIONS: ReadonlySet<string> = new Set(["restored", "deleted", "nothing_to_do"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeAgentSnapshot(raw: unknown): AgentSnapshot | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== "string" || !SNAPSHOT_ID.test(raw.id)) return null;
  if (raw.agent !== "claude-code") return null;
  if (typeof raw.targetPath !== "string") return null;
  const createdAt = Number(raw.createdAt);
  if (!Number.isFinite(createdAt)) return null;
  const skipped = typeof raw.skipped === "string" && raw.skipped ? raw.skipped : undefined;
  return {
    id: raw.id,
    agent: "claude-code",
    tool: typeof raw.tool === "string" ? raw.tool : "unknown",
    targetPath: raw.targetPath,
    createdAt,
    existedBefore: raw.existedBefore === true,
    size: Number.isFinite(Number(raw.size)) ? Number(raw.size) : 0,
    ...(skipped ? { skipped } : {}),
    current: typeof raw.current === "string" && CURRENT_VALUES.has(raw.current) ? (raw.current as SnapshotCurrent) : "unknown",
    verified: raw.verified === true,
  };
}

export function normalizeAgentSnapshotList(raw: unknown): AgentSnapshot[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(normalizeAgentSnapshot)
    .filter((item): item is AgentSnapshot => item !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function normalizeAgentSnapshotRevert(raw: unknown): AgentSnapshotRevertResult {
  if (!isRecord(raw) || typeof raw.action !== "string" || !ACTIONS.has(raw.action)) {
    return { ok: false, reason: "invalid_response" };
  }
  return { ok: true, action: raw.action as AgentSnapshotRevertResult["action"] };
}

/** 能不能撤回：签名核对过，留了内容（或本来没有这个文件），路径可读，而且现在和快照不一样。 */
export function canRevertSnapshot(snapshot: AgentSnapshot): boolean {
  return snapshot.verified && !snapshot.skipped && Boolean(snapshot.targetPath) && snapshot.current === "changed";
}

/**
 * 每个文件一行：这个时段里最早的那张快照（撤回它 = 回到这个时段里第一次改之前）。
 * `latest` 是最近一次改动的时间，只用来排序和显示。
 */
export interface AgentSnapshotFileRow {
  targetPath: string;
  earliest: AgentSnapshot;
  latestAt: number;
  edits: number;
}

export function groupSnapshotsByFile(snapshots: AgentSnapshot[]): AgentSnapshotFileRow[] {
  const byPath = new Map<string, AgentSnapshotFileRow>();
  for (const snapshot of snapshots) {
    if (!snapshot.targetPath) continue;
    const row = byPath.get(snapshot.targetPath);
    if (!row) {
      byPath.set(snapshot.targetPath, { targetPath: snapshot.targetPath, earliest: snapshot, latestAt: snapshot.createdAt, edits: 1 });
      continue;
    }
    row.edits += 1;
    if (snapshot.createdAt < row.earliest.createdAt) row.earliest = snapshot;
    if (snapshot.createdAt > row.latestAt) row.latestAt = snapshot.createdAt;
  }
  return [...byPath.values()].sort((a, b) => b.latestAt - a.latestAt);
}

function hasNativeHost(): boolean {
  return typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__?.invoke);
}

async function invokeNative(command: string, args?: Record<string, unknown>): Promise<unknown> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke(command, args);
}

export async function listAgentSnapshots(sinceMs?: number): Promise<AgentSnapshot[]> {
  if (!hasNativeHost()) return [];
  try {
    return normalizeAgentSnapshotList(await invokeNative("desktop_bridge_agent_snapshots_list", { sinceMs: sinceMs ?? null }));
  } catch {
    return [];
  }
}

function errorReason(error: unknown): string {
  if (typeof error === "string" && error) return error;
  if (error instanceof Error && error.message) return error.message;
  return "invoke_failed";
}

export async function revertAgentSnapshot(id: string): Promise<AgentSnapshotRevertResult> {
  if (!SNAPSHOT_ID.test(id)) return { ok: false, reason: "snapshot_id_invalid" };
  if (!hasNativeHost()) return { ok: false, reason: "no_native_host" };
  try {
    return normalizeAgentSnapshotRevert(await invokeNative("desktop_bridge_agent_snapshots_revert", { id }));
  } catch (error) {
    return { ok: false, reason: errorReason(error) };
  }
}

const REASON_TEXT: Record<string, string> = {
  snapshot_id_invalid: "快照编号不对",
  snapshot_not_found: "快照已经过期或被清理",
  snapshot_unreadable: "快照读不懂，没有改动文件",
  snapshot_not_restorable: "这次没有留下内容，不能撤回",
  snapshot_target_invalid: "快照里的路径不对，没有改动文件",
  snapshot_target_protected: "这是 AI 的保护设置或 Agentrix 自己的文件，不能从这里撤回",
  snapshot_unverified: "没法确认这张快照是 Agentrix 自己留的，没有改动文件",
  snapshot_target_is_directory: "那里现在是一个文件夹，没有改动",
  snapshot_revert_failed: "写回文件失败",
  no_native_host: "这个窗口不能调用本机功能",
  invalid_response: "本机返回的格式无法识别",
};

export function describeSnapshotReason(reason: string | undefined): string {
  if (!reason) return "";
  return REASON_TEXT[reason] || reason;
}

export const SNAPSHOT_SKIPPED_TEXT: Record<string, string> = {
  too_large: "文件超过 2 MB，没有留快照",
  not_regular_file: "不是普通文件，没有留快照",
  unreadable_event: "没读懂这次操作，没有留快照",
};
