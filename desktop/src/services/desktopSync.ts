import { API_BASE, apiFetch } from "./store";
import { getDesktopContext, getDesktopDeviceId, type ApprovalRiskLevel } from "./desktop";

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
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  respondedAt?: string;
  responseDeviceId?: string;
  rememberForSession: boolean;
}

export type DesktopCommandKind =
  | "context"
  | "active-window"
  | "list-windows"
  | "list-directory"
  | "run-command"
  | "read-file"
  | "write-file"
  | "open-browser";

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
      appVersion: "0.1.1",
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
  return readJson<{ ok: boolean; approval: DesktopRemoteApproval }>(response);
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

export async function claimDesktopCommand(token: string, commandId: string) {
  const response = await apiFetch(`${API_BASE}/desktop-sync/commands/${commandId}/claim`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      deviceId: getDesktopDeviceId(),
    }),
  });
  return readJson<{ ok: boolean; command: DesktopRemoteCommand }>(response);
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

export async function respondDesktopApproval(
  token: string,
  approvalId: string,
  payload: { decision: "approved" | "rejected"; rememberForSession?: boolean },
) {
  const response = await apiFetch(`${API_BASE}/desktop-sync/approvals/${approvalId}/respond`, {
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
  return readJson<{ ok: boolean; approval: DesktopRemoteApproval }>(response);
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