import { apiFetch } from './api';
import {
  assertMobileDesktopCommandAllowed,
  type MobileSubmittableDesktopCommandKind,
} from './mobileRemoteExecutionPolicy';

import { buildMobileApprovalResponse, type MobileApprovalDecision } from './mobileApprovalPolicy';

export type { MobileSubmittableDesktopCommandKind } from './mobileRemoteExecutionPolicy';

/** Kinds that may appear in command history returned by the backend (display only). */
export type DesktopCommandKind =
  | 'context'
  | 'active-window'
  | 'list-windows'
  | 'run-command'
  | 'read-file'
  | 'write-file'
  | 'open-browser';

export type DesktopCommandStatus = 'pending' | 'claimed' | 'completed' | 'failed' | 'rejected';

export interface MobileDesktopApproval {
  approvalId: string;
  deviceId: string;
  taskId: string;
  timelineEntryId?: string;
  title: string;
  description: string;
  riskLevel: 'L0' | 'L1' | 'L2' | 'L3';
  /** `expired` is a read projection (approval-card contract v1). */
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  requestedAt: string;
  respondedAt?: string;
  /** Backend request digest; must be echoed back when deciding. */
  requestDigest?: string;
  expiresAt?: string;
}

export type MobileDesktopApprovalLike = Partial<MobileDesktopApproval> & {
  id?: string;
  approval_id?: string;
};

export function getMobileDesktopApprovalId(approval: MobileDesktopApprovalLike | null | undefined): string {
  return String(approval?.approvalId || approval?.approval_id || approval?.id || '').trim();
}

export function normalizeMobileDesktopApproval(
  approval: MobileDesktopApproval | MobileDesktopApprovalLike | null | undefined,
): MobileDesktopApproval | null {
  const approvalId = getMobileDesktopApprovalId(approval);
  if (!approvalId || !approval) return null;
  return { ...(approval as MobileDesktopApproval), approvalId };
}

export interface MobileDesktopCommand {
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
  completedAt?: string;
  result?: Record<string, unknown>;
  error?: string;
}

export interface MobileDesktopState {
  devices: Array<{
    deviceId: string;
    platform: string;
    appVersion?: string;
    context?: {
      activeWindowTitle?: string;
      processName?: string;
      workspaceHint?: string;
      fileHint?: string;
      clipboardTextPreview?: string;
    };
    lastSeenAt: string;
  }>;
  tasks: Array<any>;
  approvals: MobileDesktopApproval[];
  sessions: Array<{
    sessionId: string;
    title: string;
    messageCount: number;
    updatedAt: number;
    deviceId: string;
    deviceType: 'desktop' | 'mobile' | 'web';
  }>;
  commands: MobileDesktopCommand[];
  pendingApprovalCount: number;
  serverTime: string;
}

export interface MobileDesktopClipboardSnapshot {
  deviceId: string;
  platform: string;
  text: string;
  lastSeenAt: string;
}

export async function fetchDesktopState(): Promise<MobileDesktopState> {
  return apiFetch('/desktop-sync/state');
}

export async function fetchLatestDesktopClipboard(): Promise<MobileDesktopClipboardSnapshot | null> {
  const state = await fetchDesktopState();
  const candidates = (state.devices || [])
    .filter((device) => typeof device.context?.clipboardTextPreview === 'string' && device.context.clipboardTextPreview.trim().length > 0)
    .sort((left, right) => new Date(right.lastSeenAt).getTime() - new Date(left.lastSeenAt).getTime());

  const latest = candidates[0];
  if (!latest) {
    return null;
  }

  return {
    deviceId: latest.deviceId,
    platform: latest.platform,
    text: latest.context?.clipboardTextPreview?.trim() || '',
    lastSeenAt: latest.lastSeenAt,
  };
}

/**
 * Queue a desktop-sync command from the phone.
 *
 * M0: only read-only, body-free kinds are accepted (see
 * `mobileRemoteExecutionPolicy`). Shell, file read/write and URL open are
 * refused before any network call; they only run on the computer itself.
 */
export async function createRemoteDesktopCommand(payload: {
  title: string;
  kind: MobileSubmittableDesktopCommandKind;
  targetDeviceId?: string;
  requesterDeviceId?: string;
  sessionId?: string;
  payload?: Record<string, unknown>;
}) {
  assertMobileDesktopCommandAllowed(payload?.kind, payload?.payload);
  return apiFetch<{ ok: boolean; command: MobileDesktopCommand }>('/desktop-sync/commands', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Answer a desktop approval from the phone.
 *
 * M0-d: the body is built by `mobileApprovalPolicy` — it echoes the record's
 * `requestDigest`, never sends `rememberForSession`, and refuses to approve
 * L3 / unknown-risk / expired / non-pending approvals before any network
 * call. Reject stays available (tightening).
 */
export async function respondToDesktopApproval(
  approval: MobileDesktopApproval,
  decision: MobileApprovalDecision,
) {
  const safeApprovalId = String(approval?.approvalId || '').trim();
  if (!safeApprovalId) {
    throw new Error('approvalId is required to respond to a desktop approval');
  }
  const payload = buildMobileApprovalResponse(approval, decision);
  return apiFetch<{ ok: boolean; approval: MobileDesktopApproval }>(`/desktop-sync/approvals/${encodeURIComponent(safeApprovalId)}/respond`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchDesktopSession(sessionId: string) {
  return apiFetch<{ sessionId: string; messages: Array<any>; meta: Record<string, unknown> }>(`/desktop-sync/sessions/${encodeURIComponent(sessionId)}`);
}