import { API_BASE, apiFetch } from "./store";
import { getDesktopContext, getDesktopDeviceId, type ApprovalRiskLevel } from "./desktop";
import { getDesktopAppVersion } from "./appVersion";
import {
  approvalResponseRequirementV1,
  projectApprovalStatusV1,
  type ApprovalLocalConfirmationV1,
  type ApprovalRespondRequestV1,
} from "../../../shared/types/approval-card";
import { parseApiErrorBodyV1 } from "../../../shared/types/api-error";

export type DesktopTaskRunState = "idle" | "executing" | "need-approve" | "completed" | "failed";
export type DesktopTimelineStatus = "running" | "waiting-approval" | "completed" | "failed" | "rejected";

export interface DesktopSyncContextPayload {
  activeWindowTitle?: string;
  processName?: string;
  workspaceHint?: string;
  fileHint?: string;
  clipboardTextPreview?: string;
}

export interface DesktopSyncTimelineEntry {
  id: string;
  title: string;
  detail?: string;
  kind: string;
  riskLevel: ApprovalRiskLevel;
  status: DesktopTimelineStatus;
  startedAt: number;
  finishedAt?: number;
  output?: string;
}

export interface DesktopRemoteApproval {
  approvalId: string;
  deviceId: string;
  taskId: string;
  timelineEntryId?: string;
  title: string;
  description: string;
  riskLevel: ApprovalRiskLevel;
  sessionKey?: string;
  /** 审批卡合同 v1：`expired` 是读时投影（pending 且过了 expiresAt）。 */
  status: "pending" | "approved" | "rejected" | "expired";
  requestedAt: string;
  /** 服务端记录的过期时间；本地等待不长于它。 */
  expiresAt?: string;
  /**
   * 桌面 D2：只在本机的审批卡（后端建不出记录时，例如这台电脑还没有 registry 绑定）。
   * 只能用于本机发起、本机确认的操作，不回写后端。
   */
  localOnly?: boolean;
  respondedAt?: string;
  responseDeviceId?: string;
  rememberForSession: boolean;
  /** Backend-computed digest; must be echoed back when responding. */
  requestDigest?: string;
  /** Desktop D0: L3 — only a confirmation on this computer settles it. */
  requireLocalApproval?: boolean;
}

export type DesktopRemoteApprovalLike = Partial<Omit<DesktopRemoteApproval, "riskLevel" | "status">> & {
  id?: string;
  approval_id?: string;
  riskLevel?: ApprovalRiskLevel | string;
  status?: DesktopRemoteApproval["status"] | string;
};

export function getDesktopRemoteApprovalId(approval: DesktopRemoteApprovalLike | null | undefined): string {
  return String(approval?.approvalId || approval?.approval_id || approval?.id || "").trim();
}

export function normalizeDesktopRemoteApproval(
  approval: DesktopRemoteApproval | DesktopRemoteApprovalLike | null | undefined,
): DesktopRemoteApproval | null {
  const approvalId = getDesktopRemoteApprovalId(approval);
  if (!approvalId || !approval) {
    return null;
  }
  const normalized = { ...(approval as DesktopRemoteApproval), approvalId };
  // 审批卡合同 v1：pending 且已过期的读成 expired（旧后端不做这个投影）。
  if (normalized.status === "pending") {
    normalized.status = projectApprovalStatusV1("pending", normalized.expiresAt);
  }
  return normalized;
}

/** desktop-sync 审批接口的非 2xx 响应，按错误合同 v1 取 `code`。 */
export class DesktopApprovalHttpError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message?: string,
  ) {
    super(message || code);
    this.name = "DesktopApprovalHttpError";
  }
}

async function readApprovalResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const parsed = parseApiErrorBodyV1(body);
    throw new DesktopApprovalHttpError(parsed.code || `http_${response.status}`, response.status, parsed.message || undefined);
  }
  return (body ?? {}) as T;
}

export type DesktopCommandKind =
  | "context"
  | "active-window"
  | "list-windows"
  | "list-directory"
  | "run-command"
  | "read-file"
  | "write-file"
  | "open-browser"
  // Computer Use (Phase B)
  | "computer-use-screenshot"
  | "computer-use-click"
  | "computer-use-move"
  | "computer-use-type"
  | "computer-use-key"
  | "computer-use-window-tree"
  | "computer-use-browser-navigate"
  | "computer-use-browser-list-tabs"
  | "computer-use-browser-eval"
  | "computer-use-browser-click-selector"
  // Git tools
  | "git-status"
  | "git-diff"
  | "git-log"
  | "git-commit"
  | "git-push"
  | "git-pull"
  | "git-checkout"
  // World Creation (v6) — open the Tier_C creator for a Mobile-dispatched task.
  | "world-creation-task";

export type DesktopCommandStatus = "pending" | "claimed" | "completed" | "failed" | "rejected";

export interface DesktopRemoteCommand {
  commandId: string;
  title: string;
  kind: DesktopCommandKind;
  status: DesktopCommandStatus;
  targetDeviceId?: string;
  requesterDeviceId?: string;
  sessionId?: string;
  payload?: Record<string, unknown>;
  /** Opaque data-plane reference minted by backend when raw payloads are disabled. */
  payloadRef?: unknown;
  createdAt: string;
  updatedAt: string;
  claimedAt?: string;
  claimedByDeviceId?: string;
  completedAt?: string;
  result?: Record<string, unknown>;
  error?: string;
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  return text ? JSON.parse(text) as T : ({} as T);
}

export async function captureDesktopSyncContext(): Promise<DesktopSyncContextPayload> {
  try {
    const context = await getDesktopContext();
    return {
      activeWindowTitle: context.activeWindow?.title || undefined,
      processName: context.activeWindow?.processName || undefined,
      workspaceHint: context.workspaceHint || undefined,
      fileHint: context.fileHint || undefined,
      clipboardTextPreview: context.clipboardTextPreview || undefined,
    };
  } catch {
    return {
      processName: navigator.platform,
    };
  }
}

export async function syncDesktopHeartbeat(token: string) {
  const context = await captureDesktopSyncContext();
  const response = await apiFetch(`${API_BASE}/desktop-sync/heartbeat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      deviceId: getDesktopDeviceId(),
      platform: navigator.platform || "unknown",
      // Was hard-coded "0.1.1"; backend saw every desktop as 0.1.1.
      appVersion: getDesktopAppVersion(),
      context,
    }),
  });
  return readJson<any>(response);
}

export async function syncDesktopTask(
  token: string,
  payload: {
    taskId: string;
    title: string;
    summary?: string;
    sessionId?: string;
    status: DesktopTaskRunState;
    startedAt?: number;
    finishedAt?: number;
    timeline: DesktopSyncTimelineEntry[];
  },
) {
  const context = await captureDesktopSyncContext();
  const response = await apiFetch(`${API_BASE}/desktop-sync/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      deviceId: getDesktopDeviceId(),
      ...payload,
      context,
    }),
  });
  return readJson<any>(response);
}

export async function createDesktopApproval(
  token: string,
  payload: {
    taskId: string;
    timelineEntryId?: string;
    title: string;
    description: string;
    riskLevel: ApprovalRiskLevel;
    sessionKey?: string;
  },
) {
  const context = await captureDesktopSyncContext();
  const response = await apiFetch(`${API_BASE}/desktop-sync/approvals`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      deviceId: getDesktopDeviceId(),
      ...payload,
      context,
    }),
  });
  // 非 2xx（例如这台电脑还没有 registry 绑定）要抛出，不能把错误体当成审批记录。
  return readApprovalResponse<{ ok: boolean; approval: DesktopRemoteApproval }>(response);
}

export async function createDesktopCommand(
  token: string,
  payload: {
    title: string;
    kind: DesktopCommandKind;
    targetDeviceId?: string;
    requesterDeviceId?: string;
    sessionId?: string;
    payload?: Record<string, unknown>;
  },
) {
  const response = await apiFetch(`${API_BASE}/desktop-sync/commands`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return readJson<{ ok: boolean; command: DesktopRemoteCommand }>(response);
}

export async function fetchDesktopCommands(token: string, deviceId?: string) {
  const suffix = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : "";
  const response = await apiFetch(`${API_BASE}/desktop-sync/commands${suffix}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return readJson<{ commands: DesktopRemoteCommand[] }>(response);
}

export async function fetchPendingDesktopCommands(token: string, deviceId?: string) {
  const suffix = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : "";
  const response = await apiFetch(`${API_BASE}/desktop-sync/commands/pending${suffix}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return readJson<{ commands: DesktopRemoteCommand[] }>(response);
}

export interface DesktopCommandClaimResult {
  /** True only when backend answered 2xx, did not say `ok:false`, and the claimant is this device. */
  ok: boolean;
  status: number;
  command?: DesktopRemoteCommand;
  /** Raw body on refusal, e.g. backend RemoteMutationDeniedBody (REMOTE_MUTATION_DISABLED). */
  body?: unknown;
}

/**
 * Claim a pending command. Backend enforces the remote-mutation kill switch,
 * binding, expiry and CAS at claim time, so callers MUST NOT execute unless
 * `ok` is true. Earlier versions ignored the HTTP status and executed anyway.
 */
export async function claimDesktopCommand(token: string, commandId: string): Promise<DesktopCommandClaimResult> {
  const deviceId = getDesktopDeviceId();
  const response = await apiFetch(`${API_BASE}/desktop-sync/commands/${encodeURIComponent(commandId)}/claim`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      deviceId,
    }),
  });
  let body: unknown;
  try {
    body = await readJson<unknown>(response);
  } catch {
    body = undefined;
  }
  const record = body && typeof body === "object" ? body as { ok?: unknown; command?: DesktopRemoteCommand } : undefined;
  const command = record?.command;
  const claimant = command?.claimedByDeviceId;
  const ok = response.ok
    && record?.ok !== false
    && (!command?.commandId || command.commandId === commandId)
    && (!claimant || claimant === deviceId);
  return { ok, status: response.status, command, body };
}

export async function completeDesktopCommand(
  token: string,
  commandId: string,
  payload: {
    status: Extract<DesktopCommandStatus, "completed" | "failed" | "rejected">;
    result?: Record<string, unknown>;
    error?: string;
  },
) {
  const response = await apiFetch(`${API_BASE}/desktop-sync/commands/${commandId}/complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      deviceId: getDesktopDeviceId(),
      ...payload,
    }),
  });
  return readJson<{ ok: boolean; command: DesktopRemoteCommand }>(response);
}

/**
 * 回写审批决定（审批卡合同 v1，`ApprovalRespondRequestV1`）：
 * - `requestDigest` 必填，用记录里的原值；没有就不发请求。
 * - `rememberForSession` 只在合同允许的级别（L0 / L1）带上。
 * - 不再带 `deviceId`；L2 / L3 批准的 `localConfirmation`（设备签名）等 E32。
 * - 非 2xx 抛 `DesktopApprovalHttpError`（例如 `REMOTE_APPROVAL_CONFIRMATION_REQUIRED`）。
 */
export async function respondDesktopApproval(
  token: string,
  approvalId: string,
  payload: {
    decision: "approved" | "rejected";
    rememberForSession?: boolean;
    requestDigest?: string;
    riskLevel?: string;
    /** E32：L2 / L3 批准时，这台电脑的设备签名（`developer_runtime_sign_approval`）。 */
    localConfirmation?: ApprovalLocalConfirmationV1;
  },
) {
  const safeApprovalId = String(approvalId || "").trim();
  if (!safeApprovalId) {
    throw new Error("approvalId is required to respond to a desktop approval");
  }
  const requestDigest = String(payload.requestDigest || "").trim();
  if (!requestDigest) {
    throw new DesktopApprovalHttpError("missing_request_digest", 0, "Approval record has no requestDigest; not sent");
  }
  const remember =
    payload.decision === "approved" &&
    payload.rememberForSession === true &&
    approvalResponseRequirementV1(payload.riskLevel, payload.decision).rememberAllowed;
  const body: ApprovalRespondRequestV1 = {
    decision: payload.decision,
    requestDigest,
    ...(remember ? { rememberForSession: true } : {}),
    ...(payload.localConfirmation ? { localConfirmation: payload.localConfirmation } : {}),
  };

  // Use AbortController with 10s timeout to prevent indefinite hang
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await apiFetch(`${API_BASE}/desktop-sync/approvals/${encodeURIComponent(safeApprovalId)}/respond`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return await readApprovalResponse<{ ok: boolean; approval: DesktopRemoteApproval }>(response);
  } catch (err: any) {
    if (err?.name === "AbortError") {
      // Desktop D0: never synthesize `ok:true` on timeout. The caller shows a
      // sync warning; the authoritative state arrives with the next poll.
      throw new Error("Approval response timed out before backend confirmed it");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchDesktopSyncState(token: string) {
  const response = await apiFetch(`${API_BASE}/desktop-sync/state`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return readJson<{
    devices: Array<any>;
    tasks: Array<any>;
    approvals: DesktopRemoteApproval[];
    sessions: Array<any>;
    commands: DesktopRemoteCommand[];
    pendingApprovalCount: number;
    serverTime: string;
  }>(response);
}

// ── P8: Cross-Device Capabilities ───────────────────────

export async function fetchUnifiedSessions(token: string, limit?: number) {
  const suffix = limit ? `?limit=${limit}` : "";
  const response = await apiFetch(`${API_BASE}/desktop-sync/sessions/unified${suffix}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return readJson<{ sessions: Array<any> }>(response);
}

export async function fetchDeviceCapabilities(token: string) {
  const response = await apiFetch(`${API_BASE}/desktop-sync/capabilities`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return readJson<{ devices: Array<any> }>(response);
}

export async function uploadDeviceMedia(
  token: string,
  payload: {
    sourceDeviceId: string;
    targetDeviceId?: string;
    mediaType: string;
    fileName?: string;
    mimeType?: string;
    dataUrl?: string;
    metadata?: Record<string, unknown>;
    sessionId?: string;
  },
) {
  const response = await apiFetch(`${API_BASE}/desktop-sync/media`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return readJson<{ ok: boolean; transferId: string }>(response);
}

export async function fetchDeviceMediaTransfers(token: string, deviceId?: string) {
  const suffix = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : "";
  const response = await apiFetch(`${API_BASE}/desktop-sync/media${suffix}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return readJson<{ transfers: Array<any> }>(response);
}

export async function notifyAgentCompletion(
  token: string,
  sessionId: string,
  summary: string,
) {
  const response = await apiFetch(`${API_BASE}/desktop-sync/notify-completion`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      sessionId,
      deviceId: getDesktopDeviceId(),
      summary,
    }),
  });
  return readJson<{ ok: boolean }>(response);
}

export async function createSharedWorkspace(token: string, name: string, description?: string) {
  const response = await apiFetch(`${API_BASE}/desktop-sync/workspaces`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name, description }),
  });
  return readJson<{ ok: boolean; workspace: any }>(response);
}

export async function fetchSharedWorkspaces(token: string) {
  const response = await apiFetch(`${API_BASE}/desktop-sync/workspaces`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return readJson<{ workspaces: Array<any> }>(response);
}